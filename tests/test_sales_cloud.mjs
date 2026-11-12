// Controlled transports only. A green test is never a real WhatsApp conversation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Fault,SalesInferenceEngine,WhatsAppCloudTransport,SalesWorker,signature,verifyWebhook,guardReply} from '../supabase/functions/sales/core.mjs';
import {createHandler} from '../supabase/functions/sales/api.mjs';
const secret={sales_meta_app_secret:'APP_SECRET_FIXTURE',sales_meta_verify_token:'VERIFY_FIXTURE',sales_worker_secret:'WORKER_FIXTURE'};
const apiSettings=async()=>[{transport_policy:'META_CLOUD_API'}];
test('Meta HMAC validates original raw body and rejects modified payload',async()=>{
 const body='{"object":"whatsapp_business_account"}';const sig=await signature(body,secret.sales_meta_app_secret);
 assert(await verifyWebhook(body,sig,secret.sales_meta_app_secret));assert(!await verifyWebhook(body+' ',sig,secret.sales_meta_app_secret));assert(!await verifyWebhook(body,sig,'WRONG'));assert(!await verifyWebhook(body,null,secret.sales_meta_app_secret));
});
test('challenge verification requires exact secret, returns plain challenge',async()=>{
 const db={rpc:async()=>secret,rows:apiSettings};const handler=createHandler({url:'https://fixture.supabase.co',key:'SERVICE',store:db});
 const req=value=>new Request('https://fixture.supabase.co/functions/v1/sales/webhook?hub.mode=subscribe&hub.verify_token='+value+'&hub.challenge=123456');
 const valid=await handler(req('VERIFY_FIXTURE'));assert.equal(valid.status,200);assert.equal(await valid.text(),'123456');assert.equal((await handler(req('WRONG'))).status,403);
});
test('unsigned or forged webhook never reaches the persistence RPC',async()=>{
 const calls=[];const db={rows:apiSettings,rpc:async(name,body)=>{calls.push(name);return name==='secrets'?secret:{received:1};}};
 const handler=createHandler({url:'https://fixture.supabase.co',key:'SERVICE',store:db});
 const body=JSON.stringify({object:'whatsapp_business_account'});
 const fake=await handler(new Request('https://fixture.supabase.co/functions/v1/sales/webhook',{method:'POST',body}));assert.equal(fake.status,401);assert(!calls.includes('ingest'));
 const sig=await signature(body,secret.sales_meta_app_secret);const ok=await handler(new Request('https://fixture.supabase.co/functions/v1/sales/webhook',{method:'POST',body,headers:{'X-Hub-Signature-256':sig}}));assert.equal(ok.status,200);assert(calls.includes('ingest'));
});
test('cron and operator endpoints reject anonymous access',async()=>{
 const db={rpc:async()=>secret};const handler=createHandler({url:'https://fixture.supabase.co',key:'SERVICE',store:db});
 assert.equal((await handler(new Request('https://fixture.supabase.co/functions/v1/sales/worker',{method:'POST'}))).status,401);
 assert.equal((await handler(new Request('https://fixture.supabase.co/functions/v1/sales/history'))).status,401);
});
test('free-model allowlist never falls back to a paid Gemini model',async()=>{
 let called=false;const engine=new SalesInferenceEngine({provider:'GEMMA_API',model:'gemini-paid-fixture',apiKey:'FIXTURE',fetcher:async()=>{called=true;}});
 await assert.rejects(engine.generate([]),e=>e.code==='FREE_MODEL_REQUIRED');assert.equal(called,false);
});
test('Gemma uses supported persistent API authentication and includes redacted history',async()=>{
 let captured;const engine=new SalesInferenceEngine({apiKey:'API_KEY_FIXTURE',fetcher:async(url,options)=>{captured={url,options};return Response.json({candidates:[{content:{parts:[{text:'Como esses pedidos perdidos afetam sua equipe?'}]}}]});}});
 const r=await engine.generate([{direction:'IN',body:'Meu email é lead@example.invalid e meu telefone +55 11 99999-9999. Perco pedidos.'},{direction:'OUT',body:'Quantos pedidos chegam?'},{direction:'IN',body:'Cerca de 30 por dia.'}]);
 assert.equal(r.real,true);assert.equal(r.remote,true);assert.equal(captured.options.headers['x-goog-api-key'],'API_KEY_FIXTURE');
 const prompt=JSON.parse(captured.options.body).contents[0].parts[0].text;assert(!prompt.includes('lead@example.invalid'));assert(prompt.includes('30 por dia'));assert(prompt.includes('Quantos pedidos chegam?'));assert(!captured.url.includes('API_KEY_FIXTURE'));
});
test('API quota exhaustion is explicit and never silently invokes a paid fallback',async()=>{
 const engine=new SalesInferenceEngine({apiKey:'FIXTURE',fetcher:async()=>Response.json({error:{message:'DO NOT LOG FIXTURE'}},{status:429})});await assert.rejects(engine.generate([]),e=>e.code==='INFERENCE_FREE_QUOTA_EXHAUSTED'&&!e.message.includes('DO NOT LOG'));
});
test('production rejects local inference host and missing remote authentication',async()=>{
 for(const endpoint of ['http://127.0.0.1:11434','https://localhost','https://host.invalid']){
  const engine=new SalesInferenceEngine({provider:'OLLAMA_SELF_HOST',endpoint,model:'gemma3:1b'});await assert.rejects(engine.generate([]));
 }
});
test('reply guard transfers fabricated financial commitments and secret-like text to review',()=>{
 for(const text of ['Garanto por R$ 500','Entregaremos em dois dias','Bearer SECRET_FIXTURE_LONG'])assert.throws(()=>guardReply(text));
 assert.equal(guardReply('Como sua equipe organiza os pedidos hoje?'),'Como sua equipe organiza os pedidos hoje?');
});
for(const identity of ['5511999999999','US.CONTROLLED123'])test('official send accepts '+identity+' but does not claim delivery',async()=>{
 let sent;const transport=new WhatsAppCloudTransport({token:'META_TOKEN_FIXTURE',phoneId:'123456',fetcher:async(url,options)=>{sent={url,body:JSON.parse(options.body)};return Response.json({messages:[{id:'wamid.FIXTURE'}]});}});
 const result=await transport.send(identity,'Resposta controlada','wamid.INBOUND_FIXTURE');assert.equal(result.accepted,true);assert.equal(result.delivered,false);assert.equal(sent.body.type,'text');assert.equal(sent.body.recipient_type,'individual');
 assert(!('template' in sent.body));assert.equal(sent.body.context.message_id,'wamid.INBOUND_FIXTURE');assert(sent.url.startsWith('https://graph.facebook.com/v27.0/'));
 assert.equal(identity.startsWith('US.')?sent.body.recipient:sent.body.to,identity.startsWith('US.')?identity:'+'+identity);
});
test('network timeout during Meta send is ambiguous and not retriable',async()=>{
 const transport=new WhatsAppCloudTransport({token:'FIXTURE',phoneId:'123456',fetcher:async()=>{throw new Error('timeout');}});
 await assert.rejects(transport.send('5511999999999','Resposta','wamid.IN'),e=>e.code==='META_SEND_AMBIGUOUS'&&!e.retry);
});
function workerFixture(){
 const job={id:'job',conversation_id:'conv',revision:2,phase:'GENERATE',lease:'lease',attempts:1,inbound_id:'wamid.IN'};const writes=[],calls=[];
 const db={rpc:async(name,body)=>{calls.push(name);if(name==='claim')return [structuredClone(job)];if(name==='ready')return [{...job,body:body.reply,phase:'SEND'}];if(name==='dispatch_begin')return [{...job,state:'DISPATCHING'}];if(name==='accept')return true;return {};},
  rows:async(table)=>table==='settings'?[{transport_policy:'META_CLOUD_API',paused:false,phone_number_id:'123456'}]:table==='conversations'?[{id:'conv',contact_id:'contact',revision:2}]:table==='contacts'?[{identity:'5511999999999'}]:[{direction:'IN',body:'Perco pedidos'}],
  patch:async(table,q,body)=>{writes.push({table,body});return [body];},insert:async()=>[],audit:async()=>[]};
 const engine={generate:async()=>({body:'Como sua equipe organiza os pedidos?',provider:'CONTROLLED_FIXTURE',model:'TEST_ONLY',real:true,remote:true})};const transport={send:async()=>({id:'wamid.OUT'})};
 return {job,db,writes,calls,engine,transport};
}
test('pipeline persists reply and dispatch fence before calling Meta',async()=>{
 const f=workerFixture();f.transport.send=async()=>{assert(f.calls.includes('ready'));assert(f.calls.includes('dispatch_begin'));return {id:'wamid.OUT'};};
 const worker=new SalesWorker({store:f.db,secrets:secret,engine:f.engine,transport:f.transport});const result=await worker.tick();assert.equal(result.state,'ACCEPTED');assert.equal(result.delivery_confirmed,false);assert(f.calls.includes('accept'));
});
test('new inbound or human takeover fences stale generation before send',async()=>{
 const f=workerFixture();const original=f.db.rpc;f.db.rpc=async(name,body)=>name==='ready'?[]:original(name,body);f.transport.send=async()=>{throw new Error('MUST NOT SEND');};
 const r=await new SalesWorker({store:f.db,secrets:secret,engine:f.engine,transport:f.transport}).tick();assert.equal(r.state,'CANCELLED');assert(!f.calls.includes('dispatch_begin'));
});
test('a local real model is not accepted as a permanent remote backend',async()=>{
 const f=workerFixture();f.engine.generate=async()=>({body:'Real local test',real:true,remote:false});const r=await new SalesWorker({store:f.db,secrets:secret,engine:f.engine,transport:f.transport}).tick();assert.equal(r.error,'REAL_REMOTE_INFERENCE_REQUIRED');assert(!f.calls.includes('dispatch_begin'));
});
test('ambiguous dispatch is stored for reconciliation and never blindly requeued',async()=>{
 const f=workerFixture();f.transport.send=async()=>{throw new Fault('META_SEND_AMBIGUOUS',503);};const r=await new SalesWorker({store:f.db,secrets:secret,engine:f.engine,transport:f.transport}).tick();assert.equal(r.state,'RECONCILIATION_REQUIRED');assert(f.writes.some(w=>w.body.state==='RECONCILIATION_REQUIRED'));
});
test('expired free-message budget prevents the external send',async()=>{
 const f=workerFixture();const original=f.db.rpc;f.db.rpc=async(name,body)=>{if(name==='dispatch_begin')throw new Fault('FREE_META_BUDGET_REQUIRED',503);return original(name,body);};let sent=false;f.transport.send=async()=>{sent=true;};
 const r=await new SalesWorker({store:f.db,secrets:secret,engine:f.engine,transport:f.transport}).tick();assert.equal(r.error,'FREE_META_BUDGET_REQUIRED');assert.equal(sent,false);
});

test('owner no-API policy stops even correctly signed webhook and verification',async()=>{
 const calls=[];const db={rows:async()=>[{transport_policy:'NO_WHATSAPP_API',paused:true}],rpc:async name=>{calls.push(name);return secret;}};
 const handler=createHandler({url:'https://fixture.supabase.co',key:'SERVICE',store:db});
 const body='{"object":"whatsapp_business_account"}';const sig=await signature(body,secret.sales_meta_app_secret);
 for(const req of [new Request('https://fixture.supabase.co/functions/v1/sales/webhook',{method:'POST',body,headers:{'X-Hub-Signature-256':sig}}),new Request('https://fixture.supabase.co/functions/v1/sales/webhook?hub.mode=subscribe&hub.verify_token=VERIFY_FIXTURE&hub.challenge=1')]){
  const r=await handler(req);assert.equal(r.status,409);assert.equal((await r.json()).error,'OWNER_REQUIRES_NO_WHATSAPP_API');
 }
 assert(!calls.includes('ingest'));
});

test('owner no-API policy stops a worker with the correct cron secret',async()=>{
 let created=false;const db={rows:async()=>[{transport_policy:'NO_WHATSAPP_API',paused:true}],rpc:async()=>secret};
 const handler=createHandler({url:'https://fixture.supabase.co',key:'SERVICE',store:db,workerFactory:()=>{created=true;throw Error('MUST NOT START');}});
 const r=await handler(new Request('https://fixture.supabase.co/functions/v1/sales/worker',{method:'POST',headers:{'x-sales-worker-secret':secret.sales_worker_secret}}));
 assert.equal(r.status,200);assert.equal((await r.json()).state,'DISABLED_BY_OWNER');assert.equal(created,false);
});

test('owner no-API policy prevents direct worker claim, inference and transport',async()=>{
 const f=workerFixture();f.db.rows=async()=>[{transport_policy:'NO_WHATSAPP_API',paused:true}];
 f.engine.generate=async()=>{throw Error('MUST NOT GENERATE');};f.transport.send=async()=>{throw Error('MUST NOT SEND');};
 const r=await new SalesWorker({store:f.db,secrets:secret,engine:f.engine,transport:f.transport}).tick();
 assert.equal(r.state,'DISABLED_BY_OWNER');assert.deepEqual(f.calls,[]);assert.deepEqual(f.writes,[]);
});

test('health clearly reports disabled owner policy without exposing secrets',async()=>{
 const db={rows:async()=>[{transport_policy:'NO_WHATSAPP_API',paused:true}],rpc:async()=>secret};
 const r=await createHandler({url:'https://fixture.supabase.co',key:'SERVICE',store:db})(new Request('https://fixture.supabase.co/functions/v1/sales/health'));
 const body=await r.json();assert.equal(body.state,'DISABLED_BY_OWNER');assert.equal(body.remote_worker_enabled,false);assert.equal(body.SALES_WHATSAPP_OPERATIONAL,false);assert(!JSON.stringify(body).includes('FIXTURE'));
});

test('each generation receives the currently persisted personality and message references',async()=>{
 let prompt;const engine=new SalesInferenceEngine({apiKey:'FIXTURE',fetcher:async(url,options)=>{prompt=JSON.parse(options.body).contents[0].parts[0].text;return Response.json({candidates:[{content:{parts:[{text:'Como posso ajudar sua empresa?'}]}}]});}});
 await engine.generate([{direction:'IN',body:'Olá'}],{behavior:{personality:'Formal e objetivo',opening:'Saudações da Vendrex',permission:'Posso apresentar a proposta?',proposal:'Sistema sob medida',instructions:'Responda em até duas frases'}});
 assert(prompt.includes('Formal e objetivo'));assert(prompt.includes('Saudações da Vendrex'));assert(prompt.includes('Posso apresentar a proposta?'));assert(prompt.includes('Não invente preço'));
 const f=workerFixture();f.db.rows=async table=>table==='settings'?[{paused:false,transport_policy:'META_CLOUD_API',bot_behavior:{personality:'Próxima personalidade'}}]:table==='conversations'?[{id:'conv',contact_id:'contact',revision:2}]:table==='contacts'?[{identity:'5511999999999'}]:[{direction:'IN',body:'Olá'}];
 let observed;f.engine.generate=async(history,options)=>{observed=options.behavior;return {body:'Pergunta contextual',provider:'CONTROLLED_FIXTURE',model:'FIXTURE',real:true,remote:true};};
 await new SalesWorker({store:f.db,secrets:secret,engine:f.engine,transport:f.transport}).tick();assert.equal(observed.personality,'Próxima personalidade');
});

test('QR configuration never enables the Cloud API worker and reports missing permanent host',async()=>{
 const db={rows:async table=>table==='settings'?[{transport_policy:'BAILEYS_QR',qr_instance:'fixture',paused:true}]:[{state:'HOST_REQUIRED',lease_until:null}],rpc:async name=>name==='secrets'?secret:{SALES_WHATSAPP_OPERATIONAL:false}};
 const handler=createHandler({url:'https://fixture.supabase.co',key:'SERVICE',store:db});const body=await (await handler(new Request('https://fixture.supabase.co/functions/v1/sales/health'))).json();
 assert.equal(body.state,'HOST_REQUIRED');assert.equal(body.remote_worker_enabled,false);assert.equal(body.SALES_WHATSAPP_OPERATIONAL,false);
});

test('Sales personality endpoint requires a verified user registered as operator',async()=>{
 let written=false;const userId='11111111-1111-4111-8111-111111111111';
 const db={rpc:async name=>{if(name==='behavior_set')written=true;return secret;},rows:async()=>[]};
 const handler=createHandler({url:'https://fixture.supabase.co',key:'SERVICE',store:db,fetcher:async()=>Response.json({id:userId})});
 const req=()=>new Request('https://fixture.supabase.co/functions/v1/sales/behavior',{method:'POST',headers:{Authorization:'Bearer CONTROLLED_JWT','Content-Type':'application/json'},body:JSON.stringify({behavior:{personality:'Novo estilo'}})});
 assert.equal((await handler(req())).status,403);assert.equal(written,false);
 db.rows=async()=>[{user_id:userId}];assert.equal((await handler(req())).status,200);assert.equal(written,true);
});
