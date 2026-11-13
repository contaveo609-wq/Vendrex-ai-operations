import {Store} from '../sales/core.mjs';
import {WorkBridge,WorkError} from '../../../work-bridge/core.mjs';
import {handleMCP} from '../../../work-bridge/protocol.mjs';

const url=Deno.env.get('SUPABASE_URL')!;
const db=new Store(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const workDB={call:(...args:any[])=>db.call(...args),rpc:(name:string,body={})=>db.call('rpc/vendrex_work_'+name,{method:'POST',body})};
const bridge=new WorkBridge({db:workDB,url,publishableKey:Deno.env.get('SUPABASE_ANON_KEY')!});
const json=(data:unknown,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
Deno.serve(async request=>{
 const route=new URL(request.url).pathname.split('/').pop();
 try{
  if(route==='resource'&&request.method==='GET')return json({resource:bridge.resource(),authorization_servers:[url+'/auth/v1'],bearer_methods_supported:['header']});
  if(route==='health'&&request.method==='GET')return json({component:'VENDREX_WORK_BRIDGE',customer_sending_enabled:false,media_ingestion_enabled:false,oauth_issuer:url+'/auth/v1'});
  if(route==='dispatch'&&request.method==='POST')return json(await bridge.dispatch(request));
  if(route!=='mcp')return json({error:'NOT_FOUND'},404);
  const user=await bridge.operator(request);
  return await handleMCP(request,bridge,user);
 }catch(e){
  const code=e instanceof WorkError?e.code:'WORK_REQUEST_REJECTED',status=e instanceof WorkError?e.status:503;
  console.error(JSON.stringify({component:'work-bridge',code}));
  return json({error:code},status,status===401?{'WWW-Authenticate':bridge.challenge()}:{});
 }
});
