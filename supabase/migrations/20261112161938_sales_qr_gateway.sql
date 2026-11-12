-- Owner explicitly authorized an unpaid unofficial QR connector on 2026-11-12.
-- No Cloud API is re-enabled, no paid resource is provisioned, and sending starts paused.
begin;
alter table public.vendrex_sales_settings drop constraint vendrex_sales_settings_transport_policy_check;
alter table public.vendrex_sales_settings add constraint vendrex_sales_settings_transport_policy_check
 check(transport_policy in ('NO_WHATSAPP_API','META_CLOUD_API','BAILEYS_QR'));
alter table public.vendrex_sales_settings drop constraint sales_no_api_requires_pause;
alter table public.vendrex_sales_settings add constraint sales_no_api_requires_pause check(transport_policy<>'NO_WHATSAPP_API' or paused);
alter table public.vendrex_sales_settings add column qr_instance text not null default 'vendrex-sales';
alter table public.vendrex_sales_settings add column inference_daily_limit integer not null default 500 check(inference_daily_limit between 1 and 2000);
alter table public.vendrex_sales_settings add column worker_daily_limit integer not null default 1000 check(worker_daily_limit between 1 and 4000);
update public.vendrex_sales_settings set transport_policy='BAILEYS_QR',paused=true,mode='TEST',
 inference_provider='OLLAMA_SELF_HOST',inference_model='gemma3:1b',last_error='QR_GATEWAY_HOST_REQUIRED' where id;

create table public.vendrex_sales_instances(
 id text primary key, state text not null default 'HOST_REQUIRED',owner_jid text,
 lease_owner uuid,lease_until timestamptz,accept_since timestamptz not null default now(),
 first_connected_at timestamptz,permanent_host_verified_at timestamptz,
 host_kind text not null default 'LOCAL_TEST' check(host_kind in ('LOCAL_TEST','PERMANENT_SERVER')),
 updated_at timestamptz not null default now()
);
create table public.vendrex_sales_qr_auth(
 instance_id text not null references public.vendrex_sales_instances(id),category text not null,key_id text not null,
 box jsonb not null,updated_at timestamptz not null default now(),primary key(instance_id,category,key_id)
);
create table public.vendrex_sales_qr_peers(
 jid text primary key,contact_id uuid not null references public.vendrex_sales_contacts(id)
);
create index sales_qr_peer_contact on public.vendrex_sales_qr_peers(contact_id);
create table public.vendrex_sales_qr_payloads(
 provider_id text primary key,jid text not null,body text not null,created_at timestamptz not null default now()
);
do $$ declare t text;begin
 foreach t in array array['instances','qr_auth','qr_peers','qr_payloads'] loop
  execute format('alter table public.%I enable row level security','vendrex_sales_'||t);
  execute format('revoke all on public.%I from public,anon,authenticated','vendrex_sales_'||t);
  execute format('grant all on public.%I to service_role','vendrex_sales_'||t);
 end loop;
end $$;
insert into public.vendrex_sales_instances(id) values('vendrex-sales');

create function vendrex_private.qr_assert(instance text,boot uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.vendrex_sales_settings s join public.vendrex_sales_instances i on i.id=s.qr_instance
  where s.id and s.transport_policy='BAILEYS_QR' and i.id=instance and i.lease_owner=boot and i.lease_until>clock_timestamp())
 then raise exception 'QR_LEASE_REQUIRED';end if;
end $$;
revoke all on function vendrex_private.qr_assert(text,uuid) from public,anon,authenticated;
grant execute on function vendrex_private.qr_assert(text,uuid) to service_role;

create function public.vendrex_sales_qr_lease(instance text,boot uuid,host_kind text) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.vendrex_sales_settings where id and qr_instance=instance and transport_policy='BAILEYS_QR') then raise exception 'QR_NOT_AUTHORIZED';end if;
 update public.vendrex_sales_instances i set lease_owner=boot,lease_until=clock_timestamp()+interval '45 seconds',host_kind=$3,updated_at=now()
 where i.id=instance and (i.lease_owner=boot or i.lease_until is null or i.lease_until<clock_timestamp());
 return found;
end $$;
create function public.vendrex_sales_qr_heartbeat(instance text,boot uuid,status text,owner_jid text default null) returns void language plpgsql security invoker set search_path='' as $$
begin
 perform vendrex_private.qr_assert(instance,boot);
 if status not in ('WAITING_QR','CONNECTING','CONNECTED','RECONNECTING','REAUTH_REQUIRED','ATTENTION_REQUIRED','STOPPED') then raise exception 'QR_INVALID_STATE';end if;
 if status='CONNECTED' and exists(select 1 from public.vendrex_sales_instances i where i.id=instance and i.owner_jid is not null and $4 is not null and i.owner_jid<>$4) then raise exception 'QR_NUMBER_CHANGED';end if;
 update public.vendrex_sales_instances i set lease_until=clock_timestamp()+interval '45 seconds',state=status,
 owner_jid=coalesce($4,i.owner_jid),accept_since=case when status='CONNECTED' and first_connected_at is null then now() else accept_since end,
 first_connected_at=case when status='CONNECTED' then coalesce(first_connected_at,now()) else first_connected_at end,updated_at=now() where i.id=instance;
 update public.vendrex_sales_settings set last_heartbeat=now(),last_boot_id=boot,last_error=case when status='CONNECTED' then null else 'QR_'||status end where id;
end $$;
create function public.vendrex_sales_qr_release(instance text,boot uuid) returns void language sql security invoker set search_path='' as $$
 update public.vendrex_sales_instances i set state='STOPPED',lease_until=now(),updated_at=now() where i.id=instance and i.lease_owner=boot;
$$;
create function public.vendrex_sales_qr_auth_get(instance text,boot uuid,category text,ids text[]) returns table(key_id text,box jsonb)
language plpgsql security invoker set search_path='' as $$
begin
 perform vendrex_private.qr_assert(instance,boot);
 return query select a.key_id,a.box from public.vendrex_sales_qr_auth a where a.instance_id=instance and a.category=$3 and a.key_id=any(ids);
end $$;
create function public.vendrex_sales_qr_auth_put(instance text,boot uuid,entries jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare e jsonb;begin
 perform vendrex_private.qr_assert(instance,boot);
 for e in select * from jsonb_array_elements(entries) loop
  if length(e->>'category') not between 1 and 100 or length(e->>'key_id') not between 1 and 4096 then raise exception 'QR_AUTH_KEY_INVALID';end if;
  if e->'box'='null'::jsonb then delete from public.vendrex_sales_qr_auth a where a.instance_id=instance and a.category=e->>'category' and a.key_id=e->>'key_id';
  else
   if e->'box'->>'v'<>'1' or length(e->'box'->>'data')>4000000 then raise exception 'QR_AUTH_BOX_INVALID';end if;
   insert into public.vendrex_sales_qr_auth(instance_id,category,key_id,box) values(instance,e->>'category',e->>'key_id',e->'box')
   on conflict(instance_id,category,key_id) do update set box=excluded.box,updated_at=now();
  end if;
 end loop;
end $$;

create function public.vendrex_sales_qr_ingest(payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare chat_jid text:=payload->>'jid';alias_jid text:=payload->>'alias';person uuid;other_person uuid;conv uuid;rev integer;mid text;txt text;ts timestamptz;phone text;
begin
 perform vendrex_private.qr_assert(payload->>'instance',(payload->>'boot')::uuid);
 if chat_jid!~'^\d{5,30}@(s\.whatsapp\.net|lid)$' or payload->>'kind' not in ('INBOUND','HUMAN')
 or length(payload->>'id') not between 1 and 150 then raise exception 'QR_INVALID_EVENT';end if;
 if alias_jid is not null and (alias_jid!~'^\d{5,30}@(s\.whatsapp\.net|lid)$' or split_part(alias_jid,'@',2)=split_part(chat_jid,'@',2)) then raise exception 'QR_INVALID_ALIAS';end if;
 ts:=to_timestamp((payload->>'timestamp')::double precision);
 if ts>now()+interval '5 minutes' then raise exception 'QR_INVALID_TIMESTAMP';end if;
 if ts<(select accept_since-interval '2 seconds' from public.vendrex_sales_instances where id=payload->>'instance') then return jsonb_build_object('ignored','OLDER_THAN_LINK');end if;
 if payload->>'kind'='HUMAN' and exists(select 1 from public.vendrex_sales_outbox where provider_id='qr.'||(payload->>'id')) then return jsonb_build_object('ignored','OWN_WORKER_MESSAGE');end if;
 mid:='qr.'||chat_jid||'.'||(payload->>'id');
 if exists(select 1 from public.vendrex_sales_messages where id=mid) then return jsonb_build_object('duplicate',true);end if;
 -- Serialize aliases so a phone/LID pair always resolves to a single contact.
 perform pg_advisory_xact_lock(hashtextextended(least(chat_jid,coalesce(alias_jid,chat_jid)),0));
 perform pg_advisory_xact_lock(hashtextextended(greatest(chat_jid,coalesce(alias_jid,chat_jid)),0));
 select p.contact_id into person from public.vendrex_sales_qr_peers p where p.jid=chat_jid;
 if alias_jid is not null then select p.contact_id into other_person from public.vendrex_sales_qr_peers p where p.jid=alias_jid;end if;
 if person is not null and other_person is not null and person<>other_person then raise exception 'QR_ALIAS_COLLISION';end if;
 person:=coalesce(person,other_person);
 phone:=case when chat_jid like '%@s.whatsapp.net' then split_part(chat_jid,'@',1) when alias_jid like '%@s.whatsapp.net' then split_part(alias_jid,'@',1) else null end;
 if person is null then
  insert into public.vendrex_sales_contacts(identity,wa_id,display_name,consent_at,source)
  values(chat_jid,phone,left(payload->>'name',200),ts,'BAILEYS_QR_EVENT') returning id into person;
 else update public.vendrex_sales_contacts set wa_id=coalesce(phone,wa_id) where id=person;end if;
 insert into public.vendrex_sales_qr_peers(jid,contact_id) values(chat_jid,person) on conflict do nothing;
 if alias_jid is not null then insert into public.vendrex_sales_qr_peers(jid,contact_id) values(alias_jid,person) on conflict do nothing;end if;
 insert into public.vendrex_sales_conversations(contact_id) values(person) on conflict(contact_id) do nothing;
 select id into conv from public.vendrex_sales_conversations where contact_id=person for update;
 if exists(select 1 from public.vendrex_sales_messages where id=mid) then return jsonb_build_object('duplicate',true);end if;
 txt:=left(coalesce(payload->>'body',''),8000);
 update public.vendrex_sales_conversations set revision=revision+1,debounce_until=now()+interval '5 seconds',
  last_inbound_at=case when payload->>'kind'='INBOUND' then greatest(coalesce(last_inbound_at,ts),ts) else last_inbound_at end,
  window_until=case when payload->>'kind'='INBOUND' then greatest(coalesce(window_until,ts),ts+interval '24 hours') else window_until end,status='PENDING'
 where id=conv returning revision into rev;
 insert into public.vendrex_sales_messages(id,conversation_id,direction,body,type,revision,platform_at,source)
 values(mid,conv,case when payload->>'kind'='HUMAN' then 'HUMAN' else 'IN' end,txt,payload->>'message_type',rev,ts,'BAILEYS_QR_EVENT');
 if payload->>'kind'='HUMAN' or payload->>'message_type'<>'text' or lower(txt)~'(falar|quero|chamar).*(humano|atendente|pessoa)|reclama[cç][aã]o|desconto|contrato' then
  update public.vendrex_sales_contacts set human_takeover=true where id=person;
 end if;
 if lower(trim(txt))~'^(sair|pare|parar|stop|cancelar|n[aã]o quero( receber)?( mais)?( mensagens| contato)?)[.! ]*$' or lower(txt)~'n[aã]o me (envie|mande|contate)' then
  update public.vendrex_sales_contacts set opted_out=true where id=person;
 end if;
 update public.vendrex_sales_outbox set state='CANCELLED',lease=null,lease_until=null where conversation_id=conv and state in ('QUEUED','PROCESSING','READY','RETRY');
 if exists(select 1 from public.vendrex_sales_contacts where id=person and (opted_out or blocked or human_takeover)) then
  update public.vendrex_sales_conversations set status='WAITING_HUMAN',debounce_until=null where id=conv;
 elsif ts>now()-interval '24 hours' then
  insert into public.vendrex_sales_outbox(conversation_id,revision,inbound_id,next_attempt_at) values(conv,rev,mid,now()+interval '5 seconds');
 end if;
 return jsonb_build_object('saved',true,'conversation_id',conv,'revision',rev);
end $$;

create function public.vendrex_sales_qr_receipt(instance text,boot uuid,raw_id text,status text,platform_time bigint) returns void language plpgsql security invoker set search_path='' as $$
begin
 perform vendrex_private.qr_assert(instance,boot);
 if status not in ('SENT','DELIVERED','READ') then raise exception 'QR_INVALID_RECEIPT';end if;
 insert into public.vendrex_sales_receipts(provider_id,state,platform_at,billable) values('qr.'||raw_id,status,to_timestamp(platform_time),false) on conflict do nothing;
 update public.vendrex_sales_outbox o set state=status,confirmed_at=now() where o.provider_id='qr.'||raw_id and accepted_at is not null
 and o.state<>'READ' and not(o.state='DELIVERED' and status='SENT');
 update public.vendrex_sales_messages set delivery_state=status where id='qr.'||raw_id and coalesce(delivery_state,'')<>'READ' and not(delivery_state='DELIVERED' and status='SENT');
end $$;
create function public.vendrex_sales_qr_accept(job uuid,lease_id uuid,wamid text) returns boolean language plpgsql security invoker set search_path='' as $$
declare j public.vendrex_sales_outbox;receipt public.vendrex_sales_receipts;
begin
 update public.vendrex_sales_outbox set state='ACCEPTED',accepted_at=now(),lease=null,lease_until=null where id=job and lease=lease_id and state='DISPATCHING' and provider_id=wamid returning * into j;
 if j.id is null then return false;end if;
 insert into public.vendrex_sales_messages(id,conversation_id,direction,body,revision,platform_at,delivery_state,source)
 values(wamid,j.conversation_id,'OUT',j.body,j.revision,now(),'ACCEPTED','BAILEYS_QR_SEND');
 update public.vendrex_sales_conversations set processed_revision=greatest(processed_revision,j.revision),status=case when revision=j.revision then 'IDLE' else status end where id=j.conversation_id;
 select * into receipt from public.vendrex_sales_receipts where provider_id=wamid order by case state when 'READ' then 3 when 'DELIVERED' then 2 else 1 end desc limit 1;
 if receipt.provider_id is not null then
  update public.vendrex_sales_outbox set state=receipt.state,confirmed_at=now() where id=job;
  update public.vendrex_sales_messages set delivery_state=receipt.state where id=wamid;
 end if;
 insert into public.vendrex_sales_audit(event,conversation_id,detail) values('QR_ACCEPTED',j.conversation_id,jsonb_build_object('job',job,'provider_id',wamid));
 return true;
end $$;
create function public.vendrex_sales_qr_due(instance text,boot uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 perform vendrex_private.qr_assert(instance,boot);
 if not exists(select 1 from public.vendrex_sales_settings where id and not paused) then return false;end if;
 return exists(select 1 from public.vendrex_sales_outbox j join public.vendrex_sales_conversations c on c.id=j.conversation_id
  join public.vendrex_sales_contacts p on p.id=c.contact_id cross join public.vendrex_sales_settings s
  where s.id and ((j.state in ('QUEUED','RETRY','READY') and j.next_attempt_at<=now() and c.debounce_until<=now() and c.window_until>now() and j.revision=c.revision
  and not(p.opted_out or p.blocked or p.human_takeover) and (s.mode='LIVE' or p.identity=any(s.test_recipients) or p.wa_id=any(s.test_recipients)))
  or (j.state in ('PROCESSING','DISPATCHING') and j.lease_until<now())));
end $$;

create function public.vendrex_sales_qr_payload_put(instance text,boot uuid,raw_id text,jid text,body text) returns void language plpgsql security invoker set search_path='' as $$
begin
 perform vendrex_private.qr_assert(instance,boot);
 if not exists(select 1 from public.vendrex_sales_outbox o join public.vendrex_sales_conversations c on c.id=o.conversation_id
 join public.vendrex_sales_contacts p on p.id=c.contact_id cross join public.vendrex_sales_settings s
 where s.id and not s.paused and s.transport_policy='BAILEYS_QR' and c.revision=o.revision and c.window_until>now()
 and not(p.opted_out or p.blocked or p.human_takeover) and o.provider_id='qr.'||raw_id and o.state='DISPATCHING'
 and o.worker_boot_id=boot and p.identity=$4 and o.body=$5) then raise exception 'QR_DISPATCH_REQUIRED';end if;
 insert into public.vendrex_sales_qr_payloads(provider_id,jid,body) values('qr.'||raw_id,$4,$5) on conflict(provider_id) do nothing;
end $$;

select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'sales_baileys_auth_key');
select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'sales_companion_bearer');
create or replace function vendrex_private.sales_secrets() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(name,decrypted_secret),'{}'::jsonb) from vault.decrypted_secrets where name in
 ('sales_meta_app_secret','sales_meta_access_token','sales_meta_verify_token','sales_worker_secret','sales_gemma_api_key','sales_inference_url','sales_inference_bearer','sales_baileys_auth_key','sales_companion_bearer');
$$;
-- Shared worker functions and restrictive grants are appended below from the existing queue implementation.
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

create or replace function public.vendrex_sales_dispatch_begin(job uuid,lease_id uuid) returns setof public.vendrex_sales_outbox
language plpgsql security invoker set search_path='' as $$
declare s public.vendrex_sales_settings;
begin
 select * into s from public.vendrex_sales_settings where id for update;
 if s.transport_policy not in ('META_CLOUD_API','BAILEYS_QR') then raise exception 'OWNER_REQUIRES_NO_WHATSAPP_API'; end if;
 if s.paused then raise exception 'SALES_PAUSED';end if;
 if s.transport_policy='META_CLOUD_API' and (s.budget_month is distinct from to_char(now() at time zone 'America/Recife','YYYY-MM')
 or s.budget_verified_at<now()-interval '1 day' or s.budget_verified_at is null
 or s.free_reserved>=s.free_budget) then raise exception 'FREE_META_BUDGET_REQUIRED'; end if;
 return query update public.vendrex_sales_outbox j set state='DISPATCHING',provider_id=case when s.transport_policy='BAILEYS_QR' then 'qr.3EB0'||upper(replace(j.id::text,'-','')) else j.provider_id end where id=job and lease=lease_id
 and (s.transport_policy='META_CLOUD_API' or exists(select 1 from public.vendrex_sales_instances i where i.id=s.qr_instance and i.state='CONNECTED' and i.lease_owner=j.worker_boot_id and i.lease_until>clock_timestamp())) and state='PROCESSING' and phase='SEND' and inference_real and lease_until>now()
 and exists(select 1 from public.vendrex_sales_conversations c join public.vendrex_sales_contacts p on p.id=c.contact_id
 where c.id=j.conversation_id and c.revision=j.revision and c.window_until>now() and c.debounce_until<=now()
 and not(p.opted_out or p.blocked or p.human_takeover) and (s.mode='LIVE' or p.identity=any(s.test_recipients) or p.wa_id=any(s.test_recipients))) returning j.*;
 if found and s.transport_policy='META_CLOUD_API' then update public.vendrex_sales_settings set free_reserved=free_reserved+1 where id; end if;
end $$;

create or replace function public.vendrex_sales_control(action text,conversation uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if action='pause' then update public.vendrex_sales_settings set paused=true where id;
 elsif action='resume_test' then
  if not exists(select 1 from public.vendrex_sales_settings where id and transport_policy in ('META_CLOUD_API','BAILEYS_QR')) then raise exception 'OWNER_REQUIRES_NO_WHATSAPP_API'; end if;
  if not exists(select 1 from public.vendrex_sales_settings where id and cardinality(test_recipients)>0) then raise exception 'AUTHORIZED_TEST_CONTACT_REQUIRED';end if;
  update public.vendrex_sales_settings set paused=false,mode='TEST' where id;
  update public.vendrex_sales_outbox set state='RETRY',next_attempt_at=now() where state='BLOCKED'
  and error_code in ('INFERENCE_AUTH_REQUIRED','INFERENCE_AUTH_OR_CONFIG_REQUIRED','META_AUTH_REQUIRED','FREE_META_BUDGET_REQUIRED');
 elsif action='activate_live' then
  if not (public.vendrex_sales_proof()->>'SALES_WHATSAPP_OPERATIONAL')::boolean then raise exception 'REAL_CONVERSATION_AND_REMOTE_RESTART_PROOF_REQUIRED';end if;
  update public.vendrex_sales_settings set mode='LIVE' where id;
 elsif action='human' then
  update public.vendrex_sales_contacts set human_takeover=true where id=(select contact_id from public.vendrex_sales_conversations where id=conversation);
  update public.vendrex_sales_conversations set revision=revision+1,status='HUMAN_TAKEOVER' where id=conversation;
  update public.vendrex_sales_outbox set state='CANCELLED' where conversation_id=conversation and state in ('QUEUED','PROCESSING','READY','RETRY');
 elsif action='resume_conversation' then
  update public.vendrex_sales_contacts set human_takeover=false where id=(select contact_id from public.vendrex_sales_conversations where id=conversation);
 else raise exception 'INVALID_CONTROL'; end if;
 insert into public.vendrex_sales_audit(event,conversation_id,detail) values('OWNER_CONTROL',conversation,jsonb_build_object('action',action));
 return jsonb_build_object('applied',action);
end $$;

create or replace function public.vendrex_sales_proof() returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('SALES_WHATSAPP_OPERATIONAL',exists(
 select 1 from public.vendrex_sales_settings s join public.vendrex_sales_instances i on i.id=s.qr_instance
 join public.vendrex_sales_outbox a on true join public.vendrex_sales_outbox b on b.conversation_id=a.conversation_id
 join public.vendrex_sales_messages m on m.id=b.inbound_id
 where s.id and s.transport_policy='BAILEYS_QR' and not s.paused and i.state='CONNECTED'
 and i.host_kind='PERMANENT_SERVER' and i.permanent_host_verified_at is not null and i.lease_until>clock_timestamp()
 and s.last_heartbeat>now()-interval '2 minutes' and a.inference_real and b.inference_real
 and a.inference_provider in ('GEMMA_API','OLLAMA_SELF_HOST') and b.inference_provider in ('GEMMA_API','OLLAMA_SELF_HOST')
 and a.state in ('DELIVERED','READ') and b.state in ('DELIVERED','READ') and a.worker_boot_id<>b.worker_boot_id
 and b.created_at>a.accepted_at and m.source='BAILEYS_QR_EVENT'),
 'inbound_messages',(select count(*) from public.vendrex_sales_messages where direction='IN'),
 'confirmed_replies',(select count(*) from public.vendrex_sales_outbox where state in ('DELIVERED','READ')),
 'pending_reconciliation',(select count(*) from public.vendrex_sales_outbox where state='RECONCILIATION_REQUIRED'));
$$;

do $$ declare f record;begin
 for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname like 'vendrex_sales_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
insert into public.vendrex_sales_audit(event,detail) values('OWNER_AUTHORIZED_UNPAID_QR',jsonb_build_object('connector','Baileys','cloud_api',false,'native_meta_ai',false,'paused',true));
commit;
