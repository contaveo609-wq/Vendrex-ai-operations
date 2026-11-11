import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from vendrex.codex import CodexAdapter, OUTPUT_SCHEMA, environment


class FakeProcess:
    def __init__(self, command, timeout=False):
        self.command=command
        self.returncode=None if timeout else 0
        self.stdin=io.BytesIO()
        self.stdout=io.BytesIO(b'{"type":"turn.completed","usage":{"input_tokens":12,"output_tokens":6}}\n')
        self.stderr=io.BytesIO(b'')
        self.terminated=False
        if not timeout:
            output=Path(command[command.index('--output-last-message')+1])
            output.write_text(json.dumps({'summary':'Teste isolado do protocolo, sem modelo real.','status':'draft','files':[],'evidence':[],'next_actions':[]}),encoding='utf-8')
    def poll(self): return self.returncode
    def terminate(self): self.terminated=True;self.returncode=-1
    def kill(self): self.terminated=True;self.returncode=-9
    def wait(self,timeout=None): return self.returncode


class AdapterTests(unittest.TestCase):
    def test_command_uses_chatgpt_sandbox_structured_output_and_stdin(self):
        with tempfile.TemporaryDirectory() as path:
            adapter=CodexAdapter(binary='test-codex')
            help_text='--ignore-user-config --output-schema --ephemeral --sandbox'
            with patch.object(adapter,'availability',return_value={'state':'CONNECTED'}),patch('vendrex.codex.subprocess.run',return_value=subprocess.CompletedProcess([],0,help_text,'')),patch('vendrex.codex.subprocess.Popen',side_effect=lambda command,**kwargs:FakeProcess(command)) as popen:
                result,usage=adapter.run(Path(path),'Never shell-expand $(secret).','gpt-6-luna','medium')
            command=popen.call_args.args[0]
            self.assertIn('read-only',command)
            self.assertIn('forced_login_method="chatgpt"',command)
            self.assertIn('mcp_servers={}',command)
            self.assertEqual(command[-1],'-')
            self.assertFalse(any('danger' in part for part in command))
            self.assertEqual(result['status'],'draft')
            self.assertEqual(usage['output_tokens'],6)

    def test_adapter_timeout_stops_process_and_preserves_workspace(self):
        with tempfile.TemporaryDirectory() as path:
            adapter=CodexAdapter(binary='test-codex')
            processes=[]
            def launch(command,**_):
                process=FakeProcess(command,timeout=True)
                processes.append(process)
                return process
            with patch.object(adapter,'availability',return_value={'state':'CONNECTED'}),patch('vendrex.codex.subprocess.run',return_value=subprocess.CompletedProcess([],0,'--ignore-user-config --output-schema --ephemeral --sandbox','')),patch('vendrex.codex.subprocess.Popen',side_effect=launch):
                with self.assertRaises(TimeoutError): adapter.run(Path(path),'test','gpt-6-luna','medium',timeout=0)
            self.assertTrue(processes[0].terminated)
            self.assertTrue(Path(path).exists())

    def test_paid_credentials_removed_from_subprocess(self):
        with patch.dict('os.environ',{'OPENAI_API_KEY':'never-print','CODEX_API_KEY':'never-print','OPENAI_BASE_URL':'https://unused.invalid'}):
            result=environment()
            self.assertNotIn('OPENAI_API_KEY',result)
            self.assertNotIn('CODEX_API_KEY',result)
            self.assertNotIn('OPENAI_BASE_URL',result)

    def test_nonexistent_file_is_not_accepted_as_delivery(self):
        with tempfile.TemporaryDirectory() as path:
            adapter=CodexAdapter(binary='test-codex')
            def launch(command,**_):
                process=FakeProcess(command)
                output=Path(command[command.index('--output-last-message')+1])
                result=json.loads(output.read_text(encoding='utf-8'))
                result['files']=['imaginary-delivery.html']
                output.write_text(json.dumps(result),encoding='utf-8')
                return process
            with patch.object(adapter,'availability',return_value={'state':'CONNECTED'}),patch('vendrex.codex.subprocess.run',return_value=subprocess.CompletedProcess([],0,'--ignore-user-config --output-schema --ephemeral --sandbox','')),patch('vendrex.codex.subprocess.Popen',side_effect=launch):
                with self.assertRaisesRegex(ValueError,'inexistente'):
                    adapter.run(Path(path),'test','gpt-6-luna','medium')


if __name__=='__main__': unittest.main()
