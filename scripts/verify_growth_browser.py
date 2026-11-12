"""Real isolated Chromium on Windows, with explicitly controlled backend responses.

No existing browser profile, real credentials or real Meta publication is used.
"""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sys
import threading
import time
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
args.out.mkdir(parents=True, exist_ok=True)
connection = {'id': '33333333-3333-4333-8333-333333333333', 'name': 'Vendrex · TESTE CONTROLADO <img src=x onerror=alert(1)>',
              'platform': 'instagram', 'status': 'CONNECTED', 'paused': True, 'proven_at': None,
              'permissions': ['instagram_basic', 'instagram_content_publish']}
data = {'state': 'TESTING', 'operational': False, 'meta_configured': True, 'worker_active': False,
        'connections': [connection], 'posts': [], 'metrics': [], 'alerts': []}
captured = []
sales_data={'state':'HOST_REQUIRED','paused':True,'mode':'TEST','inference_daily_limit':500,'SALES_WHATSAPP_OPERATIONAL':False,'test_recipients':[]}
sales_behavior={'personality':'Consultivo e direto','instructions':'Uma pergunta por vez','opening':'Olá! Aqui é a Vendrex.','permission':'Posso apresentar uma proposta?','proposal':'Desenvolvemos sistemas sob medida.'}

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def send_json(self, value, code=200):
        body = json.dumps(value).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/api/config':
            return self.send_json({'url': f'http://127.0.0.1:{self.server.server_port}', 'publishableKey': 'sb_publishable_TEST_FIXTURE'})
        if path == '/auth/v1/user':
            return self.send_json({'id': '11111111-1111-4111-8111-111111111111', 'email': 'controlled-test@example.invalid'})
        if path == '/rest/v1/vendrex_records':
            return self.send_json([])
        if path == '/api/meta/status':
            return self.send_json(data)
        if path == '/api/sales/status':
            return self.send_json(sales_data)
        if path == '/api/sales/behavior':
            return self.send_json({'behavior':sales_behavior,'behavior_revision':1})
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', '0'))) or '{}')
        if path == '/auth/v1/token':
            return self.send_json({'access_token': 'CONTROLLED_JWT_FIXTURE', 'refresh_token': 'CONTROLLED_REFRESH_FIXTURE', 'expires_at': time.time()+3600})
        if path == '/auth/v1/logout':
            return self.send_json({})
        if path == '/api/sales/behavior':
            sales_behavior.update(body['behavior'])
            return self.send_json({'saved':True,'behavior_revision':2})
        if path == '/api/meta/enqueue':
            captured.append(body)
            data['posts'].append({**body, 'id': '44444444-4444-4444-8444-444444444444', 'state': 'QUEUED', 'scheduled_for': '2026-11-11T15:00:00Z'})
            return self.send_json(data['posts'][-1], 201)
        return self.send_json({'error': 'CONTROLLED_UNSUPPORTED_REQUEST'}, 400)

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT/'cloud/public')))
threading.Thread(target=server.serve_forever, daemon=True).start()
checks, errors = [], []
try:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1365, 'height': 1000})
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}')
        page.get_by_label('E-mail', exact=True).fill('controlled-test@example.invalid')
        page.get_by_label('Senha da Vendrex').fill('CONTROLLED_PASSWORD_FIXTURE')
        page.get_by_role('button', name='Entrar', exact=True).click()
        page.get_by_role('heading', name='Quatro agentes. Estado comprovado.').wait_for()
        checks.append('login_and_dashboard_real_browser_controlled_auth')
        assert page.locator('#agents .card').count() == 4
        checks.append('four_agent_cards_without_fabricated_online')
        page.get_by_role('button',name='Sales e personalidade',exact=True).click()
        page.get_by_role('heading',name='Vendrex Sales',exact=True).wait_for()
        assert page.get_by_role('button',name='Ativar atendimento geral',exact=True).is_disabled()
        checks.append('sales_requires_real_conversation_before_activation')
        custom='Formal e acolhedor. <img src=x onerror=alert(1)>'
        page.get_by_label('Personalidade',exact=True).fill(custom)
        page.get_by_label('Pedido de permissão',exact=True).fill('Prazer, {nome}. Gostaria de ouvir uma proposta de um minuto?')
        page.get_by_role('button',name='Salvar personalidade e falas',exact=True).click()
        page.get_by_text('Configuração do Sales salva no Supabase.',exact=True).wait_for()
        assert sales_behavior['personality']==custom
        assert page.get_by_label('Personalidade',exact=True).input_value()==custom
        assert page.locator('#sales-panel img').count()==0
        checks.append('sales_personality_saved_and_escaped_controlled_backend')
        page.screenshot(path=str(args.out/'sales-cloud-desktop-CONTROLLED.png'),full_page=True)
        page.get_by_role('button', name='Integrações e Redes Sociais', exact=True).click()
        page.get_by_role('heading', name='Calendário de publicações').wait_for()
        assert page.get_by_role('button', name='Retomar automação', exact=True).is_disabled()
        checks.append('real_publication_proof_required_before_activation')
        assert page.locator('#social img').count() == 0
        assert '<img src=x' in page.locator('#social').inner_text()
        checks.append('untrusted_account_name_is_text')
        page.locator('input[name=media_url]').fill('https://fixture.supabase.co/storage/v1/object/public/growth-media/test.jpg')
        page.locator('textarea[name=caption]').fill('TESTE CONTROLADO. Nenhuma publicação real nesta verificação.')
        page.locator('input[name=test_post]').check()
        page.get_by_role('button', name='Adicionar à fila', exact=True).click()
        page.get_by_text('Publicação enfileirada. Conclusão depende da confirmação da Meta.', exact=True).wait_for()
        assert captured[0]['test_post'] is True and captured[0]['mime_type'] == 'image/jpeg'
        assert 'access_token' not in captured[0]
        checks.append('queue_form_sends_correct_format_without_meta_tokens')
        assert page.get_by_role('link', name='Ver publicação').count() == 0
        checks.append('queued_fixture_not_presented_as_published')
        page.screenshot(path=str(args.out/'integrations-desktop-CONTROLLED.png'), full_page=True)
        page.set_viewport_size({'width': 390, 'height': 844})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        checks.append('mobile_390px_without_page_overflow')
        page.screenshot(path=str(args.out/'integrations-mobile-CONTROLLED.png'), full_page=True)
        page.get_by_role('button', name='Sair', exact=True).click()
        page.get_by_role('button', name='Entrar', exact=True).wait_for()
        assert page.locator('#social').inner_html() == ''
        assert page.locator('#sales-panel').inner_html() == ''
        checks.append('logout_clears_private_account_data')
        assert not errors, errors
        browser.close()
    report = {'state': 'TESTED', 'platform': sys.platform, 'browser': 'isolated real Chromium',
              'backend': 'CONTROLLED_FIXTURES', 'meta_real_publication': False, 'checks': checks, 'javascript_errors': errors}
    (args.out/'browser-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))
finally:
    server.shutdown()
    server.server_close()
