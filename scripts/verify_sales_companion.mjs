/* Real, bounded, authenticated inference on an existing Ollama installation. No WhatsApp send. */
import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {inferenceServer} from '../sales-gateway/src/inference.mjs';
import {SalesInferenceEngine} from '../supabase/functions/sales/core.mjs';
const token=randomBytes(32).toString('hex'),server=inferenceServer({token,ollama:'http://127.0.0.1:11434'});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const endpoint='http://127.0.0.1:'+server.address().port;
try{
 const unauthorized=await fetch(endpoint+'/api/chat',{method:'POST',body:'{}'});
 if(unauthorized.status!==401)throw Error('AUTHENTICATION_NOT_ENFORCED');
 const engine=new SalesInferenceEngine({provider:'OLLAMA_SELF_HOST',model:process.env.SALES_TEST_MODEL||'gemma3:1b',endpoint,bearer:token,allowLocal:true});
 const history=[{direction:'IN',body:'Tenho uma hamburgueria e perco pedidos que chegam pelo WhatsApp.'},
 {direction:'OUT',body:'Quantos pedidos chegam por dia e como vocês registram os pedidos?'},
 {direction:'IN',body:'São 40 pedidos por dia. Duas pessoas anotam em cadernos separados e às vezes a cozinha não recebe o pedido.'}];
 const began=performance.now(),result=await engine.generate(history);
 if(!result.real||result.remote||!result.body)throw Error('REAL_LOCAL_INFERENCE_NOT_PROVEN');
 const report={state:'REAL_MODEL_WITH_AUTHENTICATED_BACKEND',tested_at:new Date().toISOString(),model:result.model,
  authorization_rejected_without_token:unauthorized.status===401,elapsed_ms:Math.round(performance.now()-began),
  history,response:result.body,usage:result.usage,whatsapp_conversation_proven:false,permanent_remote_backend:false};
 if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
