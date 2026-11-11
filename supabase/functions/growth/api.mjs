import {Store,Meta,Publisher,Fault,hash,nonce,seal,nextSlot,validateMedia,iso} from './core.mjs';
const response=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const uuid=value=>/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value||'');
const scopes=['pages_show_list','pages_read_engagement','pages_manage_posts','publish_video','read_insights','instagram_basic','instagram_content_publish','instagram_manage_insights'];
const context=c=>c.owner_id+':'+c.id;
const cookie=(value,maxAge=600)=>`__Host-vendrex_growth=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
const equal=(a,b)=>{if(!a||!b||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;};
export function createHandler({url,key,fetcher=fetch,store,meta,clock=()=>Date.now()}){
 const db=store||new Store(url,key,fetcher);
 return async request=>{
  try{
   const action=new URL(request.url).pathname.split('/').filter(Boolean).at(-1);
   const secrets=await db.rpc('secrets');
   const origin=secrets.growth_frontend_origin;
   if(request.headers.has('Origin')&&request.headers.get('Origin')!==origin)throw new Fault('ORIGIN_DENIED',403);
   if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin||'null','Access-Control-Allow-Headers':'authorization,content-type,apikey','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin'}});
   const methods={health:'GET',status:'GET',start:'POST',callback:'GET',enqueue:'POST',control:'POST',disconnect:'POST',metrics:'POST',worker:'POST'};
   if(!methods[action])throw new Fault('NOT_FOUND',404);
   if(request.method!==methods[action])throw new Fault('METHOD_NOT_ALLOWED',405);
   const configured=Boolean(secrets.growth_meta_app_id&&secrets.growth_meta_app_secret&&secrets.growth_meta_config_id&&origin);
   if(action==='health')return response({version:'2.4.0',state:configured?'TESTING':'AUTH_REQUIRED',meta_configured:configured,operational:false,timezone:'America/Recife',slots:['12:00','18:00']});
   const graph=meta||new Meta(secrets.growth_meta_app_id,secrets.growth_meta_app_secret,fetcher);
   const publisher=new Publisher(db,graph,secrets,clock);
   if(action==='worker'){
    if(!equal(request.headers.get('x-growth-worker-secret'),secrets.growth_worker_secret))throw new Fault('UNAUTHORIZED',401);
    const [job]=await db.rpc('claim');
    if(job)return response(await publisher.run(job));
    if(configured){
     const [connection]=await db.rows('connections',`status=neq.DISABLED&or=(checked_at.is.null,checked_at.lt.${encodeURIComponent(iso(clock()-86400000))})&order=checked_at.asc.nullsfirst&limit=1`);
     if(connection)await publisher.maintain(connection);
     const [post]=await db.rpc('metric_due');
     if(post){const [metric]=await db.rows('metrics',`post_id=eq.${post.id}`);
      if(!metric||Date.parse(metric.collected_at)<clock()-6*3600000){const [c]=await db.rows('connections',`id=eq.${post.connection_id}`);if(c&&c.status==='CONNECTED')await publisher.metrics(post,c);}
     }
    }
    return response({state:'IDLE',operational:false});
   }
   if(action==='callback'){
    const query=new URL(request.url).searchParams;
    const state=query.get('state')||'';
    const browser=request.headers.get('Cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith('__Host-vendrex_growth='))?.split('=')[1]||'';
    if(!/^[a-f0-9]{64}$/.test(state)||!/^[a-f0-9]{64}$/.test(browser))throw new Fault('OAUTH_STATE_INVALID',403);
    const [auth]=await db.rpc('consume_oauth',{s:await hash(state),b:await hash(browser)});
    if(!auth)throw new Fault('OAUTH_STATE_INVALID',403);
    if(query.has('error'))return response({state:'AUTH_REQUIRED',error:'META_CONSENT_DECLINED'},403,{'Set-Cookie':cookie('',0)});
    if(!configured)throw new Fault('META_APP_SETUP_REQUIRED',503);
    const code=query.get('code');if(!code||code.length>2048)throw new Fault('OAUTH_CODE_REQUIRED');
    const redirect=origin+'/api/meta/callback';
    const token=await graph.exchange(code,redirect);
    const permissions=await graph.request('me/permissions',token.access_token);
    const granted=(permissions.data||[]).filter(v=>v.status==='granted').map(v=>v.permission);
    const allowed=(secrets.growth_allowed_page_ids||'').split(',').map(v=>v.trim()).filter(Boolean);
    if(!allowed.length)throw new Fault('VENDREX_PAGE_ALLOWLIST_REQUIRED',409);
    const pages=(await graph.pages(token.access_token)).filter(p=>allowed.includes(p.id));
    let connected=0;
    for(const page of pages){
     if(!page.access_token||!page.tasks?.some(t=>['CREATE_CONTENT','MANAGE','PROFILE_PLUS_CREATE_CONTENT'].includes(t)))continue;
     const candidates=[{platform:'facebook',external_id:page.id,name:page.name}];
     if(page.instagram_business_account)candidates.push({platform:'instagram',external_id:page.instagram_business_account.id,name:page.instagram_business_account.username||page.name});
     for(const candidate of candidates){
      const required=candidate.platform==='facebook'?['pages_show_list','pages_read_engagement','pages_manage_posts']:['instagram_basic','instagram_content_publish','pages_read_engagement'];
      if(required.some(p=>!granted.includes(p)))continue;
      const [existing]=await db.rows('connections',`owner_id=eq.${auth.owner_id}&platform=eq.${candidate.platform}&external_id=eq.${candidate.external_id}`);
      const id=existing?.id||crypto.randomUUID();
      // Reauthorization preserves existing proof and pause setting. Never activates a new account.
      const [connection]=await db.insert('connections',{id,owner_id:auth.owner_id,page_id:page.id,...candidate,permissions:granted,status:'CONNECTED',paused:existing?.paused??true,proven_at:existing?.proven_at??null,checked_at:null,token_expires_at:null},'owner_id,platform,external_id');
      const ciphertext=await seal({page:page.access_token,user:token.access_token,user_expires_at:Math.floor(clock()/1000)+(token.expires_in||0)},secrets.growth_encryption_key,context(connection));
      await db.insert('tokens',{connection_id:id,ciphertext,updated_at:iso(clock())},'connection_id');connected++;
      await db.patch('posts',`connection_id=eq.${id}&state=eq.AUTH_REQUIRED`,{state:'RETRY',next_attempt_at:iso(clock()),error_code:null});
      await db.patch('alerts',`owner_id=eq.${auth.owner_id}&dedupe_key=eq.${encodeURIComponent(id+':reauth')}`,{resolved_at:iso(clock())});
     }
    }
    if(!connected)throw new Fault('NO_AUTHORIZED_VENDREX_ACCOUNTS',409);
    await db.audit(auth.owner_id,'META_OAUTH_CONNECTED',{connections:connected});
    return new Response(null,{status:303,headers:{Location:origin+'/#integrations?meta=connected','Set-Cookie':cookie('',0),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
   }
   const authorization=request.headers.get('Authorization')||'';
   if(!authorization.startsWith('Bearer '))throw new Fault('UNAUTHORIZED',401);
   const check=await fetcher(url+'/auth/v1/user',{headers:{Authorization:authorization,apikey:key},signal:AbortSignal.timeout(10000)});
   if(!check.ok)throw new Fault('UNAUTHORIZED',401);
   const user=await check.json();if(!uuid(user.id))throw new Fault('UNAUTHORIZED',401);
   let body={};
   if(request.method==='POST'){
    const text=await request.text();if(text.length>32000)throw new Fault('BODY_TOO_LARGE',413);
    try{body=text?JSON.parse(text):{};}catch{throw new Fault('INVALID_JSON');}
   }
   if(action==='status'){
    const [connections,posts,alerts,metrics,runtime]=await Promise.all([
     db.rows('connections',`owner_id=eq.${user.id}&order=created_at.desc`),db.rows('posts',`owner_id=eq.${user.id}&order=created_at.desc&limit=100`),
     db.rows('alerts',`owner_id=eq.${user.id}&order=created_at.desc&limit=50`),db.rows('metrics',`owner_id=eq.${user.id}`),db.rows('runtime','id=eq.true')]);
    const heartbeat=runtime[0]?.last_tick;
    const workerActive=Boolean(heartbeat&&clock()-Date.parse(heartbeat)<180000);
    const operational=workerActive&&connections.some(c=>!c.paused&&c.status==='CONNECTED'&&c.proven_at);
    return response({state:operational?'OPERATIONAL':connections.length?'TESTING':'AUTH_REQUIRED',operational,meta_configured:configured,worker_active:workerActive,last_tick:heartbeat,connections,posts,alerts,metrics,timezone:'America/Recife',slots:['12:00','18:00']});
   }
   if(action==='start'){
    if(!configured)throw new Fault('META_APP_SETUP_REQUIRED',503);
    const state=nonce(),browser=nonce();
    await db.insert('oauth',{state_hash:await hash(state),browser_hash:await hash(browser),owner_id:user.id});
    const target=new URL('https://www.facebook.com/v27.0/dialog/oauth');
    for(const [k,v] of Object.entries({client_id:secrets.growth_meta_app_id,config_id:secrets.growth_meta_config_id,redirect_uri:origin+'/api/meta/callback',response_type:'code',override_default_response_type:'true',state}))target.searchParams.set(k,v);
    return response({authorization_url:target.href,permissions:scopes},200,{'Set-Cookie':cookie(browser)});
   }
   if(!uuid(body.connection_id))throw new Fault('INVALID_CONNECTION');
   const [connection]=await db.rows('connections',`id=eq.${body.connection_id}&owner_id=eq.${user.id}`);
   if(!connection)throw new Fault('NOT_FOUND',404);
   if(action==='control'){
    if(typeof body.paused!=='boolean')throw new Fault('PAUSED_REQUIRED');
    if(!body.paused&&(!connection.proven_at||connection.status!=='CONNECTED'))throw new Fault('REAL_PUBLICATION_TEST_REQUIRED',409);
    await db.patch('connections',`id=eq.${connection.id}&owner_id=eq.${user.id}`,{paused:body.paused});
    await db.audit(user.id,body.paused?'AUTOMATION_PAUSED':'AUTOMATION_RESUMED',{connection_id:connection.id});
    return response({state:body.paused?'PAUSED':'CONNECTED'});
   }
   if(action==='disconnect'){
    await db.patch('connections',`id=eq.${connection.id}&owner_id=eq.${user.id}`,{status:'DISABLED',paused:true});
    await db.call('vendrex_growth_tokens?connection_id=eq.'+connection.id,{method:'DELETE'});
    await db.patch('posts',`connection_id=eq.${connection.id}&state=in.(QUEUED,RETRY,AUTH_REQUIRED)`,{state:'CANCELLED',error_code:'CONNECTION_DISABLED'});
    await db.audit(user.id,'META_ACCOUNT_DISCONNECTED',{connection_id:connection.id});
    return response({state:'DISABLED'});
   }
   if(action==='enqueue'){
    if(connection.status!=='CONNECTED')throw new Fault('META_AUTH_REQUIRED',401);
    const allowedOrigins=[url,origin].filter(Boolean);
    const media=validateMedia(body,allowedOrigins);
    const test=body.test_post===true;
    if(!test&&connection.paused)throw new Fault('AUTOMATION_PAUSED',409);
    const scheduled=test?iso(clock()):nextSlot(clock(),body.slot||'next');
    // Verify public asset and its actual Content-Type without following an untrusted redirect.
    const asset=await fetcher(media.media_url,{method:'HEAD',redirect:'error',signal:AbortSignal.timeout(10000)});
    if(!asset.ok||asset.headers.get('content-type')?.split(';')[0]!==media.mime_type)throw new Fault('PUBLIC_MEDIA_NOT_ACCESSIBLE',422);
    const fingerprint=await hash(JSON.stringify({kind:media.kind,caption:media.caption,media_url:media.media_url}));
    const [post]=await db.insert('posts',{owner_id:user.id,connection_id:connection.id,kind:media.kind,caption:media.caption,media_url:media.media_url,mime_type:media.mime_type,scheduled_for:scheduled,fingerprint,test_post:test});
    await db.audit(user.id,'PUBLICATION_QUEUED',{post_id:post.id,scheduled_for:scheduled,test_post:test});
    return response(post,201);
   }
   if(action==='metrics'){
    if(!uuid(body.post_id))throw new Fault('INVALID_POST');
    const [post]=await db.rows('posts',`id=eq.${body.post_id}&owner_id=eq.${user.id}&connection_id=eq.${connection.id}&state=eq.PUBLISHED`);
    if(!post)throw new Fault('CONFIRMED_PUBLICATION_REQUIRED',409);
    return response(await publisher.metrics(post,connection));
   }
   throw new Fault('NOT_FOUND',404);
  }catch(error){
   const code=error instanceof Fault?error.code:'INTERNAL_ERROR';
   // Do not log provider errors, callback query strings, tokens, or request bodies.
   console.error(JSON.stringify({component:'growth',code}));
   return response({state:code.includes('AUTH')||code.includes('SETUP')?'AUTH_REQUIRED':'BLOCKED',error:code},error instanceof Fault?error.status:500);
  }
 };
}
