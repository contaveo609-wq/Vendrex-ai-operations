from __future__ import annotations

import json
import os
from pathlib import Path
import queue
import shutil
import subprocess
import threading
import time
from .db import dumps, safe_error, uid


def environment():
    result = os.environ.copy()
    for name in ('OPENAI_API_KEY','CODEX_API_KEY','ANTHROPIC_API_KEY','OPENAI_BASE_URL','OPENAI_API_BASE','GH_TOKEN','GITHUB_TOKEN','VERCEL_TOKEN','SUPABASE_SERVICE_ROLE_KEY'):
        result.pop(name,None)
    return result


def codex_command(binary=None):
    binary = binary or shutil.which('codex')
    if not binary: raise RuntimeError('Codex CLI não instalado.')
    if os.name=='nt' and Path(binary).suffix.lower() in {'.cmd','.bat','.ps1'}:
        entry = Path(binary).parent/'node_modules/@openai/codex/bin/codex.js'
        node = shutil.which('node')
        if not node or not entry.is_file():
            raise RuntimeError('Não foi possível localizar o executável oficial do Codex. Verifique a instalação npm de @openai/codex.')
        # Call the JS entrypoint directly. Untrusted text never passes through cmd.exe.
        return [node,str(entry)]
    return [binary]


class CodexRPC:
    """Official app-server stdio. No model turn is created by diagnostic calls."""
    def __init__(self, timeout=20):
        self.timeout = timeout
        self.messages = queue.Queue()
        self.sequence = 0
        self.process = None

    def __enter__(self):
        binary = shutil.which('codex')
        if not binary:
            raise RuntimeError('Codex CLI indisponível.')
        self.process = subprocess.Popen(codex_command(binary)+['app-server','--stdio','-c','forced_login_method="chatgpt"'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,encoding='utf-8',errors='replace',env=environment())
        def reader():
            for line in self.process.stdout:
                try: self.messages.put(json.loads(line))
                except ValueError: pass
        threading.Thread(target=reader,daemon=True).start()
        try:
            self.call('initialize',{'clientInfo':{'name':'vendrex_operations','version':'1.0.0'}})
            self.send({'method':'initialized'})
            return self
        except BaseException:
            self.__exit__()
            raise

    def send(self, value):
        self.process.stdin.write(dumps(value)+'\n')
        self.process.stdin.flush()

    def call(self, method, params):
        self.sequence += 1
        self.send({'id':self.sequence,'method':method,'params':params})
        deadline = time.monotonic()+self.timeout
        while time.monotonic()<deadline:
            try: item = self.messages.get(timeout=.2)
            except queue.Empty:
                if self.process.poll() is not None: raise RuntimeError('Codex app-server encerrou.')
                continue
            if item.get('id')==self.sequence:
                if 'error' in item: raise RuntimeError(safe_error(item['error']))
                return item.get('result',{})
        raise TimeoutError(f'Tempo esgotado em {method}.')

    def __exit__(self, *_):
        if self.process:
            self.process.terminate()
            try: self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=3)
            self.process.stdin.close()
            self.process.stdout.close()


OUTPUT_SCHEMA = {'type':'object','additionalProperties':False,'properties':{
    'summary':{'type':'string'},'status':{'type':'string','enum':['draft','needs_review','blocked']},
    'files':{'type':'array','items':{'type':'string'}},'evidence':{'type':'array','items':{'type':'string'}},
    'next_actions':{'type':'array','items':{'type':'string'}}},'required':['summary','status','files','evidence','next_actions']}


class CodexAdapter:
    def __init__(self, binary=None): self.binary = binary or shutil.which('codex')

    def availability(self):
        if not self.binary:
            return {'state':'UNAVAILABLE','detail':'Instale o Codex CLI oficial.','capabilities':[]}
        try:
            login = subprocess.run(codex_command(self.binary)+['login','status'],capture_output=True,text=True,encoding='utf-8',timeout=15,env=environment())
            good = login.returncode==0 and 'chatgpt' in (login.stdout+login.stderr).lower()
            return {'state':'IMPLEMENTED' if good else 'AUTH_REQUIRED','local_auth_present':good,'detail':'Login local detectado; conexão real ainda exige uma chamada bem-sucedida.' if good else 'Use codex login com ChatGPT. API paga não aceita.','capabilities':['exec','sandbox','structured_output'] if good else []}
        except (OSError,RuntimeError,subprocess.TimeoutExpired) as error:
            return {'state':'ERROR','detail':safe_error(error),'capabilities':[]}

    def run(self, workspace: Path, prompt: str, model: str, effort: str, builder=False, timeout=600, checkpoint=None):
        available=self.availability()
        if not available.get('local_auth_present') and available['state']!='CONNECTED':
            raise RuntimeError('Autenticação ChatGPT não validada.')
        help_text = subprocess.run(codex_command(self.binary)+['exec','--help'],capture_output=True,text=True,timeout=15).stdout
        for flag in ('--ignore-user-config','--output-schema','--ephemeral','--sandbox'):
            if flag not in help_text: raise RuntimeError(f'Codex sem {flag}. Atualize o CLI oficial; proteções preservadas.')
        run_id = uid()
        schema = workspace / ('.schema-'+run_id+'.json')
        output = workspace / ('.result-'+run_id+'.json')
        schema.write_text(dumps(OUTPUT_SCHEMA),encoding='utf-8')
        command = codex_command(self.binary)+['-a','never','exec','--ignore-user-config','--ephemeral','--json','--skip-git-repo-check',
                   '--sandbox','workspace-write' if builder else 'read-only','-c','forced_login_method="chatgpt"',
                   '-c','model_provider="openai"','-c','sandbox_workspace_write.network_access=false','-c','mcp_servers={}',
                   '-c',f'model_reasoning_effort="{effort}"','--model',model,'--cd',str(workspace),
                   '--output-schema',str(schema),'--output-last-message',str(output),'-']
        process = subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=environment())
        # Bounded temporary spool prevents pipe deadlocks and unbounded memory growth.
        import tempfile
        size = [0]
        exceeded = threading.Event()
        usage = {}
        with tempfile.TemporaryFile() as stderr:
            def read(stream, errors=False):
                for line in iter(stream.readline,b''):
                    size[0] += len(line)
                    if size[0]>2_000_000:
                        exceeded.set()
                        continue
                    if errors: stderr.write(line)
                    else:
                        try:
                            event = json.loads(line)
                            if event.get('type')=='turn.completed': usage.update(event.get('usage') or {})
                        except ValueError: pass
            readers = [threading.Thread(target=read,args=(process.stdout,),daemon=True),threading.Thread(target=read,args=(process.stderr,True),daemon=True)]
            for reader in readers: reader.start()
            def feed():
                try:
                    process.stdin.write(prompt.encode())
                    process.stdin.close()
                except OSError: pass
            threading.Thread(target=feed,daemon=True).start()
            started = time.monotonic()
            try:
                while process.poll() is None:
                    if exceeded.is_set() or time.monotonic()-started>timeout:
                        raise TimeoutError('Codex excedeu tempo ou saída. Arquivos preservados para revisão.')
                    if checkpoint: checkpoint()
                    time.sleep(.2)
                for reader in readers: reader.join(timeout=2)
                if process.returncode:
                    stderr.seek(0)
                    raise RuntimeError(safe_error(stderr.read().decode(errors='replace')) or 'Falha no Codex CLI.')
                if not output.exists() or output.stat().st_size>1_000_000:
                    raise RuntimeError('Codex não produziu um resultado estruturado válido.')
                result = json.loads(output.read_text(encoding='utf-8'))
                if set(result)!=set(OUTPUT_SCHEMA['required']) or result['status'] not in {'draft','needs_review','blocked'} or not isinstance(result['summary'],str):
                    raise ValueError('Resultado Codex fora do contrato.')
                for key in ('files','evidence','next_actions'):
                    if not isinstance(result[key],list) or any(not isinstance(x,str) for x in result[key]): raise ValueError('Resultado Codex inválido.')
                for name in result['files']:
                    resolved = (workspace/name).resolve()
                    if not resolved.is_relative_to(workspace.resolve()): raise ValueError('Arquivo fora do projeto isolado.')
                return result,usage
            finally:
                if process.poll() is None:
                    process.terminate()
                    try: process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=5)
                for reader in readers: reader.join(timeout=2)
                process.stdout.close()
                process.stderr.close()
