from datetime import datetime
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from vendrex.service import Service
from vendrex.scheduler import recife


class FlowTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.s = Service(Path(self.tmp.name))
        self.s.control('start')
    def tearDown(self): self.tmp.cleanup()

    def test_sale_builder_evidence_no_duplicates_no_fake_revenue(self):
        sale = {'client_name':'Empresa fictícia','scope':'Site de apresentação','confirmation_evidence':'Validação de teste','deadline':'2030-01-30','amount':597.90,'idempotency_key':'test-sale','validated_by_human':True}
        task = self.s.confirm_sale(sale)
        self.assertEqual(self.s.confirm_sale(sale),task)
        self.assertEqual(len(self.s.db.records('projects')),1)
        self.assertEqual(self.s.metrics()['received'],0)
        result = self.s.run_next()
        self.assertEqual(result['state'],'COMPLETED')
        self.assertTrue((self.s.db.data/'workspaces'/task/'BRIEFING.md').exists())

    def test_sale_without_evidence_fails(self):
        with self.assertRaises(ValueError): self.s.confirm_sale({'validated_by_human':True})

    def test_schedules_noon_evening_director_independent_and_dedup(self):
        for hour,event in [(12,'GROWTH_MIDDAY'),(18,'GROWTH_EVENING'),(20,'DIRECTOR_DAILY_REVIEW')]:
            self.s.scheduler.tick(datetime(2030,1,2,hour,0,tzinfo=recife()))
            rows = self.s.db.rows('SELECT * FROM events WHERE type=?',(event,))
            self.assertEqual(len(rows),1)
            self.s.scheduler.tick(datetime(2030,1,2,hour,0,tzinfo=recife()))
            self.assertEqual(len(self.s.db.rows('SELECT * FROM events WHERE type=?',(event,))),1)
        while self.s.run_next(): pass
        self.assertEqual(len(self.s.db.records('content_items')),2)
        self.assertEqual(len(self.s.db.rows('SELECT * FROM reports')),1)

    def test_missed_schedule_logged_not_backlogged(self):
        self.s.scheduler.tick(datetime(2030,1,2,23,59,tzinfo=recife()))
        self.assertEqual(self.s.db.rows("SELECT COUNT(*) AS n FROM schedule_runs WHERE status='MISSED'")[0]['n'],3)
        self.assertEqual(len(self.s.db.rows('SELECT * FROM tasks')),0)

    def test_busy_builder_checkpoint_does_not_get_interrupted(self):
        task = self.s.queue.create('builder','BUILD_BRIEF','Projeto teste')
        with self.s.db.transaction() as conn: self.s.queue.claim(conn)
        directory = self.s.db.data/'workspaces'/task
        directory.mkdir(parents=True)
        self.s.checkpoint(self.s.queue.get(task),directory,'SAFE_POINT')
        self.s.scheduler.tick(datetime(2030,1,2,12,0,tzinfo=recife()))
        with self.s.db.transaction() as conn: self.assertIsNone(self.s.queue.claim(conn))
        self.assertTrue((directory/'checkpoint.json').exists())
        self.s.queue.transition(task,'COMPLETED','Fim seguro')
        self.assertEqual(self.s.run_next()['agent'],'growth')

    def test_offline_and_codex_timeout_retries_limited(self):
        config = self.s.config
        config['models'] = [{'id':'gpt-6-luna','family':'luna','efforts':['medium'],'verified':True}]
        config['routing']['sales']['model'] = 'gpt-6-luna'
        config['routing']['sales']['effort'] = 'medium'
        self.s.db.set('config',config)
        self.s.db.set('test_mode',True)
        from vendrex.policy import MockUsageProvider
        task = self.s.create_task(agent='sales',kind='USER_TASK',description='Falha simulada',requires_ai=True)
        for _ in range(2):
            MockUsageProvider(self.s.guard).update(70)
            with self.s.db.transaction() as conn: conn.execute("UPDATE tasks SET planned_at='2000-01-01T00:00:00+00:00' WHERE id=?",(task,))
            with patch.object(self.s.adapter,'run',side_effect=TimeoutError('Sem internet ou timeout simulado')):
                self.s.run_next()
        result = self.s.queue.get(task)
        self.assertEqual(result['state'],'FAILED')
        self.assertEqual(result['attempts'],2)

    def test_ai_blocks_at_ten_without_calling_adapter(self):
        self.s.db.set('test_mode',True)
        from vendrex.policy import MockUsageProvider
        MockUsageProvider(self.s.guard).update(10)
        task = self.s.create_task(agent='sales',kind='USER_TASK',description='Bloqueio',requires_ai=True)
        with patch.object(self.s.adapter,'run') as adapter:
            self.s.run_next()
            adapter.assert_not_called()
        self.assertEqual(self.s.queue.get(task)['state'],'BLOCKED')

    def test_training_test_evaluation_and_human_promotion(self):
        proposal = self.s.train({'agent':'growth','problem':'Gancho fraco','source':'Análise manual com exemplo','technique':'Explicitar a dor nos primeiros 3 segundos.'})
        self.assertEqual(self.s.db.rows('SELECT * FROM training_proposals')[0]['status'],'TESTING')
        approval = self.s.evaluate_training(proposal,{'tests':'Comparação manual de dois roteiros','result':'Melhoria de clareza observada, sem métricas externas','passed':True})
        self.s.decide_approval(approval,True)
        self.assertEqual(self.s.db.rows('SELECT * FROM training_proposals')[0]['status'],'APPROVED')
        self.assertEqual(self.s.db.rows("SELECT COUNT(*) AS n FROM instructions WHERE status='ACTIVE'")[0]['n'],4)

    def test_opt_out_zeroes_lead_priority(self):
        self.s.add_record('leads',{'name':'Teste','segment':'Restaurante','source':'https://example.invalid','pain':'Pedidos','contact':'Contato comercial público','interest_confirmed':True,'opt_out':True})
        self.s.create_task(agent='sales',kind='QUALIFY_LEADS',description='Qualificar')
        self.s.run_next()
        self.assertEqual(self.s.db.records('leads')[0]['data']['score'],0)


if __name__=='__main__': unittest.main()
