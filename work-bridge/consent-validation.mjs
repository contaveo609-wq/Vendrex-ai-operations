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
