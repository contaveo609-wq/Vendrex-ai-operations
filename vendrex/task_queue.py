from __future__ import annotations

from datetime import datetime, timezone
import json
from .db import dumps, now, uid

STATES = {'CREATED','QUEUED','WAITING_DEPENDENCY','WAITING_APPROVAL','RUNNING','CHECKPOINTING','PAUSED','BLOCKED','COMPLETED','FAILED','CANCELLED'}
TRANSITIONS = {
    'CREATED': {'QUEUED','WAITING_DEPENDENCY','WAITING_APPROVAL'},
    'QUEUED': {'RUNNING','PAUSED','CANCELLED','BLOCKED','WAITING_DEPENDENCY','WAITING_APPROVAL'},
    'WAITING_DEPENDENCY': {'QUEUED','CANCELLED','BLOCKED'},
    'WAITING_APPROVAL': {'QUEUED','CANCELLED','BLOCKED'},
    'RUNNING': {'CHECKPOINTING','COMPLETED','FAILED','BLOCKED','WAITING_APPROVAL'},
    'CHECKPOINTING': {'COMPLETED','FAILED','WAITING_APPROVAL','BLOCKED'},
    'PAUSED': {'QUEUED','CANCELLED'}, 'BLOCKED': {'QUEUED','CANCELLED','WAITING_APPROVAL'},
    'FAILED': {'QUEUED','CANCELLED'}, 'COMPLETED': set(), 'CANCELLED': set()
}


class TaskQueue:
    def __init__(self, db):
        self.db = db

    @staticmethod
    def decode(row):
        item = dict(row)
        for key in ('input','dependencies','files','result','cost_estimate','permissions'):
            item[key] = json.loads(item[key]) if item[key] else None
        return item

    def get(self, task_id, conn=None):
        if conn is None:
            with self.db.connect() as tx:
                return self.get(task_id, tx)
        row = conn.execute('SELECT * FROM tasks WHERE id=?', (task_id,)).fetchone()
        if not row:
            raise ValueError('Tarefa não encontrada.')
        return self.decode(row)

    def create(self, agent, kind, description, data=None, dependencies=None, priority=50, requires_ai=False,
               permissions=None, origin='USER_TASK', planned_at=None, dedupe_key=None, correlation_id=None, conn=None):
        if conn is None:
            with self.db.transaction() as tx:
                return self.create(agent,kind,description,data,dependencies,priority,requires_ai,permissions,origin,planned_at,dedupe_key,correlation_id,tx)
        if not conn.execute('SELECT 1 FROM agents WHERE id=? AND enabled=1', (agent,)).fetchone():
            raise ValueError('Agente indisponível.')
        if not description.strip() or len(description) > 4000:
            raise ValueError('Descreva a tarefa em até 4.000 caracteres.')
        if len(dumps(data or {})) > 24000:
            raise ValueError('Entrada excede 24.000 caracteres. Importe somente os trechos necessários.')
        if not 1 <= int(priority) <= 100:
            raise ValueError('Prioridade deve ser de 1 a 100; 1 é mais urgente.')
        if dedupe_key:
            old = conn.execute('SELECT id FROM tasks WHERE dedupe_key=?', (dedupe_key,)).fetchone()
            if old:
                return old['id']
        dependencies = dependencies or []
        for dependency in dependencies:
            self.get(dependency, conn)
        task_id = uid()
        stamp = now()
        plan = planned_at or stamp
        datetime.fromisoformat(plan).astimezone(timezone.utc)
        conn.execute('INSERT INTO tasks(id,agent,origin,kind,priority,description,input,dependencies,state,created_at,planned_at,max_attempts,cost_estimate,permissions,correlation_id,dedupe_key,requires_ai) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                     (task_id,agent,origin,kind,int(priority),description,dumps(data or {}),dumps(dependencies),'CREATED',stamp,plan,2,dumps({'unit':'unverified','value':None}),dumps(permissions or []),correlation_id or task_id,dedupe_key,int(requires_ai)))
        conn.execute('INSERT INTO task_history(task_id,from_state,to_state,reason,created_at) VALUES(?,NULL,?,?,?)', (task_id,'CREATED','Tarefa registrada',stamp))
        target = 'WAITING_APPROVAL' if permissions else ('WAITING_DEPENDENCY' if dependencies else 'QUEUED')
        self.transition(task_id,target,'Entrada validada',conn)
        if permissions:
            self.request_approval(task_id,'TASK_PERMISSION',{'permissions':permissions},'A tarefa exige autorização explícita.',conn=conn)
        return task_id

    def transition(self, task_id, target, reason, conn=None):
        if conn is None:
            with self.db.transaction() as tx:
                return self.transition(task_id,target,reason,tx)
        task = self.get(task_id,conn)
        if target not in TRANSITIONS[task['state']]:
            raise ValueError(f"Transição inválida: {task['state']} para {target}.")
        conn.execute('UPDATE tasks SET state=?,reason=?,finished_at=? WHERE id=?', (target,reason,now() if target in {'COMPLETED','FAILED','CANCELLED'} else None,task_id))
        conn.execute('INSERT INTO task_history(task_id,from_state,to_state,reason,created_at) VALUES(?,?,?,?,?)',(task_id,task['state'],target,reason,now()))
        self.db.audit('TASK_STATE',{'from':task['state'],'to':target,'reason':reason},task_id,task['agent'],conn)

    def request_approval(self, task_id, action, scope, justification, risk='Supervisionado', conn=None):
        from datetime import timedelta
        if conn is None:
            with self.db.transaction() as tx:
                return self.request_approval(task_id,action,scope,justification,risk,tx)
        approval_id = uid()
        expiry = (datetime.now(timezone.utc)+timedelta(hours=24)).isoformat()
        conn.execute('INSERT INTO approvals VALUES(?,?,?,?,?,?,?,?,?,?,?)', (approval_id,task_id,action,dumps(scope),justification,risk,'Autoriza apenas a ação e os dados exibidos. Integrações ausentes continuam bloqueadas.','PENDING',now(),expiry,None))
        self.db.notify('Aprovação necessária',justification,conn)
        return approval_id

    def decide(self, approval_id, approved):
        with self.db.transaction() as conn:
            row = conn.execute('SELECT * FROM approvals WHERE id=?',(approval_id,)).fetchone()
            if not row or row['status'] != 'PENDING':
                raise ValueError('Aprovação não está pendente.')
            if row['expires_at'] < now():
                raise ValueError('Aprovação expirada. Crie uma solicitação nova.')
            conn.execute('UPDATE approvals SET status=?,decided_at=? WHERE id=?',('APPROVED' if approved else 'REJECTED',now(),approval_id))
            if row['task_id']:
                task = self.get(row['task_id'],conn)
                pending = conn.execute("SELECT 1 FROM approvals WHERE task_id=? AND status='PENDING'",(row['task_id'],)).fetchone()
                if task['state']=='WAITING_APPROVAL' and not pending:
                    self.transition(task['id'],'QUEUED' if approved else 'CANCELLED','Decisão humana',conn)
            if approved:
                conn.execute('INSERT OR IGNORE INTO events VALUES(?,?,?,?,?,?)',(uid(),'APPROVAL_GRANTED',dumps({'approval_id':approval_id,'scope':json.loads(row['scope'])}),'approval:'+approval_id,row['task_id'],now()))
            self.db.audit('APPROVAL_DECIDED',{'id':approval_id,'approved':bool(approved),'scope':json.loads(row['scope'])},conn=conn)
            return dict(row)

    def recover(self):
        with self.db.transaction() as conn:
            rows = conn.execute("SELECT id FROM tasks WHERE state IN ('RUNNING','CHECKPOINTING')").fetchall()
            for row in rows:
                self.transition(row['id'],'WAITING_APPROVAL','Execução interrompida; revisar arquivos antes de retomar.',conn)
                self.request_approval(row['id'],'RECOVERY',{'task':row['id']},'Revisar checkpoint e autorizar retomada.',conn=conn)
            if rows:
                self.db.notify('Fila recuperada',f'{len(rows)} tarefa(s) exigem revisão.',conn)
                event_id=uid()
                conn.execute('INSERT INTO events VALUES(?,?,?,?,?,?)',(event_id,'SYSTEM_RECOVERED',dumps({'tasks':[r['id'] for r in rows]}),'recovery:'+event_id,None,now()))
            return len(rows)

    def claim(self, conn):
        if conn.execute("SELECT 1 FROM tasks WHERE state IN ('RUNNING','CHECKPOINTING')").fetchone():
            return None
        for row in conn.execute("SELECT * FROM tasks WHERE state='WAITING_DEPENDENCY'").fetchall():
            task = self.decode(row)
            states = [self.get(dep,conn)['state'] for dep in task['dependencies']]
            if all(state=='COMPLETED' for state in states):
                self.transition(task['id'],'QUEUED','Dependências concluídas',conn)
            elif any(state in {'FAILED','CANCELLED'} for state in states):
                self.transition(task['id'],'BLOCKED','Dependência falhou ou foi cancelada',conn)
        # Ageing avoids starvation. Old low-priority jobs approach the front over time.
        rows = conn.execute("SELECT * FROM tasks WHERE state='QUEUED' AND planned_at<=? ORDER BY (priority-MIN(90,MAX(0,(julianday('now')-julianday(created_at))*24)*2)),created_at",(now(),)).fetchall()
        for row in rows:
            task = self.decode(row)
            if any(self.get(dep,conn)['state']!='COMPLETED' for dep in task['dependencies']):
                self.transition(task['id'],'WAITING_DEPENDENCY','Dependência ainda pendente',conn)
                continue
            self.transition(task['id'],'RUNNING','Executor exclusivo adquirido',conn)
            conn.execute('UPDATE tasks SET attempts=attempts+1,last_run=? WHERE id=?',(now(),task['id']))
            return self.get(task['id'],conn)
        return None
