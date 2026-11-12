// Controlled event/socket fixtures. These tests never claim a real WhatsApp conversation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {AuthCipher,databaseAuth} from '../src/auth.mjs';
import {directJid,inboundEvent,outboundId,providerId,receiptState,connectionPlan,QRTransport} from '../src/events.mjs';
import {inferenceServer} from '../src/inference.mjs';
import {adminServer} from '../src/http.mjs';
import {SalesInferenceEngine} from '../../supabase/functions/sales/core.mjs';
const boot='11111111-1111-4111-8111-111111111111',id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

test('AES-GCM preserves Buffer credentials and rejects tampering, wrong key and wrong instance',()=>{
 const cipher=new AuthCipher(randomBytes(32).toString('hex'));const value={key:Buffer.from([0,1,254]),lid:'12345@lid'};
 const box=cipher.seal(value,'instance:key');assert.deepEqual(cipher.open(box,'instance:key'),value);
 assert(!JSON.stringify(box).includes('12345'));assert.throws(()=>cipher.open(box,'another:key'));
 assert.throws(()=>new AuthCipher(randomBytes(32).toString('hex')).open(box,'instance:key'));
 assert.throws(()=>cipher.open({...box,tag:Buffer.alloc(16).toString('base64')},'instance:key'));
});

function authDB(){const rows=new Map();return {rows,rpc:async(name,p)=>{
 if(name==='qr_auth_get')return p.ids.flatMap(key=>{const box=rows.get(p.category+':'+key);return box?[{key_id:key,box}]:[];});
 if(name==='qr_auth_put'){for(const e of p.entries){if(e.box)rows.set(e.category+':'+e.key_id,e.box);else rows.delete(e.category+':'+e.key_id);}return null;}
 throw Error('UNEXPECTED_RPC');
}};}
test('real Baileys credential generator and database adapter restore a session after worker reconstruction',async()=>{
 const db=authDB(),cipher=new AuthCipher(randomBytes(32).toString('hex')),options={db,cipher,instance:'fixture',boot};
 const first=await databaseAuth(options);await first.state.keys.set({'lid-mapping':{'12345':{pn:'5511999999999'}},session:{peer:Buffer.from([1,2,3])}});
 first.state.creds.registered=true;await first.saveCreds();
 const restored=await databaseAuth(options);assert.equal(restored.state.creds.registered,true);
 assert.deepEqual(restored.state.creds.noiseKey,first.state.creds.noiseKey);
 assert.deepEqual((await restored.state.keys.get('session',['peer'])).peer,Buffer.from([1,2,3]));
 assert.deepEqual((await restored.state.keys.get('lid-mapping',['12345']))['12345'],{pn:'5511999999999'});
 await restored.state.keys.set({session:{peer:null}});assert.deepEqual(await restored.state.keys.get('session',['peer']),{});
});
test('database write failure rejects keys.set before Baileys can assume durability',async()=>{
 const db=authDB(),auth=await databaseAuth({db,cipher:new AuthCipher(randomBytes(32).toString('hex')),instance:'fixture',boot});
 const original=db.rpc;db.rpc=(name,p)=>name==='qr_auth_put'?Promise.reject(Error('DATABASE_UNAVAILABLE')):original(name,p);
 await assert.rejects(auth.state.keys.set({session:{peer:Buffer.from('controlled')}}),/DATABASE_UNAVAILABLE/);
});
test('only direct PN/LID chats are accepted, including alternate identities',()=>{
 for(const jid of ['12345@g.us','status@broadcast','12345@newsletter'])assert.equal(directJid(jid),null);
 assert.equal(directJid('5511999999999:3@s.whatsapp.net'),'5511999999999@s.whatsapp.net');
 const message={key:{id:'INBOUND',remoteJid:'12345@lid',remoteJidAlt:'5511999999999@s.whatsapp.net'},messageTimestamp:Math.floor(Date.now()/1000),message:{extendedTextMessage:{text:'Preciso de um site'}}};
 const event=inboundEvent(message,{instance:'fixture',boot,acceptSince:0});assert.equal(event.jid,'12345@lid');assert.equal(event.alias,'5511999999999@s.whatsapp.net');assert.equal(event.kind,'INBOUND');assert.equal(event.body,'Preciso de um site');
 assert.equal(inboundEvent({...message,key:{...message.key,remoteJid:'12345@g.us'}},{acceptSince:0}),null);
 assert.equal(inboundEvent(message,{acceptSince:Date.now()+100000}),null);
});
test('unsupported media requests human routing while service metadata is ignored',()=>{
 const base={key:{id:'X',remoteJid:'12345@lid'},messageTimestamp:Math.floor(Date.now()/1000)};
 assert.equal(inboundEvent({...base,message:{imageMessage:{}}},{acceptSince:0}).message_type,'unsupported');
 assert.equal(inboundEvent({...base,message:{reactionMessage:{text:'ok'}}},{acceptSince:0}),null);
});
test('receipts distinguish acceptance, server send, device delivery and read',()=>{
 assert.equal(receiptState(1),null);assert.equal(receiptState(2),'SENT');assert.equal(receiptState(3),'DELIVERED');assert.equal(receiptState(4),'READ');
 for(const code of [401,403,411,440,500])assert.equal(connectionPlan(code,3).retry,false);
 assert.equal(connectionPlan(515,0).delay,1000);assert.equal(connectionPlan(408,20).delay,60000);
});
test('QR transport persists the retry payload before sending with a stable outbox ID',async()=>{
 let stored=false,sent=0;const expected=outboundId(id);
 const transport=new QRTransport({isConnected:()=>true,persistOutgoing:async v=>{assert.equal(v.id,expected);stored=true;},socket:()=>({sendMessage:async(jid,payload,options)=>{assert(stored);assert.equal(jid,'12345@lid');assert.equal(options.messageId,expected);sent++;return {key:{id:expected}};}})});
 const r=await transport.send('12345@lid','Resposta controlada','IN',{outbox_id:id});assert.equal(r.id,providerId(expected));assert.equal(r.delivered,false);assert.equal(sent,1);
});
test('QR send ambiguity never retries or fabricates delivery',async()=>{
 let n=0;const transport=new QRTransport({isConnected:()=>true,persistOutgoing:async()=>{},socket:()=>({sendMessage:async()=>{n++;throw Error('closed');}})});
 await assert.rejects(transport.send('12345@lid','Controlada',null,{outbox_id:id}),e=>e.code==='QR_SEND_AMBIGUOUS'&&!e.retry);assert.equal(n,1);
});

async function listen(server){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return 'http://127.0.0.1:'+server.address().port;}
async function close(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
test('private inference endpoint rejects unauthenticated calls and arbitrary models before contacting Ollama',async()=>{
 let calls=0;const token='X'.repeat(64),server=inferenceServer({token,fetcher:async()=>{calls++;throw Error('MUST NOT FETCH');}}),url=await listen(server);
 try{assert.equal((await fetch(url+'/api/chat',{method:'POST',body:'{}'})).status,401);
  assert.equal((await fetch(url+'/api/chat',{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify({model:'commercial-model',stream:false,messages:[]})})).status,422);assert.equal(calls,0);
 }finally{await close(server);}
});
test('production local inference requires the explicit authenticated companion boundary',async()=>{
 const engine=new SalesInferenceEngine({provider:'OLLAMA_SELF_HOST',model:'gemma3:1b',endpoint:'http://127.0.0.1:11435',bearer:'X'.repeat(64)});
 await assert.rejects(engine.generate([]),e=>e.code==='SECURE_REMOTE_INFERENCE_REQUIRED');
});
test('QR image, status, controls and test contacts require operator authentication',async()=>{
 const token='X'.repeat(64),gateway={status:'WAITING_QR',qr:{image:Buffer.from('CONTROLLED'),expires:Date.now()+10000}},db={};const server=adminServer({gateway,token,db}),url=await listen(server);
 try{for(const path of ['/qr.png','/status','/pause','/recipients','/behavior'])assert.equal((await fetch(url+path,{method:path==='/pause'?'POST':'GET'})).status,401);
  assert.equal((await fetch(url+'/qr.png',{headers:{Authorization:'Bearer '+token}})).status,200);
 }finally{await close(server);}
});

test('personality editor reads persisted settings and saves through the restricted backend RPC',async()=>{
 const token='X'.repeat(64),behavior={personality:'Consultivo e acolhedor',instructions:'Uma pergunta por vez',opening:'Olá!',permission:'Posso explicar?',proposal:'Solução sob medida'};let saved;
 const db={rows:async()=>[{bot_behavior:behavior,behavior_revision:2}],rpc:async(name,body)=>{assert.equal(name,'behavior_set');saved=body.behavior;return {saved:true,behavior_revision:3};}};
 const server=adminServer({gateway:{status:'PAUSED'},token,db}),url=await listen(server),headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 try{const read=await (await fetch(url+'/behavior',{headers})).json();assert.deepEqual(read.behavior,behavior);
  const r=await fetch(url+'/behavior',{method:'POST',headers,body:JSON.stringify({behavior:{...behavior,personality:'Formal e objetivo'}})});assert.equal(r.status,200);assert.equal(saved.personality,'Formal e objetivo');
  const page=await (await fetch(url)).text();assert(page.includes('Personalidade e falas'));assert(page.includes('save-behavior'));
 }finally{await close(server);}
});
