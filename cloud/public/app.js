import {esc,renderIntegrations} from './integrations.mjs';
let config=null,session=null,social=null;
const status=document.getElementById('status');
const explain={META_APP_SETUP_REQUIRED:'Conclua a configuração do app e o consentimento na Meta.',REAL_PUBLICATION_TEST_REQUIRED:'Confirme uma publicação real de teste antes de ativar a automação.',DUPLICATE_OR_SLOT_CONFLICT:'Conteúdo já está na fila ou o horário está ocupado.',AUTOMATION_PAUSED:'Ative a conta após o teste real ou selecione publicação de teste.',PUBLIC_MEDIA_NOT_ACCESSIBLE:'O arquivo precisa estar público e ter o formato JPEG ou MP4 correto.',MEDIA_ORIGIN_NOT_ALLOWED:'Use o armazenamento oficial da Vendrex.',META_AUTH_REQUIRED:'Reconecte a conta pela autorização oficial da Meta.'};
async function authRequest(path,body,token){
 const r=await fetch(config.url+path,{method:body?'POST':'GET',headers:{apikey:config.publishableKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
 const data=await r.json();if(!r.ok)throw new Error(data.msg||data.error_description||data.message||'Falha de autenticação');return data;
}
async function refreshSession(){if(session&&session.expires_at*1000<Date.now()+60000)session=await authRequest('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token});}
async function api(action,body){
 await refreshSession();const r=await fetch('/api/meta/'+action,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:body?JSON.stringify(body):undefined});
 const data=await r.json();if(!r.ok)throw new Error(explain[data.error]||data.error||'Integração indisponível');return data;
}
function showTab(name){for(const id of ['overview','integrations','records-panel'])document.getElementById(id).hidden=id!==(name==='records'?'records-panel':name);document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-current',b.dataset.tab===name?'page':'false'));}
async function loadSocial(){
 social=await api('status');document.getElementById('social').innerHTML=renderIntegrations(social);
 document.getElementById('connect-meta').disabled=!social.meta_configured;
 document.getElementById('agents').innerHTML=['Sales','Builder','Growth','Director'].map(name=>`<article class="card"><p class="eyebrow">AGENTE</p><h3>${name}</h3><span class="badge">${name==='Growth'?esc(social.state):'BLOCKED'}</span><p>${name==='Growth'?(social.operational?'Publicação real e worker confirmados.':'Autorização, teste real ou ativação pendente.'):'Executor remoto e inferência ainda não comprovados.'}</p></article>`).join('');
}
async function load(){
 const user=await authRequest('/auth/v1/user',null,session.access_token);
 const r=await fetch(config.url+'/rest/v1/vendrex_records?select=entity,id,payload,updated_at&order=updated_at.desc&limit=100',{headers:{apikey:config.publishableKey,Authorization:'Bearer '+session.access_token}});
 const records=await r.json();if(!r.ok)throw new Error('Dados indisponíveis. Verifique migrações e RLS.');
 document.getElementById('login').hidden=true;document.getElementById('dashboard').hidden=false;document.getElementById('user').textContent=user.email;
 document.getElementById('records').innerHTML=records.length?records.map(v=>`<article class="card"><h3>${esc(v.entity)} · ${esc(v.id.slice(0,12))}</h3><details><summary>Ver dados</summary><pre>${esc(JSON.stringify(v.payload,null,2))}</pre></details></article>`).join(''):'<p>Nenhum registro sincronizado.</p>';
 await loadSocial();showTab(location.hash.startsWith('#integrations')?'integrations':'overview');
}
document.getElementById('login-form').addEventListener('submit',async event=>{
 event.preventDefault();const b=event.target.querySelector('button');b.disabled=true;
 try{if(!config)throw new Error('Supabase não configurado.');session=await authRequest('/auth/v1/token?grant_type=password',Object.fromEntries(new FormData(event.target)));event.target.reset();await load();status.textContent='Sessão validada. Dados protegidos por propriedade e RLS.';}catch(e){status.textContent=e.message;}finally{b.disabled=false;}
});
document.getElementById('logout').addEventListener('click',async()=>{
 const previous=session;session=null;social=null;document.getElementById('dashboard').hidden=true;document.getElementById('login').hidden=false;document.getElementById('records').replaceChildren();document.getElementById('social').replaceChildren();status.textContent='Sessão encerrada.';
 try{if(previous)await authRequest('/auth/v1/logout',{},previous.access_token);}catch{status.textContent='Sessão local encerrada. Revogação remota não confirmada.';}
});
document.addEventListener('click',async event=>{
 const b=event.target.closest('button');if(!b)return;
 if(b.dataset.tab){showTab(b.dataset.tab);return;}
 if(b.id==='connect-meta'){
  const popup=window.open('about:blank','vendrex-meta','width=720,height=850');
  try{const data=await api('start',{});if(popup)popup.location.href=data.authorization_url;else location.assign(data.authorization_url);}catch(e){popup?.close();status.textContent=e.message;}return;
 }
 if(!b.dataset.control&&!b.dataset.disconnect&&!b.dataset.metrics)return;
 b.disabled=true;
 try{
  if(b.dataset.control)await api('control',{connection_id:b.dataset.control,paused:b.dataset.paused==='true'});
  if(b.dataset.disconnect)await api('disconnect',{connection_id:b.dataset.disconnect});
  if(b.dataset.metrics)await api('metrics',{connection_id:b.dataset.connection,post_id:b.dataset.metrics});
  await loadSocial();status.textContent='Estado atualizado.';
 }catch(e){status.textContent=e.message;}finally{b.disabled=false;}
});
document.addEventListener('submit',async event=>{
 if(event.target.id!=='publication-form')return;event.preventDefault();const b=event.target.querySelector('button[type=submit]');b.disabled=true;
 try{const data=Object.fromEntries(new FormData(event.target));data.test_post=data.test_post==='on';data.mime_type=data.kind==='IMAGE'?'image/jpeg':'video/mp4';await api('enqueue',data);await loadSocial();status.textContent='Publicação enfileirada. Conclusão depende da confirmação da Meta.';}catch(e){status.textContent=e.message;}finally{b.disabled=false;}
});
window.addEventListener('message',event=>{if(event.origin===location.origin&&event.data?.type==='meta-connected'&&session)loadSocial().catch(e=>status.textContent=e.message);});
if(location.hash.includes('meta=connected')&&window.opener){window.opener.postMessage({type:'meta-connected'},location.origin);window.close();}
fetch('/api/config').then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error);config=data;status.textContent='Faça login. A sessão fica apenas na memória desta página.';}).catch(e=>{status.textContent=e.message;document.querySelector('#login-form button').disabled=true;});
