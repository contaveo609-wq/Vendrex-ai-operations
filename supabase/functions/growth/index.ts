import {createHandler} from './api.mjs';
// JWT validation is performed in api.mjs. OAuth callback uses single-use, browser-bound state.
// The cron worker has a separate 256-bit secret held in Vault, never a public API key.
Deno.serve(createHandler({url:Deno.env.get('SUPABASE_URL')!,key:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}));
