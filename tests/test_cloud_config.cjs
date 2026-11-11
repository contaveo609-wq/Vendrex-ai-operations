const assert=require('node:assert/strict');
(async()=>{const {default:handler}=await import('../cloud/api/config.js');
 const original={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_PUBLISHABLE_KEY};
 function call(){const result={};const res={setHeader(){},status(code){result.code=code;return res;},json(body){result.body=body;return result;}};return handler({method:'GET'},res);}
 try{
 process.env.SUPABASE_URL='https://controlled.supabase.co';process.env.SUPABASE_PUBLISHABLE_KEY='sb_secret_never_publish_this';let r=call();assert.equal(r.code,503);assert(!JSON.stringify(r).includes('sb_secret_never_publish_this'));
 process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_controlled_fixture_123456';process.env.SUPABASE_URL='https://controlled.supabase.co.evil.invalid';assert.equal(call().code,503);
 process.env.SUPABASE_URL='https://controlled.supabase.co';assert.equal(call().code,200);
 delete process.env.SUPABASE_PUBLISHABLE_KEY;assert.equal(call().code,503);
 console.log('4 verificações de publicação segura de configuração passaram; sem conexão Supabase.');
 }finally{for(const [name,value] of [['SUPABASE_URL',original.url],['SUPABASE_PUBLISHABLE_KEY',original.key]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}}
})();
