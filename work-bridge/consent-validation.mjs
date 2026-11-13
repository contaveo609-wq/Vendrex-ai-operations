// Supabase authorization IDs are opaque URL-safe strings, not database UUIDs.
export function authorizationRequest(href){
 const ids=new URL(href).searchParams.getAll('authorization_id');
 if(!ids.length)return null;
 if(ids.length!==1||!/^[A-Za-z0-9_-]{16,256}$/.test(ids[0]))throw new Error('Solicitação inválida. Reabra a conexão do plugin no ChatGPT Work.');
 return ids[0];
}
export function authorizationRedirect(target){
 const url=new URL(target);
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||!['chatgpt.com','chat.openai.com'].includes(url.hostname))throw new Error('Destino de autorização não permitido.');
 return url.href;
}

// Email sessions stay in memory. Only the pending OAuth request ID is carried
// between tabs; it grants no access without an authenticated user and consent.
const pendingKey='vendrex.pending-oauth';
export function rememberAuthorization(storage,id,now=Date.now()){
 if(!id)return;
 try{
  const previous=JSON.parse(storage.getItem(pendingKey)||'null');
  if(previous?.id===id&&previous.expires>now)return;
  storage.setItem(pendingKey,JSON.stringify({id,expires:now+8*60*1000}));
 }catch{}
}
export function takeAuthorization(storage,now=Date.now()){
 try{
  const pending=JSON.parse(storage.getItem(pendingKey)||'null');storage.removeItem(pendingKey);
  if(!pending||typeof pending.expires!=='number'||!Number.isFinite(pending.expires)||pending.expires<=now||pending.expires>now+8*60*1000)return null;
  return authorizationRequest('https://local.invalid/?authorization_id='+encodeURIComponent(pending.id));
 }catch{return null;}
}
export function emailSession(href){
 const params=new URLSearchParams(new URL(href).hash.slice(1));
 if(!['magiclink','signup'].includes(params.get('type')))return null;
 if(['access_token','refresh_token','type'].some(key=>params.getAll(key).length!==1))return null;
 const access_token=params.get('access_token'),refresh_token=params.get('refresh_token');
 if(!/^[A-Za-z0-9._-]{30,8000}$/.test(access_token||'')||!/^[A-Za-z0-9_-]{20,2048}$/.test(refresh_token||''))return null;
 return {access_token,refresh_token};
}
export function emailReturnDestination(href){
 const url=new URL(href),params=new URLSearchParams(url.hash.slice(1));
 if(params.has('error_code'))return url.origin+'/work-consent.html#error_code=EMAIL_LINK_REJECTED';
 if(!emailSession(href))return null;
 return url.origin+'/work-consent.html'+url.hash;
}
