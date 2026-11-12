"""Isolated real Chromium on Windows; controlled backend, no production WhatsApp send."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sys
import threading
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
args.out.mkdir(parents=True, exist_ok=True)
behavior = dict(personality='Consultivo', instructions='Uma pergunta por resposta', opening='Olá! Aqui é a Vendrex.', permission='Você tem um minuto?', proposal='Desenvolvemos sistemas sob medida.')
state = dict(state='HOST_REQUIRED', paused=True, mode='TEST', inference_daily_limit=500, test_recipients=[], SALES_WHATSAPP_OPERATIONAL=False)
calls, errors, checks = [], [], []

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def send_json(self, data):
        body = json.dumps(data).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/api/config':
            return self.send_json({'user': {'id': 'CONTROLLED_OWNER', 'email': 'controlled-owner@example.invalid'}})
        if path == '/api/sales/status':
            return self.send_json(state)
        if path == '/api/sales/behavior':
            return self.send_json({'behavior': behavior, 'behavior_revision': 1})
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        data = json.loads(self.rfile.read(int(self.headers.get('Content-Length', '0'))))
        calls.append({'path': path, 'body': data})
        if path == '/api/sales/behavior':
            behavior.update(data['behavior'])
        elif path == '/api/sales/test-contacts':
            state['test_recipients'] = data['recipients']
        return self.send_json({'saved': True})

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT/'netlify-site/dist')))
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1365, 'height': 1000})
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}')
        page.get_by_role('heading', name='Vendrex Sales', exact=True).wait_for()
        assert 'controlled-owner@' in page.locator('#identity').inner_text()
        checks.append('private_identity_bootstrap_controlled_backend')
        assert page.get_by_role('button', name='Ativar atendimento geral', exact=True).is_disabled()
        assert page.get_by_role('button', name='Atender contato de teste', exact=True).is_disabled()
        checks.append('activation_requires_real_connected_gateway_and_proof')
        custom = 'Claro e acolhedor. <img src=x onerror=alert(1)>'
        page.get_by_label('Personalidade', exact=True).fill(custom)
        page.get_by_role('button', name='Salvar personalidade e falas', exact=True).click()
        page.get_by_text('Configuração salva no Supabase.', exact=True).wait_for()
        assert behavior['personality'] == custom
        assert page.locator('#sales img').count() == 0
        checks.append('personality_persists_as_escaped_text')
        page.reload()
        page.get_by_role('heading', name='Vendrex Sales', exact=True).wait_for()
        assert page.get_by_label('Personalidade', exact=True).input_value() == custom
        checks.append('personality_reload_persistence')
        page.locator('input[name=recipients]').fill('5511999999999')
        page.get_by_role('button', name='Salvar contatos de teste', exact=True).click()
        page.get_by_text('Configuração salva no Supabase.', exact=True).wait_for()
        assert state['test_recipients'] == ['5511999999999']
        assert not any(c['path'].endswith('/worker') for c in calls)
        checks.append('exact_test_contact_saved_without_triggering_send')
        page.screenshot(path=str(args.out/'sales-netlify-desktop-CONTROLLED.png'), full_page=True)
        page.get_by_role('button', name='Testes dos agentes', exact=True).click()
        assert page.locator('#tests .card').count() == 4
        assert 'não significam' in page.locator('#tests').inner_text()
        checks.append('four_agent_results_distinguish_local_tests_from_remote_workers')
        for path in ['/agent-tests/sales/resultado-inferencia.md', '/agent-tests/builder/calculadora/', '/agent-tests/director/resultado-inferencia.md']:
            assert page.request.get(f'http://127.0.0.1:{server.server_port}'+path).status == 200
        video = ROOT/'netlify-site/dist/agent-tests/growth/vendrex-32s.mp4'
        assert video.is_file() and video.stat().st_size > 1000000
        checks.append('published_artifact_paths_exist_without_invoking_agents')
        page.set_viewport_size({'width': 390, 'height': 844})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        checks.append('mobile_390px_no_overflow')
        page.screenshot(path=str(args.out/'tests-netlify-mobile-CONTROLLED.png'), full_page=True)
        assert not errors, errors
        browser.close()
    result = {'state': 'TESTED', 'platform': sys.platform, 'browser': 'isolated real Chromium', 'backend': 'CONTROLLED_FIXTURES', 'checks': checks, 'javascript_errors': errors, 'whatsapp_real_conversation': False}
    (args.out/'browser-report.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))
finally:
    server.shutdown()
    server.server_close()
