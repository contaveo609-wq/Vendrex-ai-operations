import {renderSales} from './sales.mjs';
import {renderPairing} from './pairing.mjs';
import {renderConversations,renderHistory} from './inbox.mjs';
// Email verification can redirect here; never retain authentication fragments in the address bar.
if(/(?:access_token|refresh_token|error_description)=/.test(location.hash))history.replaceState(null,'',location.pathname+location.search);
const status=document.getElementById('status');let identity,pairingTimer,expiryTimer,watchUntil=0,selectedConversation=null,conversations=[];
const explain={OWNER_LOGIN_REQUIRED:'Acesse com a conta proprietária da Netlify e recarregue a página.',SERVER_CONFIGURATION_REQUIRED:'A configuração segura do painel ainda precisa ser concluída.',SALES_UNAVAILABLE:'Não foi possível consultar o Sales. Tente atualizar o estado.',EXACT_AUTHORIZED_CONTACT_REQUIRED:'Informe o número internacional do contato autorizado para o teste.',PAUSE_BEFORE_CHANGING_TEST_CONTACTS:'Pause o Sales antes de alterar os contatos de teste.'};
async function api(action,body){
 const r=await fetch('/api/'+action,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 let data;try{data=await r.json();}catch{throw new Error('A sessão Netlify expirou. Recarregue a página para entrar novamente.');}
 if(!r.ok)throw new Error(explain[data.error]||data.error||'Serviço indisponível.');return data;
}
function showPairing(pairing){
 clearTimeout(expiryTimer);document.getElementById('pairing-panel').innerHTML=renderPairing(pairing);
 const ms=Date.parse(pairing.expires_at)-Date.now();
 if(pairing.state==='QR_READY'&&ms>0)expiryTimer=setTimeout(()=>showPairing({state:'QR_EXPIRED',host_kind:pairing.host_kind}),Math.min(ms,60000));
}
async function loadPairing(){
 clearTimeout(pairingTimer);const data=await api('sales/pairing');showPairing(data);
 if(Date.now()<watchUntil&&['CONNECTING','RECONNECTING','QR_READY','QR_EXPIRED','WAITING_QR'].includes(data.state))pairingTimer=setTimeout(()=>loadPairing().catch(e=>{status.textContent=e.message;}),5000);
}
async function load(){
 const [state,behavior,pairing]=await Promise.all([api('sales/status'),api('sales/behavior'),api('sales/pairing')]);
 document.getElementById('sales').innerHTML='<article id="pairing-panel" class="card" aria-live="polite"></article>'+renderSales(state,behavior);showPairing(pairing);
 status.textContent=state.SALES_WHATSAPP_OPERATIONAL?'Atendimento real e continuidade comprovados.':'Configuração salva na nuvem. Conexão do telefone e teste real ainda pendentes.';
}
async function loadInbox(){
 const data=await api('sales/conversations');conversations=data.conversations||[];
 if(!conversations.some(c=>c.id===selectedConversation))selectedConversation=conversations[0]?.id||null;
 document.getElementById('inbox').innerHTML=renderConversations(data,selectedConversation);
 if(selectedConversation)await loadHistory();
}
async function loadHistory(){
 const current=conversations.find(c=>c.id===selectedConversation);
 if(!current)return;
 const messages=await api('sales/history?conversation_id='+encodeURIComponent(current.id));
 document.getElementById('inbox-thread').innerHTML=renderHistory(messages,current);
 document.querySelectorAll('[data-conversation]').forEach(button=>{button.classList.toggle('selected',button.dataset.conversation===current.id);button.setAttribute('aria-current',button.dataset.conversation===current.id?'true':'false');});
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.tab){for(const id of ['sales','inbox','builder','growth','director','tests'])document.getElementById(id).hidden=id!==b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(v=>v.setAttribute('aria-current',v===b?'page':'false'));if(b.dataset.tab!=='sales'){watchUntil=0;clearTimeout(pairingTimer);}if(b.dataset.tab==='inbox')try{await loadInbox();}catch(error){status.textContent=error.message;}return;}
 if(b.hasAttribute('data-inbox-refresh')){b.disabled=true;try{await loadInbox();status.textContent='Conversas atualizadas.';}catch(error){status.textContent=error.message;}finally{b.disabled=false;}return;}
 if(b.dataset.conversation){selectedConversation=b.dataset.conversation;try{await loadHistory();}catch(error){status.textContent=error.message;}return;}
 if(b.dataset.humanControl){b.disabled=true;try{await api('sales/control',{action:b.dataset.humanControl,conversation_id:b.dataset.conversationId});await loadInbox();status.textContent='Controle da conversa salvo no Supabase.';}catch(error){status.textContent=error.message;b.disabled=false;}return;}
 if(b.hasAttribute('data-pairing-refresh')){b.disabled=true;try{watchUntil=Date.now()+180000;await loadPairing();}catch(error){status.textContent=error.message;b.disabled=false;}return;}
 if(!b.hasAttribute('data-sales-refresh')&&!b.dataset.salesControl)return;
 b.disabled=true;try{if(b.dataset.salesControl)await api('sales/control',{action:b.dataset.salesControl});await load();}catch(error){status.textContent=error.message;b.disabled=false;}
});
document.addEventListener('submit',async e=>{
 if(!['sales-behavior-form','sales-contacts-form','sales-inference-key-form','work-order-form'].includes(e.target.id))return;e.preventDefault();
 const b=e.target.querySelector('button[type=submit]');b.disabled=true;
 try{const values=Object.fromEntries(new FormData(e.target));
  if(e.target.id==='work-order-form'){
   const result=await api('sales/work-order',{instruction:values.instruction});
   status.textContent=result.work_enabled?'Ordem salva na fila do gerente.':'Ordem salva. Aguardando conexão e autorização do ChatGPT Work.';b.disabled=false;return;
  }
  if(e.target.id==='sales-behavior-form')await api('sales/behavior',{behavior:values});
  else if(e.target.id==='sales-inference-key-form')await api('sales/inference-key',{api_key:values.api_key});
  else await api('sales/test-contacts',{recipients:values.recipients.split(',').map(x=>x.trim()).filter(Boolean)});
  await load();status.textContent='Configuração salva no Supabase.';
 }catch(error){status.textContent=error.message;b.disabled=false;}
});
try{identity=await api('config');document.getElementById('identity').textContent='Acesso privado · '+(identity.user.email||'Proprietário');await load();}
catch(error){status.textContent=error.message;}
window.addEventListener('pagehide',()=>{watchUntil=0;clearTimeout(pairingTimer);clearTimeout(expiryTimer);});
