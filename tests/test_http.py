import http.client
import io
import json
from pathlib import Path
import tempfile
import threading
import unittest
import zipfile
from vendrex.service import Service, source_zip
from vendrex.web import server_for


class HTTPTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.service = Service(Path(self.tmp.name))
        self.server = server_for(self.service,0)
        self.thread = threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        self.port = self.server.server_port
        status,data = self.request('GET','/api/snapshot')
        self.assertEqual(status,200)
        self.token = json.loads(data)['csrf']
    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.tmp.cleanup()
    def request(self,method,path,data=None,headers=None):
        connection = http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=10)
        try:
            connection.request(method,path,body=json.dumps(data) if data is not None else None,headers=headers or {})
            response = connection.getresponse()
            return response.status,response.read()
        finally: connection.close()
    def post(self,path,data): return self.request('POST',path,data,{'X-Vendrex-CSRF':self.token,'Content-Type':'application/json'})

    def test_source_download_is_real_zip_with_windows_launcher(self):
        status,data = self.request('GET','/download/source.zip')
        self.assertEqual(status,200)
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            self.assertIsNone(archive.testzip())
            self.assertIn('VENDREX-AI/Iniciar.cmd',archive.namelist())
            self.assertIn('VENDREX-AI/agents/growth/PLAYBOOK.md',archive.namelist())
            self.assertFalse(any('runtime' in n or '.git/' in n or 'vendrex.sqlite' in n for n in archive.namelist()))

    def test_csrf_origin_and_host_enforced(self):
        self.assertEqual(self.request('POST','/api/control',{'action':'start'})[0],403)
        self.assertEqual(self.request('POST','/api/control',{'action':'start'},{'X-Vendrex-CSRF':self.token,'Origin':'https://evil.invalid'})[0],403)
        self.assertEqual(self.request('GET','/api/snapshot',headers={'Host':'evil.invalid'})[0],403)

    def test_start_pause_emergency_controls(self):
        for action,mode in [('start','RUNNING'),('pause','PAUSED'),('emergency','STOPPED')]:
            status,data = self.post('/api/control',{'action':action})
            self.assertEqual(status,200)
            self.assertEqual(json.loads(data)['mode'],mode)

    def test_lead_create_update_qualify_and_task_details(self):
        status,data = self.post('/api/record',{'entity':'leads','data':{'name':'Lead teste','source':'https://example.invalid','pain':'Hipótese','segment':'Restaurante'}})
        self.assertEqual(status,200)
        lead = json.loads(data)['id']
        status,_ = self.post('/api/lead-update',{'id':lead,'data':{'name':'Lead teste','opt_out':True}})
        self.assertEqual(status,200)
        self.assertTrue(self.service.db.records('leads')[0]['data']['opt_out'])
        status,data = self.post('/api/tasks',{'agent':'sales','kind':'QUALIFY_LEADS','description':'Qualificar'})
        self.assertEqual(status,200)
        task = json.loads(data)['id']
        self.post('/api/control',{'action':'start'})
        self.service.run_next()
        self.assertEqual(self.request('GET','/api/task/'+task)[0],200)

    def test_traversal_and_private_database_not_served(self):
        for path in ['/files/../vendrex.sqlite3','/files/%2e%2e/vendrex.sqlite3','/../run.py','/files/vendrex.sqlite3']:
            self.assertEqual(self.request('GET',path)[0],404)

    def test_backup_endpoint_file_download(self):
        status,data = self.post('/api/backup',{})
        self.assertEqual(status,200)
        path = json.loads(data)['path']
        status,content = self.request('GET','/files/'+path)
        self.assertEqual(status,200)
        self.assertTrue(content.startswith(b'SQLite format 3'))

    def test_html_js_css_and_favicon_served(self):
        for path in ['/','/app.js','/style.css','/favicon.svg']:
            self.assertEqual(self.request('GET',path)[0],200)

    def test_usage_safety_and_schema_validation(self):
        self.assertEqual(self.post('/api/usage',{'five_hour':10,'weekly':70})[0],200)
        self.assertFalse(self.service.guard.status()['allowed'])
        self.assertEqual(self.post('/api/config',{'usage_reserve':0})[0],400)
        self.assertEqual(self.post('/api/tasks',{'agent':'builder','kind':'BUILD_PROJECT','description':'teste'})[0],400)

    def test_mission_endpoint_and_real_media_range(self):
        status,_=self.post('/api/missions',{})
        self.assertEqual(status,200)
        self.assertEqual(len(self.service.db.rows('SELECT * FROM tasks')),4)
        directory=self.service.db.data/'workspaces/test-media';directory.mkdir(parents=True)
        (directory/'test.mp4').write_bytes(b'0123456789')
        status,body=self.request('GET','/media/workspaces/test-media/test.mp4',headers={'Range':'bytes=2-5'})
        self.assertEqual(status,206);self.assertEqual(body,b'2345')
        self.assertEqual(self.request('GET','/media/../vendrex.sqlite3')[0],404)

    def test_source_export_omits_nested_secrets_and_build_caches(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'cloud/node_modules').mkdir(parents=True)
            (root/'cloud/.env').write_text('SECRET=fake-test-value')
            (root/'cloud/node_modules/cache.js').write_text('fixture')
            (root/'cloud/package.json').write_text('{}')
            with patch('vendrex.service.ROOT',root):data=source_zip()
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                self.assertEqual(archive.namelist(),['VENDREX-AI/cloud/package.json'])


if __name__=='__main__': unittest.main()
