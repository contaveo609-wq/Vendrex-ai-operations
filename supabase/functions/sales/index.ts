import {createHandler} from './api.mjs';
// Meta HMAC, separate cron secret, and validated operator JWTs authenticate each route.
Deno.serve(createHandler({url:Deno.env.get('SUPABASE_URL')!,key:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}));
