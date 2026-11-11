const allowed=new Set(['health','status','start','callback','enqueue','control','disconnect','metrics']);
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
 try{
  const action=req.query.action;
  if(!allowed.has(action))return res.status(404).json({error:'NOT_FOUND'});
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY,origin=process.env.PUBLIC_BASE_URL;
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url||'')||!origin)return res.status(503).json({state:'AUTH_REQUIRED',error:'BACKEND_NOT_CONFIGURED'});
  if(req.headers.origin&&req.headers.origin!==origin)return res.status(403).json({error:'ORIGIN_DENIED'});
  const target=new URL(url+'/functions/v1/growth/'+action);
  if(action==='callback')for(const name of ['state','code','error'])if(typeof req.query[name]==='string')target.searchParams.set(name,req.query[name]);
  const headers={apikey:key,'Content-Type':'application/json',Origin:origin};
  if(req.headers.authorization)headers.Authorization=req.headers.authorization;
  if(action==='callback'&&req.headers.cookie)headers.Cookie=req.headers.cookie.split(';').filter(c=>c.trim().startsWith('__Host-vendrex_growth=')).join(';');
  const result=await fetch(target,{method:req.method,headers,body:req.method==='GET'?undefined:JSON.stringify(req.body||{}),redirect:'manual',signal:AbortSignal.timeout(25000)});
  const cookie=result.headers.get('set-cookie');if(cookie)res.setHeader('Set-Cookie',cookie);
  const location=result.headers.get('location');if(result.status===303&&location?.startsWith(origin+'/#')){res.setHeader('Location',location);return res.status(303).end();}
  return res.status(result.status).json(await result.json());
 }catch{return res.status(503).json({state:'DEGRADED',error:'BACKEND_UNAVAILABLE'});}
}
