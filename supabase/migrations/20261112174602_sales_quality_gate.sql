begin;
alter table public.vendrex_sales_settings add column inference_quality_verified_at timestamptz;
create or replace function public.vendrex_sales_proof() returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('SALES_WHATSAPP_OPERATIONAL',exists(
 select 1 from public.vendrex_sales_settings s join public.vendrex_sales_instances i on i.id=s.qr_instance
 join public.vendrex_sales_outbox a on true join public.vendrex_sales_outbox b on b.conversation_id=a.conversation_id
 join public.vendrex_sales_messages m on m.id=b.inbound_id
 where s.id and s.inference_quality_verified_at is not null and s.transport_policy='BAILEYS_QR' and not s.paused and i.state='CONNECTED'
 and i.host_kind='PERMANENT_SERVER' and i.permanent_host_verified_at is not null and i.lease_until>clock_timestamp()
 and s.last_heartbeat>now()-interval '2 minutes' and a.inference_real and b.inference_real
 and a.inference_provider in ('GEMMA_API','OLLAMA_SELF_HOST') and b.inference_provider in ('GEMMA_API','OLLAMA_SELF_HOST')
 and a.state in ('DELIVERED','READ') and b.state in ('DELIVERED','READ') and a.worker_boot_id<>b.worker_boot_id
 and b.created_at>a.accepted_at and m.source='BAILEYS_QR_EVENT'),
 'inbound_messages',(select count(*) from public.vendrex_sales_messages where direction='IN'),
 'confirmed_replies',(select count(*) from public.vendrex_sales_outbox where state in ('DELIVERED','READ')),
 'pending_reconciliation',(select count(*) from public.vendrex_sales_outbox where state='RECONCILIATION_REQUIRED'));
$$;
commit;
