import {randomUUID} from 'node:crypto';
import makeWASocket,{makeCacheableSignalKeyStore,jidNormalizedUser} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import {Fault,SalesWorker,SalesInferenceEngine} from '../../supabase/functions/sales/core.mjs';
import {AuthCipher,databaseAuth} from './auth.mjs';
import {connectionPlan,inboundEvent,providerId,receiptState,QRTransport} from './events.mjs';
import {inferenceServer} from './inference.mjs';

const logger=pino({level:'silent'}); // Library logs can contain cryptographic material or customer data.
export const safeCode=e=>/^[A-Z_]{5,80}$/.test(e?.code||e?.message||'')?(e.code||e.message):'GATEWAY_FAILURE';
export class SalesGateway {
 constructor({db,instance='vendrex-sales',hostKind='LOCAL_TEST',ollama='http://ollama:11434',socketFactory=makeWASocket,boot=randomUUID()}){
  if(!/^[a-z0-9-]{3,60}$/.test(instance)||!['LOCAL_TEST','PERMANENT_SERVER'].includes(hostKind))throw Error('INVALID_GATEWAY_CONFIG');
  Object.assign(this,{db,instance,hostKind,ollama,socketFactory,boot});this.status='CONNECTING';this.connected=false;this.stopped=false;this.attempt=0;this.sequence=Promise.resolve();this.qr=null;this.qrCount=0;
 }
 async start(){
  if(!await this.db.rpc('qr_lease',{instance:this.instance,boot:this.boot,host_kind:this.hostKind}))throw Error('QR_INSTANCE_ALREADY_RUNNING');
  this.secrets=await this.db.rpc('secrets');this.cipher=new AuthCipher(this.secrets.sales_baileys_auth_key);
  await this.heartbeat();
  this.auth=await databaseAuth({db:this.db,instance:this.instance,boot:this.boot,cipher:this.cipher});
  const [row]=await this.db.rows('instances','id=eq.'+this.instance);this.acceptSince=Date.parse(row.accept_since)-2000;
  this.transport=new QRTransport({socket:()=>this.socket,isConnected:()=>this.connected&&!this.stopped,
   persistOutgoing:({id,jid,body})=>this.db.rpc('qr_payload_put',{instance:this.instance,boot:this.boot,raw_id:id,jid,body})});
  const [settings]=await this.db.rows('settings','id=eq.true');let engine;
  if(settings.inference_provider==='OLLAMA_SELF_HOST'&&['gemma3:1b','gemma2:2b'].includes(settings.inference_model)){
   this.inference=inferenceServer({token:this.secrets.sales_companion_bearer,ollama:this.ollama});
   await new Promise((resolve,reject)=>{this.inference.once('error',reject);this.inference.listen(11435,'127.0.0.1',resolve);});
   engine=new SalesInferenceEngine({provider:'OLLAMA_SELF_HOST',model:settings.inference_model,endpoint:'http://127.0.0.1:11435',bearer:this.secrets.sales_companion_bearer,trustedCompanion:this.hostKind==='PERMANENT_SERVER',allowLocal:this.hostKind==='LOCAL_TEST'});
  }
  this.worker=new SalesWorker({store:this.db,secrets:this.secrets,bootId:this.boot,engine,transport:this.transport,transportPolicy:'BAILEYS_QR'});
  this.heartbeatTimer=setInterval(()=>{if(this.heartbeatBusy)return;this.heartbeatBusy=true;this.heartbeat().catch(e=>this.fail(e)).finally(()=>this.heartbeatBusy=false);},15000);
  this.tickTimer=setInterval(()=>{if(this.tickBusy||!this.connected||this.hostKind!=='PERMANENT_SERVER'||this.stopped)return;
   this.tickBusy=true;this.tick().catch(e=>this.fail(e)).finally(()=>this.tickBusy=false);},1000);
  await this.connect();
 }
 async heartbeat(){
  await this.db.rpc('qr_heartbeat',{instance:this.instance,boot:this.boot,status:this.status,owner_jid:this.connected?jidNormalizedUser(this.socket?.user?.id):null});
  this.lastHeartbeat=Date.now();
 }
 async connect(){
  if(this.stopped)return;this.status='CONNECTING';this.connected=false;this.qr=null;
  this.qrCount=0;await this.db.rpc('pairing_put',{instance:this.instance,boot:this.boot,png:null});
  const socket=this.socketFactory({auth:{creds:this.auth.state.creds,keys:makeCacheableSignalKeyStore(this.auth.state.keys,logger)},logger,
   markOnlineOnConnect:false,syncFullHistory:false,shouldSyncHistoryMessage:()=>false,enableAutoSessionRecreation:false,
   getMessage:async key=>{if(!key.id)return undefined;const rows=await this.db.rows('qr_payloads','provider_id=eq.'+encodeURIComponent(providerId(key.id))+'&limit=1');
    const row=rows[0];return row&&jidNormalizedUser(key.remoteJid)===row.jid?{conversation:row.body}:undefined;}});
  this.socket=socket;
  socket.ev.process(events=>{this.sequence=this.sequence.then(()=>this.process(events,socket)).catch(e=>this.fail(e));return this.sequence;});
 }
 async process(events,socket){
  if(this.stopped||socket!==this.socket)return;
  if(events['creds.update']){Object.assign(this.auth.state.creds,events['creds.update']);await this.auth.saveCreds();}
  const update=events['connection.update'];
  if(update?.qr){
   // Baileys rc14 gives the first QR 60s and subsequent QRs 20s. Expire slightly sooner.
   const ttl=this.qrCount++===0?55000:15000;
   this.status='WAITING_QR';this.qr={image:await QRCode.toBuffer(update.qr,{width:360,margin:3}),expires:Date.now()+ttl};await this.heartbeat();
   await this.db.rpc('pairing_put',{instance:this.instance,boot:this.boot,png:'data:image/png;base64,'+this.qr.image.toString('base64'),expires_at:new Date(this.qr.expires).toISOString()});
  }
  if(update?.connection==='open'){
   this.status='CONNECTED';this.connected=true;this.qr=null;this.attempt=0;await this.auth.saveCreds();await this.heartbeat();
   await this.db.rpc('pairing_put',{instance:this.instance,boot:this.boot,png:null});
   const [row]=await this.db.rows('instances','id=eq.'+this.instance);this.acceptSince=Date.parse(row.accept_since)-2000;
  }
  if(update?.connection==='close'){
   this.connected=false;this.qr=null;const plan=connectionPlan(update.lastDisconnect?.error?.output?.statusCode,this.attempt++);this.status=plan.state;await this.heartbeat();
   await this.db.rpc('pairing_put',{instance:this.instance,boot:this.boot,png:null});
   if(plan.retry)this.reconnectTimer=setTimeout(()=>this.connect().catch(e=>this.fail(e)),plan.delay);
   else{await this.db.rpc('control',{action:'pause'});this.log(plan.state);}
  }
  const upsert=events['messages.upsert'];
  if(upsert&&['notify','append'].includes(upsert.type))for(const message of upsert.messages){
   const payload=inboundEvent(message,{instance:this.instance,boot:this.boot,acceptSince:this.acceptSince});
   if(payload)await this.db.rpc('qr_ingest',{payload});
  }
  for(const {key,update:change} of events['messages.update']||[]){const state=receiptState(change.status);if(state&&key.fromMe)await this.receipt(key.id,state);}
  for(const {key,receipt} of events['message-receipt.update']||[]){
   if(key.fromMe&&(receipt.readTimestamp||receipt.playedTimestamp))await this.receipt(key.id,'READ');
   else if(key.fromMe&&receipt.receiptTimestamp)await this.receipt(key.id,'DELIVERED');
  }
 }
 receipt(id,status){return this.db.rpc('qr_receipt',{instance:this.instance,boot:this.boot,raw_id:id,status,platform_time:Math.floor(Date.now()/1000)});}
 async tick(){
  if(Date.now()-this.lastHeartbeat>25000)throw new Fault('QR_HEARTBEAT_STALE',503);
  if(!await this.db.rpc('qr_due',{instance:this.instance,boot:this.boot}))return;
  const result=await this.worker.tick();this.log(result.state);
 }
 log(code){console.log(JSON.stringify({component:'sales-qr',code,boot:this.boot}));}
 async fail(error){if(this.stopped)return;this.lastError=safeCode(error);this.log(this.lastError);await this.stop().catch(()=>{});this.onFatal?.();}
 async stop(){
  this.stopped=true;this.connected=false;this.qr=null;clearInterval(this.heartbeatTimer);clearInterval(this.tickTimer);clearTimeout(this.reconnectTimer);
  // Closing the socket keeps the durable session; logging out would revoke it.
  this.socket?.end(new Error('GATEWAY_STOPPED'));await this.auth?.flush();
  if(this.inference)await new Promise(resolve=>this.inference.close(resolve));
  await this.db.rpc('pairing_put',{instance:this.instance,boot:this.boot,png:null}).catch(()=>{});
  await this.db.rpc('qr_release',{instance:this.instance,boot:this.boot});this.status='STOPPED';
 }
}
