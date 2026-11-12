import {createServer} from 'node:http';
import {authorized,readBody} from './inference.mjs';
import {safeCode} from './gateway.mjs';

const html=`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vendrex Sales</title><link rel="stylesheet" href="/app.css"><main><h1>VENDREX Sales</h1><p>Conexão por QR e IA própria. Envio começa pausado em modo TEST.</p><label>Token de administração <input id="token" type="password" autocomplete="off"></label><button id="load">Consultar</button><pre id="status">Autentique para consultar a conexão.</pre><img id="qr" alt="QR de vinculação" hidden><label>Contatos autorizados para teste (números internacionais sem + ou JIDs exatos, separados por vírgula)<input id="recipients" autocomplete="off" placeholder="Informe somente contatos que autorizaram o teste"></label><button id="save">Salvar contatos</button><button id="resume">Atender contatos de teste</button><button id="pause">Pausar imediatamente</button><h2>Transferir para humano</h2><label>ID da conversa <input id="conversation" autocomplete="off"></label><button id="human">Transferir</button><p>Histórico, recebimentos e confirmações ficam no Supabase. Uma conversa só é comprovada com recebimento real, IA real, entrega confirmada e continuidade após reiniciar.</p></main><script src="/app.js"></script></html>`;
const js=`let qrUrl;const el=id=>document.getElementById(id);async function call(path,body){const r=await fetch(path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+el('token').value,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const value=await r.json();if(!r.ok)throw Error(value.error||'Falha');return value;}async function load(){try{const status=await call('/status');el('status').textContent=JSON.stringify(status,null,2);el('live').disabled=!status.SALES_WHATSAPP_OPERATIONAL;const r=await fetch('/qr.png',{headers:{Authorization:'Bearer '+el('token').value}});el('qr').hidden=!r.ok;if(r.ok){if(qrUrl)URL.revokeObjectURL(qrUrl);qrUrl=URL.createObjectURL(await r.blob());el('qr').src=qrUrl;}}catch(e){el('status').textContent=e.message;}}async function action(path,body){try{el('status').textContent=JSON.stringify(await call(path,body),null,2);await load();}catch(e){el('status').textContent=e.message;}}el('load').onclick=load;el('save').onclick=()=>action('/recipients',{recipients:el('recipients').value.split(',').map(x=>x.trim()).filter(Boolean)});el('resume').onclick=()=>action('/resume',{});el('pause').onclick=()=>action('/pause',{});el('human').onclick=()=>action('/human',{conversation_id:el('conversation').value.trim()});setInterval(()=>{if(el('token').value)load();},15000);`;
const css='body{font:16px system-ui;background:#101820;color:#e7f0f4;margin:0}main{max-width:760px;margin:40px auto;padding:24px}label{display:block;margin:20px 0}input{box-sizing:border-box;display:block;width:100%;margin-top:8px;padding:12px;background:#1d2d39;color:#fff;border:1px solid #668294;border-radius:6px}button{padding:12px;margin:4px;background:#37ccb3;border:0;border-radius:6px;cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#1d2d39;padding:20px}img{max-width:100%;background:white}p{line-height:1.6}';
const behaviorHtml=`<button id="live" disabled>Ativar atendimento geral após teste real</button><section aria-labelledby="behavior-title"><h2 id="behavior-title">Personalidade e falas</h2><p>Edite o estilo e os textos de referência usados pela IA nas próximas respostas.</p><label>Personalidade<textarea id="personality" rows="3" maxlength="1200"></textarea></label><label>Instruções de atendimento<textarea id="instructions" rows="4" maxlength="2000"></textarea></label><label>Abertura<textarea id="opening" rows="2" maxlength="1200"></textarea></label><label>Pedido de permissão<textarea id="permission" rows="3" maxlength="1200"></textarea></label><label>Texto-base da proposta<textarea id="proposal" rows="4" maxlength="1200"></textarea></label><button id="save-behavior">Salvar personalidade e falas</button><p id="behavior-result" role="status">Autentique e clique em Consultar para carregar a configuração.</p></section>`;
const behaviorJS=`el('live').onclick=()=>action('/live',{});const behaviorFields=['personality','instructions','opening','permission','proposal'];async function loadBehavior(){try{const data=await call('/behavior');for(const key of behaviorFields)el(key).value=data.behavior[key]||'';el('behavior-result').textContent='Configuração carregada. Versão '+data.behavior_revision;}catch(e){el('behavior-result').textContent=e.message;}}el('load').onclick=async()=>{await load();await loadBehavior();};el('save-behavior').onclick=async()=>{try{const behavior=Object.fromEntries(behaviorFields.map(key=>[key,el(key).value]));const r=await call('/behavior',{behavior});el('behavior-result').textContent='Salvo. Configuração vale para próximas respostas. Versão '+r.behavior_revision;}catch(e){el('behavior-result').textContent=e.message;}};`;
export function adminServer({gateway,token,db}){
 if(!token||token.length<32)throw Error('SALES_ADMIN_TOKEN_REQUIRED');
 return createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'");
  const send=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  if(req.method==='GET'&&['/','/app.js','/app.css'].includes(req.url)){const file=req.url==='/'?[html.replace('</main>',behaviorHtml+'</main>'),'text/html; charset=utf-8']:req.url==='/app.js'?[js+behaviorJS,'text/javascript; charset=utf-8']:[css+'textarea{box-sizing:border-box;display:block;width:100%;margin-top:8px;padding:12px;background:#1d2d39;color:#fff;border:1px solid #668294;border-radius:6px;font:inherit}','text/css'];res.writeHead(200,{'Content-Type':file[1]});return res.end(file[0]);}
  if(req.url==='/health'&&req.method==='GET')return send({component:'VENDREX_SALES_QR',state:gateway.status,SALES_WHATSAPP_OPERATIONAL:false});
  if(!authorized(req.headers.authorization,'Bearer '+token))return send({error:'UNAUTHORIZED'},401);
  try{
   if(req.url==='/qr.png'&&req.method==='GET'){
    if(!gateway.qr||gateway.qr.expires<Date.now()){res.writeHead(404);return res.end();}
    res.writeHead(200,{'Content-Type':'image/png'});return res.end(gateway.qr.image);
   }
   if(req.url==='/status'&&req.method==='GET'){
    const [settings]=await db.rows('settings','id=eq.true');const proof=await db.rpc('proof');
    return send({...proof,state:gateway.status,host_kind:gateway.hostKind,paused:settings.paused,mode:settings.mode,debounce_seconds:5,
     inference_daily_limit:settings.inference_daily_limit,inference_calls_today:settings.inference_calls,worker_daily_limit:settings.worker_daily_limit,
     last_heartbeat:settings.last_heartbeat,last_error:gateway.lastError||settings.last_error,
     conversations:await db.rows('conversations','select=id,status,last_inbound_at&order=last_inbound_at.desc.nullslast&limit=20')});
   }
   if(req.url==='/behavior'&&req.method==='GET'){
    const [s]=await db.rows('settings','select=bot_behavior,behavior_revision&id=eq.true');return send({behavior:s.bot_behavior,behavior_revision:s.behavior_revision});
   }
   if(req.method!=='POST')return send({error:'NOT_FOUND'},404);
   const body=JSON.parse(await readBody(req));
   if(req.url==='/behavior')return send(await db.rpc('behavior_set',{behavior:body.behavior}));
   if(req.url==='/recipients'){
    const values=body.recipients;
    if(!Array.isArray(values)||values.length<1||values.length>5||values.some(v=>typeof v!=='string'||!/^\d{8,30}(?:@(s\.whatsapp\.net|lid))?$/.test(v)))return send({error:'EXACT_AUTHORIZED_CONTACT_REQUIRED'},422);
    const [s]=await db.rows('settings','id=eq.true');if(!s.paused)return send({error:'PAUSE_BEFORE_CHANGING_TEST_CONTACTS'},409);
    await db.patch('settings','id=eq.true',{test_recipients:[...new Set(values)],mode:'TEST'});return send({saved:true,mode:'TEST'});
   }
   if(['/pause','/resume','/human','/live'].includes(req.url)){
    const action=req.url==='/pause'?'pause':req.url==='/resume'?'resume_test':req.url==='/live'?'activate_live':'human';
    if(['resume_test','activate_live'].includes(action)&&!gateway.connected)return send({error:'QR_CONNECTION_REQUIRED'},409);
    if(action==='human'&&!/^[a-f0-9-]{36}$/i.test(body.conversation_id||''))return send({error:'CONVERSATION_ID_REQUIRED'},422);
    return send(await db.rpc('control',{action,conversation:body.conversation_id||null}));
   }
   return send({error:'NOT_FOUND'},404);
  }catch(error){return send({error:safeCode(error)},400);}
 });
}
