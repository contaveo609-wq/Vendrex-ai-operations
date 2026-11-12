/* Bounded real open-model generation. Does not constitute a WhatsApp or remote-host proof. */
import {writeFile} from 'node:fs/promises';
import {SalesInferenceEngine} from '../supabase/functions/sales/core.mjs';
const engine=new SalesInferenceEngine({provider:'OLLAMA_SELF_HOST',endpoint:'http://127.0.0.1:11434',model:'gemma3:1b',allowLocal:true});
const history=[{direction:'IN',body:'Recebo pedidos pelo WhatsApp, mas minha equipe perde mensagens.'},
{direction:'OUT',body:'Quantos pedidos chegam por dia e como sua equipe registra cada pedido?'},
{direction:'IN',body:'São cerca de 30 pedidos por dia. Duas pessoas anotam em cadernos separados e alguns pedidos não chegam à cozinha.'}];
const result=await engine.generate(history);
if(!result.real||!result.body||result.remote)throw new Error('Inference validation failed');
const report={state:'REAL_INFERENCE_TESTED',whatsapp_conversation_proven:false,permanent_remote_backend:false,provider:'existing local Ollama',model:result.model,history:history.map(h=>({role:h.direction,body:h.body})),response:result.body,usage:result.usage};
const target=process.argv[2];if(target)await writeFile(target,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
