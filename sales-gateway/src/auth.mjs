import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {BufferJSON,initAuthCreds,proto} from '@whiskeysockets/baileys';

// Each credential/key entry is encrypted separately. AAD binds it to its instance and key.
export class AuthCipher {
 constructor(hex){if(!/^[a-f0-9]{64}$/i.test(hex||''))throw Error('AUTH_ENCRYPTION_KEY_REQUIRED');this.key=Buffer.from(hex,'hex');}
 seal(value,aad){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);cipher.setAAD(Buffer.from(aad));
  const data=Buffer.concat([cipher.update(JSON.stringify(value,BufferJSON.replacer),'utf8'),cipher.final()]);
  return {v:1,iv:iv.toString('base64'),data:data.toString('base64'),tag:cipher.getAuthTag().toString('base64')};}
 open(box,aad){if(box?.v!==1)throw Error('AUTH_FORMAT_INVALID');const decipher=createDecipheriv('aes-256-gcm',this.key,Buffer.from(box.iv,'base64'));
  decipher.setAAD(Buffer.from(aad));decipher.setAuthTag(Buffer.from(box.tag,'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(box.data,'base64')),decipher.final()]).toString('utf8'),BufferJSON.reviver);}
}

export async function databaseAuth({db,instance,boot,cipher}){
 const read=async(category,ids)=>{
  const rows=await db.rpc('qr_auth_get',{instance,boot,category,ids});const result={};
  for(const row of rows){let value=cipher.open(row.box,instance+':'+category+':'+row.key_id);
   if(category==='app-state-sync-key'&&value)value=proto.Message.AppStateSyncKeyData.fromObject(value);
   result[row.key_id]=value;
  }return result;
 };
 // Serialize writes, and do not resolve keys.set before the database commits.
 let pending=Promise.resolve();
 const write=entries=>{const operation=pending.then(()=>db.rpc('qr_auth_put',{instance,boot,entries}));pending=operation.catch(()=>{});return operation;};
 const boxEntry=(category,key_id,value)=>({category,key_id,box:value==null?null:cipher.seal(value,instance+':'+category+':'+key_id)});
 const saved=await read('creds',['main']);const creds=saved.main||initAuthCreds();
 if(!saved.main)await write([boxEntry('creds','main',creds)]);
 return {state:{creds,keys:{get:read,set:async data=>{
  const entries=[];for(const [category,values] of Object.entries(data))for(const [id,value] of Object.entries(values))entries.push(boxEntry(category,id,value));
  if(entries.length)await write(entries);
 }}},saveCreds:()=>write([boxEntry('creds','main',creds)]),flush:()=>pending};
}
