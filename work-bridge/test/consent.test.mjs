import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizationRequest,authorizationRedirect} from '../consent-validation.mjs';

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
