begin;
create or replace function public.vendrex_sales_qr_payload_put(instance text,boot uuid,raw_id text,jid text,body text) returns void language plpgsql security invoker set search_path='' as $$
begin
 perform vendrex_private.qr_assert(instance,boot);
 if not exists(select 1 from public.vendrex_sales_outbox o join public.vendrex_sales_conversations c on c.id=o.conversation_id
 join public.vendrex_sales_contacts p on p.id=c.contact_id cross join public.vendrex_sales_settings s
 where s.id and not s.paused and s.transport_policy='BAILEYS_QR' and c.revision=o.revision and c.window_until>now()
 and not(p.opted_out or p.blocked or p.human_takeover) and o.provider_id='qr.'||raw_id and o.state='DISPATCHING'
 and o.worker_boot_id=boot and p.identity=$4 and o.body=$5) then raise exception 'QR_DISPATCH_REQUIRED';end if;
 insert into public.vendrex_sales_qr_payloads(provider_id,jid,body) values('qr.'||raw_id,$4,$5) on conflict(provider_id) do nothing;
end $$;
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
commit;
