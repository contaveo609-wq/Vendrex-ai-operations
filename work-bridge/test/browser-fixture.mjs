// Local browser fixture only. No real accounts, email, database or OAuth grants.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DEFAULT_BEHAVIOR} from '../../supabase/functions/sales/behavior.mjs';
const root=fileURLToPath(new URL('../../netlify-site/dist/',import.meta.url));
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const fixtureToken=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:'11111111-1111-4111-8111-111111111111',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)})+'.'+Buffer.from('not-a-real-signature').toString('base64url');
const fixtureSession={access_token:fixtureToken,refresh_token:'fixture12345',type:'magiclink'};
const events=[];
const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'owner@example.invalid',email_confirmed_at:new Date().toISOString(),app_metadata:{provider:'email'},user_metadata:{},identities:[],created_at:new Date().toISOString()};
const server=createServer(async(req,res)=>{
 const origin='http://'+req.headers.host,url=new URL(req.url,origin);
 const json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 try{
  if(url.pathname==='/__fixture'){
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
   res.end('<h1>Teste local controlado</h1><p>Nenhuma conta real é usada.</p><a href="/#'+new URLSearchParams(fixtureSession)+'">Testar retorno pela página inicial</a><br><a href="/work-consent.html?authorization_id=abcdefghijklmnopqrstuvwxyz234567#'+new URLSearchParams(fixtureSession)+'">Testar retorno com solicitação OAuth</a><br><a href="/work-consent.html">Testar formulário de link</a>');return;
  }
  if(url.pathname==='/__events')return json({fixture:true,events});
  if(url.pathname==='/api/sales/work-config')return json({email:user.email,url:origin+'/supabase',publishable_key:'sb_publishable_controlled_browser_fixture'});
  if(url.pathname==='/api/sales/work-enroll'){
   let raw='';for await(const chunk of req)raw+=chunk;
   if(JSON.parse(raw).access_token!==fixtureToken)return json({error:'FIXTURE_INVALID_SESSION'},401);
   events.push('OWNER_ENROLLED');return json({enrolled:true});
  }
  if(url.pathname==='/supabase/auth/v1/user'){
   if(req.headers.authorization!=='Bearer '+fixtureToken)return json({error:'FIXTURE_INVALID_SESSION'},401);
   events.push('AUTH_USER_VERIFIED');return json(user);
  }
  if(url.pathname==='/supabase/auth/v1/verify'){
   let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);
   if(body.token_hash!=='unused-browser-fixture'||body.type!=='email')return json({error_code:'otp_expired'},403);
   events.push('LINK_VERIFIED');return json({...fixtureSession,expires_in:3600,token_type:'bearer',user});
  }
  if(url.pathname.startsWith('/supabase/auth/v1/oauth/authorizations/')){
   events.push('CONSENT_DETAILS_READ');return json({authorization_id:'abcdefghijklmnopqrstuvwxyz234567',client:{name:'ChatGPT — fixture local'},scope:'offline_access',redirect_uri:'https://chatgpt.com/fixture-callback'});
  }
  if(url.pathname==='/api/config')return json({user:{email:user.email,expiresAt:'2100-01-01T00:00:00Z'}});
  if(url.pathname==='/api/sales/status')return json({paused:true,mode:'TEST',transport_policy:'BAILEYS_QR',state:'HOST_REQUIRED',test_recipients:[],SALES_WHATSAPP_OPERATIONAL:false});
  if(url.pathname==='/api/sales/behavior')return json({behavior:DEFAULT_BEHAVIOR,behavior_revision:1});
  if(url.pathname==='/api/sales/pairing')return json({state:'HOST_REQUIRED'});
  const file=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(resolve(root)+'/')&&!file.startsWith(resolve(root)+'\\'))return json({error:'NOT_FOUND'},404);
  const content=await readFile(file),mime={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css'}[extname(file)]||'application/octet-stream';
  res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store'});res.end(content);
 }catch{return json({error:'FIXTURE_REQUEST_FAILED'},500);}
});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({port:server.address().port,fixture:true})));
process.on('SIGTERM',()=>{server.closeAllConnections();server.close();});
