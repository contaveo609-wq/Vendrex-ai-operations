import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../cloud/api/sales/[action].js';
import {renderSales} from '../cloud/public/sales.mjs';
const before={url:process.env.SUPABASE_URL,origin:process.env.PUBLIC_BASE_URL,key:process.env.SUPABASE_PUBLISHABLE_KEY,fetch:globalThis.fetch};
function request(req){const result={headers:{}};const res={setHeader:(k,v)=>result.headers[k]=v,status:c=>{result.status=c;return res;},json:b=>{result.body=b;return result;}};return handler({method:'GET',headers:{},query:{},...req},res).then(()=>result);}
test('Sales proxy rejects internal routes, missing JWT, foreign origins and unexpected methods',async()=>{
 process.env.SUPABASE_URL='https://fixture.supabase.co';process.env.PUBLIC_BASE_URL='https://vendrex.example';process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_fixture';
 for(const action of ['worker','webhook','secrets','qr_auth_get'])assert.equal((await request({query:{action}})).status,404);
 assert.equal((await request({query:{action:'behavior'}})).status,401);
 assert.equal((await request({query:{action:'behavior'},headers:{origin:'https://evil.invalid'}})).status,403);
 assert.equal((await request({query:{action:'control'}})).status,405);
});
test('Sales proxy forwards only the operator token and approved configuration request',async()=>{
 let captured;globalThis.fetch=async(url,options)=>{captured={url,options};return Response.json({saved:true});};
 const r=await request({method:'POST',query:{action:'behavior'},headers:{authorization:'Bearer OPERATOR_FIXTURE'},body:{behavior:{personality:'Consultivo'}}});
 assert.equal(r.status,200);assert.equal(captured.url,'https://fixture.supabase.co/functions/v1/sales/behavior');assert.equal(captured.options.headers.Authorization,'Bearer OPERATOR_FIXTURE');assert.equal(JSON.parse(captured.options.body).behavior.personality,'Consultivo');assert(!('Cookie' in captured.options.headers));
});
test('Sales cloud editor escapes content and blocks live activation without real proof',()=>{
 const html=renderSales({state:'HOST_REQUIRED',paused:true,SALES_WHATSAPP_OPERATIONAL:false,inference_daily_limit:500},{behavior:{personality:'</textarea><img src=x onerror=alert(1)>'},behavior_revision:2});
 assert(!html.includes('<img src=x'));assert(html.includes('&lt;/textarea&gt;'));assert(html.includes('data-sales-control="activate_live" disabled'));assert(html.includes('sales-behavior-form'));assert(html.includes('500'));
});
test.after(()=>{for(const [key,value] of [['SUPABASE_URL',before.url],['PUBLIC_BASE_URL',before.origin],['SUPABASE_PUBLISHABLE_KEY',before.key]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}globalThis.fetch=before.fetch;});
