export default function handler(req,res){
  const configured=Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_PUBLISHABLE_KEY);
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({version:'2.4.0',dashboard:'IMPLEMENTED',database:configured?'CONFIGURED_NOT_VERIFIED':'BLOCKED',growth:'CHECK_AUTHENTICATED_META_STATUS',codex_remote_executor:'NOT_IMPLEMENTED',whatsapp:'BLOCKED',note:'O worker Growth usa Supabase Cron. Codex local ainda exige executor autorizado.'});
}
