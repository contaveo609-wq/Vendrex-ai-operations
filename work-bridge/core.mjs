import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {guardReply} from '../supabase/functions/sales/core.mjs';

export const AGENTS=['sales','builder','growth','director'];
export const EVENT='vendrex.task.ready';
export class WorkError extends Error {constructor(code,status=400){super(code);this.code=code;this.status=status;}}
const same=(a,b)=>{if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&y.length>=32&&timingSafeEqual(x,y);};
export function callbackURL(value){
 let u;try{u=new URL(value);}catch{throw new WorkError('WORK_CALLBACK_REJECTED');}
 // Exact first-party hosts: never send customer data to an arbitrary MCP callback.
 if(u.protocol!=='https:'||u.username||u.password||u.hash||u.port||!['chatgpt.com','api.openai.com','chat.openai.com'].includes(u.hostname))throw new WorkError('WORK_CALLBACK_REJECTED');
 return u.href;
}
export function signingKey(value){
 if(typeof value!=='string'||!/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(value))throw new WorkError('WORK_SIGNING_KEY_INVALID');
 const encoded=value.slice(6),key=Buffer.from(encoded,'base64');
 if(key.length<24||key.length>64||key.toString('base64')!==encoded)throw new WorkError('WORK_SIGNING_KEY_INVALID');
 return key;
}
export function signedHeaders({id,subscription,secret,body,now=Date.now()}){
 const timestamp=String(Math.floor(now/1000));
 const signature=createHmac('sha256',signingKey(secret)).update(id+'.'+timestamp+'.'+body).digest('base64');
 return {'Content-Type':'application/json','webhook-id':id,'webhook-timestamp':timestamp,'webhook-signature':'v1,'+signature,'X-MCP-Subscription-Id':subscription};
}
export class WorkBridge {
 constructor({db,url,publishableKey,fetcher=fetch,now=()=>Date.now()}){Object.assign(this,{db,url,publishableKey,fetcher,now});}
 resource(){return this.url+'/functions/v1/work/mcp';}
 challenge(){return 'Bearer resource_metadata="'+this.url+'/functions/v1/work/resource", error="invalid_token", error_description="Connect an authorized Vendrex operator account"';}
 async operator(request){
  const authorization=request.headers.get('authorization')||'';
  if(!/^Bearer [A-Za-z0-9._-]{30,}$/.test(authorization))throw new WorkError('WORK_LOGIN_REQUIRED',401);
  const response=await this.fetcher(this.url+'/auth/v1/user',{headers:{Authorization:authorization,apikey:this.publishableKey},redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new WorkError('WORK_LOGIN_REQUIRED',401);
  const user=await response.json();
  if(!/^[a-f0-9-]{36}$/i.test(user.id||'')||!user.email_confirmed_at)throw new WorkError('WORK_LOGIN_REQUIRED',401);
  if(!(await this.db.call('vendrex_sales_operators?user_id=eq.'+user.id+'&limit=1')).length)throw new WorkError('OPERATOR_REQUIRED',403);
  return user;
 }
 async subscribe(user,{name,arguments:args,delivery,ttlMs}){
  if(name!==EVENT||!AGENTS.includes(args?.agent)||delivery?.mode!=='webhook')throw new WorkError('WORK_INVALID_SUBSCRIPTION');
  const target=callbackURL(delivery.url);signingKey(delivery.secret);
  const ttl=ttlMs==null?86400000:Math.min(604800000,Math.max(60000,ttlMs));
  if(!Number.isFinite(ttl))throw new WorkError('WORK_INVALID_SUBSCRIPTION');
  const challenge=randomBytes(32).toString('base64url'),body=JSON.stringify({type:'verification',challenge});
  // A deterministic ID is returned by the store; verification is never sent to untrusted hosts.
  const subscription=await this.db.rpc('subscription_id',{owner_id:user.id,agent:args.agent,callback_url:target});
  let response;try{response=await this.fetcher(target,{method:'POST',redirect:'error',headers:signedHeaders({id:'verify_'+randomBytes(16).toString('hex'),subscription,secret:delivery.secret,body,now:this.now()}),body,signal:AbortSignal.timeout(8000)});}catch{throw new WorkError('WORK_CALLBACK_VERIFICATION_FAILED',502);}
  let received;try{received=(await response.json()).challenge;}catch{throw new WorkError('WORK_CALLBACK_VERIFICATION_FAILED',502);}
  if(!response.ok||!same(challenge,received))throw new WorkError('WORK_CALLBACK_VERIFICATION_FAILED',502);
  const expires=new Date(this.now()+ttl).toISOString();
  const id=await this.db.rpc('subscribe',{owner_id:user.id,agent:args.agent,callback_url:target,signing_secret:delivery.secret,expires_at:expires});
  return {id,refreshBefore:expires,cursor:null,truncated:false};
 }
 async unsubscribe(user,params){
  if(params.name!==EVENT||!AGENTS.includes(params.arguments?.agent))throw new WorkError('WORK_INVALID_SUBSCRIPTION');
  await this.db.call('vendrex_work_subscriptions?owner_id=eq.'+user.id+'&agent=eq.'+params.arguments.agent+'&callback_url=eq.'+encodeURIComponent(callbackURL(params.delivery?.url)),{method:'PATCH',body:{active:false}});
  return {};
 }
 async context(id){if(!/^[a-f0-9-]{36}$/i.test(id))throw new WorkError('WORK_JOB_NOT_FOUND',404);return this.db.rpc('context',{job:id});}
 async complete(user,{job_id,result}){
  if(typeof job_id!=='string'||!/^[a-f0-9-]{36}$/i.test(job_id)||!result||typeof result!=='object'||Array.isArray(result))throw new WorkError('WORK_INVALID_RESULT');
  const [job]=await this.db.call('vendrex_work_jobs?select=agent,conversation_id&id=eq.'+job_id+'&limit=1');
  if(!job)throw new WorkError('WORK_JOB_NOT_FOUND',404);
  if(job.agent==='sales'&&job.conversation_id){
   if(typeof result.reply!=='string')throw new WorkError('WORK_REPLY_REQUIRED');
   guardReply(result.reply);
   if(Object.keys(result).some(k=>!['reply','summary'].includes(k)))throw new WorkError('WORK_INVALID_RESULT');
  }else if(typeof result.summary!=='string'||!result.summary.trim()||result.summary.length>8000||!Array.isArray(result.evidence)||result.evidence.length>10||result.evidence.some(x=>typeof x!=='string'||x.length>2000)||Object.keys(result).some(k=>!['summary','evidence'].includes(k)))throw new WorkError('WORK_INVALID_RESULT');
  if(new TextEncoder().encode(JSON.stringify(result)).length>30000)throw new WorkError('WORK_RESULT_TOO_LARGE');
  return this.db.rpc('complete',{job:job_id,owner_id:user.id,result});
 }
 async dispatch(request){
  const secret=await this.db.rpc('secret');
  if(!same(request.headers.get('x-work-dispatch-secret'),secret))throw new WorkError('UNAUTHORIZED',401);
  let processed=0;
  for(let i=0;i<1;i++){
   const d=await this.db.rpc('claim_delivery');if(!d)break;
   const body=JSON.stringify({eventId:d.id,name:EVENT,timestamp:d.created_at,data:{job_id:d.job_id,agent:d.agent},cursor:null});
   let status=0;
   try{const response=await this.fetcher(callbackURL(d.callback_url),{method:'POST',redirect:'error',headers:signedHeaders({id:d.id,subscription:d.subscription_id,secret:d.signing_secret,body,now:this.now()}),body,signal:AbortSignal.timeout(8000)});status=response.status;}catch{}
   const terminal=status===410||status===413||(status>=400&&status<500&&status!==408&&status!==429)||d.attempts>=5;
   await this.db.call('vendrex_work_deliveries?id=eq.'+d.id+'&lease=eq.'+d.lease+'&state=eq.SENDING',{method:'PATCH',body:{state:status>=200&&status<300?'ACCEPTED':terminal?'FAILED':'PENDING',lease:null,lease_until:null,http_status:status||null,next_attempt_at:new Date(this.now()+Math.min(300,5*2**d.attempts)*1000).toISOString()}});
   processed++;
  }
  return {processed,customer_sent:false};
 }
}
