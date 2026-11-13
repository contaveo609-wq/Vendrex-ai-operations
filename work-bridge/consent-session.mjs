import {authorizationRedirect,emailVerificationLink} from './consent-validation.mjs';

export async function verifyEmailLink({client,link,projectURL}){
 const parameters=emailVerificationLink(link,projectURL);
 const {data,error}=await client.auth.verifyOtp(parameters);
 if(error||!data?.session)throw new Error('Este link já foi usado ou expirou. Solicite outro e copie seu endereço sem abri-lo.');
 return data.session;
}

export async function completeLogin({client,api,session,authorizationId}){
 if(!session?.access_token)throw new Error('Não foi possível confirmar a sessão de acesso.');
 // The private backend checks both the verified Netlify owner and the real
 // Supabase user. An email-link fragment alone never registers an operator.
 await api('work-enroll',{access_token:session.access_token});
 if(!authorizationId)return {state:'READY'};
 const result=await client.auth.oauth.getAuthorizationDetails(authorizationId);
 if(result.error)return {state:'READY',reauthorization_required:true};
 if(result.data.redirect_url)return {state:'REDIRECT',url:authorizationRedirect(result.data.redirect_url)};
 // Approval is a separate, explicit user action in the consent page.
 return {state:'CONSENT',details:{aplicativo:result.data.client,permissoes:result.data.scope,destino:result.data.redirect_uri}};
}
