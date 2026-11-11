export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const url=process.env.SUPABASE_URL;
  const publishableKey=process.env.SUPABASE_PUBLISHABLE_KEY;
  res.setHeader('Cache-Control','no-store');
  if(!url||!publishableKey)return res.status(503).json({state:'AUTH_REQUIRED',error:'Supabase não configurado. Nenhum dado de demonstração é apresentado como real.'});
  return res.status(200).json({url,publishableKey});
}
