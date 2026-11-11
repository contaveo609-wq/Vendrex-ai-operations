from datetime import datetime,timedelta,timezone
import json
from pathlib import Path
import tempfile
import unittest
from vendrex.service import Service
from vendrex.communications import ReplyEngine,eligibility
from vendrex.public_web import validate_url


class CommunicationsTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.service=Service(Path(self.tmp.name));self.clock=[2000000000.0]
        self.data={'name':'Empresa fictícia de teste','prospected':True,'prospected_by':'sales','contact_verified':True,'contact_e164':'+5581999999999','contact_authorization':True,'authorization_evidence':'Consentimento fictício de teste','authorization_expires_at':datetime.fromtimestamp(self.clock[0]+86400,timezone.utc).isoformat()}
        self.lead=self.service.db.record('leads',self.data)
        self.engine=ReplyEngine(self.service,clock=lambda:self.clock[0])
    def tearDown(self):self.tmp.cleanup()
    def receive(self,message='m1',body='Olá, queria entender o sistema',**extra):return self.engine.receive(message,'c1',self.lead,self.data['contact_e164'],body,**extra)

    def test_eligible_inbound_debounce_three_seconds(self):
        self.assertTrue(self.receive()['eligible']);self.assertEqual(self.engine.prepare('c1',lambda *_:'Resposta de teste')['state'],'WAITING');self.clock[0]+=3
        result=self.engine.prepare('c1',lambda *_:'Vamos entender sua operação antes de propor uma solução.');self.assertEqual(result['state'],'PREPARED')
        self.assertEqual(self.engine.send(result['id'])['state'],'BLOCKED')

    def test_no_consent_unknown_personal_group_optout_all_blocked(self):
        for change in [{'contact_authorization':False},{'prospected':False},{'personal_contact':True},{'opt_out':True},{'blocked':True},{'contact_e164':'+5581888888888'}]:
            self.assertFalse(eligibility({**self.data,**change},self.data['contact_e164'],timestamp=self.clock[0])[0])
        self.assertFalse(eligibility(self.data,self.data['contact_e164'],is_group=True,timestamp=self.clock[0])[0])

    def test_two_messages_grouped_once_after_new_window(self):
        self.receive();self.clock[0]+=2;self.receive('m2','Mais uma informação');self.clock[0]+=2
        self.assertEqual(self.engine.prepare('c1',lambda *_:'teste')['state'],'WAITING');self.clock[0]+=1
        seen=[]
        result=self.engine.prepare('c1',lambda messages,lead:seen.extend(messages) or 'Resposta única agrupada')
        self.assertEqual(len(seen),2);self.assertEqual(result['state'],'PREPARED')
        self.assertEqual(self.engine.prepare('c1',lambda *_:'duplicata')['id'],result['id'])

    def test_new_message_during_generation_cancels_stale_response(self):
        self.receive();self.clock[0]+=3
        def generator(*_):self.receive('m2','Nova informação');return 'Resposta desatualizada'
        self.assertEqual(self.engine.prepare('c1',generator)['state'],'CANCELLED')

    def test_optout_cancels_pending(self):
        self.receive();self.clock[0]+=1;self.receive('m2','sair');self.clock[0]+=10
        self.assertEqual(self.engine.prepare('c1',lambda *_:'Não deve gerar')['state'],'WAITING')
        self.assertTrue(self.service.db.records('leads')[0]['data']['opt_out'])

    def test_human_takeover_cancels_generation(self):
        self.receive();self.clock[0]+=3
        def generator(*_):self.engine.takeover('c1');return 'Resposta cancelada'
        self.assertEqual(self.engine.prepare('c1',generator)['state'],'CANCELLED')

    def test_duplicates_not_reprocessed(self):
        self.receive();self.assertTrue(self.receive()['duplicate'])
        self.assertEqual(len(self.service.db.rows('SELECT * FROM inbound_messages')),1)

    def test_financial_or_complaint_message_requires_human(self):
        self.receive(body='Quero desconto e contrato');self.clock[0]+=3
        self.assertEqual(self.engine.prepare('c1',lambda *_:'Vou encaminhar sua solicitação.Operação não aprovada.')['state'],'WAITING_HUMAN')

    def test_sent_once_using_isolated_test_transport_not_production_claim(self):
        class FixtureTransport:
            state='CONNECTED';validated=True
            def __init__(self):self.calls=[]
            def send(self,*args):self.calls.append(args);return {'test_receipt':'fixture-only'}
        fixture=FixtureTransport();self.engine.transport=fixture;self.engine.simulation_only=True
        config=self.service.config;config['sales'].update(autonomous_enabled=True,connector_validated=True);self.service.db.set('config',config)
        self.receive();self.clock[0]+=3;prepared=self.engine.prepare('c1',lambda *_:'Teste isolado.')
        self.assertEqual(self.engine.send(prepared['id'])['state'],'SENT')
        self.assertEqual(self.engine.send(prepared['id'])['state'],'BLOCKED')
        self.assertEqual(len(fixture.calls),1)

    def test_disconnected_or_ambiguous_send_never_blindly_retries(self):
        class FixtureTransport:
            state='CONNECTED';validated=True
            def send(self,*_):raise ConnectionError('Falha simulada, efeito externo desconhecido')
        self.engine.transport=FixtureTransport();self.engine.simulation_only=True
        config=self.service.config;config['sales'].update(autonomous_enabled=True,connector_validated=True);self.service.db.set('config',config)
        self.receive();self.clock[0]+=3;prepared=self.engine.prepare('c1',lambda *_:'Teste isolado.')
        with self.assertRaises(ConnectionError):self.engine.send(prepared['id'])
        self.assertEqual(self.service.db.rows('SELECT status FROM reply_outbox')[0]['status'],'RECONCILIATION_REQUIRED')
        self.assertEqual(self.engine.send(prepared['id'])['state'],'BLOCKED')


class V22Tests(unittest.TestCase):
    def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.service=Service(Path(self.tmp.name))
    def tearDown(self):self.tmp.cleanup()

    def test_company_context_and_correct_pillars_for_all_agents(self):
        snapshot=self.service.snapshot();self.assertEqual([a['id'] for a in snapshot['agents']],['sales','builder','growth','director'])
        self.assertEqual(self.service.config['offers'][0]['reference_price'],1490.90)
        self.assertTrue(all(r['effort']=='xhigh' for r in self.service.config['routing'].values()))
        self.assertEqual(self.service.config['sales_pillars'],snapshot['company_context']['sales_pillars'])

    def test_browser_task_payload_alias_is_accepted(self):
        task=self.service.create_task(agent='builder',kind='BUILDER_CALCULATOR',description='Gerar calculadora',input={'title':'Meu teste'})
        self.assertEqual(self.service.queue.get(task)['input']['title'],'Meu teste')

    def test_mission_can_be_queued_without_claiming_cli_connected(self):
        tasks=self.service.queue_missions();self.assertEqual(len(tasks),4)
        self.assertEqual(len(self.service.db.rows('SELECT * FROM tasks')),4)
        self.assertTrue(all(not t['requires_ai'] for t in self.service.snapshot()['tasks']))

    def test_private_research_targets_rejected(self):
        for url in ['http://example.com','https://127.0.0.1/','https://10.0.0.1/','https://localhost/','https://169.254.169.254/','https://user:password@example.com/']:
            with self.assertRaises(ValueError):validate_url(url)

    def test_cloud_store_requires_session_and_official_url(self):
        from vendrex.cloud_sync import SupabaseStore
        with self.assertRaises(ValueError):SupabaseStore('https://evil.invalid','publishable','session')
        with self.assertRaises(ValueError):SupabaseStore('https://dedicated.supabase.co','','')

    def test_v1_social_database_migrates_without_losing_instructions(self):
        config=self.service.config;config.pop('version');config['routing']['social']=config['routing'].pop('growth')
        config['sales_pillars']=['Antigo 1','Antigo 2','Antigo 3','Antigo 4'];config['offers'][0]['reference_price']=597.90
        with self.service.db.transaction() as conn:
            conn.execute("INSERT INTO agents VALUES('social','VENDREX Social','Perfil legado','#ffffff',1)")
            conn.execute("UPDATE instructions SET agent='social' WHERE agent='growth'")
            conn.execute("DELETE FROM agents WHERE id='growth'")
            self.service.db.set('config',config,conn)
        restored=Service(Path(self.tmp.name))
        self.assertEqual(len(restored.snapshot()['agents']),4)
        self.assertTrue(restored.db.rows("SELECT 1 FROM instructions WHERE agent='growth'"))
        self.assertEqual(restored.config['offers'][0]['reference_price'],1490.90)
        self.assertTrue(list((restored.db.data/'backups').glob('*.sqlite3')))


if __name__=='__main__':unittest.main()
