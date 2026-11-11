"""Owner controls. No linked-device scraper or fabricated pairing credentials.

A provider-specific official transport is deliberately not supplied: the owner
must select and authorize a BSP. Local protocol tests are not provider evidence.
"""
from .db import now

REQUIRED_TESTS = {'connect','reconnect','receive','eligible_reply','unknown_blocked',
                  'personal_blocked','group_blocked','debounce','cancel','dedupe',
                  'human_takeover','opt_out','recovery'}


class WhatsAppControl:
    def __init__(self, service): self.service=service;self.db=service.db

    def status(self):
        return {'state':'BLOCKED','connector':'NOT_IMPLEMENTED','connected':False,
                'autonomous_enabled':False,'connector_validated':False,
                'qr_supported':False,'pairing_code_supported':False,
                'connection_preference':'LINKED_DEVICE_MANUAL_NO_API',
                'manual_login_url':'https://web.whatsapp.com/',
                'manual_session_state':'NOT_VERIFIED',
                'reason':'Proprietário escolheu vinculação por QR/código sem API. Login disponível no WhatsApp Web oficial; o Sales não verifica essa sessão nem acessa mensagens.',
                'required_tests':sorted(REQUIRED_TESTS),
                'source':'https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users',
                'last_owner_action':self.db.setting('whatsapp_owner_action')}

    def control(self, action, confirmation=False, delay=None):
        if action=='delay':
            if isinstance(delay,bool) or not isinstance(delay,int) or not 3<=delay<=10:
                raise ValueError('Use um intervalo inteiro de 3 a 10 segundos.')
            config=self.service.config;config['sales']['min_reply_delay_seconds']=delay
            self.db.set('config',config)
        elif action in {'disable','disconnect'}:
            config=self.service.config;config['sales']['autonomous_enabled']=False
            config['sales']['connector_validated']=False;self.db.set('config',config)
            with self.db.transaction() as conn:
                conn.execute("UPDATE reply_outbox SET status='CANCELLED' WHERE status IN ('PREPARED','GENERATING','RETRY_GENERATION')")
                conn.execute("UPDATE conversations SET due_at=NULL,revision=revision+1 WHERE due_at IS NOT NULL")
        elif action=='activate':
            if confirmation is not True:raise ValueError('Ativação exige confirmação explícita do proprietário.')
            raise ValueError('BLOCKED: nenhum conector oficial instalado, conectado e aprovado nos testes reais. Flags não liberam envio.')
        elif action in {'connect','reconnect'}:
            raise ValueError('BLOCKED: vinculação manual acontece em https://web.whatsapp.com/. O Sales não possui acesso a essa sessão. Nenhum QR ou código foi gerado pelo Sales.')
        else:raise ValueError('Ação WhatsApp inválida.')
        self.db.set('whatsapp_owner_action',{'action':action,'at':now()})
        self.db.audit('WHATSAPP_OWNER_CONTROL',{'action':action,'delay':delay})
        return self.status()
