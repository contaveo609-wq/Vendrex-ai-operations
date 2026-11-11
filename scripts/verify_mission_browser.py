"""Real Chromium acceptance checks for mission artifacts and the local dashboard."""
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
import json
from pathlib import Path
import sys
import threading

ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT))
from vendrex.service import Service
from vendrex.web import server_for


def main():
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--data',type=Path,required=True);parser.add_argument('--out',type=Path,required=True);parser.add_argument('--chromium',default=None)
    args=parser.parse_args();args.out.mkdir(parents=True,exist_ok=True)
    from playwright.sync_api import sync_playwright
    service=Service(args.data);tasks=service.snapshot()['tasks']
    builder=next(t for t in tasks if t['kind']=='BUILDER_CALCULATOR' and t['state']=='COMPLETED')
    app=args.data/'workspaces'/builder['id']/'calculadora'
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self,*_):pass
    artifact_server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(app)))
    dashboard=server_for(service,0)
    servers=[artifact_server,dashboard]
    for server in servers:threading.Thread(target=server.serve_forever,daemon=True).start()
    checks=[]
    try:
        with sync_playwright() as p:
            import shutil
            browser=p.chromium.launch(executable_path=args.chromium or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
            page=browser.new_page(viewport={'width':1365,'height':900});errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{artifact_server.server_port}');page.get_by_role('button',name='7',exact=True).click();page.get_by_role('button',name='Multiplicar').click();page.get_by_role('button',name='8',exact=True).click();page.get_by_role('button',name='Calcular resultado').click()
            assert page.locator('#result').inner_text()=='56';checks.append('calculator_mouse_7x8=56')
            page.keyboard.press('Escape');page.keyboard.type('0.1+0.2');page.keyboard.press('Enter');assert page.locator('#result').inner_text()=='0,3';checks.append('calculator_keyboard_decimal=0.3')
            page.keyboard.press('Escape');page.keyboard.type('9/0');page.keyboard.press('Enter');assert 'zero' in page.locator('#result').inner_text();checks.append('calculator_division_by_zero_handled')
            page.keyboard.press('Escape');page.keyboard.type('32/4');page.keyboard.press('Enter');assert page.locator('#result').inner_text()=='8';checks.append('calculator_recovers_after_error')
            page.screenshot(path=str(args.out/'calculator-desktop.png'),full_page=True)
            page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth');page.screenshot(path=str(args.out/'calculator-mobile.png'),full_page=True);checks.append('calculator_mobile_no_horizontal_overflow')
            page.set_viewport_size({'width':1440,'height':1000});base=f'http://127.0.0.1:{dashboard.server_port}'
            page.goto(base);page.get_by_text('Sua operação, em um só lugar.',exact=True).wait_for()
            for route in ['overview','sales','builder','growth','director','missions','queue','approvals','settings','audit']:
                page.goto(base+'/#'+route);page.locator('#main').wait_for();page.wait_for_timeout(80)
                assert page.locator('h1').count()>0;checks.append('dashboard_'+route)
            page.goto(base+'/#missions');page.get_by_text('Missões com provas.',exact=True).wait_for();video=page.locator('video').first
            video.evaluate('(video)=>video.load()');page.wait_for_function('document.querySelector("video")?.readyState >= 1',timeout=15000)
            assert abs(video.evaluate('(v)=>v.duration')-32)<.05;checks.append('dashboard_video_metadata_duration32')
            video.evaluate('(v)=>{v.muted=true;v.currentTime=12;}');page.wait_for_function('document.querySelector("video")?.currentTime >= 11.9');checks.append('dashboard_video_range_seek')
            page.screenshot(path=str(args.out/'missions-dashboard.png'),full_page=True)
            page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(100);assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth');checks.append('dashboard_mobile_no_horizontal_overflow')
            assert not errors,errors
            browser.close()
        result={'passed':True,'checks':checks,'browser':'Real headless Chromium via Playwright','javascript_errors':errors,'screenshots':['calculator-desktop.png','calculator-mobile.png','missions-dashboard.png']}
        (args.out/'browser-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
    finally:
        for server in servers:server.shutdown();server.server_close()


if __name__=='__main__':main()
