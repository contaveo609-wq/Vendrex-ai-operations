/* Official Graph API only. Shared with Node tests; no paid SDK or intermediary. */
const encoder = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), v => v.toString(16).padStart(2, '0')).join('');
const bytes = value => Uint8Array.from(value.match(/../g) || [], h => parseInt(h, 16));
export const iso = value => new Date(value).toISOString();
export const hash = async value => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
export const nonce = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export class Fault extends Error {
 constructor(code, status=400, retry=false) { super(code); this.code=code; this.status=status; this.retry=retry; }
}
export async function seal(value, key, context) {
 if (!/^[a-f0-9]{64}$/.test(key || '')) throw new Fault('ENCRYPTION_KEY_REQUIRED',503);
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const imported=await crypto.subtle.importKey('raw',bytes(key),'AES-GCM',false,['encrypt']);
 const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(context)},imported,encoder.encode(JSON.stringify(value)));
 return 'v1.'+hex(iv)+'.'+hex(data);
}
export async function unseal(value, key, context) {
 const [version,iv,data]=value.split('.');
 if(version!=='v1')throw new Fault('TOKEN_VERSION_INVALID',503);
 const imported=await crypto.subtle.importKey('raw',bytes(key),'AES-GCM',false,['decrypt']);
 return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv),additionalData:encoder.encode(context)},imported,bytes(data))));
}
export function nextSlot(now=Date.now(), slot='next') {
 if(!['next','12:00','18:00'].includes(slot))throw new Fault('INVALID_SLOT');
 // Recife has no DST. Intl resolves the requested IANA zone before UTC conversion.
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Recife',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now)).map(p=>[p.type,p.value]));
 const date=`${parts.year}-${parts.month}-${parts.day}`;
 const clocks=slot==='next'?['12:00','18:00']:[slot];
 for(let day=0;day<2;day++)for(const clock of clocks){
  const time=Date.parse(`${date}T${clock}:00-03:00`)+day*86400000;
  if(time>now)return iso(time);
 }
 throw new Fault('INVALID_SLOT');
}
export function validateMedia(input, allowedOrigins) {
 let url;try{url=new URL(input.media_url);}catch{throw new Fault('INVALID_MEDIA_URL');}
 if(url.protocol!=='https:'||url.username||url.password||url.hash||!allowedOrigins.includes(url.origin))throw new Fault('MEDIA_ORIGIN_NOT_ALLOWED');
 if(!['IMAGE','VIDEO','REEL'].includes(input.kind))throw new Fault('INVALID_MEDIA_KIND');
 if(input.kind==='IMAGE'&&input.mime_type!=='image/jpeg')throw new Fault('JPEG_REQUIRED');
 if(input.kind!=='IMAGE'&&input.mime_type!=='video/mp4')throw new Fault('MP4_REQUIRED');
 if(typeof input.caption!=='string'||!input.caption.trim()||input.caption.length>2200)throw new Fault('INVALID_CAPTION');
 return {...input,media_url:url.href,caption:input.caption.trim()};
}
export class Store {
 constructor(url,key,fetcher=fetch){this.url=url;this.key=key;this.fetcher=fetcher;}
 async call(path,{method='GET',body,prefer}={}) {
  let r;try{r=await this.fetcher(this.url+'/rest/v1/'+path,{method,headers:{apikey:this.key,Authorization:'Bearer '+this.key,'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});}catch{throw new Fault('DATABASE_UNAVAILABLE',503,true);}
  if(!r.ok)throw new Fault(r.status===409?'DUPLICATE_OR_SLOT_CONFLICT':'DATABASE_'+r.status,r.status===409?409:503,true);
  return r.status===204?null:r.json();
 }
 rows(table,query=''){return this.call('vendrex_growth_'+table+'?'+query);}
 insert(table,body,conflict){return this.call('vendrex_growth_'+table+(conflict?'?on_conflict='+conflict:''),{method:'POST',body,prefer:'return=representation'+(conflict?',resolution=merge-duplicates':'')});}
 patch(table,query,body){return this.call('vendrex_growth_'+table+'?'+query,{method:'PATCH',body,prefer:'return=representation'});}
 rpc(name,body={}){return this.call('rpc/vendrex_growth_'+name,{method:'POST',body});}
 async audit(owner,action,detail={}){await this.insert('audit',{owner_id:owner,action,detail});}
 async alert(owner,key,code,detail){await this.insert('alerts',{owner_id:owner,dedupe_key:key,code,detail,resolved_at:null},'owner_id,dedupe_key');}
}
export class Meta {
 constructor(appId,appSecret,fetcher=fetch){this.appId=appId;this.appSecret=appSecret;this.fetcher=fetcher;}
 async request(path,token,{method='GET',params={},host='graph.facebook.com',proof=true}={}) {
  if(!['graph.facebook.com','graph-video.facebook.com','rupload.facebook.com'].includes(host)||!/^\/?[A-Za-z0-9_./-]+$/.test(path))throw new Fault('INVALID_META_ENDPOINT');
  const url=new URL(`https://${host}/v27.0/${path.replace(/^\//,'')}`);
  const values={...params};
  if(proof&&token&&host!=='rupload.facebook.com'){
   const key=await crypto.subtle.importKey('raw',encoder.encode(this.appSecret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
   values.appsecret_proof=hex(await crypto.subtle.sign('HMAC',key,encoder.encode(token)));
  }
  if(method==='GET')for(const [k,v] of Object.entries(values))url.searchParams.set(k,typeof v==='object'?JSON.stringify(v):String(v));
  let r;
  try{r=await this.fetcher(url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:method==='GET'?undefined:JSON.stringify(values),signal:AbortSignal.timeout(15000)});}catch{throw new Fault(method==='GET'?'META_UNAVAILABLE':'META_MUTATION_UNKNOWN',503,true);}
  let data;try{data=await r.json();}catch{throw new Fault(method==='GET'?'META_INVALID_RESPONSE':'META_MUTATION_UNKNOWN',503,true);}
  if(!r.ok||data.error){const code=data.error?.code;throw new Fault(code===190?'META_AUTH_REQUIRED':'META_'+(code||r.status),code===190?401:502,Boolean(data.error?.is_transient)||r.status===429||r.status>=500);}
  return data;
 }
 async pages(token){
  const result=[];let after;
  for(let page=0;page<20;page++){
   const data=await this.request('me/accounts',token,{params:{fields:'id,name,access_token,tasks,instagram_business_account{id,username,account_type}',limit:100,...(after?{after}:{})}});
   result.push(...(data.data||[]));after=data.paging?.cursors?.after;
   if(!data.paging?.next)return result;
  }
  throw new Fault('TOO_MANY_PAGES',409);
 }
 async exchange(code,redirectUri){
  const short=await this.request('oauth/access_token','',{proof:false,params:{client_id:this.appId,client_secret:this.appSecret,code,redirect_uri:redirectUri}});
  return this.request('oauth/access_token','',{proof:false,params:{grant_type:'fb_exchange_token',client_id:this.appId,client_secret:this.appSecret,fb_exchange_token:short.access_token}});
 }
 debug(token){return this.request('debug_token',this.appId+'|'+this.appSecret,{proof:false,params:{input_token:token}});}
 async uploadReel(videoId,token,url){
  let r;try{r=await this.fetcher(`https://rupload.facebook.com/video-upload/v27.0/${videoId}`,{method:'POST',headers:{Authorization:'OAuth '+token,file_url:url},signal:AbortSignal.timeout(15000)});}catch{throw new Fault('META_UPLOAD_UNKNOWN',503,true);}
  const data=await r.json();if(!r.ok||!data.success)throw new Fault('META_UPLOAD_FAILED',502,true);return data;
 }
}
export class Publisher {
 constructor(store,meta,secrets,clock=()=>Date.now()){this.db=store;this.meta=meta;this.secrets=secrets;this.clock=clock;}
 async save(job,patch){
  const updated=await this.db.patch('posts',`id=eq.${job.id}&lease=eq.${job.lease}&state=eq.RUNNING&lease_until=gt.${encodeURIComponent(iso(this.clock()))}`,{...patch,updated_at:iso(this.clock())});
  if(!updated.length)throw new Fault('LEASE_LOST',409);
  Object.assign(job,patch);return updated[0];
 }
 async defer(job,patch={},seconds=60){return this.save(job,{state:'RETRY',lease:null,lease_until:null,next_attempt_at:iso(this.clock()+seconds*1000),...patch});}
 async tokens(connection){
  const [row]=await this.db.rows('tokens',`connection_id=eq.${connection.id}`);
  if(!row)throw new Fault('META_AUTH_REQUIRED',401);
  return unseal(row.ciphertext,this.secrets.growth_encryption_key,connection.owner_id+':'+connection.id);
 }
 async run(job){
  let mutation=false;
  try{
   const [c]=await this.db.rows('connections',`id=eq.${job.connection_id}&owner_id=eq.${job.owner_id}`);
   if(!c||c.status==='DISABLED')return this.save(job,{state:'CANCELLED',error_code:'CONNECTION_DISABLED'});
   if(c.paused&&!job.test_post&&job.phase!=='CONFIRM')return this.defer(job,{},300);
   const tokens=await this.tokens(c), token=tokens.page;
   if(job.phase==='PREPARE'){
    if(c.platform==='instagram'){
     const quota=await this.meta.request(c.external_id+'/content_publishing_limit',token,{params:{fields:'quota_usage,config'}});
     if(quota.data?.[0]?.quota_usage>=(quota.data?.[0]?.config?.quota_total||100))return this.defer(job,{error_code:'META_QUOTA'},3600);
     mutation=true;
     const result=await this.meta.request(c.external_id+'/media',token,{method:'POST',params:job.kind==='IMAGE'?{image_url:job.media_url,caption:job.caption}:{media_type:'REELS',video_url:job.media_url,caption:job.caption}});
     if(!result.id)throw new Fault('META_MUTATION_UNKNOWN',503);
     return this.defer(job,{phase:'WAIT_CONTAINER',checkpoint:{container_id:result.id}});
    }
    if(job.kind==='REEL'){
     mutation=true;
     const result=await this.meta.request(c.external_id+'/video_reels',token,{method:'POST',params:{upload_phase:'start'}});
     if(!result.video_id)throw new Fault('META_MUTATION_UNKNOWN',503);
     return this.defer(job,{phase:'UPLOAD_REEL',checkpoint:{video_id:result.video_id}},1);
    }
    // The single Facebook publication call is fenced and never blindly retried after a timeout.
    await this.save(job,{phase:'PUBLISHING'});mutation=true;
    const result=await this.meta.request(c.external_id+(job.kind==='IMAGE'?'/photos':'/videos'),token,{method:'POST',host:job.kind==='IMAGE'?'graph.facebook.com':'graph-video.facebook.com',params:job.kind==='IMAGE'?{url:job.media_url,caption:job.caption,published:true}:{file_url:job.media_url,description:job.caption,published:true}});
    if(!result.id)throw new Fault('META_MUTATION_UNKNOWN',503);
    return this.defer(job,{phase:'CONFIRM',remote_id:result.post_id||result.id,checkpoint:{video_id:job.kind==='VIDEO'?result.id:null}},1);
   }
   if(job.phase==='WAIT_CONTAINER'){
    const result=await this.meta.request(job.checkpoint.container_id,token,{params:{fields:'status_code'}});
    if(result.status_code==='IN_PROGRESS'){
     const polls=(job.checkpoint.polls||0)+1;
     if(polls>=5)throw new Fault('CONTAINER_PROCESSING_TIMEOUT',422);
     return this.defer(job,{checkpoint:{...job.checkpoint,polls}},60);
    }
    if(result.status_code==='PUBLISHED')return this.save(job,{state:'RECONCILIATION_REQUIRED',error_code:'REMOTE_ALREADY_PUBLISHED'});
    if(result.status_code!=='FINISHED')throw new Fault('CONTAINER_'+result.status_code,422);
    await this.save(job,{phase:'PUBLISHING'});mutation=true;
    const published=await this.meta.request(c.external_id+'/media_publish',token,{method:'POST',params:{creation_id:job.checkpoint.container_id}});
    if(!published.id)throw new Fault('META_MUTATION_UNKNOWN',503);
    return this.defer(job,{phase:'CONFIRM',remote_id:published.id},1);
   }
   if(job.phase==='UPLOAD_REEL'){
    mutation=true;await this.meta.uploadReel(job.checkpoint.video_id,token,job.media_url);
    return this.defer(job,{phase:'FINISH_REEL'},1);
   }
   if(job.phase==='FINISH_REEL'){
    await this.save(job,{phase:'PUBLISHING'});mutation=true;
    await this.meta.request(c.external_id+'/video_reels',token,{method:'POST',params:{upload_phase:'finish',video_id:job.checkpoint.video_id,video_state:'PUBLISHED',description:job.caption}});
    return this.defer(job,{phase:'CONFIRM',remote_id:job.checkpoint.video_id},60);
   }
   if(job.phase==='CONFIRM'){
    let result;
    if(c.platform==='instagram')result=await this.meta.request(job.remote_id,token,{params:{fields:'id,permalink,timestamp'}});
    else if(job.kind!=='IMAGE'){
     result=await this.meta.request(job.remote_id,token,{params:{fields:'id,status,permalink_url'}});
     if(result.status?.publishing_phase?.status!=='complete'){
      if(result.status?.video_status==='error')throw new Fault('VIDEO_PROCESSING_FAILED',422);
      return this.defer(job,{},60);
     }
    }else{
     result=await this.meta.request(job.remote_id,token,{params:{fields:'id,permalink_url,is_published'}});
     if(result.is_published!==true)return this.defer(job,{},60);
    }
    const permalink=result.permalink||result.permalink_url;
    if(!result.id||!permalink)return this.defer(job,{error_code:'AWAITING_PLATFORM_CONFIRMATION'},60);
    const parsed=new URL(permalink);
    if(parsed.protocol!=='https:'||!/(^|\.)(instagram|facebook)\.com$/.test(parsed.hostname))throw new Fault('INVALID_PLATFORM_PERMALINK',502);
    const confirmed=await this.db.rpc('confirm',{post:job.id,lease_id:job.lease,link:permalink});
    if(!confirmed?.length)throw new Fault('LEASE_LOST',409);
    Object.assign(job,confirmed[0]);
    return {state:'PUBLISHED',post_id:job.id};
   }
   return this.save(job,{state:'RECONCILIATION_REQUIRED',error_code:'UNKNOWN_PHASE'});
  }catch(error){
   if(error.code==='LEASE_LOST')return {state:'RECONCILIATION_REQUIRED',error_code:'LEASE_LOST'};
   const code=error instanceof Fault?error.code:'INTERNAL_ERROR';
   let state=mutation?'RECONCILIATION_REQUIRED':error.status===401?'AUTH_REQUIRED':error.retry&&job.attempts<12?'RETRY':'FAILED';
   // A definite API rejection is safe to retry; an unknown mutation result is not.
   if(mutation&&error instanceof Fault&&/^META_(190|4|17|32|613|100|200)$/.test(code))state=error.status===401?'AUTH_REQUIRED':error.retry&&job.attempts<12?'RETRY':'FAILED';
   if(code==='META_AUTH_REQUIRED')state='AUTH_REQUIRED';
   const phase=job.phase==='PUBLISHING'&&['RETRY','AUTH_REQUIRED'].includes(state)?(job.checkpoint.container_id?'WAIT_CONTAINER':job.checkpoint.video_id?'FINISH_REEL':'PREPARE'):job.phase;
   const saved=await this.save(job,{state,phase,error_code:code,lease:null,lease_until:null,next_attempt_at:iso(this.clock()+Math.min(3600,60*2**Math.min(job.attempts,6))*1000)});
   await this.db.alert(job.owner_id,job.id+':'+code,code,'Publicação requer atenção. Resultado externo não é presumido.');
   if(state==='AUTH_REQUIRED')await this.db.patch('connections',`id=eq.${job.connection_id}`,{status:'AUTH_REQUIRED',paused:true});
   return saved;
  }
 }
 async maintain(connection){
  const tokens=await this.tokens(connection);
  try{
   const {data}=await this.meta.debug(tokens.page);
   if(!data?.is_valid)throw new Fault('META_AUTH_REQUIRED',401);
   const expiry=data.expires_at?iso(data.expires_at*1000):null;
   const accessExpiry=data.data_access_expires_at?iso(data.data_access_expires_at*1000):null;
   await this.db.patch('connections',`id=eq.${connection.id}`,{checked_at:iso(this.clock()),token_expires_at:expiry,data_access_expires_at:accessExpiry,status:'CONNECTED'});
   const nextExpiry=[data.expires_at,data.data_access_expires_at,tokens.user_expires_at].filter(Boolean).map(Number);
   if(nextExpiry.some(t=>t*1000-this.clock()<7*86400000))await this.db.alert(connection.owner_id,connection.id+':reauth','REAUTHORIZE_SOON','A autorização Meta expira em até 7 dias. Reconecte pela autorização oficial.');
   // Facebook has no general refresh_token grant. Re-derive Page tokens only while the user token is valid.
   if(tokens.user_expires_at*1000>this.clock()+86400000){
    const page=(await this.meta.pages(tokens.user)).find(p=>p.id===connection.page_id);
    if(page?.access_token){
     tokens.page=page.access_token;
     await this.db.patch('tokens',`connection_id=eq.${connection.id}`,{ciphertext:await seal(tokens,this.secrets.growth_encryption_key,connection.owner_id+':'+connection.id),updated_at:iso(this.clock())});
    }
   }
  }catch(e){
   if(e.status===401){await this.db.patch('connections',`id=eq.${connection.id}`,{status:'AUTH_REQUIRED',paused:true,checked_at:iso(this.clock())});await this.db.alert(connection.owner_id,connection.id+':reauth','META_AUTH_REQUIRED','Meta exige nova autorização. Publicações suspensas.');}
   else throw e;
  }
 }
 async metrics(post,connection){
  const tokens=await this.tokens(connection),data={available:{},unavailable:[]};
  if(connection.platform==='instagram'){
   for(const metric of ['reach','views','saved','shares','total_interactions']){
    try{const result=await this.meta.request(post.remote_id+'/insights',tokens.user,{params:{metric}});const value=result.data?.[0]?.values?.[0]?.value;
     if(value===undefined)data.unavailable.push(metric);else data.available[metric]=value;
    }catch(e){if(e.status===401)throw e;data.unavailable.push(metric);}
   }
  }else{
   try{const result=await this.meta.request(post.remote_id,tokens.page,{params:{fields:'reactions.limit(0).summary(true),comments.limit(0).summary(true),shares'}});
    for(const [key,value] of Object.entries({reactions:result.reactions?.summary?.total_count,comments:result.comments?.summary?.total_count,shares:result.shares?.count})){
     if(value===undefined)data.unavailable.push(key);else data.available[key]=value;
    }
   }catch(e){if(e.status===401)throw e;data.unavailable.push('facebook_engagement');}
  }
  await this.db.insert('metrics',{owner_id:post.owner_id,post_id:post.id,data,collected_at:iso(this.clock())},'post_id');return data;
 }
}
