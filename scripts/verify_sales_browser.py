"""Real isolated Chromium. Controlled backend; no real WhatsApp or credentials."""
import argparse
import json
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser()
parser.add_argument('--out',type=Path,required=True)
args=parser.parse_args()
args.out.mkdir(parents=True,exist_ok=True)
process=subprocess.Popen(['node','test/browser-fixture.mjs'],cwd=root/'sales-gateway',stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8')
try:
    port=json.loads(process.stdout.readline())['port']
    checks=[]
    errors=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True)
        page=browser.new_page(viewport={'width':1280,'height':960})
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{port}')
        page.get_by_label('Token de administração').fill('CONTROLLED_BROWSER_TOKEN_'*3)
        page.get_by_role('button',name='Consultar',exact=True).click()
        page.get_by_text('Configuração carregada. Versão 1',exact=True).wait_for()
        checks.append('authenticated_personality_loaded')
        assert page.get_by_role('button',name='Ativar atendimento geral após teste real',exact=True).is_disabled()
        checks.append('live_activation_requires_real_conversation')
        values={'Personalidade':'Formal, acolhedor e direto. <img src=x onerror=alert(1)>',
                'Instruções de atendimento':'Faça uma pergunta por vez e consulte o histórico.',
                'Abertura':'Olá! Aqui é a Vendrex. Como posso te chamar?',
                'Pedido de permissão':'Prazer, {nome}. Você gostaria de ouvir uma proposta de um minuto?',
                'Texto-base da proposta':'A Vendrex desenvolve sistemas sob medida. Qual problema mais afeta sua empresa?'}
        for label,value in values.items():
            page.get_by_label(label,exact=True).fill(value)
        page.get_by_role('button',name='Salvar personalidade e falas',exact=True).click()
        page.get_by_text('Salvo. Configuração vale para próximas respostas. Versão 2',exact=True).wait_for()
        checks.append('all_five_editable_fields_saved')
        page.reload()
        page.get_by_label('Token de administração').fill('CONTROLLED_BROWSER_TOKEN_'*3)
        page.get_by_role('button',name='Consultar',exact=True).click()
        page.get_by_text('Configuração carregada. Versão 2',exact=True).wait_for()
        for label,value in values.items():
            assert page.get_by_label(label,exact=True).input_value()==value
        checks.append('settings_restored_after_browser_reload')
        assert page.locator('img:not(#qr)').count()==0
        checks.append('untrusted_personality_is_text_not_html')
        assert 'false' in page.locator('#status').inner_text()
        checks.append('no_fabricated_operational_status')
        page.screenshot(path=str(args.out/'sales-settings-desktop.png'),full_page=True)
        page.set_viewport_size({'width':390,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(args.out/'sales-settings-mobile.png'),full_page=True)
        checks.append('mobile_390px_no_horizontal_overflow')
        assert not errors,errors
        browser.close()
    report={'state':'PASS','browser':'real isolated Chromium on Windows','backend':'CONTROLLED_FIXTURE',
            'checks':checks,'javascript_errors':errors,'whatsapp_conversation_proven':False}
    (args.out/'browser-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))
finally:
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
