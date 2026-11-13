const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const routes={status:'GET',behavior:['GET','POST'],control:'POST','test-contacts':'POST','inference-key':'POST',history:'GET',conversations:'GET',pairing:'GET','work-config':'GET','work-enroll':'POST','work-order':'POST'};
export function createOperatorHandler({env,fetcher=fetch,now=()=>Date.now()}){
 return async(request,context)=>{
  try{
   const owner=env('NETLIFY_OWNER_ID'),user=context?.user;
   // Only the platform's verified identity is trusted. Request headers are never identity.
   if(!owner||!user||user.id!==owner||!Number.isFinite(new Date(user.expiresAt).getTime())||new Date(user.expiresAt).getTime()<=now())return reply({error:'OWNER_LOGIN_REQUIRED'},401);
   const u=new URL(request.url);
   if(request.headers.has('Origin')&&request.headers.get('Origin')!==u.origin)return reply({error:'ORIGIN_REJECTED'},403);
   if(request.method!=='GET'&&(request.headers.get('Origin')!==u.origin||!['same-origin','none',null].includes(request.headers.get('Sec-Fetch-Site'))))return reply({error:'ORIGIN_REJECTED'},403);
   if(u.pathname==='/api/config'&&request.method==='GET')return reply({user:{id:user.id,email:user.email||null,expiresAt:new Date(user.expiresAt).toISOString()},hosting:'NETLIFY_PRIVATE'});
   const match=/^\/api\/sales\/([a-z-]+)$/.exec(u.pathname),action=match?.[1];
   if(!routes[action])return reply({error:'NOT_FOUND'},404);
   if(![routes[action]].flat().includes(request.method))return reply({error:'METHOD_NOT_ALLOWED'},405);
   const url=env('SUPABASE_URL'),key=env('SUPABASE_PUBLISHABLE_KEY'),secret=env('SALES_DASHBOARD_SECRET');
   if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url||'')||!/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key||'')||! /^[a-f0-9]{64}$/.test(secret||''))return reply({error:'SERVER_CONFIGURATION_REQUIRED'},503);
   if(action==='work-config')return reply({url,publishable_key:key,email:user.email||null});
   let body;
   if(request.method==='POST'){
    if(!request.headers.get('Content-Type')?.startsWith('application/json'))return reply({error:'JSON_REQUIRED'},415);
    const raw=await request.text();if(new TextEncoder().encode(raw).length>16384)return reply({error:'PAYLOAD_TOO_LARGE'},413);
    let data;try{data=JSON.parse(raw);}catch{return reply({error:'INVALID_JSON'},400);}
    if(!data||typeof data!=='object'||Array.isArray(data))return reply({error:'INVALID_JSON'},400);
    if(action==='behavior')body={behavior:data.behavior};
    if(action==='test-contacts')body={recipients:data.recipients};
    if(action==='control')body={action:data.action,conversation_id:data.conversation_id};
    if(action==='inference-key'){
     if(typeof data.api_key!=='string'||!/^gsk_[A-Za-z0-9_-]{32,200}$/.test(data.api_key))return reply({error:'GROQ_KEY_INVALID'},422);
     body={api_key:data.api_key};
    }
    if(action==='work-enroll'){
     if(typeof data.access_token!=='string'||!/^[-A-Za-z0-9._]{30,8000}$/.test(data.access_token)||!user.email)return reply({error:'WORK_LOGIN_REQUIRED'},422);
     body={access_token:data.access_token,owner_email:user.email};
    }
    if(action==='work-order'){
     if(typeof data.instruction!=='string'||data.instruction.trim().length<10||data.instruction.length>4000)return reply({error:'WORK_INVALID_ORDER'},422);
     body={instruction:data.instruction};
    }
   }
   const target=new URL(url+'/functions/v1/sales/'+action);
   if(action==='history'){
    const id=u.searchParams.get('conversation_id');if(!/^[a-f0-9-]{36}$/i.test(id||''))return reply({error:'INVALID_CONVERSATION'},400);
    target.searchParams.set('conversation_id',id);
   }
   const response=await fetcher(target.href,{method:request.method,redirect:'error',headers:{apikey:key,'Content-Type':'application/json','x-sales-dashboard-secret':secret,'x-sales-operator-id':owner},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
   const data=await response.json();
   // Do not forward upstream cookies, authentication headers or internal failure text.
   if(!response.ok)return reply({error:/^[A-Z_]{4,80}$/.test(data?.error||'')?data.error:'SALES_UNAVAILABLE'},response.status>=400&&response.status<600?response.status:502);
   return reply(data);
  }catch{return reply({error:'SALES_UNAVAILABLE'},502);}
 };
}
