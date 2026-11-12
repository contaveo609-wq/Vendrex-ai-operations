import {jidNormalizedUser,normalizeMessageContent,WAMessageStatus,DisconnectReason} from '@whiskeysockets/baileys';
import {Fault} from '../../supabase/functions/sales/core.mjs';

export const directJid=value=>{const jid=typeof value==='string'?jidNormalizedUser(value):'';return /^\d{5,30}@(s\.whatsapp\.net|lid)$/.test(jid)?jid:null;};
export const outboundId=id=>{if(!/^[a-f0-9-]{36}$/i.test(id||''))throw Error('INVALID_OUTBOX_ID');return '3EB0'+id.replaceAll('-','').toUpperCase();};
export const providerId=id=>'qr.'+id;
export const receiptState=status=>({[WAMessageStatus.SERVER_ACK]:'SENT',[WAMessageStatus.DELIVERY_ACK]:'DELIVERED',[WAMessageStatus.READ]:'READ',[WAMessageStatus.PLAYED]:'READ'})[status]||null;
export function connectionPlan(code,attempt){
 if([DisconnectReason.loggedOut,DisconnectReason.forbidden,DisconnectReason.badSession,DisconnectReason.multideviceMismatch,DisconnectReason.connectionReplaced].includes(code))return {state:code===401?'REAUTH_REQUIRED':'ATTENTION_REQUIRED',retry:false};
 return {state:'RECONNECTING',retry:true,delay:code===DisconnectReason.restartRequired?1000:Math.min(60000,1000*2**Math.min(attempt,6))};
}
export function inboundEvent(message,{instance,boot,acceptSince,now=Date.now()}){
 const jid=directJid(message.key?.remoteJid);if(!jid||!message.key?.id)return null;
 const seconds=Number(message.messageTimestamp);if(!Number.isFinite(seconds)||seconds*1000<acceptSince||seconds*1000>now+300000)return null;
 const content=normalizeMessageContent(message.message)||{};
 // Ignore service metadata, reactions, deletions and receipts; unsupported customer media needs a human.
 if(content.protocolMessage||content.reactionMessage||content.senderKeyDistributionMessage||Object.keys(content).length===0)return null;
 const body=content.conversation??content.extendedTextMessage?.text??content.buttonsResponseMessage?.selectedDisplayText??content.listResponseMessage?.title??'';
 const alt=directJid(message.key.remoteJidAlt);
 return {instance,boot,kind:message.key.fromMe?'HUMAN':'INBOUND',jid,alias:alt&&alt!==jid?alt:null,id:message.key.id,
  body:String(body).slice(0,8000),message_type:body?'text':'unsupported',timestamp:seconds,name:String(message.pushName||'').slice(0,200)};
}

export class QRTransport {
 kind='BAILEYS_QR';
 constructor({socket,isConnected,persistOutgoing}){Object.assign(this,{socket,isConnected,persistOutgoing});}
 async send(identity,body,context,{outbox_id}={}){
  const jid=directJid(identity);if(!jid||!this.isConnected())throw new Fault('QR_CONNECTION_REQUIRED',503);
  const id=outboundId(outbox_id);
  // Save the retry payload before the external effect. Retries never create a new message ID.
  await this.persistOutgoing({id,jid,body});
  let result;try{result=await Promise.race([this.socket().sendMessage(jid,{text:body},{messageId:id}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('timeout')),20000);timer.unref();})]);}catch{throw new Fault('QR_SEND_AMBIGUOUS',503);}
  if(result?.key?.id!==id)throw new Fault('QR_SEND_AMBIGUOUS',503);
  return {id:providerId(id),accepted:true,delivered:false};
 }
}
