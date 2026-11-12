const methods={health:'GET',status:'GET',behavior:['GET','POST'],control:'POST','test-contacts':'POST'};
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
 try{
  const action=req.query.action;
  if(typeof action!=='string'||!Object.hasOwn(methods,action))return res.status(404).json({error:'NOT_FOUND'});
  if(![methods[action]].flat().includes(req.method))return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY,origin=process.env.PUBLIC_BASE_URL;
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url||'')||!origin)return res.status(503).json({error:'BACKEND_NOT_CONFIGURED'});
  if(req.headers.origin&&req.headers.origin!==origin)return res.status(403).json({error:'ORIGIN_DENIED'});
  if(action!=='health'&&!/^Bearer [A-Za-z0-9._-]+$/.test(req.headers.authorization||''))return res.status(401).json({error:'UNAUTHORIZED'});
  const headers={apikey:key,'Content-Type':'application/json',Origin:origin};if(req.headers.authorization)headers.Authorization=req.headers.authorization;
  const result=await fetch(url+'/functions/v1/sales/'+action,{method:req.method,headers,body:req.method==='GET'?undefined:JSON.stringify(req.body||{}),signal:AbortSignal.timeout(25000)});
  return res.status(result.status).json(await result.json());
 }catch{return res.status(503).json({error:'BACKEND_UNAVAILABLE'});}
}
