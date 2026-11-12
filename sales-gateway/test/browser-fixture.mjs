// Controlled UI test backend. Never connects WhatsApp or a production database.
import {adminServer} from '../src/http.mjs';
import {DEFAULT_BEHAVIOR} from '../../supabase/functions/sales/behavior.mjs';
let behavior={...DEFAULT_BEHAVIOR},revision=1;
const settings={paused:true,mode:'TEST',last_error:'CONTROLLED_BROWSER_FIXTURE',inference_daily_limit:500,worker_daily_limit:1000,inference_calls:0};
const db={rows:async(table)=>table==='settings'?[{...settings,bot_behavior:behavior,behavior_revision:revision}]:[],rpc:async(name,body)=>{
 if(name==='proof')return {SALES_WHATSAPP_OPERATIONAL:false};
 if(name==='behavior_set'){behavior=body.behavior;revision++;return {saved:true,behavior_revision:revision};}
 throw Error('UNSUPPORTED_FIXTURE_CALL');
}};
const server=adminServer({gateway:{status:'HOST_REQUIRED',hostKind:'LOCAL_TEST'},db,token:'CONTROLLED_BROWSER_TOKEN_'.repeat(3)});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({port:server.address().port})));
process.on('SIGTERM',()=>{server.closeAllConnections();server.close();});
