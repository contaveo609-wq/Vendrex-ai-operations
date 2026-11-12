import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';

export const authorized=(actual,expected)=>{const a=Buffer.from(actual||''),b=Buffer.from(expected||'');return b.length>=32&&a.length===b.length&&timingSafeEqual(a,b);};
export async function readBody(req,max=32000){let size=0,parts=[];for await(const part of req){size+=part.length;if(size>max)throw Error('BODY_TOO_LARGE');parts.push(part);}return Buffer.concat(parts).toString();}
// Authenticated loopback gateway. Ollama is isolated inside the deployment network, with no public port.
export function inferenceServer({token,ollama='http://ollama:11434',fetcher=fetch}){
 if(!token||token.length<32)throw Error('COMPANION_AUTH_REQUIRED');
 return createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!authorized(req.headers.authorization,'Bearer '+token)){res.writeHead(401);return res.end('{"error":"UNAUTHORIZED"}');}
  if(req.method!=='POST'||req.url!=='/api/chat'){res.writeHead(404);return res.end();}
  try{
   const body=JSON.parse(await readBody(req));
   if(!['gemma3:1b','gemma2:2b'].includes(body.model)||body.stream!==false||!Array.isArray(body.messages)||body.messages.length>21){res.writeHead(422);return res.end('{"error":"FREE_LOCAL_MODEL_REQUIRED"}');}
   body.options={temperature:0.2,num_predict:220};
   const response=await fetcher(ollama+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(119000)});
   res.writeHead(response.status,{'Content-Type':'application/json'});res.end(await response.text());
  }catch{res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":"COMPANION_UNAVAILABLE"}');}
 });
}
