import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../cloud/api/meta/[action].js';
const original={url:process.env.SUPABASE_URL,origin:process.env.PUBLIC_BASE_URL,key:process.env.SUPABASE_PUBLISHABLE_KEY,fetch:globalThis.fetch};
function call(req){const value={headers:{}};const res={setHeader:(k,v)=>value.headers[k]=v,status:code=>{value.status=code;return res;},json:body=>{value.body=body;return value;},end:()=>value};return handler({method:'GET',headers:{},query:{},...req},res).then(()=>value);}
test('Vercel proxy forwards callback with cookie, never exposes token data',async()=>{
 process.env.SUPABASE_URL='https://fixture.supabase.co';process.env.PUBLIC_BASE_URL='https://vendrex.example';process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_fixture';
 let forwarded;globalThis.fetch=async(url,options)=>{forwarded={url:String(url),options};return new Response(null,{status:303,headers:{Location:'https://vendrex.example/#integrations?meta=connected','Set-Cookie':'__Host-vendrex_growth=; Max-Age=0'}});};
 const result=await call({query:{action:'callback',code:'CODE_FIXTURE',state:'STATE_FIXTURE'},headers:{cookie:'unrelated=private; __Host-vendrex_growth=BROWSER_FIXTURE'}});
 assert.equal(result.status,303);assert.equal(forwarded.options.headers.Cookie,' __Host-vendrex_growth=BROWSER_FIXTURE');assert(!JSON.stringify(result).includes('CODE_FIXTURE'));assert(result.headers['Set-Cookie']);
});
test('Vercel proxy rejects worker passthrough and foreign origins',async()=>{
 const r=await call({query:{action:'worker'}});assert.equal(r.status,404);
 const blocked=await call({query:{action:'status'},headers:{origin:'https://evil.invalid'}});assert.equal(blocked.status,403);
});
test('Vercel proxy fails closed without a configured backend',async()=>{
 delete process.env.SUPABASE_URL;const r=await call({query:{action:'status'}});assert.equal(r.status,503);
});
test.after(()=>{for(const [name,value] of [['SUPABASE_URL',original.url],['PUBLIC_BASE_URL',original.origin],['SUPABASE_PUBLISHABLE_KEY',original.key]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}globalThis.fetch=original.fetch;});
