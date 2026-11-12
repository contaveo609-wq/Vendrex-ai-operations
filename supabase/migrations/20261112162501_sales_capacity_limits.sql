-- Configurable daily ceilings for the owner's 40-50 new prospects plus ongoing replies.
-- These are application budgets, not a claimed WhatsApp quota or ban guarantee.
begin;
alter table public.vendrex_sales_settings add column if not exists inference_daily_limit integer not null default 500 check(inference_daily_limit between 1 and 2000);
alter table public.vendrex_sales_settings add column if not exists worker_daily_limit integer not null default 1000 check(worker_daily_limit between 1 and 4000);


create or replace function public.vendrex_sales_claim(boot uuid) returns setof public.vendrex_sales_outbox
language plpgsql security invoker set search_path='' as $$
declare s public.vendrex_sales_settings;
begin
 select * into s from public.vendrex_sales_settings where id for update;
 if s.transport_policy not in ('META_CLOUD_API','BAILEYS_QR') then return; end if;
 if s.transport_policy='BAILEYS_QR' and not exists(select 1 from public.vendrex_sales_instances i where i.id=s.qr_instance and i.state='CONNECTED' and i.lease_owner=boot and i.lease_until>clock_timestamp()) then return;end if;
 update public.vendrex_sales_settings set last_heartbeat=now(),last_boot_id=boot,
 worker_day=current_date,worker_calls=case when worker_day=current_date then worker_calls+1 else 1 end,
 inference_calls=case when worker_day=current_date then inference_calls else 0 end where id;
 update public.vendrex_sales_outbox set state='RECONCILIATION_REQUIRED',error_code='SEND_LEASE_EXPIRED' where state='DISPATCHING' and lease_until<now();
 update public.vendrex_sales_outbox set state=case when attempts<3 then 'RETRY' else 'WAITING_HUMAN' end,
 next_attempt_at=now()+interval '5 seconds',lease=null where state='PROCESSING' and lease_until<now();
 if s.paused or (s.worker_day=current_date and s.worker_calls>=s.worker_daily_limit) then return; end if;
 return query update public.vendrex_sales_outbox o set state='PROCESSING',lease=gen_random_uuid(),lease_until=now()+case when s.transport_policy='BAILEYS_QR' then interval '180 seconds' else interval '90 seconds' end,
 attempts=attempts+1,worker_boot_id=boot where o.id=(
 select j.id from public.vendrex_sales_outbox j
 join public.vendrex_sales_conversations c on c.id=j.conversation_id
 join public.vendrex_sales_contacts p on p.id=c.contact_id
 where exists(select 1 from public.vendrex_sales_messages m where m.id=j.inbound_id and m.source=case when s.transport_policy='BAILEYS_QR' then 'BAILEYS_QR_EVENT' else 'META_WHATSAPP_WEBHOOK' end) and j.state in ('QUEUED','RETRY','READY') and j.next_attempt_at<=now() and c.debounce_until<=now()
 and c.window_until>now() and j.revision=c.revision and not(p.opted_out or p.blocked or p.human_takeover)
 and (s.mode='LIVE' or p.identity=any(s.test_recipients) or p.wa_id=any(s.test_recipients))
 order by j.next_attempt_at for update of j skip locked limit 1) returning o.*;
end $$;

create or replace function public.vendrex_sales_ready(job uuid,lease_id uuid,reply text,provider text,model text)
returns setof public.vendrex_sales_outbox language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.vendrex_sales_settings where id and transport_policy in ('META_CLOUD_API','BAILEYS_QR') and not paused) then raise exception 'OWNER_REQUIRES_NO_WHATSAPP_API'; end if;
 if length(reply) not between 1 and 1500 then raise exception 'INVALID_REPLY'; end if;
 update public.vendrex_sales_settings set inference_calls=inference_calls+1 where id and inference_calls<inference_daily_limit;
 if not found then raise exception 'INFERENCE_DAILY_LIMIT'; end if;
 return query update public.vendrex_sales_outbox j set body=reply,phase='SEND',inference_provider=provider,
 inference_model=model,inference_real=true where id=job and lease=lease_id and state='PROCESSING' and lease_until>now() and exists(select 1 from public.vendrex_sales_settings s where s.id and (s.transport_policy='META_CLOUD_API' or exists(select 1 from public.vendrex_sales_instances i where i.id=s.qr_instance and i.lease_owner=j.worker_boot_id and i.lease_until>clock_timestamp())))
 and exists(select 1 from public.vendrex_sales_conversations c join public.vendrex_sales_contacts p on p.id=c.contact_id
 where c.id=j.conversation_id and c.revision=j.revision and not(p.opted_out or p.blocked or p.human_takeover)) returning j.*;
end $$;

commit;
