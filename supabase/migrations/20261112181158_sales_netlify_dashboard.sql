-- Scoped server-to-server bridge. No Supabase Auth users or operator rows are fabricated.
do $$begin
 if not exists(select 1 from vault.secrets where name='sales_dashboard_secret') then
  perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'sales_dashboard_secret');
 end if;
end$$;
create or replace function vendrex_private.sales_secrets() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(name,decrypted_secret),'{}'::jsonb) from vault.decrypted_secrets where name in
 ('sales_meta_app_secret','sales_meta_access_token','sales_meta_verify_token','sales_worker_secret','sales_gemma_api_key','sales_inference_url','sales_inference_bearer','sales_baileys_auth_key','sales_companion_bearer','sales_dashboard_secret','sales_netlify_owner_id');
$$;
revoke all on function vendrex_private.sales_secrets() from public,anon,authenticated;
grant execute on function vendrex_private.sales_secrets() to service_role;
