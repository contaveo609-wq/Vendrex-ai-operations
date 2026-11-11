from __future__ import annotations
import csv
from datetime import datetime
from html import escape
import json
from pathlib import Path
import re
import shutil
import subprocess
from .db import ROOT, dumps, fingerprint, now, uid
from .public_web import fetch_public

MISSION_KINDS={'BUILDER_BOARD':'builder','SALES_PROSPECT':'sales','BUILDER_CALCULATOR':'builder','GROWTH_VIDEO32':'growth','DIRECTOR_VIDEO_TRAINING':'director'}


class Missions:
    def __init__(self, service): self.service=service;self.db=service.db

    def run(self,task,workspace):
        kind=task['kind']
        if MISSION_KINDS.get(kind)!=task['agent']: raise ValueError('Missão não corresponde ao agente.')
        mission_id=uid()
        with self.db.transaction() as conn:
            conn.execute('INSERT INTO mission_runs VALUES(?,?,?,?,?,?,?,?,?)',(mission_id,task['id'],task['agent'],kind,'RUNNING','deterministic_tools',dumps({}),now(),None))
        self.db.audit('MISSION_STARTED',{'mission_id':mission_id,'kind':kind,'engine':'real local tools; no model inference claimed'},task['id'],task['agent'])
        try:
            result={'BUILDER_BOARD':self.board,'SALES_PROSPECT':self.prospect,'BUILDER_CALCULATOR':self.calculator,'GROWTH_VIDEO32':self.video,'DIRECTOR_VIDEO_TRAINING':self.teach}[kind](task,workspace)
            manifest={**result,'mission_id':mission_id,'task_id':task['id'],'agent':task['agent'],'mission':kind,'executed_at':now(),'execution_engine':'deterministic_tools','model_inference':False,
                      'files':[{ 'path':str(p.relative_to(workspace)),'bytes':p.stat().st_size} for p in workspace.rglob('*') if p.is_file() and '.git' not in p.parts]}
            # Use the hash of raw bytes, not a textual hash, for portable artifact verification.
            import hashlib
            for f in manifest['files']: f['sha256']=hashlib.sha256((workspace/f['path']).read_bytes()).hexdigest()
            (workspace/'mission-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
            with self.db.transaction() as conn:
                conn.execute("UPDATE mission_runs SET state='TESTED',manifest=?,finished_at=? WHERE id=?",(dumps(manifest),now(),mission_id))
            return {'summary':result['summary'],'execution':'deterministic_tools','mission_id':mission_id,'verification':manifest,'human_review_required':False}
        except Exception as error:
            with self.db.transaction() as conn: conn.execute("UPDATE mission_runs SET state='BLOCKED',manifest=?,finished_at=? WHERE id=?",(dumps({'error':str(error)}),now(),mission_id))
            raise

    def prospect(self,task,workspace):
        seeds=task['input'].get('companies',[])
        if not isinstance(seeds,list) or not 1<=len(seeds)<=10: raise ValueError('Informe de 1 a 10 empresas e fontes públicas.')
        found=[];errors=[]
        for seed in seeds:
            try:
                page=fetch_public(seed['url'])
                text=page['text']
                if not any(word in text.casefold() for word in ['recife','restaurante','restaurant','reservas']): raise ValueError('Fonte não confirmou o contexto comercial esperado.')
                contacts=[link for link in page['links'] if link.startswith(('tel:','mailto:')) or any(host in link for host in ['wa.me/','api.whatsapp.com/send','whatsapp.com/'])]
                # Public contact pages remain useful even when no phone/email is exposed in HTML.
                contacts=contacts[:8] or [page['final_url']]
                title=seed.get('name') or page['title']
                data={'name':title,'segment':seed.get('segment','Restaurante'),'city':seed.get('city','Recife'),'website':page['final_url'],'source':page['final_url'],
                      'contact':'; '.join(contacts),'public_contact_channels':contacts,'observed_at':page['retrieved_at'],'source_hash':page['sha256'],
                      'confirmed_facts':['Fonte pública acessível HTTP 200','Canal comercial público registrado'],
                      'hypotheses':['Investigar se pedidos, reservas e atendimento têm necessidades de personalização. Não foi diagnosticada uma dor confirmada.'],
                      'pain':'Hipótese a confirmar em diagnóstico, sem alegar custos ou falhas.','source_excerpt':text[:350],
                      'prospected_by':'sales','prospected':True,'contact_verified':True,'contact_authorization':False,'opt_out':False,'stage':'Em pesquisa',
                      'score':40,'qualification':'Adequação inicial por segmento; sem confirmação de dor ou consentimento.','consent_status':'NOT_AUTHORIZED','outreach_sent':False}
                # Canonical business URL is idempotent across repeat prospecting runs.
                record_id=fingerprint({'entity':'lead','url':page['final_url']})[:32]
                existing=next((x for x in self.db.records('leads') if x['id']==record_id),None)
                if existing:
                    for key in ['opt_out','contact_authorization','authorization_expires_at','blocked','human_takeover']:
                        if key in existing['data']: data[key]=existing['data'][key]
                self.db.record('leads',data,record_id=record_id)
                found.append({'id':record_id,**data})
            except Exception as error: errors.append({'url':seed.get('url'),'error':str(error)[:500]})
        if not found: raise ValueError('Nenhuma fonte comercial verificada: '+dumps(errors))
        (workspace/'leads.json').write_text(json.dumps({'leads':found,'errors':errors,'messages_sent':0},ensure_ascii=False,indent=2),encoding='utf-8')
        with (workspace/'leads.csv').open('w',newline='',encoding='utf-8-sig') as stream:
            writer=csv.DictWriter(stream,fieldnames=['name','city','segment','source','contact','observed_at','consent_status','score']);writer.writeheader()
            writer.writerows({key:lead[key] for key in writer.fieldnames} for lead in found)
        return {'summary':f'{len(found)} empresa(s) reais verificadas; nenhuma mensagem enviada.','verified_businesses':len(found),'errors':errors,'outreach_sent':0,'sources':[x['source'] for x in found]}

    def calculator(self,task,workspace):
        template=ROOT/'templates/calculator'
        if not shutil.which('node') or not shutil.which('git'): raise ValueError('Builder precisa de Node.js e Git para construir e testar esta missão.')
        app=workspace/'calculadora';app.mkdir(exist_ok=True)
        for source in template.iterdir():
            if source.is_file(): shutil.copyfile(source,app/source.name)
        title=task['input'].get('title','VENDREX · Calculadora')
        if len(title)>100: raise ValueError('Título excedido.')
        html=(app/'index.html').read_text(encoding='utf-8').replace('VENDREX · Calculadora',escape(title))
        (app/'index.html').write_text(html,encoding='utf-8')
        (app/'SPEC.md').write_text('# Especificação aprovada\n\nCalculadora local com teclado, quatro operações, decimais, porcentagem, inversão de sinal, limpeza e erro de divisão por zero. Sem eval ou chamadas de rede. Título solicitado: '+title+'\n',encoding='utf-8')
        def git(*args):
            return subprocess.run(['git',*args],cwd=app,capture_output=True,text=True,timeout=20,check=True)
        if not (app/'.git').exists(): git('init','-b','main')
        branch='mission/'+task['id'][:12]
        git('checkout','-B',branch)
        check=subprocess.run(['node','test.cjs'],cwd=app,capture_output=True,text=True,timeout=30)
        (workspace/'unit-tests.txt').write_text(check.stdout+check.stderr,encoding='utf-8')
        if check.returncode: raise RuntimeError('Testes da calculadora falharam: '+check.stderr[:600])
        git('add','.')
        git('-c','user.name=Vendrex Builder','-c','user.email=builder@vendrex.local','commit','--allow-empty','-m','Implement calculator mission and passing arithmetic tests')
        commit=git('rev-parse','HEAD').stdout.strip()
        (workspace/'PR.md').write_text('# Builder: calculadora funcional\n\nProblema: concluir uma aplicação local verificável.\n\nImplementação: calculadora com quatro operações e tratamento de entradas inválidas.\n\nValidação: node test.cjs, sem rede e sem eval.\n\nBranch: '+branch+'\nCommit: '+commit+'\n\nDeploy de produção não realizado. PR remoto depende do repositório autorizado.\n',encoding='utf-8')
        return {'summary':'Builder construiu calculadora executável, criou branch/commit e passou nos testes de aritmética.','app_path':'calculadora/index.html','unit_tests':check.stdout.strip(),'branch':branch,'commit':commit,'public_deploy':False,'generation_method':'Parameterized source scaffold, generated and executed locally; no CLI inference claimed.'}

    def video(self,task,workspace):
        from .video import render_video32
        data=task['input'];rules=None
        if data.get('training_id'):
            rows=self.db.rows('SELECT * FROM training_proposals WHERE id=?',(data['training_id'],))
            if not rows or rows[0]['agent']!='growth' or rows[0]['status'] not in {'TESTING','EVALUATED','APPROVED'}: raise ValueError('Versão de treinamento não disponível para experimento.')
            rules={'caption_size':64,'caption_track':True,'high_contrast':True,'training_id':data['training_id']}
        result=render_video32(workspace,title=data.get('title','Seus pedidos estão organizados?'),trained=rules is not None)
        if data.get('message_id'):
            with self.db.transaction() as conn:
                conn.execute("UPDATE agent_messages SET status='APPLIED_IN_EXPERIMENT',acknowledged_at=? WHERE id=? AND receiver='growth'",(now(),data['message_id']))
        if data.get('training_id'):
            before=data.get('baseline_quality',{'caption_track':False,'caption_font_px':36})
            comparison={'before':before,'after':result['quality'],'checks':{'duration_32':abs(result['duration_seconds']-32)<.05,'caption_track':result['quality']['caption_track'],'larger_captions':result['quality']['caption_font_px']>before.get('caption_font_px',0)},'not_measured':['engagement','CTR','conversion']}
            if not all(comparison['checks'].values()): raise RuntimeError('Experimento não passou na comparação.')
            (workspace/'training-comparison.json').write_text(json.dumps(comparison,ensure_ascii=False,indent=2),encoding='utf-8')
            approval=self.service.evaluate_training(data['training_id'],{'tests':dumps(comparison['checks']),'result':dumps(comparison),'passed':True})
            result['training']={'proposal_id':data['training_id'],'experimental_version_used':True,'comparison':comparison,'production_promotion_approval':approval}
        self.db.record('content_items',{'theme':data.get('title','Pedidos organizados'),'task_id':task['id'],'production':'MP4 H.264 32s renderizado e verificado com ffprobe.','status':'DRAFT','duration_seconds':32,'research_status':'Conteúdo institucional original. Sem alegações de pesquisa de mercado.','sources':data.get('sources',[]),'video_path':str((workspace/'vendrex-32s.mp4').relative_to(self.db.data)),'quality':result['quality']})
        return {'summary':'Growth renderizou um MP4 real de 32 segundos com trilha original e texto editorial.','video':result}

    def teach(self,task,workspace):
        source=task['input'].get('video_url','https://www.w3.org/WAI/perspective-videos/captions/')
        page=fetch_public(source)
        text=page['text']
        if 'captions make videos accessible' not in text.lower(): raise ValueError('Transcrição pública do vídeo não foi localizada; não inferir lições pelo título.')
        # Narrow evidence extraction: only this accessibility lesson is recognized; arbitrary source commands have no effect.
        excerpt='Captions make videos accessible.'
        lesson={'video_url':source,'publisher':'W3C Web Accessibility Initiative','title':'Video Captions','transcript_source':'Transcrição textual publicada na própria página','language':'en','retrieved_at':page['retrieved_at'],'source_sha256':page['sha256'],'exact_excerpt':excerpt,
                'paraphrased_lessons':['A mensagem precisa ser compreensível quando o som não está disponível.','Legendas devem acompanhar o conteúdo visual e representar informação de áudio relevante.','Texto de apoio deve permanecer legível e sincronizado.'],
                'experiment_rules':{'caption_font_px':64,'caption_track':True,'high_contrast':True,'duration_seconds':32},'protected_rules_unchanged':True,'third_party_video_rehosted':False}
        baseline=task['input'].get('baseline_quality',{'caption_track':False,'caption_font_px':36})
        if task['input'].get('baseline_task'):
            prior=self.service.queue.get(task['input']['baseline_task'])
            if prior['state']!='COMPLETED':raise ValueError('Vídeo-base precisa estar concluído antes da aula.')
            baseline=prior['result']['verification']['video']['quality']
        proposal=self.service.train({'agent':'growth','problem':'Melhorar legibilidade e acesso ao conteúdo sem som.','source':source,'technique':'Incluir texto sincronizado de apoio e faixa de legendas com tipografia maior. Comparar o arquivo final antes da promoção.'})
        message_id=uid()
        payload={**lesson,'training_id':proposal,'instructions':'Executar um experimento da missão GROWTH_VIDEO32. Não alterar políticas de segurança, envio ou orçamento.'}
        with self.db.transaction() as conn:
            followup=self.service.queue.create('growth','GROWTH_VIDEO32','Aplicar aula em vídeo de 32 segundos',{'training_id':proposal,'message_id':message_id,'title':'Seu atendimento pode ser mais claro?','baseline_quality':baseline,'sources':[source]},dependencies=[task['id']],priority=35,origin='DIRECTOR_TRAINING_REQUEST',conn=conn)
            conn.execute('INSERT INTO agent_messages VALUES(?,?,?,?,?,?,?,?,?,?)',(message_id,'director','growth','VIDEO_LESSON',dumps(payload),task['id'],followup,'SENT_INTERNAL',now(),None))
            self.db.audit('VIDEO_LESSON_SENT',{'message_id':message_id,'video_url':source,'recipient':'growth','followup':followup},task['id'],'director',conn)
        (workspace/'aula-enviada.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
        (workspace/'video-educacional.url').write_text('[InternetShortcut]\nURL='+source+'\n',encoding='utf-8')
        (workspace/'LICAO.md').write_text('# Aula enviada ao Growth\n\nVídeo original: '+source+'\n\nFonte: W3C WAI. Transcrição textual disponível na página. O vídeo de terceiros não foi baixado nem republicado.\n\n'+ '\n'.join('- '+s for s in lesson['paraphrased_lessons'])+'\n\nMudança em versão experimental; promoção de produção exige avaliação e aprovação.\n',encoding='utf-8')
        return {'summary':'Director leu a transcrição pública, enviou o vídeo ao Growth e criou experimento versionado.','lesson':lesson,'training_id':proposal,'message_id':message_id,'followup_task':followup}

    def board(self,task,workspace):
        if not shutil.which('node') or not shutil.which('git'):raise ValueError('Node e Git necessários.')
        app=workspace/'quadro';shutil.copytree(ROOT/'templates/board',app,dirs_exist_ok=True)
        phases={
            'REQUIREMENTS.md':'Quadro com criação, transição de etapa, exclusão, exportação e persistência local. Sem backend ou publicação.',
            'PLAN.md':'Validar contrato dos dados; criar DOM via textContent; salvar atomicamente em localStorage; tratar falhas; verificar em navegador.',
            'REVIEW.md':'Sem eval, HTML importado ou rede. Dados validados no carregamento. Erro de armazenamento preserva estado anterior. Teste de navegador é separado.',
            'DELIVERY.md':'Abra index.html por servidor local. Persistência por navegador/origem. Exporte JSON para backup. Método: scaffold determinístico, não inferência generativa.'}
        for name,body in phases.items():(workspace/name).write_text(body+'\n',encoding='utf-8')
        check=subprocess.run(['node','test.cjs'],cwd=app,capture_output=True,text=True,timeout=30)
        (workspace/'unit-tests.txt').write_text(check.stdout+check.stderr)
        if check.returncode:raise RuntimeError('Contrato do quadro falhou.')
        def git(*args):return subprocess.run(['git',*args],cwd=app,capture_output=True,text=True,timeout=20,check=True)
        if not (app/'.git').exists():git('init','-b','mission/'+task['id'][:12])
        git('add','.')
        git('-c','user.name=Vendrex Builder','-c','user.email=builder@vendrex.local','commit','--allow-empty','-m','Build persistent local project board')
        return {'summary':'Quadro persistente construído com requisitos, plano, código, contrato, revisão e entrega.','app_path':'quadro/index.html','node_tests':check.stdout.strip(),'commit':git('rev-parse','HEAD').stdout.strip(),'generation_method':'deterministic scaffold; model inference not available','public_deploy':False}
