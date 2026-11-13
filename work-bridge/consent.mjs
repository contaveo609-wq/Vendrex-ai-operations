import {createClient} from '@supabase/supabase-js';
import {authorizationRequest,authorizationRedirect,emailSession,rememberAuthorization,takeAuthorization} from './consent-validation.mjs';
import {completeLogin,verifyEmailLink} from './consent-session.mjs';
let returnedSession=emailSession(location.href);
const emailLinkFailed=new URLSearchParams(location.hash.slice(1)).has('error_code');
if(/(?:access_token|refresh_token|error_description)=/.test(location.hash))history.replaceState(null,'',location.pathname+location.search);

const status=document.getElementById('work-status'),login=document.getElementById('work-login');
let client,authorizationId,ownerEmail,projectURL;
const api=async(action,body)=>{
 const response=await fetch('/api/sales/'+action,{method:body?'POST':'GET',redirect:'error',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});
 let data;try{data=await response.json();}catch{throw new Error('Sua sessão do painel expirou. Recarregue a página para entrar novamente.');}
 if(!response.ok)throw new Error(data.error||'Não foi possível confirmar o acesso.');return data;
};
const redirect=target=>location.assign(authorizationRedirect(target));
async function finish(session){
 const result=await completeLogin({client,api,session,authorizationId});
 if(result.state==='REDIRECT'){redirect(result.url);return;}
 login.hidden=true;
 if(result.state==='READY'){
  document.getElementById('work-ready').hidden=false;
  status.textContent='Acesso de operador confirmado. Falta conectar o plugin no ChatGPT e revisar o consentimento. Isso ainda não ativa o WhatsApp.';return;
 }
 document.getElementById('work-client').textContent=JSON.stringify(result.details,null,2);
 document.getElementById('work-permissions').hidden=false;status.textContent='Confira o aplicativo e as permissões abaixo. Para concluir, clique em Autorizar esta conexão.';
}
async function start(){
 const config=await api('work-config');
 authorizationId=authorizationRequest(location.href);
 if(authorizationId)rememberAuthorization(localStorage,authorizationId);
 else if(returnedSession)authorizationId=takeAuthorization(localStorage);
 if(!config.email)throw new Error('Email do proprietário indisponível.');
 ownerEmail=config.email;
 projectURL=config.url;
 client=createClient(config.url,config.publishable_key,{auth:{persistSession:true,storage:localStorage,autoRefreshToken:true,detectSessionInUrl:false,flowType:'implicit'},global:{fetch:(url,options={})=>fetch(url,{...options,signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)})}});
 document.getElementById('work-email').value=config.email;login.hidden=false;
 if(returnedSession){
  status.textContent='Confirmando o link recebido por email…';
  const supplied=returnedSession;returnedSession=null;
  const {data,error}=await client.auth.setSession(supplied);
  if(error||!data.session)throw new Error('O link de entrada expirou ou já foi usado. Solicite outro pelo botão Entrar por email.');
  await finish(data.session);return;
 }
 const existing=await client.auth.getSession();
 if(existing.data.session){await finish(existing.data.session);return;}
 if(emailLinkFailed){status.textContent='O link de entrada expirou ou já foi usado. Solicite outro pelo botão Entrar por email.';return;}
 status.textContent='Sua conta já existe. Para entrar, use um link novo neste computador. O mesmo link só funciona uma vez.';
}
document.getElementById('work-link-form').addEventListener('submit',async event=>{
 event.preventDefault();const button=event.target.querySelector('button[type="submit"]');button.disabled=true;
 status.textContent='Validando o link de entrada…';
 try{
  const input=document.getElementById('work-email-url'),link=input.value;input.value='';
  await finish(await verifyEmailLink({client,link,projectURL}));
 }catch(error){status.textContent=error.message;status.scrollIntoView({block:'center'});}finally{button.disabled=false;}
});

document.getElementById('work-email-link').addEventListener('click',async()=>{
 const button=document.getElementById('work-email-link');button.disabled=true;
 status.textContent='Solicitando link de entrada…';
 try{
  const {error}=await client.auth.signInWithOtp({email:ownerEmail,options:{shouldCreateUser:false,emailRedirectTo:location.origin}});
  if(error?.status===429)throw new Error('O Supabase limitou novos emails. Aguarde antes de solicitar outro. Use o email mais recente apenas se o link ainda não foi aberto.');
  if(error)throw new Error('Não foi possível enviar o link de entrada. A conta precisa estar cadastrada e o email confirmado.');
  status.textContent='Link solicitado. No Lenovo, abra o email mais recente e clique no link uma única vez. Se preferir, copie o endereço do link sem abri-lo e valide no campo abaixo. Não use o link no celular primeiro.';
  setTimeout(()=>{button.disabled=false;},60000);
 }catch(error){status.textContent=error.message;button.disabled=false;}
});
for(const decision of ['approve','deny'])document.getElementById('work-'+decision).addEventListener('click',async()=>{
 document.querySelectorAll('button').forEach(button=>button.disabled=true);
 try{
  const result=decision==='approve'?await client.auth.oauth.approveAuthorization(authorizationId,{skipBrowserRedirect:true}):await client.auth.oauth.denyAuthorization(authorizationId,{skipBrowserRedirect:true});
  if(result.error)throw new Error('Não foi possível registrar a decisão.');redirect(result.data.redirect_url);
 }catch(error){status.textContent=error.message;document.querySelectorAll('button').forEach(button=>button.disabled=false);}
});
document.getElementById('work-sign-out').addEventListener('click',async()=>{
 if(client)await client.auth.signOut({scope:'local'});
 document.getElementById('work-ready').hidden=true;document.getElementById('work-permissions').hidden=true;login.hidden=false;
 status.textContent='Acesso encerrado neste navegador. Use um novo link de email para entrar.';
});
start().catch(error=>{status.textContent=error.message;});
