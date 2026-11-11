"""Eligibility/debounce state machine. Actual WhatsApp transport stays blocked until validated."""
from __future__ import annotations
from datetime import datetime,timezone
import json
import re
import time
from .db import dumps,now,uid


def canonical_contact(value):
    value=str(value)
    if not value.startswith('+') or not re.fullmatch(r'\+[1-9]\d{7,14}',value): raise ValueError('Use número internacional exato, por exemplo +55…; não adivinhar país ou DDD.')
    return value


def eligibility(lead,contact,is_group=False,timestamp=None):
    if is_group:return False,'GROUP_BLOCKED'
    if lead.get('personal_contact') or lead.get('excluded') or lead.get('blocked'):return False,'EXCLUDED'
    if lead.get('opt_out'):return False,'OPT_OUT'
    if lead.get('human_takeover'):return False,'HUMAN_TAKEOVER'
    if not lead.get('prospected') or lead.get('prospected_by')!='sales':return False,'NOT_PROSPECTED'
    if not lead.get('contact_verified') or lead.get('contact_e164')!=contact:return False,'CONTACT_NOT_VERIFIED'
    if not lead.get('contact_authorization') or not lead.get('authorization_evidence'):return False,'NO_CONSENT'
    expiry=lead.get('authorization_expires_at')
    try:
        if not expiry or datetime.fromisoformat(expiry).timestamp()<=(timestamp or time.time()):return False,'CONSENT_EXPIRED'
    except (ValueError,TypeError):return False,'CONSENT_INVALID'
    return True,'ELIGIBLE'


class WhatsAppBlockedTransport:
    state='NOT_CONFIGURED'
    validated=False
    def send(self,*_,**__):raise RuntimeError('WhatsApp não configurado e não validado. Nenhuma mensagem enviada.')


class ReplyEngine:
    def __init__(self,service,transport=None,clock=time.time):
        self.service=service;self.db=service.db;self.transport=transport or WhatsAppBlockedTransport();self.clock=clock

    def lead(self,lead_id,conn):
        row=conn.execute("SELECT data FROM records WHERE id=? AND entity='leads'",(lead_id,)).fetchone()
        return json.loads(row['data']) if row else {}

    def receive(self,message_id,conversation_id,lead_id,contact,body,is_group=False):
        contact=canonical_contact(contact)
        if not isinstance(body,str) or len(body)>8000:raise ValueError('Mensagem inválida ou excedida.')
        stamp=self.clock()
        with self.db.transaction() as conn:
            if conn.execute('SELECT 1 FROM inbound_messages WHERE id=?',(message_id,)).fetchone():return {'duplicate':True}
            lead=self.lead(lead_id,conn)
            allowed,reason=eligibility(lead,contact,is_group,stamp)
            conversation=conn.execute('SELECT * FROM conversations WHERE id=?',(conversation_id,)).fetchone()
            if conversation and (conversation['contact']!=contact or conversation['lead_id']!=lead_id):raise ValueError('Conversa não corresponde exatamente ao contato e lead.')
            if not conversation:
                conn.execute('INSERT INTO conversations(id,lead_id,contact,is_group) VALUES(?,?,?,?)',(conversation_id,lead_id,contact,int(is_group)))
                revision=1
            else:revision=conversation['revision']+1
            if body.strip().casefold() in {'sair','pare','parar','não quero','nao quero','stop','cancelar'}:
                lead['opt_out']=True;self.db.record('leads',lead,record_id=lead_id,conn=conn);allowed=False;reason='OPT_OUT'
            delay=self.service.config['sales']['min_reply_delay_seconds']
            if not 3<=delay<=10:raise ValueError('Janela de debounce fora de 3–10s.')
            conn.execute('INSERT INTO inbound_messages VALUES(?,?,?,?,?)',(message_id,conversation_id,body,stamp,revision))
            conn.execute('UPDATE conversations SET revision=?,due_at=?,last_inbound=?,status=? WHERE id=?',(revision,stamp+delay if allowed else None,stamp,'PENDING' if allowed else reason,conversation_id))
            # An in-flight generator's revision is invalidated by the new message.
            conn.execute("UPDATE reply_outbox SET status='CANCELLED' WHERE conversation_id=? AND status IN ('PREPARED','GENERATING')",(conversation_id,))
            self.db.audit('INBOUND_ELIGIBILITY',{'conversation':conversation_id,'revision':revision,'allowed':allowed,'reason':reason},conn=conn)
            return {'eligible':allowed,'reason':reason,'revision':revision,'due_at':stamp+delay if allowed else None}

    def takeover(self,conversation_id):
        with self.db.transaction() as conn:
            conn.execute("UPDATE conversations SET human_takeover=1,due_at=NULL,status='HUMAN_TAKEOVER',revision=revision+1 WHERE id=?",(conversation_id,))
            conn.execute("UPDATE reply_outbox SET status='CANCELLED' WHERE conversation_id=? AND status NOT IN ('SENT','CANCELLED')",(conversation_id,))
            self.db.audit('HUMAN_TAKEOVER',{'conversation_id':conversation_id},conn=conn)

    def prepare(self,conversation_id,generator):
        stamp=self.clock()
        with self.db.transaction() as conn:
            row=conn.execute('SELECT * FROM conversations WHERE id=?',(conversation_id,)).fetchone()
            if not row or row['human_takeover'] or row['due_at'] is None or row['due_at']>stamp:return {'state':'WAITING'}
            lead=self.lead(row['lead_id'],conn);allowed,reason=eligibility(lead,row['contact'],bool(row['is_group']),stamp)
            if not allowed:return {'state':'BLOCKED','reason':reason}
            revision=row['revision']
            if revision<=row['processed_revision']:return {'state':'DUPLICATE'}
            key=f'{conversation_id}:{revision}'
            existing=conn.execute('SELECT * FROM reply_outbox WHERE idempotency_key=?',(key,)).fetchone()
            if existing:return {'state':existing['status'],'id':existing['id']}
            outbox=uid()
            conn.execute('INSERT INTO reply_outbox VALUES(?,?,?,?,?,?,?,?)',(outbox,conversation_id,revision,key,'','GENERATING',now(),None))
            messages=[dict(m) for m in conn.execute('SELECT body,revision FROM inbound_messages WHERE conversation_id=? AND revision>? ORDER BY revision',(conversation_id,row['processed_revision']))]
        body=generator(messages,lead)
        if not isinstance(body,str) or not body.strip() or len(body)>4000:raise ValueError('Resposta gerada inválida.')
        # Do not let routine autonomous replies make financial or contractual commitments.
        sensitive=any(word in ' '.join(m['body'] for m in messages).casefold() for word in ['desconto','contrato','reclamação','reclamacao','cobrança','cobranca','processo judicial'])
        with self.db.transaction() as conn:
            current=conn.execute('SELECT * FROM conversations WHERE id=?',(conversation_id,)).fetchone()
            lead=self.lead(current['lead_id'],conn);allowed,reason=eligibility(lead,current['contact'],bool(current['is_group']),self.clock())
            if current['revision']!=revision or current['human_takeover'] or not allowed:
                conn.execute("UPDATE reply_outbox SET status='CANCELLED' WHERE id=?",(outbox,));return {'state':'CANCELLED','reason':'CONTEXT_CHANGED'}
            target='WAITING_HUMAN' if sensitive else 'PREPARED'
            conn.execute('UPDATE reply_outbox SET body=?,status=? WHERE id=?',(body,target,outbox))
            if sensitive:self.db.notify('Atendimento exige humano','Desconto, contrato ou risco detectado na conversa '+conversation_id,conn)
            return {'state':target,'id':outbox,'revision':revision}

    def send(self,outbox_id):
        # Only tested, explicitly activated, supported transports can reach the sending branch.
        config=self.service.config['sales']
        if not config.get('autonomous_enabled') or not config.get('connector_validated') or self.transport.state!='CONNECTED' or not self.transport.validated:
            return {'state':'BLOCKED','reason':'CONNECTOR_NOT_ACTIVATED_AND_TESTED'}
        with self.db.transaction() as conn:
            row=conn.execute('SELECT * FROM reply_outbox WHERE id=?',(outbox_id,)).fetchone()
            if not row or row['status']!='PREPARED':return {'state':'BLOCKED','reason':'OUTBOX_NOT_READY'}
            conversation=conn.execute('SELECT * FROM conversations WHERE id=?',(row['conversation_id'],)).fetchone()
            lead=self.lead(conversation['lead_id'],conn)
            allowed,reason=eligibility(lead,conversation['contact'],bool(conversation['is_group']),self.clock())
            if not allowed or conversation['human_takeover'] or conversation['revision']!=row['revision']:
                conn.execute("UPDATE reply_outbox SET status='CANCELLED' WHERE id=?",(outbox_id,));return {'state':'CANCELLED','reason':reason}
            # Mark attempt before external effect. Ambiguous sends require reconciliation, never blind retries.
            conn.execute("UPDATE reply_outbox SET status='DISPATCHING' WHERE id=?",(outbox_id,))
        try:receipt=self.transport.send(conversation['contact'],row['body'],row['idempotency_key'])
        except Exception:
            with self.db.transaction() as conn:conn.execute("UPDATE reply_outbox SET status='RECONCILIATION_REQUIRED' WHERE id=?",(outbox_id,))
            raise
        with self.db.transaction() as conn:
            conn.execute("UPDATE reply_outbox SET status='SENT',sent_at=? WHERE id=?",(now(),outbox_id))
            conn.execute("UPDATE conversations SET processed_revision=?,due_at=NULL,status='IDLE' WHERE id=?",(row['revision'],row['conversation_id']))
            self.db.audit('AUTHORIZED_REPLY_SENT',{'conversation':row['conversation_id'],'outbox':outbox_id,'receipt':receipt},conn=conn)
        return {'state':'SENT','receipt':receipt}
