import {Fault,Store,SalesWorker,equal,verifyWebhook} from './core.mjs';
const bootId=crypto.randomUUID();
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function createHandler({url,key,fetcher=fetch,store,workerFactory}){
 const db=store||new Store(url,key,fetcher);
 return async req=>{
  try{
   const u=new URL(req.url),action=u.pathname.split('/').filter(Boolean).at(-1);
   const secrets=await db.rpc('secrets');
   if(action==='webhook'){
    const [settings]=await db.rows('settings','id=eq.true');
    if(settings?.transport_policy!=='META_CLOUD_API')throw new Fault('OWNER_REQUIRES_NO_WHATSAPP_API',409);
    if(req.method==='GET'){
     if(u.searchParams.get('hub.mode')!=='subscribe'||!equal(u.searchParams.get('hub.verify_token'),secrets.sales_meta_verify_token))throw new Fault('VERIFY_TOKEN_INVALID',403);
     const challenge=u.searchParams.get('hub.challenge');if(!challenge||challenge.length>256)throw new Fault('INVALID_CHALLENGE');
     return new Response(challenge,{status:200,headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});
    }
    if(req.method!=='POST')throw new Fault('METHOD_NOT_ALLOWED',405);
    if(Number(req.headers.get('Content-Length')||0)>3000000)throw new Fault('PAYLOAD_TOO_LARGE',413);
    const raw=await req.text();if(new TextEncoder().encode(raw).length>3000000)throw new Fault('PAYLOAD_TOO_LARGE',413);
    if(!await verifyWebhook(raw,req.headers.get('X-Hub-Signature-256'),secrets.sales_meta_app_secret))throw new Fault('WEBHOOK_SIGNATURE_INVALID',401);
    let payload;try{payload=JSON.parse(raw);}catch{throw new Fault('INVALID_JSON');}
    const result=await db.rpc('ingest',{payload});return json({received:true,...result});
   }
   if(action==='health'&&req.method==='GET'){
    const [s]=await db.rows('settings','id=eq.true');
    let state=s.transport_policy!=='META_CLOUD_API'?'DISABLED_BY_OWNER':!s.phone_number_id||!secrets.sales_meta_access_token?'AUTH_REQUIRED':s.paused?'PAUSED':'TESTING',operational=false;
    if(s.transport_policy==='BAILEYS_QR'){
     const [instance]=await db.rows('instances','id=eq.'+encodeURIComponent(s.qr_instance));
     state=!instance?.lease_until||Date.parse(instance.lease_until)<Date.now()?'HOST_REQUIRED':s.paused?'PAUSED':instance.state;
     operational=Boolean((await db.rpc('proof')).SALES_WHATSAPP_OPERATIONAL);
    }
    return json({component:'VENDREX_SALES',version:'2.4.0',state,
      transport_policy:s.transport_policy,remote_worker_deployed:true,remote_worker_enabled:s.transport_policy==='META_CLOUD_API'&&!s.paused,
      inference_configured:Boolean(secrets.sales_gemma_api_key||secrets.sales_inference_url),
      inference_verified:Boolean(s.inference_verified_at),SALES_WHATSAPP_OPERATIONAL:operational,debounce_seconds:5});
   }
   if(action==='worker'&&req.method==='POST'){
    if(!equal(req.headers.get('x-sales-worker-secret'),secrets.sales_worker_secret))throw new Fault('UNAUTHORIZED',401);
    const [settings]=await db.rows('settings','id=eq.true');
    if(settings?.transport_policy!=='META_CLOUD_API')return json({state:'DISABLED_BY_OWNER',transport_policy:'NO_WHATSAPP_API',SALES_WHATSAPP_OPERATIONAL:false});
    const worker=workerFactory?workerFactory(db,secrets):new SalesWorker({store:db,secrets,fetcher,bootId});
    return json(await worker.tick());
   }
   if(!['status','control','history','behavior','test-contacts'].includes(action))throw new Fault('NOT_FOUND',404);
   const authorization=req.headers.get('Authorization')||'';
   if(!authorization.startsWith('Bearer '))throw new Fault('UNAUTHORIZED',401);
   const r=await fetcher(url+'/auth/v1/user',{headers:{Authorization:authorization,apikey:key},signal:AbortSignal.timeout(10000)});
   if(!r.ok)throw new Fault('UNAUTHORIZED',401);const user=await r.json();
   if(!/^[a-f0-9-]{36}$/i.test(user.id||''))throw new Fault('UNAUTHORIZED',401);
   if(!(await db.rows('operators',`user_id=eq.${user.id}`)).length)throw new Fault('OPERATOR_REQUIRED',403);
   if(action==='status'&&req.method==='GET'){
    const [s]=await db.rows('settings','id=eq.true'),proof=await db.rpc('proof');
    let state=s.paused?'PAUSED':'TESTING';
    if(s.transport_policy==='BAILEYS_QR'){
     const [i]=await db.rows('instances','id=eq.'+encodeURIComponent(s.qr_instance));
     state=!i?.lease_until||Date.parse(i.lease_until)<Date.now()?'HOST_REQUIRED':i.state;
    }
    return json({...proof,paused:s.paused,transport_policy:s.transport_policy,mode:s.mode,last_heartbeat:s.last_heartbeat,last_error:s.last_error,
     state,inference_daily_limit:s.inference_daily_limit,inference_calls:s.inference_calls,inference_model:s.inference_model,test_recipients:s.test_recipients,
     SALES_WHATSAPP_OPERATIONAL:proof.SALES_WHATSAPP_OPERATIONAL&&['META_CLOUD_API','BAILEYS_QR'].includes(s.transport_policy)&&!s.paused&&Date.now()-Date.parse(s.last_heartbeat)<120000});
   }
   if(action==='behavior'&&req.method==='GET'){
    const [s]=await db.rows('settings','select=bot_behavior,behavior_revision&id=eq.true');return json({behavior:s.bot_behavior,behavior_revision:s.behavior_revision});
   }
   if(action==='behavior'&&req.method==='POST'){
    const body=await req.json();return json(await db.rpc('behavior_set',{behavior:body.behavior}));
   }
   if(action==='test-contacts'&&req.method==='POST'){
    const body=await req.json(),values=body.recipients;
    if(!Array.isArray(values)||values.length<1||values.length>5||values.some(v=>typeof v!=='string'||!/^\d{8,30}(?:@(s\.whatsapp\.net|lid))?$/.test(v)))throw new Fault('EXACT_AUTHORIZED_CONTACT_REQUIRED',422);
    const [s]=await db.rows('settings','id=eq.true');if(!s.paused)throw new Fault('PAUSE_BEFORE_CHANGING_TEST_CONTACTS',409);
    await db.patch('settings','id=eq.true',{test_recipients:[...new Set(values)],mode:'TEST'});return json({saved:true,mode:'TEST'});
   }
   if(action==='control'&&req.method==='POST'){
    const body=await req.json();if(body.conversation_id&&!/^[a-f0-9-]{36}$/i.test(body.conversation_id))throw new Fault('INVALID_CONVERSATION');
    return json(await db.rpc('control',{action:body.action,conversation:body.conversation_id||null}));
   }
   if(action==='history'&&req.method==='GET'){
    const id=u.searchParams.get('conversation_id');if(!/^[a-f0-9-]{36}$/i.test(id||''))throw new Fault('INVALID_CONVERSATION');
    return json(await db.rows('messages',`conversation_id=eq.${id}&order=platform_at.asc&limit=100`));
   }
   throw new Fault('METHOD_NOT_ALLOWED',405);
  }catch(e){const code=e instanceof Fault?e.code:'INTERNAL_ERROR';console.error(JSON.stringify({component:'sales',code}));return json({error:code,SALES_WHATSAPP_OPERATIONAL:false},e instanceof Fault?e.status:500);}
 };
}
