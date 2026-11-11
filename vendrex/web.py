from __future__ import annotations

import json
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import secrets
from urllib.parse import unquote, urlparse
from .db import ROOT, dumps, safe_error
from .policy import ManualUsageProvider
from .service import source_zip


def server_for(service, port=8766):
    csrf = secrets.token_urlsafe(32)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_): pass

        def send(self, status, body, content_type='application/json; charset=utf-8', filename=None):
            if not isinstance(body,bytes): body = (dumps(body) if content_type.startswith('application/json') else str(body)).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type',content_type)
            self.send_header('Content-Length',str(len(body)))
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Referrer-Policy','no-referrer')
            self.send_header('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
            if filename: self.send_header('Content-Disposition','attachment; filename="'+filename+'"')
            self.end_headers()
            self.wfile.write(body)

        def valid_host(self):
            return self.headers.get('Host') in {f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}

        def do_GET(self):
            if not self.valid_host(): return self.send(403,{'error':'Host não autorizado. Acesse pelo endereço local.'})
            path = unquote(urlparse(self.path).path)
            try:
                if path=='/api/snapshot': return self.send(200,{**service.snapshot(),'csrf':csrf})
                if path.startswith('/api/task/'):
                    task_id = path.rsplit('/',1)[1]
                    task = service.queue.get(task_id)
                    return self.send(200,{'task':task,'history':service.db.rows('SELECT * FROM task_history WHERE task_id=? ORDER BY id',(task_id,))})
                if path.startswith('/api/report/'):
                    rows = service.db.rows('SELECT * FROM reports WHERE id=?',(path.rsplit('/',1)[1],))
                    if not rows: return self.send(404,{'error':'Relatório não encontrado.'})
                    return self.send(200,rows[0])
                if path=='/download/source.zip': return self.send(200,source_zip(),'application/zip','VENDREX-AI-OPERATIONS-V1.zip')
                if path=='/download/data.json': return self.send(200,json.dumps(service.snapshot(),ensure_ascii=False,indent=2).encode(),'application/json','vendrex-dados.json')
                if path.startswith('/files/'):
                    relative = path.removeprefix('/files/')
                    target = (service.db.data/relative).resolve()
                    allowed = target.is_relative_to(service.db.data/'workspaces') or target.is_relative_to(service.db.data/'backups')
                    if not allowed or not target.is_file() or target.is_symlink(): return self.send(404,{'error':'Arquivo indisponível.'})
                    return self.send(200,target.read_bytes(),'application/octet-stream',target.name)
                file = ROOT/'dashboard'/('index.html' if path=='/' else path.lstrip('/'))
                if file.resolve().parent!=(ROOT/'dashboard').resolve() or not file.is_file(): return self.send(404,{'error':'Não encontrado.'})
                content = mimetypes.guess_type(file)[0] or 'application/octet-stream'
                return self.send(200,file.read_bytes(),content+'; charset=utf-8')
            except (ValueError,KeyError) as error: self.send(400,{'error':safe_error(error)})
            except Exception as error:
                service.db.audit('HTTP_ERROR',{'error':safe_error(error)})
                self.send(500,{'error':'Falha interna registrada na auditoria.'})

        def do_POST(self):
            if not self.valid_host() or not secrets.compare_digest(self.headers.get('X-Vendrex-CSRF',''),csrf):
                return self.send(403,{'error':'Sessão ou origem inválida. Recarregue o painel local.'})
            origin = self.headers.get('Origin')
            if origin and origin not in {f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}'}:
                return self.send(403,{'error':'Origem não autorizada.'})
            try:
                size = int(self.headers.get('Content-Length','0'))
                if not 0<size<=100_000: return self.send(413,{'error':'Entrada excedida ou vazia.'})
                body = json.loads(self.rfile.read(size))
                if not isinstance(body,dict): raise ValueError('Corpo JSON precisa ser objeto.')
                path = urlparse(self.path).path
                result = None
                if path=='/api/control': result = service.control(body['action'])
                elif path=='/api/tasks': result = {'id':service.create_task(**body)}
                elif path=='/api/sale': result = {'task_id':service.confirm_sale(body)}
                elif path=='/api/record': result = {'id':service.add_record(body['entity'],body['data'])}
                elif path=='/api/lead-update': result = {'id':service.update_lead(body['id'],body['data'])}
                elif path=='/api/approval':
                    if not isinstance(body.get('approved'),bool): raise ValueError('Decisão deve ser booleana.')
                    result = service.decide_approval(body['id'],body['approved'])
                elif path=='/api/task-action':
                    task_id = body['id']
                    if body['action']=='retry': service.retry(task_id)
                    elif body['action']=='cancel': service.queue.transition(task_id,'CANCELLED','Cancelamento humano')
                    else: raise ValueError('Ação inválida.')
                    result = {'ok':True}
                elif path=='/api/config': result = service.update_config(body)
                elif path=='/api/usage':
                    ManualUsageProvider(service.guard).update(body['five_hour'],body['weekly'])
                    result = service.guard.status()
                elif path=='/api/diagnose': result = service.diagnose()
                elif path=='/api/model-map':
                    service.map_model(body['id'],body['family'])
                    result = {'ok':True}
                elif path=='/api/backup':
                    target = service.db.backup()
                    result = {'path':str(target.relative_to(service.db.data))}
                elif path=='/api/retention': result = service.retention_request()
                elif path=='/api/training': result = {'id':service.train(body)}
                elif path=='/api/training-evaluate': result = {'approval':service.evaluate_training(body['id'],body)}
                else: return self.send(404,{'error':'Operação desconhecida.'})
                self.send(200,result)
            except (ValueError,KeyError,TypeError) as error: self.send(400,{'error':safe_error(error)})
            except Exception as error:
                service.db.audit('HTTP_ERROR',{'error':safe_error(error)})
                self.send(500,{'error':'Falha interna registrada na auditoria.'})

    server = ThreadingHTTPServer(('127.0.0.1',port),Handler)
    server.daemon_threads = True
    return server
