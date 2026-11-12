// Controlled HTTP fixtures validate security. No WhatsApp messages are sent here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createOperatorHandler} from '../netlify-site/lib/operator.mjs';
import {createHandler} from '../supabase/functions/sales/api.mjs';
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
