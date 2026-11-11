from datetime import datetime,timezone
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from vendrex.service import Service
from vendrex.communications import ReplyEngine,eligibility

class ReplyV23Tests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.s=Service(Path(self.tmp.name));self.t=[2000000000.0]
  self.lead={'name':'TEST ONLY','prospected':True,'prospected_by':'sales','contact_verified':True,'contact_e164':'+5581999999999','contact_authorization':True,'authorization_evidence':'TEST ONLY','authorization_expires_at':datetime.fromtimestamp(self.t[0]+3600,timezone.utc).isoformat()}
  self.id=self.s.db.record('leads',self.lead);self.e=ReplyEngine(self.s,clock=lambda:self.t[0])
 def tearDown(self):self.tmp.cleanup()
 def receive(self,msg='1',body='Olá'):
  return self.e.receive(msg,'c',self.id,self.lead['contact_e164'],body)
 def prepare(self):self.receive();self.t[0]+=3;return self.e.prepare('c',lambda *_:'Resposta de teste sem compromissos.')
 def test_generation_failure_retries_once_then_human(self):
  self.receive();self.t[0]+=3
  def fail(*_):raise RuntimeError('provider down')
  with self.assertRaises(RuntimeError):self.e.prepare('c',fail)
  self.assertEqual(self.e.prepare('c',fail)['state'],'WAITING');self.t[0]+=3
  with self.assertRaises(RuntimeError):self.e.prepare('c',fail)
  self.assertEqual(self.s.db.rows('SELECT status,attempts FROM reply_outbox')[0],{'status':'WAITING_HUMAN','attempts':2})
 def test_success_after_retry_and_dedup(self):
  self.receive();self.t[0]+=3
  with self.assertRaises(ValueError):self.e.prepare('c',lambda *_:'')
  self.t[0]+=3;r=self.e.prepare('c',lambda *_:'Recuperado.')
  self.assertEqual(r['state'],'PREPARED');self.assertEqual(self.e.prepare('c',lambda *_:'duplicado')['id'],r['id'])
 def test_crash_generation_lease_recovered(self):
  self.prepare()
  with self.s.db.transaction() as c:c.execute("UPDATE reply_outbox SET status='GENERATING',lease_until=?",(self.t[0]-1,))
  self.e.recover();self.t[0]+=3
  self.assertEqual(self.e.prepare('c',lambda *_:'Após recuperação')['state'],'PREPARED')
 def test_crash_dispatch_requires_reconciliation(self):
  self.prepare()
  with self.s.db.transaction() as c:c.execute("UPDATE reply_outbox SET status='DISPATCHING'")
  self.e.recover();self.assertEqual(self.s.db.rows('SELECT status FROM reply_outbox')[0]['status'],'RECONCILIATION_REQUIRED')
 def test_takeover_prevents_following_inbound(self):
  self.prepare();self.e.takeover('c');r=self.receive('2','Outra mensagem')
  self.assertEqual(r['reason'],'HUMAN_TAKEOVER');self.t[0]+=10
  self.assertEqual(self.e.prepare('c',lambda *_:'proibida')['state'],'WAITING')
 def test_opt_out_sentence(self):self.assertEqual(self.receive(body='Por favor, pare!')['reason'],'OPT_OUT')
 def test_legacy_flags_never_activate_production(self):
  r=self.prepare()
  class Fake:
   state='CONNECTED';validated=True
   def send(self,*_):raise AssertionError('Must not send')
  self.e.transport=Fake();config=self.s.config;config['sales'].update(autonomous_enabled=True,connector_validated=True);self.s.db.set('config',config)
  self.assertEqual(self.e.send(r['id'])['reason'],'SUPPORTED_PROVIDER_NOT_IMPLEMENTED')
 def test_new_inbound_during_simulated_send_remains_pending(self):
  r=self.prepare();config=self.s.config;config['sales'].update(autonomous_enabled=True,connector_validated=True);self.s.db.set('config',config)
  outer=self
  class Fake:
   state='CONNECTED';validated=True
   def send(self,*_):outer.receive('2','Nova pergunta');return {'fixture':'SIMULATION_ONLY'}
  self.e.transport=Fake();self.e.simulation_only=True;self.e.send(r['id'])
  c=self.s.db.rows('SELECT * FROM conversations')[0]
  self.assertEqual(c['revision'],2);self.assertEqual(c['processed_revision'],1);self.assertEqual(c['status'],'PENDING');self.assertIsNotNone(c['due_at'])
 def test_human_during_generation_cancels(self):
  self.receive();self.t[0]+=3
  def generation(*_):self.e.takeover('c');return 'stale'
  self.assertEqual(self.e.prepare('c',generation)['state'],'CANCELLED')
 def test_generated_financial_commitment_requires_human(self):
  self.receive();self.t[0]+=3
  self.assertEqual(self.e.prepare('c',lambda *_:'O preço será R$ 100 com desconto.')['state'],'WAITING_HUMAN')
 def test_delay_all_values(self):
  for d in range(3,11):
   self.s.whatsapp.control('delay',delay=d);r=self.receive(str(d));self.assertEqual(r['due_at']-self.t[0],d)
  for d in [2,11,True,3.5]:
   with self.assertRaises(ValueError):self.s.whatsapp.control('delay',delay=d)
 def test_activation_needs_real_provider(self):
  with self.assertRaises(ValueError):self.s.whatsapp.control('activate',confirmation=True)
  self.assertFalse(self.s.whatsapp.status()['connected'])
 def test_disable_invalidates_pending(self):
  self.prepare();self.s.whatsapp.control('disable');self.assertEqual(self.s.db.rows('SELECT status FROM reply_outbox')[0]['status'],'CANCELLED')
 def test_naive_consent_time_rejected(self):
  data={**self.lead,'authorization_expires_at':'2099-01-01T12:00:00'}
  self.assertEqual(eligibility(data,data['contact_e164'],timestamp=self.t[0])[1],'CONSENT_INVALID')
 def test_unknown_takeover_not_reported_success(self):
  with self.assertRaises(ValueError):self.e.takeover('missing')
 def test_unexpired_lease_recovers_after_time_passes(self):
  self.prepare()
  with self.s.db.transaction() as c:c.execute("UPDATE reply_outbox SET status='GENERATING',lease_until=?",(self.t[0]+5,))
  self.e.recover();self.assertEqual(self.s.db.rows('SELECT status FROM reply_outbox')[0]['status'],'GENERATING')
  self.t[0]+=6;self.e.recover(startup=False);self.assertEqual(self.s.db.rows('SELECT status FROM reply_outbox')[0]['status'],'RETRY_GENERATION')
 def test_history_preserves_messages(self):
  self.prepare();h=self.e.history('c');self.assertEqual(len(h['inbound']),1);self.assertEqual(len(h['outbound']),1)

class BusinessV23Tests(unittest.TestCase):
 def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.s=Service(Path(self.tmp.name))
 def tearDown(self):self.tmp.cleanup()
 def campaign(self):return {'source':'fixture://controlled-export','period':'2026-11-01/2026-11-02','currency':'BRL','dataset_kind':'SIMULATION_ONLY','campaigns':[{'campaign_id':'test','spend':100,'impressions':10000,'clicks':200,'leads':10,'qualified_leads':4,'acquisitions':2,'conversions':[]}]}
 def test_metrics_reproducible_and_idempotent(self):
  data=self.campaign();self.s.campaigns.ingest(data);self.assertTrue(self.s.campaigns.ingest(data)['duplicate'])
  r=self.s.campaigns.summary()['campaigns'][0];self.assertEqual(r['calculated_metrics'],{'CPM':10,'CTR':2,'CPC':0.5,'CPL':10,'CAC':50,'ROAS':None});self.assertEqual(r['dataset_kind'],'SIMULATION_ONLY')
 def test_missing_metrics_never_invented(self):
  data=self.campaign();data['campaigns']=[{'campaign_id':'empty'}];self.s.campaigns.ingest(data)
  self.assertTrue(all(v is None for v in self.s.campaigns.summary()['campaigns'][0]['calculated_metrics'].values()))
 def test_nonfinite_and_negative_rejected(self):
  for value in [-1,'nan','Infinity',True]:
   data=self.campaign();data['campaigns'][0]['spend']=value
   with self.assertRaises(ValueError):self.s.campaigns.ingest(data)
 def test_conversion_and_sale_dedup_with_controlled_records(self):
  deal=self.s.db.record('deals',{'status':'CONFIRMED','amount':500,'currency':'BRL'})
  data=self.campaign();data['dataset_kind']='OBSERVED_EXPORT';data['campaigns'][0]['conversions']=[{'id':'a','deal_id':deal,'attribution_evidence':'controlled unit fixture'},{'id':'a','deal_id':deal,'attribution_evidence':'duplicate'},{'id':'b','deal_id':deal,'attribution_evidence':'same sale'}]
  self.s.campaigns.ingest(data);r=self.s.campaigns.summary()['campaigns'][0];self.assertEqual(r['confirmed_attributed_conversions'],1);self.assertEqual(r['calculated_metrics']['ROAS'],5)
 def test_no_revenue_for_unidentified_sale(self):
  data=self.campaign();data['campaigns'][0]['conversions']=[{'id':'a','deal_id':'missing'}];self.s.campaigns.ingest(data);self.assertIsNone(self.s.campaigns.summary()['campaigns'][0]['confirmed_attributed_revenue'])
 def test_snapshot_replaces_period_spend(self):
  data=self.campaign();self.s.campaigns.ingest(data);data['campaigns'][0]['spend']=50;self.s.campaigns.ingest(data);r=self.s.campaigns.summary()['campaigns'];self.assertEqual(len(r),1);self.assertEqual(r[0]['calculated_metrics']['CPM'],5)
 def assessment(self):return {'agent':'sales','deficiency':'Perguntas pouco específicas','technique':'Investigar contexto e impacto antes da proposta','source_url':'https://www.w3.org/','quote':'Accessible content','evidence_kind':'IMPORTED_RESPONSES','cases':[{'scenario':'Qualificação','before':'Olá','after':'Qual problema e impacto?','required_terms':['problema','impacto']},{'scenario':'Diagnóstico','before':'Compre já','after':'Como funciona o processo?','required_terms':['processo']}]}
 def test_director_fetches_source_versions_and_requires_approval(self):
  page={'text':'Accessible content','final_url':'https://www.w3.org/','sha256':'source-test','retrieved_at':'2026-11-11'}
  with patch('vendrex.competencies.fetch_public',return_value=page):r=self.s.competencies.assess(self.assessment())
  self.assertTrue(r['improved']);self.assertFalse(r['model_inference']);self.assertTrue(r['approval_id'])
  self.assertFalse(self.s.db.rows("SELECT * FROM instructions WHERE status='APPROVED_ADDENDUM'"))
 def test_director_rejects_metadata_only(self):
  page={'text':'Only a title'}
  with patch('vendrex.competencies.fetch_public',return_value=page):
   with self.assertRaises(ValueError):self.s.competencies.assess(self.assessment())
 def test_upgrade_preserves_data(self):
  lead=self.s.db.record('leads',{'name':'keep'})
  config=self.s.config;config['version']='2.2.0';self.s.db.set('config',config)
  restored=Service(Path(self.tmp.name));self.assertEqual(restored.config['version'],'2.3.0');self.assertEqual(restored.db.records('leads')[0]['id'],lead)
  self.assertTrue(list((restored.db.data/'backups').glob('*.sqlite3')))
 def test_builder_board_real_node_and_git(self):
  task=self.s.create_task(agent='builder',kind='BUILDER_BOARD',description='Test board');self.s.control('start');self.s.run_next();r=self.s.queue.get(task)
  self.assertEqual(r['state'],'COMPLETED');self.assertTrue((self.s.db.data/'workspaces'/task/'quadro/index.html').exists())


class SyncV23Tests(unittest.TestCase):
 def test_export_not_limited_by_ui_pagination(self):
  from vendrex.cloud_sync import SupabaseStore
  with tempfile.TemporaryDirectory() as path:
   s=Service(Path(path))
   with s.db.transaction() as c:
    for i in range(205):s.db.record('leads',{'name':str(i)},conn=c)
   store=SupabaseStore('https://controlled.supabase.co','sb_publishable_fixture','controlled-session')
   calls=[]
   def request(path,method='GET',data=None,prefer=None):
    if path=='/auth/v1/user':return {'id':'controlled-user'}
    calls.append((path,data));return []
   with patch.object(store,'request',side_effect=request):store.sync(s)
   leads=[item for path,data in calls if isinstance(data,list) for item in data if item['entity']=='leads']
   self.assertEqual(len(leads),205)
 def test_secret_keys_and_extra_url_parts_rejected(self):
  from vendrex.cloud_sync import SupabaseStore
  for url,key in [('https://controlled.supabase.co','sb_secret_fixture'),('https://controlled.supabase.co:444','sb_publishable_fixture'),('https://controlled.supabase.co/path','sb_publishable_fixture')]:
   with self.assertRaises(ValueError):SupabaseStore(url,key,'fixture')

if __name__=='__main__':unittest.main()
