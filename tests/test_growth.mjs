/* Controlled Meta responses only. These tests never constitute a real publication. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {seal,unseal,nextSlot,validateMedia,Meta,Publisher,Fault} from '../supabase/functions/growth/core.mjs';
import {createHandler} from '../supabase/functions/growth/api.mjs';
import {renderIntegrations} from '../cloud/public/integrations.mjs';
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const cid='33333333-3333-4333-8333-333333333333',pid='44444444-4444-4444-8444-444444444444';
const clock=()=>Date.parse('2026-11-11T14:00:00Z');
const secret={growth_encryption_key:'a'.repeat(64),growth_worker_secret:'w'.repeat(64),growth_meta_app_id:'123',growth_meta_app_secret:'fixture-secret',growth_meta_config_id:'456',growth_frontend_origin:'https://vendrex.example',growth_allowed_page_ids:'100'};
class MemoryStore {
 constructor(){this.data={connections:[],tokens:[],posts:[],alerts:[],audit:[],runtime:[],metrics:[],oauth:[]};this.stale=false;this.consumed=false;}
 async rows(table,query=''){
  return structuredClone(this.data[table].filter(row=>query.split('&').every(part=>{const match=part.match(/^(\w+)=eq\.(.*)$/);return !match||String(row[match[1]])===decodeURIComponent(match[2]);})));
 }
 async patch(table,query,body){if(this.stale&&table==='posts')return [];const rows=await this.rows(table,query);for(const row of rows){const dest=this.data[table].find(r=>(r.id||r.connection_id)===(row.id||row.connection_id));Object.assign(dest,body);}return rows.map(r=>({...r,...body}));}
 async insert(table,body){this.data[table].push(structuredClone(body));return [structuredClone(body)];}
 async rpc(name,body){if(name==='secrets')return secret;if(name==='claim')return [];if(name==='confirm'){const row=this.data.posts.find(p=>p.id===body.post&&p.lease===body.lease_id);if(!row)return [];Object.assign(row,{state:'PUBLISHED',permalink:body.link,confirmed_at:new Date(clock()).toISOString()});this.data.connections[0].proven_at=row.confirmed_at;return [structuredClone(row)];}if(name==='consume_oauth'){if(this.consumed)return [];this.consumed=true;return [{owner_id:owner}];}return [];}
 audit(owner_id,action,detail){return this.insert('audit',{owner_id,action,detail});}
 alert(owner_id,dedupe_key,code,detail){return this.insert('alerts',{owner_id,dedupe_key,code,detail});}
}
async function fixture(platform='instagram',kind='IMAGE'){
 const db=new MemoryStore();const c={id:cid,owner_id:owner,external_id:'100',page_id:'100',platform,paused:false,status:'CONNECTED',permissions:[]};
 db.data.connections=[c];db.data.tokens=[{connection_id:cid,ciphertext:await seal({page:'PAGE_FIXTURE',user:'USER_FIXTURE',user_expires_at:clock()/1000+30*86400},secret.growth_encryption_key,owner+':'+cid)}];
 const job={id:pid,owner_id:owner,connection_id:cid,kind,media_url:'https://vendrex.example/asset.jpg',caption:'Controlled fixture',state:'RUNNING',phase:'PREPARE',checkpoint:{},attempts:1,lease:'lease-fixture',lease_until:new Date(clock()+90000).toISOString()};db.data.posts=[structuredClone(job)];
 const calls=[];let responder=()=>({id:'900'});
 const graph={request:async(...args)=>{calls.push(args);return responder(...args);},uploadReel:async(...args)=>{calls.push(['UPLOAD',...args]);return {success:true};},debug:async()=>({data:{is_valid:true}}),pages:async()=>[]};
 const publisher=new Publisher(db,graph,secret,clock);
 return {db,c,job,calls,graph,publisher,reply:fn=>responder=fn,claim:()=>{Object.assign(job,{state:'RUNNING',lease:'lease-fixture',lease_until:new Date(clock()+90000).toISOString(),attempts:job.attempts+1});Object.assign(db.data.posts[0],job);}};
}
test('AES-GCM roundtrip; owner binding, tampering and wrong key fail',async()=>{
 const value=await seal({token:'NEVER_PUBLIC'},secret.growth_encryption_key,owner);
 assert(!value.includes('NEVER_PUBLIC'));assert.deepEqual(await unseal(value,secret.growth_encryption_key,owner),{token:'NEVER_PUBLIC'});
 await assert.rejects(unseal(value,secret.growth_encryption_key,other));await assert.rejects(unseal(value,'b'.repeat(64),owner));
 await assert.rejects(unseal(value.slice(0,-1)+(value.endsWith('0')?'1':'0'),secret.growth_encryption_key,owner));
});
test('Recife slots convert 12h/18h to 15h/21h UTC with rollover',()=>{
 assert.equal(nextSlot(Date.parse('2026-11-11T14:59:59Z')),'2026-11-11T15:00:00.000Z');
 assert.equal(nextSlot(Date.parse('2026-11-11T15:00:00Z')),'2026-11-11T21:00:00.000Z');
 assert.equal(nextSlot(Date.parse('2026-11-11T21:00:00Z')),'2026-11-12T15:00:00.000Z');
 assert.equal(nextSlot(Date.parse('2026-12-31T23:59:59Z'),'12:00'),'2027-01-01T15:00:00.000Z');
 assert.throws(()=>nextSlot(clock(),'20:00'));
});
test('media rejects private origins, credential URLs, unsupported MIME and oversized captions',()=>{
 const valid={media_url:'https://vendrex.example/image.jpg',kind:'IMAGE',mime_type:'image/jpeg',caption:'Teste'};
 assert.equal(validateMedia(valid,['https://vendrex.example']).caption,'Teste');
 for(const media_url of ['http://127.0.0.1/x','https://169.254.169.254/x','https://vendrex.example.evil/x','https://u:p@vendrex.example/x','https://vendrex.example/x#fragment'])assert.throws(()=>validateMedia({...valid,media_url},['https://vendrex.example']));
 for(const change of [{mime_type:'image/png'},{kind:'REEL'},{caption:'x'.repeat(2201)}])assert.throws(()=>validateMedia({...valid,...change},['https://vendrex.example']));
});
test('Instagram container is persisted before publish, confirmation precedes proof',async()=>{
 const f=await fixture();f.reply(path=>path.endsWith('content_publishing_limit')?{data:[{quota_usage:0,config:{quota_total:100}}]}:{id:'container'});
 await f.publisher.run(f.job);assert.equal(f.job.phase,'WAIT_CONTAINER');assert.equal(f.calls.filter(c=>c[0].endsWith('/media_publish')).length,0);
 f.claim();f.reply(path=>path==='container'?{status_code:'FINISHED'}:{id:'published'});
 await f.publisher.run(f.job);assert.equal(f.job.state,'RETRY');assert.equal(f.db.data.connections[0].proven_at,undefined);
 f.claim();f.reply(()=>({id:'published',permalink:'https://www.instagram.com/p/fixture/',timestamp:'2026-11-11'}));
 await f.publisher.run(f.job);assert.equal(f.job.state,'PUBLISHED');assert(f.db.data.connections[0].proven_at);assert.equal(f.calls.filter(c=>c[0].endsWith('/media_publish')).length,1);
});
for(const kind of ['VIDEO','REEL'])test('Instagram '+kind+' uses supported Reels container',async()=>{
 const f=await fixture('instagram',kind);f.reply(path=>path.endsWith('content_publishing_limit')?{data:[]}:{id:'container'});await f.publisher.run(f.job);
 assert.equal(f.calls.at(-1)[2].params.media_type,'REELS');assert.equal(f.calls.at(-1)[2].params.video_url,f.job.media_url);
});
for(const kind of ['IMAGE','VIDEO'])test('Facebook '+kind+' publishes once and waits for platform confirmation',async()=>{
 const f=await fixture('facebook',kind);f.reply(()=>({id:'video-or-photo',post_id:kind==='IMAGE'?'page_post':undefined}));await f.publisher.run(f.job);assert.equal(f.job.phase,'CONFIRM');
 f.claim();f.reply(()=>kind==='IMAGE'?{id:'page_post',is_published:true,permalink_url:'https://www.facebook.com/page_post'}:{id:'video-or-photo',status:{publishing_phase:{status:'complete'}},permalink_url:'https://www.facebook.com/watch/fixture'});
 await f.publisher.run(f.job);assert.equal(f.job.state,'PUBLISHED');assert.equal(f.calls.filter(c=>c[2]?.method==='POST').length,1);
});
test('Facebook Reels start, upload, finish and confirm use same persisted video ID',async()=>{
 const f=await fixture('facebook','REEL');f.reply(()=>({video_id:'900'}));await f.publisher.run(f.job);assert.equal(f.job.phase,'UPLOAD_REEL');
 f.claim();await f.publisher.run(f.job);assert.equal(f.job.phase,'FINISH_REEL');
 f.claim();f.reply(()=>({success:true}));await f.publisher.run(f.job);assert.equal(f.job.remote_id,'900');assert.equal(f.job.phase,'CONFIRM');
 assert.equal(f.calls.find(c=>c[0]==='UPLOAD')[1],'900');assert.equal(f.calls.at(-1)[2].params.video_id,'900');
});
test('timeout after publication cannot cause automatic duplicate',async()=>{
 const f=await fixture('facebook');f.reply(()=>{throw new Fault('META_MUTATION_UNKNOWN',503,true);});await f.publisher.run(f.job);
 assert.equal(f.job.state,'RECONCILIATION_REQUIRED');assert.equal(f.calls.length,1);assert(!f.db.data.connections[0].proven_at);
});
test('quota exhaustion does not create media',async()=>{
 const f=await fixture();f.reply(()=>({data:[{quota_usage:100,config:{quota_total:100}}]}));await f.publisher.run(f.job);
 assert.equal(f.job.state,'RETRY');assert.equal(f.calls.length,1);assert.equal(f.job.error_code,'META_QUOTA');
});
test('already-published container never repeats media_publish',async()=>{
 const f=await fixture();f.job.phase='WAIT_CONTAINER';f.job.checkpoint={container_id:'900'};f.reply(()=>({status_code:'PUBLISHED'}));await f.publisher.run(f.job);
 assert.equal(f.job.state,'RECONCILIATION_REQUIRED');assert.equal(f.calls.length,1);
});
test('stale lease prevents an external publication',async()=>{
 const f=await fixture('facebook');f.db.stale=true;const result=await f.publisher.run(f.job);assert.equal(result.error_code,'LEASE_LOST');assert.equal(f.calls.length,0);
});
test('revoked token suspends connection and produces reauthorization alert',async()=>{
 const f=await fixture();f.reply(()=>{throw new Fault('META_AUTH_REQUIRED',401);});await f.publisher.run(f.job);
 assert.equal(f.job.state,'AUTH_REQUIRED');assert.equal(f.db.data.connections[0].paused,true);assert(f.db.data.alerts.length);
});
test('maintenance derives Page token without claiming perpetual User renewal',async()=>{
 const f=await fixture();f.graph.pages=async()=>[{id:'100',access_token:'DERIVED_PAGE_FIXTURE'}];await f.publisher.maintain(f.c);
 const tokens=await unseal(f.db.data.tokens[0].ciphertext,secret.growth_encryption_key,owner+':'+cid);
 assert.equal(tokens.page,'DERIVED_PAGE_FIXTURE');assert.equal(tokens.user,'USER_FIXTURE');assert.equal(tokens.user_expires_at,clock()/1000+30*86400);
});
test('metrics preserve unavailable values and use User token for IG insights',async()=>{
 const f=await fixture();f.job.remote_id='900';f.reply(()=>({data:[]}));const data=await f.publisher.metrics(f.job,f.c);
 assert.deepEqual(data.available,{});assert.equal(data.unavailable.length,5);assert(f.calls.every(c=>c[1]==='USER_FIXTURE'));
});
test('Meta paging uses a cursor on the fixed Graph host, never an untrusted next URL',async()=>{
 const urls=[];const graph=new Meta('app','secret',async url=>{urls.push(String(url));return Response.json(urls.length===1?{data:[{id:'1'}],paging:{next:'https://evil.invalid/steal',cursors:{after:'cursor'}}}:{data:[{id:'2'}]});});
 assert.equal((await graph.pages('TOKEN_FIXTURE')).length,2);assert(urls.every(u=>u.startsWith('https://graph.facebook.com/v27.0/')));assert(urls[1].includes('after=cursor'));assert(!urls.some(u=>u.includes('TOKEN_FIXTURE')));
});
test('Meta transport redacts provider messages and secrets',async()=>{
 const graph=new Meta('app','secret',async()=>Response.json({error:{code:190,message:'TOKEN_FIXTURE secret'}},{status:400}));
 await assert.rejects(graph.request('me','TOKEN_FIXTURE'),e=>e.code==='META_AUTH_REQUIRED'&&!e.message.includes('TOKEN_FIXTURE'));
});
function handlerFixture(){const db=new MemoryStore();const handler=createHandler({url:'https://fixture.supabase.co',key:'SERVICE_FIXTURE',store:db,clock,fetcher:async()=>Response.json({id:owner})});return {db,handler,req:(action,body,extra={})=>new Request('https://fixture.supabase.co/functions/v1/growth/'+action,{method:body?'POST':'GET',headers:{Authorization:'Bearer USER_JWT',...extra},body:body?JSON.stringify(body):undefined})};}
test('worker rejects an anonymous caller and a Supabase user JWT',async()=>{
 const f=handlerFixture();assert.equal((await f.handler(f.req('worker',{}))).status,401);assert.equal((await f.handler(f.req('worker',{}, {'x-growth-worker-secret':secret.growth_worker_secret}))).status,200);
});
test('foreign origin and unsupported method fail closed',async()=>{
 const f=handlerFixture();assert.equal((await f.handler(f.req('status',null,{Origin:'https://evil.invalid'}))).status,403);assert.equal((await f.handler(f.req('disconnect'))).status,405);
});
test('OAuth start sets secure cookie, stores only hashes, binds owner and uses business config',async()=>{
 const f=handlerFixture();const r=await f.handler(f.req('start',{}));const data=await r.json();const u=new URL(data.authorization_url);
 assert.equal(u.hostname,'www.facebook.com');assert.equal(u.searchParams.get('config_id'),'456');assert.equal(f.db.data.oauth[0].owner_id,owner);
 assert.notEqual(f.db.data.oauth[0].state_hash,u.searchParams.get('state'));assert.match(r.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);
});
test('OAuth callback rejects missing browser binding before token exchange',async()=>{
 const f=handlerFixture();const r=await f.handler(f.req('callback?state='+'a'.repeat(64)));assert.equal(r.status,403);
});
test('owner cannot activate without real platform proof',async()=>{
 const f=handlerFixture();f.db.data.connections=[{id:cid,owner_id:owner,paused:true,status:'CONNECTED'}];const r=await f.handler(f.req('control',{connection_id:cid,paused:false}));assert.equal(r.status,409);assert.equal(f.db.data.connections[0].paused,true);
});
test('owner cannot operate another tenant connection',async()=>{
 const f=handlerFixture();f.db.data.connections=[{id:cid,owner_id:other,paused:true,status:'CONNECTED'}];assert.equal((await f.handler(f.req('control',{connection_id:cid,paused:false}))).status,404);
});
test('runtime never announces operational without active, proven connection',async()=>{
 const f=handlerFixture();f.db.data.runtime=[{id:true,last_tick:new Date(clock()).toISOString()}];const data=await (await f.handler(f.req('status'))).json();assert.equal(data.operational,false);assert.equal(data.state,'AUTH_REQUIRED');
});
test('dashboard escapes untrusted account names and captions, retains real-test gate',()=>{
 const attack='<img src=x onerror=alert(1)>';const html=renderIntegrations({state:'TESTING',connections:[{id:cid,platform:'instagram',name:attack,paused:true,status:'CONNECTED',permissions:[]}],posts:[],metrics:[]});
 assert(!html.includes(attack));assert(html.includes('&lt;img'));assert(html.includes('disabled'));assert(html.includes('America/Recife'));assert(!html.includes('type="password"'));
});
function callbackFixture(permissions=['pages_show_list','pages_read_engagement','pages_manage_posts','instagram_basic','instagram_content_publish']){
 const db=new MemoryStore(),exchanges=[];
 const meta={exchange:async(code,redirect)=>{exchanges.push({code,redirect});return {access_token:'LONG_USER_FIXTURE',expires_in:5184000};},request:async()=>({data:permissions.map(permission=>({permission,status:'granted'}))}),pages:async()=>[
  {id:'100',name:'Vendrex',access_token:'PAGE_FIXTURE',tasks:['CREATE_CONTENT'],instagram_business_account:{id:'200',username:'vendrex_fixture'}},
  {id:'999',name:'Unrelated account',access_token:'NEVER_USE_FIXTURE',tasks:['CREATE_CONTENT']}]};
 const handler=createHandler({url:'https://fixture.supabase.co',key:'SERVICE_FIXTURE',store:db,meta,clock});
 const request=()=>new Request('https://fixture.supabase.co/functions/v1/growth/callback?state='+'a'.repeat(64)+'&code=CODE_FIXTURE',{headers:{Cookie:'__Host-vendrex_growth='+'b'.repeat(64)}});
 return {db,handler,request,exchanges};
}
test('complete OAuth callback connects only allowed Pages and linked professional IG, encrypted and paused',async()=>{
 const f=callbackFixture();const r=await f.handler(f.request());assert.equal(r.status,303);assert.equal(f.db.data.connections.length,2);assert.equal(f.db.data.tokens.length,2);
 assert(f.db.data.connections.every(c=>c.page_id==='100'&&c.paused&&!c.proven_at));
 const c=f.db.data.connections[0],tokens=await unseal(f.db.data.tokens[0].ciphertext,secret.growth_encryption_key,owner+':'+c.id);
 assert.equal(tokens.user,'LONG_USER_FIXTURE');assert(!JSON.stringify([...r.headers]).includes('LONG_USER_FIXTURE'));assert.equal(f.exchanges[0].redirect,'https://vendrex.example/api/meta/callback');
});
test('OAuth callback replay never exchanges code twice',async()=>{
 const f=callbackFixture();assert.equal((await f.handler(f.request())).status,303);assert.equal((await f.handler(f.request())).status,403);assert.equal(f.exchanges.length,1);
});
test('declined publishing scopes cannot create a connected account',async()=>{
 const f=callbackFixture(['pages_show_list']);assert.equal((await f.handler(f.request())).status,409);assert.equal(f.db.data.connections.length,0);assert.equal(f.db.data.tokens.length,0);
});
