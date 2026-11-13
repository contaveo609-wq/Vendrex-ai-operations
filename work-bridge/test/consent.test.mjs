import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizationRequest,authorizationRedirect,emailSession,emailReturnDestination,rememberAuthorization,takeAuthorization} from '../consent-validation.mjs';
import {completeLogin} from '../consent-session.mjs';

test('OAuth consent accepts opaque Supabase authorization IDs and account setup without an ID',()=>{
 const page='https://private.example.invalid/work-consent.html';
 assert.equal(authorizationRequest(page),null);
 // Regression: real authorization requests use 32 URL-safe characters, not UUIDs.
 const opaque='abcdefghijklmnopqrstuvwxyz234567';
 assert.equal(authorizationRequest(page+'?authorization_id='+opaque),opaque);
 const uuid='11111111-1111-4111-8111-111111111111';
 assert.equal(authorizationRequest(page+'?authorization_id='+uuid),uuid);
 for(const value of ['', 'short', '../authorizations', 'a'.repeat(257), 'x%2Fy'.repeat(16)])assert.throws(()=>authorizationRequest(page+'?authorization_id='+value),/Solicitação inválida/);
 assert.throws(()=>authorizationRequest(page+'?authorization_id='+opaque+'&authorization_id='+opaque));
});

test('OAuth consent can return a code only to an exact HTTPS ChatGPT callback',()=>{
 const target='https://chatgpt.com/connector_platform/oauth_redirect?code=fixture&state=fixture';
 assert.equal(authorizationRedirect(target),target);
 for(const value of ['https://chatgpt.com.evil.test/x','https://chatgpt.com:8443/x','https://evil@chatgpt.com/x','http://chatgpt.com/x','https://chatgpt.com/x#token','https://127.0.0.1/x','javascript:alert(1)'])assert.throws(()=>authorizationRedirect(value));
});

test('email callback transfers tokens only to the same origin and rejects malformed sessions',()=>{
 const base='https://private.example.invalid/',session={access_token:'a'.repeat(50),refresh_token:'r'.repeat(30)};
 const fragment='#'+new URLSearchParams({...session,type:'magiclink'});
 assert.deepEqual(emailSession(base+fragment),session);
 assert.equal(emailReturnDestination(base+fragment),'https://private.example.invalid/work-consent.html'+fragment);
 for(const suffix of [fragment+'&access_token=duplicate',fragment.replace('type=magiclink','type=recovery'),fragment.replace('r'.repeat(30),'short')])assert.equal(emailSession(base+suffix),null);
 assert.equal(emailReturnDestination(base+'#error_code=otp_expired&error_description=private-text'),'https://private.example.invalid/work-consent.html#error_code=EMAIL_LINK_REJECTED');
 assert.equal(emailReturnDestination(base+'#unrelated'),null);
});

test('cross-tab OAuth context contains only a short-lived request ID and is consumed once',()=>{
 const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const id='abcdefghijklmnopqrstuvwxyz234567';
 rememberAuthorization(storage,id,1000);const saved=JSON.parse([...values.values()][0]);
 assert.deepEqual(Object.keys(saved).sort(),['expires','id']);
 rememberAuthorization(storage,id,2000);assert.equal(JSON.parse([...values.values()][0]).expires,saved.expires);
 assert.equal(takeAuthorization(storage,3000),id);assert.equal(takeAuthorization(storage,3000),null);
 rememberAuthorization(storage,id,1000);assert.equal(takeAuthorization(storage,500000),null);
});

test('email login verifies operator enrollment before reading OAuth details and never approves consent automatically',async()=>{
 const calls=[],client={auth:{oauth:{getAuthorizationDetails:async id=>{calls.push('details');return {data:{client:{name:'ChatGPT'},scope:'offline_access',redirect_uri:'https://chatgpt.com/callback'}};},approveAuthorization:()=>assert.fail('automatic approval')}}};
 const result=await completeLogin({client,api:async action=>calls.push(action),session:{access_token:'controlled-fixture'},authorizationId:'opaque-fixture'});
 assert.deepEqual(calls,['work-enroll','details']);assert.equal(result.state,'CONSENT');assert.equal(result.details.permissoes,'offline_access');
 let accessed=false;
 await assert.rejects(completeLogin({client:{auth:{oauth:{getAuthorizationDetails:()=>{accessed=true;}}}},api:async()=>{throw Error('OWNER_MISMATCH');},session:{access_token:'fixture'},authorizationId:'fixture'}),/OWNER_MISMATCH/);
 assert.equal(accessed,false);
});

test('email login without an OAuth request prepares the operator and grants nothing to ChatGPT',async()=>{
 assert.deepEqual(await completeLogin({client:{},api:async()=>{},session:{access_token:'fixture'},authorizationId:null}),{state:'READY'});
 await assert.rejects(completeLogin({client:{},api:()=>assert.fail('missing session was enrolled'),session:null,authorizationId:null}),/sessão/);
});
