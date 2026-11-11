from __future__ import annotations

from datetime import datetime, timezone
import json
import re
from .db import now, uid, dumps

EFFORTS = ['low','medium','high','xhigh']
EXTERNAL = {'send_message','publish','deploy','discount','charge','purchase','delete_database','delete_backup','change_security','paid_api'}


class UsageGuard:
    def __init__(self, db):
        self.db = db

    def record(self, source, windows, detail='', observed_at=None):
        if source not in {'official','manual','conservative','mock'}:
            raise ValueError('Provedor de uso inválido.')
        if source == 'mock' and not self.db.setting('test_mode',False):
            raise ValueError('Mock permitido somente em testes isolados.')
        if not isinstance(windows,dict) or any(not isinstance(v,(float,int)) or isinstance(v,bool) or not 0<=v<=100 for v in windows.values()):
            raise ValueError('Saldo precisa ser um percentual entre 0 e 100 por janela.')
        if windows and not {'five_hour','weekly'}.issubset(windows):
            raise ValueError('Informe separadamente as janelas de cinco horas e semanal.')
        with self.db.transaction() as conn:
            conn.execute('INSERT INTO usage_snapshots VALUES(?,?,?,?,?,?)',(uid(),source,dumps(windows),observed_at or now(),1 if source in {'manual','mock'} else 100,detail))
            if windows and min(windows.values())>15:
                self.db.set('ai_paused',False,conn)
            self.db.audit('USAGE_OBSERVED',{'source':source,'windows':windows},conn=conn)

    def status(self, conn=None):
        if conn is None:
            with self.db.connect() as tx:
                return self.status(tx)
        row = conn.execute('SELECT * FROM usage_snapshots ORDER BY rowid DESC LIMIT 1').fetchone()
        if not row:
            return {'mode':'unknown','allowed':False,'remaining':None,'reason':'Saldo não verificado. Consulte os limites oficiais ou registre sua observação.'}
        item = dict(row)
        item['windows'] = json.loads(row['windows'])
        remaining = min(item['windows'].values()) if item['windows'] else None
        config = self.db.setting('config',{},conn)
        age = (datetime.now(timezone.utc)-datetime.fromisoformat(row['observed_at'])).total_seconds()/60
        mode = 'unknown' if remaining is None else ('stopped' if remaining<=10 else ('critical' if remaining<20 else ('economy' if remaining<=35 else 'normal')))
        allowed = remaining is not None and remaining>10+config.get('usage_headroom',5) and age<=config.get('usage_fresh_minutes',15) and row['remaining_jobs']>0
        reason = 'Observação recente; reserva aplicada com margem. Nenhuma chamada garante consumo percentual exato.'
        if not allowed:
            reason = 'Novas chamadas bloqueadas: saldo desconhecido, vencido, sem margem ou observação já utilizada.'
        return {**item,'mode':mode,'remaining':remaining,'allowed':allowed,'reason':reason,'age_minutes':round(age,1),'exact_reserve':False}

    def claim(self, task, conn):
        status = self.status(conn)
        if not status['allowed']:
            raise ValueError(status['reason'])
        if status['mode']=='critical' and (task['agent']=='builder' or task['priority']>25):
            raise ValueError('Modo crítico: projeto longo ou pesquisa de baixa prioridade suspensos.')
        conn.execute('UPDATE usage_snapshots SET remaining_jobs=remaining_jobs-1 WHERE id=?',(status['id'],))
        return status


class OfficialUsageProvider:
    @staticmethod
    def read(rpc):
        data = rpc.call('account/rateLimits/read', {})
        limits = data.get('rateLimits') or {}
        result = {}
        for name, value in limits.items():
            if not isinstance(value,dict) or 'usedPercent' not in value:
                continue
            duration = value.get('windowDurationMins')
            key = 'five_hour' if duration==300 else ('weekly' if duration==10080 else name)
            result[key] = max(0,100-float(value['usedPercent']))
        if not {'five_hour','weekly'}.issubset(result):
            raise ValueError('Provedor oficial não informou ambas as janelas. Saldo continua não verificado.')
        return result


class ManualUsageProvider:
    def __init__(self, guard): self.guard = guard
    def update(self, five_hour, weekly):
        self.guard.record('manual',{'five_hour':float(five_hour),'weekly':float(weekly)},'Observação humana. Uma chamada por atualização; não é telemetria exata.')


class ConservativeBudgetProvider:
    """Unknown real usage never grants permission for an inference call."""
    def read(self): return {'allowed':False,'mode':'unknown','reason':'Saldo não verificado.'}


class MockUsageProvider:
    def __init__(self, guard): self.guard = guard
    def update(self, value): self.guard.record('mock',{'five_hour':value,'weekly':value},'Somente teste')


def route_model(config, agent, complexity='medium'):
    rule = config['routing'].get(agent)
    if not rule or not rule.get('model'):
        raise ValueError('Configure um modelo verificado para este agente. Nenhum ID foi presumido.')
    model = next((m for m in config['models'] if m['id']==rule['model'] and m.get('verified')),None)
    if not model or model.get('family') not in rule['allowed_families']:
        raise ValueError('Modelo não verificado ou família acima do teto autorizado.')
    version = re.search(r'(\d+)(?:\.(\d+))?',model['id'])
    ceiling = rule.get('family_ceilings',{}).get(model['family'])
    if not version or not ceiling or (int(version[1]),int(version[2] or 0))>tuple(ceiling):
        raise ValueError('Versão do modelo desconhecida ou acima do teto solicitado pelo proprietário.')
    effort = 'low' if complexity=='simple' else rule['effort']
    if effort not in EFFORTS or EFFORTS.index(effort)>EFFORTS.index(rule['max_effort']) or effort not in model.get('efforts',[]):
        raise ValueError('Esforço não suportado pelo modelo ou acima do teto.')
    return {'model':model['id'],'effort':effort,'reason':f'Complexidade {complexity}; seleção explícita dentro do teto de {agent}.'}
