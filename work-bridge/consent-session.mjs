import {authorizationRedirect} from './consent-validation.mjs';

export async function completeLogin({client,api,session,authorizationId}){
 if(!session?.access_token)throw new Error('Não foi possível confirmar a sessão de acesso.');
 // The private backend checks both the verified Netlify owner and the real
 // Supabase user. An email-link fragment alone never registers an operator.
 await api('work-enroll',{access_token:session.access_token});
 if(!authorizationId)return {state:'READY'};
 const result=await client.auth.oauth.getAuthorizationDetails(authorizationId);
 if(result.error)throw new Error('A solicitação expirou. Volte ao plugin Vendrex Operations no ChatGPT e escolha Conectar novamente.');
 if(result.data.redirect_url)return {state:'REDIRECT',url:authorizationRedirect(result.data.redirect_url)};
 // Approval is a separate, explicit user action in the consent page.
 return {state:'CONSENT',details:{aplicativo:result.data.client,permissoes:result.data.scope,destino:result.data.redirect_uri}};
}
