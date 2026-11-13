import {createClient} from '@supabase/supabase-js';
import {authorizationRequest,authorizationRedirect} from './consent-validation.mjs';
if(/(?:access_token|refresh_token|error_description)=/.test(location.hash))history.replaceState(null,'',location.pathname+location.search);

const status=document.getElementById('work-status'),login=document.getElementById('work-login');
let client,authorizationId;
const api=async(action,body)=>{
 const response=await fetch('/api/sales/'+action,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível confirmar o acesso.');return data;
};
const redirect=target=>location.assign(authorizationRedirect(target));
async function start(){
 const config=await api('work-config');
 authorizationId=authorizationRequest(location.href);
 if(!config.email)throw new Error('Email do proprietário indisponível.');
 client=createClient(config.url,config.publishable_key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 document.getElementById('work-email').value=config.email;login.hidden=false;
 status.textContent=authorizationId?'Confira a solicitação antes de autorizar. A senha não é salva neste navegador.':'Prepare seu acesso. Depois volte ao plugin Vendrex Operations no ChatGPT e escolha Conectar.';
}
login.addEventListener('submit',async event=>{
 event.preventDefault();const button=login.querySelector('button');button.disabled=true;
 try{
  const password=document.getElementById('work-password');
  const {data,error}=await client.auth.signInWithPassword({email:document.getElementById('work-email').value,password:password.value});password.value='';
  if(error?.code==='invalid_credentials')throw new Error('Email ou senha incorretos. Use a senha criada nesta página.');
  if(error?.code==='email_not_confirmed')throw new Error('Confirme seu email antes de entrar. Depois volte a esta página.');
  if(error||!data.session)throw new Error('Não foi possível entrar. Confirme a conta de operador e o email verificado.');
  await api('work-enroll',{access_token:data.session.access_token});
  if(!authorizationId){
   login.hidden=true;document.getElementById('work-ready').hidden=false;
   status.textContent='Acesso de operador confirmado. Falta conectar o plugin no ChatGPT e revisar o consentimento. Isso ainda não ativa o WhatsApp.';return;
  }
  const result=await client.auth.oauth.getAuthorizationDetails(authorizationId);
  if(result.error)throw new Error('A solicitação de autorização expirou ou o provedor OAuth ainda não foi configurado.');
  if(result.data.redirect_url){redirect(result.data.redirect_url);return;}
  document.getElementById('work-client').textContent=JSON.stringify({aplicativo:result.data.client,permissoes:result.data.scope,destino:result.data.redirect_uri},null,2);
  document.getElementById('work-permissions').hidden=false;login.hidden=true;status.textContent='Autorize somente a conexão que você iniciou.';
 }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
});
document.getElementById('work-register').addEventListener('click',async()=>{
 const input=document.getElementById('work-password'),button=document.getElementById('work-register');
 if(input.value.length<12){status.textContent='Para criar seu acesso, escolha uma senha com pelo menos 12 caracteres.';return;}
 button.disabled=true;
 try{
  const {error}=await client.auth.signUp({email:document.getElementById('work-email').value,password:input.value});input.value='';
  if(error)throw new Error('Não foi possível criar o acesso. Se já possui essa conta, use Entrar.');
  status.textContent='Confira seu email e confirme o acesso. Depois retorne à conexão do ChatGPT e entre com a senha escolhida.';
 }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
});
for(const decision of ['approve','deny'])document.getElementById('work-'+decision).addEventListener('click',async()=>{
 document.querySelectorAll('button').forEach(button=>button.disabled=true);
 try{
  const result=decision==='approve'?await client.auth.oauth.approveAuthorization(authorizationId,{skipBrowserRedirect:true}):await client.auth.oauth.denyAuthorization(authorizationId,{skipBrowserRedirect:true});
  if(result.error)throw new Error('Não foi possível registrar a decisão.');redirect(result.data.redirect_url);
 }catch(error){status.textContent=error.message;document.querySelectorAll('button').forEach(button=>button.disabled=false);}
});
start().catch(error=>{status.textContent=error.message;});
