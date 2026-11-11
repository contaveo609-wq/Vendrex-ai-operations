"""Real local Chromium checks. No WhatsApp transport or cloud connection inferred."""
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
import argparse,json,shutil,sys,threading
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from vendrex.service import Service
from vendrex.web import server_for

def main():
 p=argparse.ArgumentParser();p.add_argument('--data',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
 s=Service(a.data)
 board=next(t for t in s.snapshot()['tasks'] if t['kind']=='BUILDER_BOARD' and t['state']=='COMPLETED')
 class Quiet(SimpleHTTPRequestHandler):
  def log_message(self,*_):pass
 artifact=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(a.data/'workspaces'/board['id']/'quadro')))
 dashboard=server_for(s,0);servers=[artifact,dashboard]
 for server in servers:threading.Thread(target=server.serve_forever,daemon=True).start()
 from playwright.sync_api import sync_playwright
 checks=[];errors=[]
 try:
  with sync_playwright() as pw:
   browser=pw.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'])
   page=browser.new_page(viewport={'width':1365,'height':950});page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{artifact.server_port}');page.locator('#title').fill('<img src=x onerror=alert(1)>');page.get_by_role('button',name='Adicionar tarefa',exact=True).click()
   assert page.locator('.card img').count()==0;assert page.locator('.card p').inner_text()=='<img src=x onerror=alert(1)>';checks.append('board_input_rendered_as_text')
   page.locator('.card select').select_option('Em andamento');page.reload();assert page.locator('.card select').input_value()=='Em andamento';checks.append('board_stage_persists_after_reload')
   with page.expect_download() as info:page.get_by_role('button',name='Exportar JSON').click()
   assert json.loads(Path(info.value.path()).read_text())[0]['stage']=='Em andamento';checks.append('board_export_real_json')
   page.screenshot(path=str(a.out/'board-desktop.png'),full_page=True)
   page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');checks.append('board_mobile_no_overflow');page.screenshot(path=str(a.out/'board-mobile.png'),full_page=True)
   page.evaluate("Object.defineProperty(Storage.prototype,'setItem',{value(){throw new Error('test quota');},configurable:true})")
   page.locator('#title').fill('Must not persist');page.get_by_role('button',name='Adicionar tarefa',exact=True).click();assert 'Falha ao salvar' in page.locator('#status').inner_text();assert page.locator('.card').count()==1;checks.append('board_storage_failure_preserves_prior_state')
   page.reload();page.get_by_role('button',name='Excluir tarefa').click();page.reload();assert page.locator('.card').count()==0;checks.append('board_delete_persists')
   page.evaluate("localStorage.setItem('vendrex-board-v1','invalid-json')");page.reload();assert not page.locator('#new-task').is_visible();assert page.evaluate("localStorage.getItem('vendrex-board-v1')")=='invalid-json';checks.append('board_corrupt_storage_not_overwritten')
   base=f'http://127.0.0.1:{dashboard.server_port}';page.set_viewport_size({'width':1440,'height':1000});page.goto(base+'/#whatsapp');page.get_by_role('heading',name='WhatsApp Sales',exact=True).wait_for()
   assert page.get_by_role('button',name='Ativar autonomia',exact=True).is_disabled();checks.append('whatsapp_activation_blocked_without_provider')
   link=page.get_by_role('link',name='Abrir QR Code / código no WhatsApp');assert link.get_attribute('href')=='https://web.whatsapp.com/';assert 'noopener' in link.get_attribute('rel');checks.append('whatsapp_manual_login_link_points_to_official_site_only')
   page.locator('input[name=delay]').fill('7');page.get_by_role('button',name='Salvar intervalo').click();page.wait_for_function("() => document.querySelector('input[name=delay]')?.value==='7'");assert s.config['sales']['min_reply_delay_seconds']==7;checks.append('whatsapp_debounce_saved_to_database')
   page.screenshot(path=str(a.out/'whatsapp-desktop.png'),full_page=True)
   page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');checks.append('whatsapp_mobile_no_overflow')
   page.set_viewport_size({'width':1440,'height':1000});page.goto(base+'/#intelligence');page.get_by_role('heading',name='Vendrex Intelligence',exact=True).wait_for();assert 'SIMULATION_ONLY' in page.locator('#main').inner_text();assert 'Não medido' in page.locator('#main').inner_text();checks.append('campaign_fixture_and_missing_metrics_identified');page.screenshot(path=str(a.out/'intelligence-desktop.png'),full_page=True)
   assert not errors,errors;browser.close()
  report={'state':'TESTED','browser':'Real Chromium','checks':checks,'javascript_errors':errors,'whatsapp_live_tests':'BLOCKED','generative_tests':'AUTH_REQUIRED','cloud_tests':'BLOCKED'}
  (a.out/'browser-v23.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False))
 finally:
  for server in servers:server.shutdown();server.server_close()
if __name__=='__main__':main()
