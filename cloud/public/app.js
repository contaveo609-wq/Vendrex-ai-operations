'use strict';
/* Auth is performed by the Supabase server. No service key, user_metadata authorization, or invented session. */
let config=null,session=null;
const status=document.getElementById('status');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function authRequest(path,body,token){
  const response=await fetch(config.url+path,{method:body?'POST':'GET',headers:{apikey:config.publishableKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
  const data=await response.json();if(!response.ok)throw new Error(data.msg||data.error_description||data.message||'Falha de autenticação');return data;
}
async function load(){
  const user=await authRequest('/auth/v1/user',null,session.access_token);
  const response=await fetch(config.url+'/rest/v1/vendrex_records?select=entity,id,payload,updated_at&order=updated_at.desc&limit=100',{headers:{apikey:config.publishableKey,Authorization:'Bearer '+session.access_token}});
  const records=await response.json();if(!response.ok)throw new Error('Dados indisponíveis. Verifique migrações e RLS.');
  document.getElementById('login').hidden=true;document.getElementById('dashboard').hidden=false;document.getElementById('user').textContent='Usuário autenticado: '+user.email;
  document.getElementById('records').innerHTML=records.length?records.map(r=>`<article class="card"><h2>${esc(r.entity)} · ${esc(r.id.slice(0,12))}</h2><p>${esc(r.updated_at)}</p><details><summary>Ver dados</summary><pre>${esc(JSON.stringify(r.payload,null,2))}</pre></details></article>`).join(''):'<p>Nenhum registro sincronizado para este usuário.</p>';
}
document.getElementById('login-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;
  try{if(!config)throw new Error('Supabase não configurado no servidor.');const values=Object.fromEntries(new FormData(event.target));session=await authRequest('/auth/v1/token?grant_type=password',values);event.target.reset();await load();status.textContent='Sessão validada pelo Supabase Auth. Dados filtrados por RLS.';}catch(error){status.textContent=error.message;}finally{button.disabled=false;}
});
document.getElementById('logout').addEventListener('click',async()=>{
  if(session){await fetch(config.url+'/auth/v1/logout',{method:'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+session.access_token}});}
  session=null;document.getElementById('dashboard').hidden=true;document.getElementById('login').hidden=false;status.textContent='Sessão encerrada.';
});
fetch('/api/config').then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);config=data;status.textContent='Faça login. A sessão fica apenas na memória desta página.';}).catch(error=>{status.textContent=error.message;document.querySelector('#login-form button').disabled=true;});
