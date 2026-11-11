export default function handler(req,res){
  const configured=Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_PUBLISHABLE_KEY);
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({version:'2.2.0',dashboard:'IMPLEMENTED',database:configured?'CONFIGURED_NOT_VERIFIED':'BLOCKED',codex_remote_executor:'NOT_IMPLEMENTED',whatsapp:'BLOCKED',note:'Funções serverless não executam o Codex local permanentemente.'});
}
