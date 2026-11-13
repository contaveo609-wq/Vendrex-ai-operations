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
      inference_configured:Boolean(secrets.sales_groq_api_key||secrets.sales_gemma_api_key||secrets.sales_inference_url),
      inference_verified:Boolean(s.inference_verified_at),SALES_WHATSAPP_OPERATIONAL:operational,debounce_seconds:5});
   }
   if(action==='worker'&&req.method==='POST'){
    if(!equal(req.headers.get('x-sales-worker-secret'),secrets.sales_worker_secret))throw new Fault('UNAUTHORIZED',401);
    const [settings]=await db.rows('settings','id=eq.true');
    if(settings?.transport_policy!=='META_CLOUD_API')return json({state:'DISABLED_BY_OWNER',transport_policy:'NO_WHATSAPP_API',SALES_WHATSAPP_OPERATIONAL:false});
    const worker=workerFactory?workerFactory(db,secrets):new SalesWorker({store:db,secrets,fetcher,bootId});
    return json(await worker.tick());
   }
   if(!['status','control','history','conversations','behavior','test-contacts','inference-key','pairing','work-enroll','work-order','work-status'].includes(action))throw new Fault('NOT_FOUND',404);
   // A private Netlify Function verifies context.user before adding these server-only headers.
   // This scoped bridge cannot invoke the worker or expose database credentials.
   const dashboardSecret=req.headers.get('x-sales-dashboard-secret');
   if(dashboardSecret!==null){
    if(!equal(dashboardSecret,secrets.sales_dashboard_secret)||!equal(req.headers.get('x-sales-operator-id'),secrets.sales_netlify_owner_id))throw new Fault('UNAUTHORIZED',401);
   }else{
    const authorization=req.headers.get('Authorization')||'';
    if(!authorization.startsWith('Bearer '))throw new Fault('UNAUTHORIZED',401);
    const r=await fetcher(url+'/auth/v1/user',{headers:{Authorization:authorization,apikey:key},signal:AbortSignal.timeout(10000)});
    if(!r.ok)throw new Fault('UNAUTHORIZED',401);const user=await r.json();
    if(!/^[a-f0-9-]{36}$/i.test(user.id||''))throw new Fault('UNAUTHORIZED',401);
    if(!(await db.rows('operators',`user_id=eq.${user.id}`)).length)throw new Fault('OPERATOR_REQUIRED',403);
   }
   if(action==='work-status'&&req.method==='GET'){
    const [[settings],operators,jobs,subscriptions]=await Promise.all([
     db.call('vendrex_work_settings?select=enabled&id=eq.true'),db.rows('operators','select=user_id&limit=1'),
     db.call('vendrex_work_jobs?select=id,agent,state,created_at,completed_at,result&order=created_at.desc&limit=20'),
     db.call('vendrex_work_subscriptions?select=agent,active,expires_at&active=eq.true')]);
    return json({enabled:settings?.enabled===true,operator_enrolled:operators.length>0,
     active_subscriptions:[...new Set(subscriptions.filter(s=>s.active&&Date.parse(s.expires_at)>Date.now()).map(s=>s.agent))],
     jobs:jobs.map(({id,agent,state,created_at,completed_at,result})=>({id,agent,state,created_at,completed_at,result})),customer_sending_enabled:false});
   }
   if(action==='work-enroll'&&req.method==='POST'){
    if(dashboardSecret===null)throw new Fault('OWNER_LOGIN_REQUIRED',403);
    const body=await req.json();
    if(typeof body.access_token!=='string'||!/^[-A-Za-z0-9._]{30,8000}$/.test(body.access_token)||typeof body.owner_email!=='string')throw new Fault('WORK_LOGIN_REQUIRED',422);
    const result=await fetcher(url+'/auth/v1/user',{headers:{apikey:key,Authorization:'Bearer '+body.access_token},signal:AbortSignal.timeout(8000)});
    if(!result.ok)throw new Fault('WORK_LOGIN_REQUIRED',401);
    const user=await result.json();
    if(!/^[a-f0-9-]{36}$/i.test(user.id||'')||!user.email_confirmed_at||user.email?.toLowerCase()!==body.owner_email.toLowerCase())throw new Fault('WORK_OWNER_MISMATCH',403);
    if(!(await db.rows('operators','user_id=eq.'+user.id)).length)await db.insert('operators',{user_id:user.id});
    await db.audit('WORK_OWNER_ENROLLED',null,{user_id:user.id});
    return json({enrolled:true});
   }
   if(action==='work-order'&&req.method==='POST'){
    if(dashboardSecret===null)throw new Fault('OWNER_LOGIN_REQUIRED',403);
    const body=await req.json();if(typeof body.instruction!=='string'||body.instruction.trim().length<10||body.instruction.length>4000)throw new Fault('WORK_INVALID_ORDER',422);
    return json(await db.call('rpc/vendrex_work_order',{method:'POST',body:{instruction:body.instruction}}));
   }
   if(action==='pairing'&&req.method==='GET')return json(await db.rpc('pairing_get'));
   if(action==='status'&&req.method==='GET'){
    const [s]=await db.rows('settings','id=eq.true'),proof=await db.rpc('proof');
    let state=s.paused?'PAUSED':'TESTING';
    if(s.transport_policy==='BAILEYS_QR'){
     const [i]=await db.rows('instances','id=eq.'+encodeURIComponent(s.qr_instance));
     state=!i?.lease_until||Date.parse(i.lease_until)<Date.now()?'HOST_REQUIRED':i.state;
    }
    const inferenceConfigured=s.inference_provider==='GROQ_FREE'?Boolean(secrets.sales_groq_api_key):s.inference_provider==='GEMMA_API'?Boolean(secrets.sales_gemma_api_key):Boolean(secrets.sales_inference_url||secrets.sales_companion_bearer);
    return json({...proof,paused:s.paused,transport_policy:s.transport_policy,mode:s.mode,last_heartbeat:s.last_heartbeat,last_error:s.last_error,
     state,inference_configured:inferenceConfigured,inference_daily_limit:s.inference_daily_limit,inference_calls:s.inference_calls,inference_provider:s.inference_provider,inference_model:s.inference_model,test_recipients:s.test_recipients,
     SALES_WHATSAPP_OPERATIONAL:proof.SALES_WHATSAPP_OPERATIONAL&&['META_CLOUD_API','BAILEYS_QR'].includes(s.transport_policy)&&!s.paused&&Date.now()-Date.parse(s.last_heartbeat)<120000});
   }
   if(action==='behavior'&&req.method==='GET'){
    const [s]=await db.rows('settings','select=bot_behavior,behavior_revision&id=eq.true');return json({behavior:s.bot_behavior,behavior_revision:s.behavior_revision});
   }
   if(action==='behavior'&&req.method==='POST'){
    const body=await req.json();return json(await db.rpc('behavior_set',{behavior:body.behavior}));
   }
   if(action==='inference-key'&&req.method==='POST'){
    const body=await req.json();if(typeof body.api_key!=='string'||!/^gsk_[A-Za-z0-9_-]{32,200}$/.test(body.api_key))throw new Fault('GROQ_KEY_INVALID',422);
    return json(await db.rpc('groq_key_set',{api_key:body.api_key}));
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
   if(action==='conversations'&&req.method==='GET'){
    const conversations=await db.rows('conversations','select=id,contact_id,status,last_inbound_at,revision,processed_revision&order=last_inbound_at.desc.nullslast&limit=50');
    if(!conversations.length)return json({conversations:[]});
    const ids=conversations.map(c=>c.contact_id).filter(id=>/^[a-f0-9-]{36}$/i.test(id));
    const contacts=ids.length?await db.rows('contacts',`select=id,identity,display_name,opted_out,blocked,human_takeover,lead_stage&id=in.(${ids.join(',')})`):[];
    const byId=new Map(contacts.map(contact=>[contact.id,contact]));
    return json({conversations:conversations.map(c=>({...c,contact:byId.get(c.contact_id)||null}))});
   }
   throw new Fault('METHOD_NOT_ALLOWED',405);
  }catch(e){const code=e instanceof Fault?e.code:'INTERNAL_ERROR';console.error(JSON.stringify({component:'sales',code}));return json({error:code,SALES_WHATSAPP_OPERATIONAL:false},e instanceof Fault?e.status:500);}
 };
}
