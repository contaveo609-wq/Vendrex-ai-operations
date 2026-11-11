export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const url=process.env.SUPABASE_URL;
  const publishableKey=process.env.SUPABASE_PUBLISHABLE_KEY;
  res.setHeader('Cache-Control','no-store');
  if(!url||!publishableKey)return res.status(503).json({state:'AUTH_REQUIRED',error:'Supabase não configurado. Nenhum dado de demonstração é apresentado como real.'});
  // Fail closed: a privileged key accidentally configured here must never reach a browser.
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)||!/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(publishableKey)){
    return res.status(503).json({state:'BLOCKED',error:'Use URL oficial e chave sb_publishable_. Chaves secretas/privilegiadas não são publicadas.'});
  }
  return res.status(200).json({url,publishableKey});
}
