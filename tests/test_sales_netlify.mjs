// Controlled HTTP fixtures validate security. No WhatsApp messages are sent here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createOperatorHandler} from '../netlify-site/lib/operator.mjs';
import {createHandler} from '../supabase/functions/sales/api.mjs';
import {renderPairing} from '../netlify-site/public/pairing.mjs';
import {renderConversations,renderHistory} from '../netlify-site/public/inbox.mjs';
const owner='OWNER_FIXTURE',shared='a'.repeat(64),origin='https://private.example.invalid';
const values={NETLIFY_OWNER_ID:owner,SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_'+'x'.repeat(24),SALES_DASHBOARD_SECRET:shared};
const context={user:{id:owner,email:'owner@example.invalid',expiresAt:new Date('2100-01-01')}};
function fixture(overrides={}){
 const calls=[];const handler=createOperatorHandler({env:n=>values[n],fetcher:async(url,options)=>{calls.push({url,options});return Response.json({saved:true});},...overrides});
 return {calls,handler};
}
const request=(path,body,headers={})=>new Request(origin+'/api/'+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});
test('Netlify identity is mandatory; forged identity and bearer headers are ignored',async()=>{
 const {handler,calls}=fixture();const r=await handler(request('sales/status',null,{'x-sales-operator-id':owner,Authorization:'Bearer FAKE'}),{});assert.equal(r.status,401);assert.equal(calls.length,0);
});
test('another Netlify user and expired owner session are rejected',async()=>{
 const {handler,calls}=fixture();for(const user of [{...context.user,id:'OTHER'}, {...context.user,expiresAt:new Date('2000-01-01')}, {...context.user,expiresAt:undefined}])assert.equal((await handler(request('sales/status'),{user})).status,401);assert.equal(calls.length,0);
});
test('owner identity endpoint never exposes configuration secrets',async()=>{
 const {handler}=fixture();const r=await handler(request('config'),context);assert.equal(r.status,200);const text=await r.text();assert(text.includes('owner@example.invalid'));assert(!text.includes(shared));assert(!text.includes('sb_publishable_'));
});
test('worker, webhook, arbitrary routes and wrong methods cannot be proxied',async()=>{
 const {handler,calls}=fixture();for(const path of ['sales/worker','sales/webhook','sales/secrets','sales/status/extra','meta/start'])assert.equal((await handler(request(path),context)).status,404);
 assert.equal((await handler(request('sales/status',{}),context)).status,405);assert.equal(calls.length,0);
});
test('cross-origin and originless mutations fail before contacting Supabase',async()=>{
 const {handler,calls}=fixture();assert.equal((await handler(request('sales/behavior',{behavior:{}},{Origin:'https://attacker.invalid'}),context)).status,403);
 assert.equal((await handler(new Request(origin+'/api/sales/control',{method:'POST',body:'{}'}),context)).status,403);assert.equal(calls.length,0);
});
test('owner behavior changes forward only scoped server credentials and allowed fields',async()=>{
 const {handler,calls}=fixture();const r=await handler(request('sales/behavior',{behavior:{personality:'Objetivo'},worker_secret:'NEVER_FORWARD'},{Authorization:'Bearer NEVER_FORWARD','x-sales-operator-id':'ATTACKER'}),context);
 assert.equal(r.status,200);const {url,options}=calls[0];assert.equal(url,'https://fixture.supabase.co/functions/v1/sales/behavior');assert.equal(options.headers['x-sales-dashboard-secret'],shared);assert.equal(options.headers['x-sales-operator-id'],owner);assert(!('Authorization' in options.headers));assert.deepEqual(JSON.parse(options.body),{behavior:{personality:'Objetivo'}});assert(!JSON.stringify(options).includes('NEVER_FORWARD'));
});
test('oversized bodies, invalid JSON and privileged keys fail closed',async()=>{
 const {handler,calls}=fixture();assert.equal((await handler(request('sales/behavior',{behavior:'x'.repeat(18000)}),context)).status,413);
 assert.equal((await handler(new Request(origin+'/api/sales/behavior',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{bad'}),context)).status,400);
 const broken=fixture({env:n=>n==='SUPABASE_PUBLISHABLE_KEY'?'sb_secret_FIXTURE':values[n]});assert.equal((await broken.handler(request('sales/status'),context)).status,503);assert.equal(calls.length,0);assert.equal(broken.calls.length,0);
});
test('history validates the conversation id and forwards no arbitrary query parameters',async()=>{
 const {handler,calls}=fixture();assert.equal((await handler(request('sales/history?conversation_id=bad'),context)).status,400);
 const id='00000000-0000-4000-8000-000000000001';assert.equal((await handler(request('sales/history?conversation_id='+id+'&select=secrets'),context)).status,200);assert.equal(new URL(calls[0].url).search,'?conversation_id='+id);
});
test('upstream failures hide tokens and internal error text',async()=>{
 const {handler}=fixture({fetcher:async()=>Response.json({error:'internal '+shared},{status:500,headers:{'Set-Cookie':'fixture=secret'}})});const r=await handler(request('sales/status'),context);assert.equal(r.status,500);assert.deepEqual(await r.json(),{error:'SALES_UNAVAILABLE'});assert.equal(r.headers.get('Set-Cookie'),null);
});

test('Work connection exposes only public configuration to the verified owner',async()=>{
 const {handler,calls}=fixture();const response=await handler(request('sales/work-config'),context);
 const data=await response.json();assert.equal(response.status,200);assert.equal(data.email,context.user.email);assert.equal(data.publishable_key,values.SUPABASE_PUBLISHABLE_KEY);assert.equal(calls.length,0);assert(!JSON.stringify(data).includes(shared));
});

test('Work enrollment takes owner email from platform identity and never trusts a submitted email',async()=>{
 const {handler,calls}=fixture();const token='VERIFIED_TOKEN_FIXTURE_'+'x'.repeat(30);
 const response=await handler(request('sales/work-enroll',{access_token:token,owner_email:'attacker@example.invalid'}),context);
 assert.equal(response.status,200);assert.deepEqual(JSON.parse(calls[0].options.body),{access_token:token,owner_email:context.user.email});assert(!JSON.stringify(await response.json()).includes(token));
});

test('manager orders accept only a bounded owner instruction and do not forward agent or deployment permissions',async()=>{
 const {handler,calls}=fixture();
 assert.equal((await handler(request('sales/work-order',{instruction:'short'}),context)).status,422);
 const response=await handler(request('sales/work-order',{instruction:'Revise as legendas e informe evidências.',agent:'growth',publish:true}),context);
 assert.equal(response.status,200);assert.deepEqual(JSON.parse(calls[0].options.body),{instruction:'Revise as legendas e informe evidências.'});
});

test('Edge enrollment requires both the Netlify owner and a verified Supabase account with matching email',async()=>{
 const writes=[];let email='attacker@example.invalid';const user_id='00000000-0000-4000-8000-000000000099';
 const db={rpc:async()=>({sales_dashboard_secret:shared,sales_netlify_owner_id:owner}),rows:async()=>[],insert:async(table,body)=>writes.push({table,body}),audit:async()=>{}};
 const handler=createHandler({url:'https://fixture.supabase.co',key:'BACKEND_FIXTURE',store:db,fetcher:async()=>Response.json({id:user_id,email,email_confirmed_at:'2026-11-13T00:00:00Z'})});
 const req=()=>new Request('https://fixture.supabase.co/functions/v1/sales/work-enroll',{method:'POST',headers:{'Content-Type':'application/json','x-sales-dashboard-secret':shared,'x-sales-operator-id':owner},body:JSON.stringify({access_token:'x'.repeat(50),owner_email:context.user.email})});
 assert.equal((await handler(req())).status,403);assert.equal(writes.length,0);
 email=context.user.email;assert.equal((await handler(req())).status,200);assert.deepEqual(writes,[{table:'operators',body:{user_id}}]);
});
function edgeFixture(){
 const calls=[];const handler=createHandler({url:'https://fixture.supabase.co',key:'SERVICE_FIXTURE',store:{rpc:async(name)=>{calls.push(name);return name==='secrets'?{sales_dashboard_secret:shared,sales_netlify_owner_id:owner}:{};},rows:async()=>[{bot_behavior:{personality:'Objetivo'},behavior_revision:1}]},fetcher:async()=>{throw Error('NO_FAKE_SUPABASE_LOGIN');}});return {handler,calls};
}
test('Edge bridge authenticates both secret and owner without fabricating a Supabase JWT',async()=>{
 const {handler}=edgeFixture();const valid=new Request('https://fixture.supabase.co/functions/v1/sales/behavior',{headers:{'x-sales-dashboard-secret':shared,'x-sales-operator-id':owner}});assert.equal((await handler(valid)).status,200);
 for(const headers of [{'x-sales-dashboard-secret':shared,'x-sales-operator-id':'OTHER'},{'x-sales-dashboard-secret':'WRONG','x-sales-operator-id':owner},{'x-sales-operator-id':owner}])assert.equal((await handler(new Request(valid.url,{headers}))).status,401);
});
test('Edge bridge secret grants no worker access',async()=>{
 const {handler,calls}=edgeFixture();const r=await handler(new Request('https://fixture.supabase.co/functions/v1/sales/worker',{method:'POST',headers:{'x-sales-dashboard-secret':shared,'x-sales-operator-id':owner}}));assert.equal(r.status,401);assert(!calls.includes('claim'));
});
test('private pairing proxy is read-only and never invents a QR for an absent server',async()=>{
 const {handler,calls}=fixture();assert.equal((await handler(request('sales/pairing'),context)).status,200);assert(calls[0].url.endsWith('/sales/pairing'));
 assert.equal((await handler(request('sales/pairing',{}),context)).status,405);
 const absent=renderPairing({state:'HOST_REQUIRED'});assert(!absent.includes('<img'));assert(absent.includes('não há QR disponível'));
});
test('private inbox proxy exposes only owner-scoped read actions',async()=>{
 const {handler,calls}=fixture();assert.equal((await handler(request('sales/conversations'),context)).status,200);
 assert(calls[0].url.endsWith('/sales/conversations'));
 assert.equal((await handler(request('sales/conversations',{}),context)).status,405);
 assert.equal((await handler(request('sales/conversations'),{})).status,401);
});
test('Groq key endpoint is owner-only and forwards only the credential to Supabase',async()=>{
 const key='gsk_'+'A'.repeat(40),{handler,calls}=fixture();
 assert.equal((await handler(request('sales/inference-key',{api_key:key,extra:'NEVER_FORWARD'}),{})).status,401);
 assert.equal((await handler(request('sales/inference-key',{api_key:'invalid'}),context)).status,422);
 const response=await handler(request('sales/inference-key',{api_key:key,extra:'NEVER_FORWARD'}),context);
 assert.equal(response.status,200);assert.deepEqual(JSON.parse(calls[0].options.body),{api_key:key});
 assert(!JSON.stringify(calls[0]).includes('NEVER_FORWARD'));
 assert(!JSON.stringify(await response.json()).includes(key));
});
test('Edge rejects an invalid Groq key before writing to Vault',async()=>{
 const {handler,calls}=edgeFixture();
 const req=new Request('https://fixture.supabase.co/functions/v1/sales/inference-key',{method:'POST',headers:{'x-sales-dashboard-secret':shared,'x-sales-operator-id':owner,'Content-Type':'application/json'},body:JSON.stringify({api_key:'bad'})});
 assert.equal((await handler(req)).status,422);assert(!calls.includes('groq_key_set'));
});
test('inbox lists real rows and escapes contact and message content',async()=>{
 const id='00000000-0000-4000-8000-000000000001';
 const row={id,status:'PENDING',last_inbound_at:'2026-11-12T12:00:00Z',contact:{identity:'5581999999999',display_name:'<img src=x onerror=alert(1)>',human_takeover:false}};
 const list=renderConversations({conversations:[row]},id),history=renderHistory([{direction:'IN',body:'<script>alert(1)</script>',platform_at:'2026-11-12T12:00:00Z',delivery_state:null}],row);
 assert(list.includes('data-conversation="'+id+'"'));assert(!list.includes('<img src=x'));
 assert(history.includes('&lt;script&gt;'));assert(!history.includes('<script>'));
 assert(renderConversations({conversations:[]}).includes('Nenhuma conversa real'));
});
test('pairing renderer removes expired images and rejects injected or non-PNG URLs',()=>{
 const live={state:'QR_READY',qr_data_url:'data:image/png;base64,iVBORw0KGgoCONTROLLED=',expires_at:new Date(Date.now()+10000).toISOString()};
 assert(renderPairing(live).includes('<img'));assert(!renderPairing(live,Date.now()+20000).includes('<img'));
 for(const qr_data_url of ['javascript:alert(1)','https://attacker.invalid/qr.png','data:image/svg+xml,<svg onload=alert(1)>'])assert(!renderPairing({...live,qr_data_url}).includes('<img'));
});
