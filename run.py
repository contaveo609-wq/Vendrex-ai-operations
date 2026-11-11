"""Entry point. Python 3.11+, standard library only."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import signal
import sys
import threading
import webbrowser

from vendrex.db import ExecutorLock, ROOT
from vendrex.service import Service, source_zip
from vendrex.web import server_for


def demo_seed(service):
    if service.db.setting('demo',False): return
    service.db.set('demo',True)
    service.add_record('leads',{'name':'Restaurante Exemplo · FICTÍCIO','segment':'Restaurante','city':'Recife','source':'https://example.com','pain':'Hipótese de organização de pedidos','contact':'Envio manual, sem contato real','interest_confirmed':False})
    service.add_record('research',{'source':'Material fictício de demonstração','text':'Exemplo editorial local. Não representa pesquisa de mercado.'})
    service.confirm_sale({'client_name':'Cliente de demonstração · FICTÍCIO','scope':'Exemplo de site institucional para teste do fluxo interno.','confirmation_evidence':'Confirmação fictícia de demonstração','deadline':'2030-12-30','amount':597.90,'idempotency_key':'demo-sale','validated_by_human':True})
    service.create_task(agent='sales',kind='QUALIFY_LEADS',description='Qualificar lead fictício')
    service.create_task(agent='social',kind='SOCIAL_PACK',description='Criar rascunho de demonstração')
    service.create_task(agent='director',kind='DIRECTOR_DAILY_REVIEW',description='Gerar relatório da demonstração')
    service.control('start')
    while service.run_next(): pass
    service.control('pause')


def main():
    parser = argparse.ArgumentParser(description='VENDREX AI Operations — execução local supervisionada')
    parser.add_argument('command',choices=['serve','tick','diagnose','status','backup','package','test-sale'])
    parser.add_argument('--data',type=Path,default=None)
    parser.add_argument('--port',type=int,default=8766)
    parser.add_argument('--demo',action='store_true',help='Base isolada com dados explicitamente fictícios')
    parser.add_argument('--open',action='store_true',help='Abre o navegador local')
    args = parser.parse_args()
    if args.command=='package':
        target = ROOT/'dist/VENDREX-AI-OPERATIONS-V1.zip'
        target.parent.mkdir(exist_ok=True)
        target.write_bytes(source_zip())
        print(target)
        return 0
    data = args.data or Path(os.environ.get('VENDREX_DATA') or ROOT/('runtime-demo' if args.demo else 'runtime'))
    service = Service(data)
    if args.command=='status':
        print(json.dumps(service.snapshot(),ensure_ascii=False,indent=2))
        return 0
    if args.command=='diagnose':
        print(json.dumps(service.diagnose(),ensure_ascii=False,indent=2))
        return 0
    if args.command=='backup':
        print(service.db.backup())
        return 0
    if args.command=='test-sale':
        if not args.demo: parser.error('Use --demo para evitar gravar vendas fictícias na base real.')
        with ExecutorLock(data): demo_seed(service)
        print('Fluxo fictício criado em base isolada. Use python run.py serve --demo --open para inspecionar.')
        return 0
    try:
        with ExecutorLock(data):
            service.queue.recover()
            if args.demo: demo_seed(service)
            if args.command=='tick':
                service.scheduler.tick()
                service.run_next()
                service.db.write_journal()
                return 0
            server = server_for(service,args.port)
            def worker():
                while not service.stop_event.is_set():
                    try:
                        service.scheduler.tick()
                        service.run_next()
                        service.db.write_journal()
                    except Exception as error:
                        from vendrex.db import safe_error
                        service.db.audit('WORKER_ERROR',{'error':safe_error(error)})
                    service.stop_event.wait(2)
            thread = threading.Thread(target=worker,daemon=True)
            thread.start()
            address = f'http://127.0.0.1:{server.server_port}'
            print('VENDREX '+('DEMONSTRAÇÃO FICTÍCIA — ' if args.demo else '')+address,flush=True)
            print('Dados: '+str(data.resolve())+' | Ctrl+C encerra após checkpoint seguro.',flush=True)
            if args.open: webbrowser.open(address)
            try: server.serve_forever(poll_interval=.25)
            except KeyboardInterrupt: pass
            finally:
                service.control('pause')
                service.stop_event.set()
                server.server_close()
                # Do not release the exclusive lock while a Codex process still runs.
                thread.join()
            return 0
    except RuntimeError as error:
        if args.command=='tick' and 'Outro executor' in str(error): return 0
        print(str(error),file=sys.stderr)
        return 1


if __name__=='__main__': raise SystemExit(main())
