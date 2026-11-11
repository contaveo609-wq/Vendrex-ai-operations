"""Reproducible Director assessments of imported responses, not invented inference."""
from urllib.parse import urlparse
from .db import dumps,fingerprint,now,uid
from .public_web import fetch_public

class Competencies:
    def __init__(self,service):self.service=service;self.db=service.db

    def assess(self,data):
        if data.get('agent') not in self.service.config['routing']:raise ValueError('Agente inválido.')
        if not data.get('deficiency') or not data.get('technique') or not data.get('quote'):raise ValueError('Informe deficiência, técnica e trecho literal da fonte.')
        if data.get('evidence_kind')!='IMPORTED_RESPONSES':raise ValueError('Este avaliador valida respostas importadas; não declara inferência generativa.')
        page=fetch_public(data['source_url'])
        if data['quote'] not in page['text']:raise ValueError('Trecho não encontrado no conteúdo acessível. Metadados não comprovam aprendizado.')
        if len(data['quote'])>800:raise ValueError('Trecho excedido; cite somente o necessário.')
        cases=data.get('cases')
        if not isinstance(cases,list) or not 2<=len(cases)<=20:raise ValueError('Use de 2 a 20 cenários comparáveis.')
        results=[]
        for case in cases:
            if not all(isinstance(case.get(k),str) and case[k].strip() for k in ['scenario','before','after']):raise ValueError('Cenário, antes e depois são obrigatórios.')
            terms=case.get('required_terms')
            if not isinstance(terms,list) or not 1<=len(terms)<=10 or any(not isinstance(t,str) or not t.strip() for t in terms):raise ValueError('Critérios devem conter termos verificáveis.')
            score=lambda response:sum(term.casefold() in response.casefold() for term in terms)/len(terms)
            results.append({'scenario':case['scenario'],'before':score(case['before']),'after':score(case['after']),'before_response':case['before'],'after_response':case['after'],'response_sha256':fingerprint({'before':case['before'],'after':case['after']}),'criteria':terms})
        before=sum(r['before'] for r in results)/len(results);after=sum(r['after'] for r in results)/len(results)
        host=urlparse(page['final_url']).hostname
        credibility={'publisher':host,'content_retrieved':True,'retrieved_at':page['retrieved_at'],
                     'assessment':'Publisher source retrieved; owner must assess expertise, bias and applicability before promotion.',
                     'owner_review_required':True}
        proposal=self.service.train({'agent':data['agent'],'problem':data['deficiency'],'source':page['final_url'],
                                     'technique':data['technique'],'quote':data['quote'],'credibility':credibility})
        report={'state':'TESTED','evidence_kind':'IMPORTED_RESPONSES','model_inference':False,'proposal_id':proposal,
                'dataset_kind':data.get('dataset_kind','UNVERIFIED_IMPORT'),
                'source_url':page['final_url'],'source_sha256':page['sha256'],'quote':data['quote'],'technique':data['technique'],
                'before':before,'after':after,'improved':after>before,'scenarios':results,'credibility':credibility,
                'limitations':['Literal rubric coverage only; no proof of negotiation skill, engagement or safety.','Candidate remains inactive until owner promotion.']}
        approval=self.service.evaluate_training(proposal,{'tests':dumps(results),'result':dumps(report),'passed':after>before})
        report['approval_id']=approval
        item=uid()
        with self.db.transaction() as conn:
            conn.execute('INSERT INTO competency_runs VALUES(?,?,?,?,?,?)',(item,proposal,page['final_url'],page['sha256'],dumps(report),now()))
            self.db.audit('COMPETENCY_ASSESSED',{'id':item,'proposal':proposal,'evidence_kind':'IMPORTED_RESPONSES'},conn=conn)
        return report
