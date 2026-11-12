-- Free GroqCloud tier only: no paid fallback, no key in frontend or source.
begin;
alter table public.vendrex_sales_settings drop constraint vendrex_sales_settings_inference_provider_check;
alter table public.vendrex_sales_settings add constraint vendrex_sales_settings_inference_provider_check
 check(inference_provider in ('GEMMA_API','OLLAMA_SELF_HOST','GROQ_FREE'));
update public.vendrex_sales_settings set inference_provider='GROQ_FREE',inference_model='openai/gpt-oss-20b',
 inference_verified_at=null,inference_quality_verified_at=null,paused=true,mode='TEST'
 where id and inference_provider='OLLAMA_SELF_HOST' and inference_verified_at is null;
create or replace function vendrex_private.sales_secrets() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(name,decrypted_secret),'{}'::jsonb) from vault.decrypted_secrets where name in
 ('sales_meta_app_secret','sales_meta_access_token','sales_meta_verify_token','sales_worker_secret',
  'sales_gemma_api_key','sales_groq_api_key','sales_inference_url','sales_inference_bearer',
  'sales_baileys_auth_key','sales_companion_bearer','sales_dashboard_secret','sales_netlify_owner_id');
$$;
revoke all on function vendrex_private.sales_secrets() from public,anon,authenticated;
grant execute on function vendrex_private.sales_secrets() to service_role;
create or replace function public.vendrex_sales_proof() returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('SALES_WHATSAPP_OPERATIONAL',exists(
 select 1 from public.vendrex_sales_settings s join public.vendrex_sales_instances i on i.id=s.qr_instance
 join public.vendrex_sales_outbox a on true join public.vendrex_sales_outbox b on b.conversation_id=a.conversation_id
 join public.vendrex_sales_messages m on m.id=b.inbound_id
 where s.id and s.inference_quality_verified_at is not null and s.transport_policy='BAILEYS_QR' and not s.paused and i.state='CONNECTED'
 and i.host_kind='PERMANENT_SERVER' and i.permanent_host_verified_at is not null and i.lease_until>clock_timestamp()
 and s.last_heartbeat>now()-interval '2 minutes' and a.inference_real and b.inference_real
 and a.inference_provider in ('GEMMA_API','OLLAMA_SELF_HOST','GROQ_FREE') and b.inference_provider in ('GEMMA_API','OLLAMA_SELF_HOST','GROQ_FREE')
 and a.state in ('DELIVERED','READ') and b.state in ('DELIVERED','READ') and a.worker_boot_id<>b.worker_boot_id
 and b.created_at>a.accepted_at and m.source='BAILEYS_QR_EVENT'),
 'inbound_messages',(select count(*) from public.vendrex_sales_messages where direction='IN'),
 'confirmed_replies',(select count(*) from public.vendrex_sales_outbox where state in ('DELIVERED','READ')),
 'pending_reconciliation',(select count(*) from public.vendrex_sales_outbox where state='RECONCILIATION_REQUIRED'));
$$;
commit;
