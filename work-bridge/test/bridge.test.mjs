import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {callbackURL,signingKey,signedHeaders,WorkBridge,EVENT} from '../core.mjs';
import {handleMCP} from '../protocol.mjs';

const owner={id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-11-13T00:00:00Z'};
const job='22222222-2222-4222-8222-222222222222';
const secret='whsec_'+Buffer.alloc(32,7).toString('base64');
const callback='https://chatgpt.com/mcp-events/test';
const params={name:EVENT,arguments:{agent:'sales'},delivery:{mode:'webhook',url:callback,secret}};
const bridge=options=>new WorkBridge({url:'https://example.supabase.co',publishableKey:'public',db:{call:async()=>[],rpc:async()=>null},...options});

test('callbacks reject credentials, local hosts, lookalikes and URL fragments before network access',()=>{
 for(const url of ['http://chatgpt.com/x','https://127.0.0.1/x','https://chatgpt.com.evil.test/x','https://evil@chatgpt.com/x','https://chatgpt.com/x#secret','https://chatgpt.com:8443/x'])assert.throws(()=>callbackURL(url),/WORK_CALLBACK_REJECTED/);
 assert.equal(callbackURL(callback),callback);
});
test('only canonical strong webhook keys are accepted',()=>{
 assert.equal(signingKey(secret).length,32);
 for(const value of ['bad', 'whsec_Zg==','whsec_'+Buffer.alloc(65).toString('base64')])assert.throws(()=>signingKey(value));
});
test('Standard Webhooks signature covers exact body bytes, ID and signing time',()=>{
 const body='{"message":"ação"}',headers=signedHeaders({id:'evt1',subscription:'sub1',secret,body,now:1700000000000});
 const expected=createHmac('sha256',Buffer.alloc(32,7)).update('evt1.1700000000.'+body).digest('base64');
 assert.equal(headers['webhook-signature'],'v1,'+expected);
 assert.equal(headers['X-MCP-Subscription-Id'],'sub1');
});
test('authentication does not trust an unsigned user header or an unconfirmed/unregistered user',async()=>{
 let calls=0;const b=bridge({fetcher:async()=>{calls++;return Response.json(owner);}});
 await assert.rejects(b.operator(new Request('https://test',{headers:{'x-user-id':owner.id}})),/WORK_LOGIN_REQUIRED/);assert.equal(calls,0);
 await assert.rejects(b.operator(new Request('https://test',{headers:{Authorization:'Bearer '+'a'.repeat(50)}})),/OPERATOR_REQUIRED/);
 const noConfirmation=bridge({fetcher:async()=>Response.json({id:owner.id}),db:{call:async()=>[owner]}});
 await assert.rejects(noConfirmation.operator(new Request('https://test',{headers:{Authorization:'Bearer '+'a'.repeat(50)}})),/WORK_LOGIN_REQUIRED/);
});
test('successful user validation still requires a server-side operator record',async()=>{
 const b=bridge({fetcher:async()=>Response.json(owner),db:{call:async path=>{assert.match(path,/vendrex_sales_operators\?user_id=eq\./);return [owner];}}});
 assert.equal((await b.operator(new Request('https://test',{headers:{Authorization:'Bearer '+'a'.repeat(50)}}))).id,owner.id);
});
test('subscription is not stored until a signed callback echoes the challenge',async()=>{
 const calls=[];
 const b=bridge({db:{rpc:async(name,payload)=>{calls.push(name);return name==='subscription_id'?'sub1':'sub1';}},fetcher:async(url,request)=>{
  assert.equal(url,callback);assert.equal(request.redirect,'error');assert.match(request.headers['webhook-signature'],/^v1,/);
  return Response.json({challenge:JSON.parse(request.body).challenge});
 }});
 const result=await b.subscribe(owner,params);assert.deepEqual(calls,['subscription_id','subscribe']);assert.equal(result.id,'sub1');assert.equal(result.cursor,null);
 const rejected=bridge({db:{rpc:async name=>{assert.notEqual(name,'subscribe');return 'sub1';}},fetcher:async()=>Response.json({challenge:'wrong'})});
 await assert.rejects(rejected.subscribe(owner,params),/WORK_CALLBACK_VERIFICATION_FAILED/);
});
test('untrusted subscription destinations fail without a callback or secret write',async()=>{
 const b=bridge({fetcher:()=>assert.fail('network'),db:{rpc:()=>assert.fail('database')}});
 await assert.rejects(b.subscribe(owner,{...params,delivery:{...params.delivery,url:'https://evil.test'}}),/WORK_CALLBACK_REJECTED/);
});
test('dispatch authenticates secret, preserves event identity and records transient retries',async()=>{
 const updates=[];const d={id:job,lease:owner.id,attempts:1,subscription_id:'sub1',callback_url:callback,signing_secret:secret,job_id:job,agent:'sales',created_at:'2026-11-13T00:00:00Z'};
 const b=bridge({now:()=>0,db:{rpc:async name=>name==='secret'?'a'.repeat(64):d,call:async(path,request)=>updates.push(request.body)},fetcher:async(url,request)=>{
  const event=JSON.parse(request.body);assert.equal(event.eventId,job);assert.deepEqual(event.data,{job_id:job,agent:'sales'});assert.equal(event.data.body,undefined);return new Response(null,{status:429});
 }});
 await assert.rejects(b.dispatch(new Request('https://test',{headers:{'x-work-dispatch-secret':'é'.repeat(64)}})),/UNAUTHORIZED/);
 assert.deepEqual(await b.dispatch(new Request('https://test',{headers:{'x-work-dispatch-secret':'a'.repeat(64)}})),{processed:1,customer_sent:false});
 assert.equal(updates[0].state,'PENDING');assert.equal(updates[0].next_attempt_at,'1970-01-01T00:00:10.000Z');
});
test('expired callbacks are terminal and are never mistaken for a completed agent run',async()=>{
 let saved;const b=bridge({db:{rpc:async name=>name==='secret'?'a'.repeat(64):{id:job,lease:owner.id,attempts:1,subscription_id:'sub1',callback_url:callback,signing_secret:secret,job_id:job,agent:'sales',created_at:'2026-11-13T00:00:00Z'},call:async(path,request)=>{saved=request.body;}},fetcher:async()=>new Response(null,{status:410})});
 await b.dispatch(new Request('https://test',{headers:{'x-work-dispatch-secret':'a'.repeat(64)}}));assert.equal(saved.state,'FAILED');
});
test('draft validation rejects instructions, commercial promises, arbitrary result fields and multiple questions',async()=>{
 const b=bridge({db:{call:async()=>[{agent:'sales',conversation_id:job}],rpc:()=>assert.fail('invalid reply reached storage')}});
 for(const reply of ['R$ 100 garantido','Olá? Tudo bem?','Bearer abcdefghijklmnopqrst'])await assert.rejects(b.complete(owner,{job_id:job,result:{reply}}));
 await assert.rejects(b.complete(owner,{job_id:job,result:{reply:'Como posso ajudar?',to:'another customer'}}),/WORK_INVALID_RESULT/);
});
test('MCP advertises event subscriptions and scoped tools using official transport',async()=>{
 const b=bridge();const req=body=>new Request(b.resource(),{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-03-26'},body:JSON.stringify(body)});
 let response=await handleMCP(req({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}}}),b,owner);
 assert.equal(response.status,200);let data=await response.json();assert.deepEqual(data.result.capabilities.events,{});
 response=await handleMCP(req({jsonrpc:'2.0',id:2,method:'tools/list',params:{}}),b,owner);data=await response.json();assert.ok(data.result.tools.some(t=>t.name==='save_sales_reply'));assert.ok(data.result.tools.every(t=>t.securitySchemes[0].type==='oauth2'));assert.ok(data.result.tools.every(t=>t.securitySchemes[0].scopes.includes('offline_access')&&t._meta.securitySchemes[0].scopes.includes('offline_access')));
 response=await handleMCP(req({jsonrpc:'2.0',id:3,method:'events/list',params:{}}),b,owner);data=await response.json();assert.equal(data.result.events[0].name,EVENT);
});

test('completed results can be read through MCP without reopening context or exposing internal fields',async()=>{
 const paths=[];const result={summary:'An internal task was completed.',evidence:['Fixture only.']};
 const b=bridge({db:{call:async path=>{paths.push(path);return [{id:job,agent:'builder',state:'COMPLETE',created_at:'2026-11-13',completed_at:'2026-11-14',result,payload:{private:'DO_NOT_EXPOSE'},conversation_id:'DO_NOT_EXPOSE'}];},rpc:()=>assert.fail('result lookup must not reopen context or write')}});
 const response=await handleMCP(new Request(b.resource(),{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'get_agent_result',arguments:{job_id:job}}})}),b,owner);
 assert.equal(response.status,200);const data=await response.json();assert.equal(data.result.isError,undefined);
 assert.deepEqual(data.result.structuredContent,{job:{id:job,agent:'builder',state:'COMPLETE',created_at:'2026-11-13',completed_at:'2026-11-14'},result});
 assert(!JSON.stringify(data).includes('DO_NOT_EXPOSE'));assert.equal(paths.length,1);assert(!paths[0].includes('payload'));
});

test('result lookup rejects unknown or malformed IDs and does not invent a pending result',async()=>{
 let calls=0;const b=bridge({db:{call:async()=>{calls++;return [];}}});
 for(const id of [null,undefined,'x'.repeat(36),job+'&select=payload'])await assert.rejects(b.result(id),/WORK_JOB_NOT_FOUND/);
 assert.equal(calls,0);await assert.rejects(b.result(job),/WORK_JOB_NOT_FOUND/);assert.equal(calls,1);
 const pending=bridge({db:{call:async()=>[{id:job,agent:'director',state:'PENDING',created_at:'2026-11-13',completed_at:null,result:null}]}});
 assert.equal((await pending.result(job)).result,null);assert.equal((await pending.result(job)).job.state,'PENDING');
});
