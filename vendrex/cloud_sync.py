"""Authenticated PostgREST synchronization; no service key is needed on the client."""
from __future__ import annotations
import json
import os
from urllib.error import HTTPError
from urllib.parse import urlencode,urlparse
from urllib.request import Request,build_opener,HTTPRedirectHandler
from .db import now

class NoCredentialRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):
        raise RuntimeError('Supabase redirect blocked; credentials stay on the configured origin.')


class SupabaseStore:
    def __init__(self,url,publishable_key,access_token):
        parsed=urlparse(url)
        if parsed.scheme!='https' or not parsed.hostname or not parsed.hostname.endswith('.supabase.co') or parsed.username or parsed.password or parsed.port not in (None,443) or parsed.path not in ('','/') or parsed.query or parsed.fragment:raise ValueError('URL oficial Supabase HTTPS necessária.')
        self.url=url.rstrip('/');self.key=publishable_key;self.token=access_token
        if not all([self.key,self.token]):raise ValueError('Configuração e sessão de usuário necessárias. Não use service_role no cliente.')
        if not self.key.startswith('sb_publishable_'):raise ValueError('Use uma chave publishable; chaves privilegiadas não são aceitas.')

    def request(self,path,method='GET',data=None,prefer=None):
        headers={'apikey':self.key,'Authorization':'Bearer '+self.token,'Content-Type':'application/json'}
        if prefer:headers['Prefer']=prefer
        request=Request(self.url+path,method=method,headers=headers,data=json.dumps(data,ensure_ascii=False).encode() if data is not None else None)
        try:
            with build_opener(NoCredentialRedirect()).open(request,timeout=25) as response:
                body=response.read(5_000_000);return json.loads(body) if body else None
        except HTTPError as error:
            # Never include headers or tokens in error output.
            raise RuntimeError(f'Supabase HTTP {error.code}; confira sessão, migrações e RLS.') from error

    def user(self):
        result=self.request('/auth/v1/user')
        if not result or not result.get('id'):raise RuntimeError('Sessão não validada pelo servidor Auth.')
        return result['id']

    def sync(self,service):
        owner=self.user();snapshot=service.snapshot();rows=[]
        for entity in snapshot['records']:
            items=service.db.records(entity)  # Snapshot is paginated for UI, not a complete export.
            for item in items:rows.append({'owner_id':owner,'entity':entity,'id':item['id'],'project_id':item.get('project_id'),'payload':item['data'],'updated_at':now()})
        for entity,table in [('tasks','tasks'),('missions','mission_runs'),('agent_messages','agent_messages'),('reports','reports'),('conversations','conversations'),('campaigns','campaign_imports'),('competencies','competency_runs')]:
            for item in service.db.rows('SELECT * FROM '+table):rows.append({'owner_id':owner,'entity':entity,'id':str(item['id']),'payload':item,'updated_at':now()})
        for start in range(0,len(rows),100):self.request('/rest/v1/vendrex_records?on_conflict=owner_id,entity,id','POST',rows[start:start+100],prefer='resolution=merge-duplicates,return=minimal')
        self.request('/rest/v1/vendrex_context?on_conflict=owner_id','POST',{'owner_id':owner,'version':snapshot['version'],'context':snapshot['company_context'],'updated_at':now()},prefer='resolution=merge-duplicates,return=minimal')
        service.db.audit('SUPABASE_SYNC',{'rows':len(rows),'owner_id':owner,'source':'local records; user JWT and RLS'})
        return {'rows':len(rows),'owner_id':owner,'state':'CONNECTED'}

    def claim(self,executor_id):return self.request('/rest/v1/rpc/vendrex_claim_job','POST',{'requested_executor':executor_id})

    @classmethod
    def from_environment(cls):
        return cls(os.environ.get('VENDREX_SUPABASE_URL',''),os.environ.get('VENDREX_SUPABASE_PUBLISHABLE_KEY',''),os.environ.get('VENDREX_SUPABASE_ACCESS_TOKEN',''))
