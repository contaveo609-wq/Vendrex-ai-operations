-- Owner revoked all WhatsApp API authorization. Native Meta Business Agent is a separate option.
begin;
alter table public.vendrex_sales_settings add column transport_policy text not null default 'NO_WHATSAPP_API'
 check(transport_policy in ('NO_WHATSAPP_API','META_CLOUD_API'));
update public.vendrex_sales_settings set paused=true,transport_policy='NO_WHATSAPP_API',last_error='OWNER_REQUIRES_NO_WHATSAPP_API' where id;
alter table public.vendrex_sales_settings add constraint sales_no_api_requires_pause
 check(transport_policy='META_CLOUD_API' or paused);
select cron.unschedule(jobid) from cron.job where jobname='vendrex-sales-dispatch';
update public.vendrex_sales_outbox set state='CANCELLED',error_code='OWNER_REQUIRES_NO_WHATSAPP_API',lease=null,lease_until=null
 where state in ('QUEUED','READY','PROCESSING','RETRY','BLOCKED');


create or replace function public.vendrex_sales_ingest(payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.vendrex_sales_settings; ent jsonb; ch jsonb; val jsonb; m jsonb; r jsonb;
 who text; txt text; nam text; ts timestamptz; person uuid; conv uuid; rev integer; msgid text; n integer:=0; job uuid;
begin
 select * into s from public.vendrex_sales_settings where id;
 if s.transport_policy<>'META_CLOUD_API' then raise exception 'OWNER_REQUIRES_NO_WHATSAPP_API'; end if;
 if s.waba_id is null or s.phone_number_id is null then raise exception 'META_ACCOUNT_REQUIRED'; end if;
 if payload->>'object'<>'whatsapp_business_account' then raise exception 'INVALID_OBJECT'; end if;
 for ent in select * from jsonb_array_elements(coalesce(payload->'entry','[]')) loop
  if ent->>'id'<>s.waba_id then continue; end if;
  for ch in select * from jsonb_array_elements(coalesce(ent->'changes','[]')) loop
   val:=ch->'value';
   if val->'metadata'->>'phone_number_id' is distinct from s.phone_number_id then continue; end if;
   if ch->>'field'='smb_message_echoes' then
    for m in select * from jsonb_array_elements(coalesce(val->'message_echoes','[]')) loop
     who:=coalesce(nullif(m->>'to_user_id',''),nullif(m->>'to',''));
     update public.vendrex_sales_contacts set human_takeover=true where identity=who or wa_id=m->>'to' returning id into person;
     update public.vendrex_sales_conversations set revision=revision+1,status='HUMAN_TAKEOVER',debounce_until=null where contact_id=person returning id into conv;
     update public.vendrex_sales_outbox set state='CANCELLED' where conversation_id=conv and state in ('QUEUED','PROCESSING','READY','RETRY');
     insert into public.vendrex_sales_audit(event,conversation_id) values('BUSINESS_APP_HUMAN_TAKEOVER',conv);
    end loop;
   end if;
   if ch->>'field'<>'messages' then continue; end if;
   for m in select * from jsonb_array_elements(coalesce(val->'messages','[]')) loop
    msgid:=m->>'id';who:=coalesce(nullif(m->>'from_user_id',''),nullif(m->>'from',''));
    if msgid is null or who is null or length(who)>160 or coalesce(m->>'group_id','')<>'' then continue; end if;
    if exists(select 1 from public.vendrex_sales_messages where id=msgid) then continue; end if;
    ts:=to_timestamp((m->>'timestamp')::double precision);
    if ts>now()+interval '5 minutes' then raise exception 'INVALID_MESSAGE_TIMESTAMP'; end if;
    txt:=left(coalesce(m->'text'->>'body',m->'button'->>'text',m->'interactive'->'button_reply'->>'title',''),8000);
    nam:=left((val->'contacts'->0->'profile'->>'name'),200);
    insert into public.vendrex_sales_contacts(identity,wa_id,display_name,consent_at) values(who,nullif(m->>'from',''),nam,ts)
    on conflict(identity) do update set display_name=coalesce(excluded.display_name,public.vendrex_sales_contacts.display_name),wa_id=coalesce(excluded.wa_id,public.vendrex_sales_contacts.wa_id)
    returning id into person;
    insert into public.vendrex_sales_conversations(contact_id) values(person) on conflict(contact_id) do nothing;
    select id into conv from public.vendrex_sales_conversations where contact_id=person for update;
    -- Locking the conversation serializes webhook batches and resets the five-second quiet period.
    if exists(select 1 from public.vendrex_sales_messages where id=msgid) then continue; end if;
    update public.vendrex_sales_conversations set revision=revision+1,
     last_inbound_at=greatest(coalesce(last_inbound_at,ts),ts),window_until=greatest(coalesce(window_until,ts),ts+interval '24 hours'),
     debounce_until=now()+interval '5 seconds',status='PENDING' where id=conv returning revision into rev;
    insert into public.vendrex_sales_messages(id,conversation_id,direction,body,type,revision,platform_at)
    values(msgid,conv,'IN',txt,m->>'type',rev,ts);
    if lower(trim(txt)) ~ '^(sair|pare|parar|stop|cancelar|n[aã]o quero( receber)?( mais)?( mensagens| contato)?)[.! ]*$'
      or lower(txt) ~ 'n[aã]o me (envie|mande|contate)' then
     update public.vendrex_sales_contacts set opted_out=true where id=person;
    end if;
    if lower(txt) ~ '(falar|quero|chamar).*(humano|atendente|pessoa)|reclama[cç][aã]o|desconto|contrato'
      or m->>'type' not in ('text','button','interactive') then
     update public.vendrex_sales_contacts set human_takeover=true where id=person;
    end if;
    update public.vendrex_sales_outbox set state='CANCELLED' where conversation_id=conv and state in ('QUEUED','PROCESSING','READY','RETRY');
    if exists(select 1 from public.vendrex_sales_contacts where id=person and (opted_out or blocked or human_takeover)) then
     update public.vendrex_sales_conversations set status='WAITING_HUMAN',debounce_until=null where id=conv;
    else
     insert into public.vendrex_sales_outbox(conversation_id,revision,inbound_id,next_attempt_at)
     values(conv,rev,msgid,now()+interval '5 seconds');
    end if;
    n:=n+1;
   end loop;
   for r in select * from jsonb_array_elements(coalesce(val->'statuses','[]')) loop
    if r->>'status' not in ('sent','delivered','read','failed') then continue; end if;
    insert into public.vendrex_sales_receipts(provider_id,state,platform_at,error_code,billable)
    values(r->>'id',upper(r->>'status'),to_timestamp((r->>'timestamp')::double precision),r->'errors'->0->>'code',
      case when r->'pricing' ? 'billable' then (r->'pricing'->>'billable')::boolean else null end)
    on conflict do nothing;
    update public.vendrex_sales_outbox set state=upper(r->>'status'),confirmed_at=now(),error_code=r->'errors'->0->>'code'
    where provider_id=r->>'id' and state not in ('READ') and not (state='DELIVERED' and r->>'status' in ('sent','failed'));
    if (r->'pricing'->>'billable')::boolean is true then
     update public.vendrex_sales_settings set paused=true,last_error='META_BILLABLE_RECEIPT' where id;
    end if;
   end loop;
  end loop;
 end loop;
 return jsonb_build_object('received',n);
end $$;

create or replace function public.vendrex_sales_claim(boot uuid) returns setof public.vendrex_sales_outbox
language plpgsql security invoker set search_path='' as $$
declare s public.vendrex_sales_settings;
begin
 select * into s from public.vendrex_sales_settings where id for update;
 if s.transport_policy<>'META_CLOUD_API' then return; end if;
 update public.vendrex_sales_settings set last_heartbeat=now(),last_boot_id=boot,
 worker_day=current_date,worker_calls=case when worker_day=current_date then worker_calls+1 else 1 end,
 inference_calls=case when worker_day=current_date then inference_calls else 0 end where id;
 update public.vendrex_sales_outbox set state='RECONCILIATION_REQUIRED',error_code='SEND_LEASE_EXPIRED' where state='DISPATCHING' and lease_until<now();
 update public.vendrex_sales_outbox set state=case when attempts<3 then 'RETRY' else 'WAITING_HUMAN' end,
 next_attempt_at=now()+interval '5 seconds',lease=null where state='PROCESSING' and lease_until<now();
 if s.paused or (s.worker_day=current_date and s.worker_calls>=300) then return; end if;
 return query update public.vendrex_sales_outbox o set state='PROCESSING',lease=gen_random_uuid(),lease_until=now()+interval '90 seconds',
 attempts=attempts+1,worker_boot_id=boot where o.id=(
 select j.id from public.vendrex_sales_outbox j
 join public.vendrex_sales_conversations c on c.id=j.conversation_id
 join public.vendrex_sales_contacts p on p.id=c.contact_id
 where j.state in ('QUEUED','RETRY','READY') and j.next_attempt_at<=now() and c.debounce_until<=now()
 and c.window_until>now() and j.revision=c.revision and not(p.opted_out or p.blocked or p.human_takeover)
 and (s.mode='LIVE' or p.identity=any(s.test_recipients) or p.wa_id=any(s.test_recipients))
 order by j.next_attempt_at for update of j skip locked limit 1) returning o.*;
end $$;

create or replace function public.vendrex_sales_ready(job uuid,lease_id uuid,reply text,provider text,model text)
returns setof public.vendrex_sales_outbox language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.vendrex_sales_settings where id and transport_policy='META_CLOUD_API' and not paused) then raise exception 'OWNER_REQUIRES_NO_WHATSAPP_API'; end if;
 if length(reply) not between 1 and 1500 then raise exception 'INVALID_REPLY'; end if;
 update public.vendrex_sales_settings set inference_calls=inference_calls+1 where id and inference_calls<120;
 if not found then raise exception 'INFERENCE_DAILY_LIMIT'; end if;
 return query update public.vendrex_sales_outbox j set body=reply,phase='SEND',inference_provider=provider,
 inference_model=model,inference_real=true where id=job and lease=lease_id and state='PROCESSING' and lease_until>now()
 and exists(select 1 from public.vendrex_sales_conversations c join public.vendrex_sales_contacts p on p.id=c.contact_id
 where c.id=j.conversation_id and c.revision=j.revision and not(p.opted_out or p.blocked or p.human_takeover)) returning j.*;
end $$;

create or replace function public.vendrex_sales_dispatch_begin(job uuid,lease_id uuid) returns setof public.vendrex_sales_outbox
language plpgsql security invoker set search_path='' as $$
declare s public.vendrex_sales_settings;
begin
 select * into s from public.vendrex_sales_settings where id for update;
 if s.transport_policy<>'META_CLOUD_API' then raise exception 'OWNER_REQUIRES_NO_WHATSAPP_API'; end if;
 if s.paused or s.budget_month is distinct from to_char(now() at time zone 'America/Recife','YYYY-MM')
 or s.budget_verified_at<now()-interval '1 day' or s.budget_verified_at is null
 or s.free_reserved>=s.free_budget then raise exception 'FREE_META_BUDGET_REQUIRED'; end if;
 return query update public.vendrex_sales_outbox j set state='DISPATCHING' where id=job and lease=lease_id
 and state='PROCESSING' and phase='SEND' and inference_real and lease_until>now()
 and exists(select 1 from public.vendrex_sales_conversations c join public.vendrex_sales_contacts p on p.id=c.contact_id
 where c.id=j.conversation_id and c.revision=j.revision and c.window_until>now() and c.debounce_until<=now()
 and not(p.opted_out or p.blocked or p.human_takeover) and (s.mode='LIVE' or p.identity=any(s.test_recipients) or p.wa_id=any(s.test_recipients))) returning j.*;
 if found then update public.vendrex_sales_settings set free_reserved=free_reserved+1 where id; end if;
end $$;

create or replace function public.vendrex_sales_control(action text,conversation uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if action='pause' then update public.vendrex_sales_settings set paused=true where id;
 elsif action='resume_test' then
  if not exists(select 1 from public.vendrex_sales_settings where id and transport_policy='META_CLOUD_API') then raise exception 'OWNER_REQUIRES_NO_WHATSAPP_API'; end if;
  update public.vendrex_sales_settings set paused=false,mode='TEST' where id;
  update public.vendrex_sales_outbox set state='RETRY',next_attempt_at=now() where state='BLOCKED'
  and error_code in ('INFERENCE_AUTH_REQUIRED','INFERENCE_AUTH_OR_CONFIG_REQUIRED','META_AUTH_REQUIRED','FREE_META_BUDGET_REQUIRED');
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
 select jsonb_build_object('SALES_WHATSAPP_OPERATIONAL',exists(select 1 from public.vendrex_sales_settings where id and transport_policy='META_CLOUD_API' and not paused) and exists(
 select 1 from public.vendrex_sales_outbox a join public.vendrex_sales_outbox b on b.conversation_id=a.conversation_id
 join public.vendrex_sales_messages m on m.id=b.inbound_id
 where a.confirmed_at is not null and b.confirmed_at is not null and a.inference_real and b.inference_real
 and a.state in ('SENT','DELIVERED','READ') and b.state in ('SENT','DELIVERED','READ')
 and a.worker_boot_id<>b.worker_boot_id and b.created_at>a.accepted_at
 and m.source='META_WHATSAPP_WEBHOOK'),
 'confirmed_replies',(select count(*) from public.vendrex_sales_outbox where state in ('SENT','DELIVERED','READ')),
 'inbound_messages',(select count(*) from public.vendrex_sales_messages where direction='IN'),
 'pending_reconciliation',(select count(*) from public.vendrex_sales_outbox where state='RECONCILIATION_REQUIRED'));
$$;

create or replace function public.vendrex_sales_dispatch() returns bigint language plpgsql security invoker set search_path='' as $$
declare s public.vendrex_sales_settings; request_id bigint;
begin
 select * into s from public.vendrex_sales_settings where id for update;
 if s.transport_policy<>'META_CLOUD_API' or s.paused or (s.worker_day=current_date and s.worker_calls>=300) or s.last_dispatch>now()-interval '1 second' then return null; end if;
 if not exists(select 1 from public.vendrex_sales_outbox where
  (state in ('QUEUED','RETRY','READY') and next_attempt_at<=now()) or
  (state in ('PROCESSING','DISPATCHING') and lease_until<now()))
 and s.last_heartbeat>now()-interval '5 minutes' then return null; end if;
 update public.vendrex_sales_settings set last_dispatch=now() where id;
 select net.http_post(
  url:=(select decrypted_secret from vault.decrypted_secrets where name='sales_project_url')||'/functions/v1/sales/worker',
  headers:=jsonb_build_object('Content-Type','application/json','x-sales-worker-secret',
   (select decrypted_secret from vault.decrypted_secrets where name='sales_worker_secret')),
  body:='{}'::jsonb,timeout_milliseconds:=70000) into request_id;
 return request_id;
end $$;

insert into public.vendrex_sales_audit(event,detail) values('OWNER_NO_WHATSAPP_API_POLICY',jsonb_build_object('transport','disabled','schedule_installed',false));
commit;
