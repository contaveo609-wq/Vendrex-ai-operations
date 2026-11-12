import {Store} from '../../supabase/functions/sales/core.mjs';
import {SalesGateway,safeCode} from './gateway.mjs';
import {adminServer} from './http.mjs';

const {SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,SALES_ADMIN_TOKEN}=process.env;
let gateway,server;
async function stop(code=0){await gateway?.stop().catch(()=>{});server?.closeAllConnections();server?.close();process.exit(code);}
try{
 if(!SUPABASE_URL?.startsWith('https://')||!SUPABASE_SERVICE_ROLE_KEY)throw Error('BACKEND_CREDENTIALS_REQUIRED');
 const db=new Store(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY);
 gateway=new SalesGateway({db,instance:process.env.SALES_INSTANCE||'vendrex-sales',hostKind:process.env.SALES_HOST_KIND||'LOCAL_TEST',ollama:process.env.OLLAMA_INTERNAL_URL||'http://ollama:11434'});
 if(SALES_ADMIN_TOKEN){
  server=adminServer({gateway,db,token:SALES_ADMIN_TOKEN});
  server.listen(Number(process.env.PORT||8787),process.env.SALES_HOST||'127.0.0.1');
 }
 gateway.onFatal=()=>stop(1);await gateway.start();
 process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
 console.log(JSON.stringify({component:'sales-qr',state:'STARTED',host_kind:gateway.hostKind,SALES_WHATSAPP_OPERATIONAL:false}));
}catch(error){console.error(JSON.stringify({component:'sales-qr',error:safeCode(error),SALES_WHATSAPP_OPERATIONAL:false}));await stop(1);}
