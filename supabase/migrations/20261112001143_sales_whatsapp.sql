-- Official WhatsApp Sales: isolated from Growth and the local SQLite executor.
begin;
create table public.vendrex_sales_settings (
 id boolean primary key default true check(id), waba_id text, phone_number_id text,
 paused boolean not null default true, mode text not null default 'TEST' check(mode in ('TEST','LIVE')),
 test_recipients text[] not null default '{}', inference_provider text not null default 'GEMMA_API'
 check(inference_provider in ('GEMMA_API','OLLAMA_SELF_HOST')),
 inference_model text not null default 'gemma-4-26b-a4b-it', inference_verified_at timestamptz,
 budget_month text, free_budget integer not null default 0 check(free_budget between 0 and 900),
 free_reserved integer not null default 0, budget_verified_at timestamptz,
 last_heartbeat timestamptz,last_dispatch timestamptz, last_error text,
 worker_day date,worker_calls integer not null default 0,inference_calls integer not null default 0,
 last_boot_id uuid, created_at timestamptz not null default now()
);
insert into public.vendrex_sales_settings(id) values(true);
create table public.vendrex_sales_contacts (
 id uuid primary key default gen_random_uuid(), identity text not null unique, wa_id text, display_name text,
 consent_scope text not null default 'CUSTOMER_INITIATED_SERVICE', consent_at timestamptz not null,
 opted_out boolean not null default false, blocked boolean not null default false,
 human_takeover boolean not null default false, lead_stage text not null default 'NEW',
 source text not null default 'META_WHATSAPP_WEBHOOK', created_at timestamptz not null default now()
);
create table public.vendrex_sales_conversations (
 id uuid primary key default gen_random_uuid(),contact_id uuid not null unique references public.vendrex_sales_contacts(id),
 revision integer not null default 0,processed_revision integer not null default 0,
 window_until timestamptz, debounce_until timestamptz,status text not null default 'PENDING',
 last_inbound_at timestamptz,created_at timestamptz not null default now()
);
create table public.vendrex_sales_messages (
 id text primary key,conversation_id uuid not null references public.vendrex_sales_conversations(id),
 direction text not null check(direction in ('IN','OUT','HUMAN')),body text not null,type text not null default 'text',
 revision integer not null,platform_at timestamptz not null,received_at timestamptz not null default now(),
 delivery_state text,source text not null default 'META_WHATSAPP_WEBHOOK'
);
create index sales_history on public.vendrex_sales_messages(conversation_id,platform_at);
create table public.vendrex_sales_outbox (
 id uuid primary key default gen_random_uuid(),conversation_id uuid not null references public.vendrex_sales_conversations(id),
 revision integer not null,inbound_id text not null references public.vendrex_sales_messages(id),
 state text not null default 'QUEUED',phase text not null default 'GENERATE',body text,
 next_attempt_at timestamptz not null,attempts integer not null default 0,lease uuid,lease_until timestamptz,
 provider_id text unique,error_code text,inference_provider text,inference_model text,inference_real boolean not null default false,
 worker_boot_id uuid,accepted_at timestamptz,confirmed_at timestamptz,created_at timestamptz not null default now(),
 unique(conversation_id,revision),
 check(state in ('QUEUED','PROCESSING','READY','DISPATCHING','ACCEPTED','SENT','DELIVERED','READ','RETRY','FAILED','CANCELLED','BLOCKED','WAITING_HUMAN','RECONCILIATION_REQUIRED'))
);
create index sales_due on public.vendrex_sales_outbox(next_attempt_at) where state in ('QUEUED','RETRY','READY');
create table public.vendrex_sales_receipts (
 provider_id text not null,state text not null,platform_at timestamptz not null,error_code text,billable boolean,
 primary key(provider_id,state,platform_at)
);
create table public.vendrex_sales_audit (
 id bigint generated always as identity primary key,event text not null,conversation_id uuid,
 detail jsonb not null default '{}',created_at timestamptz not null default now()
);
create index sales_audit_conversation on public.vendrex_sales_audit(conversation_id,created_at);
create table public.vendrex_sales_worker_runs (
 id uuid primary key default gen_random_uuid(),boot_id uuid not null,outbox_id uuid references public.vendrex_sales_outbox(id),
 outcome text not null,created_at timestamptz not null default now()
);
create index sales_runs_outbox on public.vendrex_sales_worker_runs(outbox_id);
create table public.vendrex_sales_operators(user_id uuid primary key references auth.users(id));
do $$ declare t text; begin
 foreach t in array array['settings','contacts','conversations','messages','outbox','receipts','audit','worker_runs','operators'] loop
  execute format('alter table public.%I enable row level security','vendrex_sales_'||t);
  execute format('revoke all on public.%I from public,anon,authenticated','vendrex_sales_'||t);
  execute format('grant all on public.%I to service_role','vendrex_sales_'||t);
 end loop;
end $$;
grant usage,select on sequence public.vendrex_sales_audit_id_seq to service_role;

create function vendrex_private.sales_secrets() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(name,decrypted_secret),'{}'::jsonb) from vault.decrypted_secrets
 where name in ('sales_meta_app_secret','sales_meta_access_token','sales_meta_verify_token','sales_worker_secret',
 'sales_gemma_api_key','sales_inference_url','sales_inference_bearer');
$$;
revoke all on function vendrex_private.sales_secrets() from public,anon,authenticated;
grant execute on function vendrex_private.sales_secrets() to service_role;
create function public.vendrex_sales_secrets() returns jsonb language sql security invoker set search_path='' as $$select vendrex_private.sales_secrets();$$;

create function public.vendrex_sales_ingest(payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.vendrex_sales_settings; ent jsonb; ch jsonb; val jsonb; m jsonb; r jsonb;
 who text; txt text; nam text; ts timestamptz; person uuid; conv uuid; rev integer; msgid text; n integer:=0; job uuid;
begin
 select * into s from public.vendrex_sales_settings where id;
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

create function public.vendrex_sales_claim(boot uuid) returns setof public.vendrex_sales_outbox
language plpgsql security invoker set search_path='' as $$
declare s public.vendrex_sales_settings;
begin
 select * into s from public.vendrex_sales_settings where id for update;
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

create function public.vendrex_sales_ready(job uuid,lease_id uuid,reply text,provider text,model text)
returns setof public.vendrex_sales_outbox language plpgsql security invoker set search_path='' as $$
begin
 if length(reply) not between 1 and 1500 then raise exception 'INVALID_REPLY'; end if;
 update public.vendrex_sales_settings set inference_calls=inference_calls+1 where id and inference_calls<120;
 if not found then raise exception 'INFERENCE_DAILY_LIMIT'; end if;
 return query update public.vendrex_sales_outbox j set body=reply,phase='SEND',inference_provider=provider,
 inference_model=model,inference_real=true where id=job and lease=lease_id and state='PROCESSING' and lease_until>now()
 and exists(select 1 from public.vendrex_sales_conversations c join public.vendrex_sales_contacts p on p.id=c.contact_id
 where c.id=j.conversation_id and c.revision=j.revision and not(p.opted_out or p.blocked or p.human_takeover)) returning j.*;
end $$;

create function public.vendrex_sales_dispatch_begin(job uuid,lease_id uuid) returns setof public.vendrex_sales_outbox
language plpgsql security invoker set search_path='' as $$
declare s public.vendrex_sales_settings;
begin
 select * into s from public.vendrex_sales_settings where id for update;
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

create function public.vendrex_sales_accept(job uuid,lease_id uuid,wamid text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare j public.vendrex_sales_outbox; receipt public.vendrex_sales_receipts;
begin
 update public.vendrex_sales_outbox set state='ACCEPTED',provider_id=wamid,accepted_at=now(),lease=null,lease_until=null
 where id=job and lease=lease_id and state='DISPATCHING' returning * into j;
 if j.id is null then return false; end if;
 insert into public.vendrex_sales_messages(id,conversation_id,direction,body,revision,platform_at,delivery_state,source)
 values(wamid,j.conversation_id,'OUT',j.body,j.revision,now(),'ACCEPTED','META_CLOUD_API');
 update public.vendrex_sales_conversations set processed_revision=greatest(processed_revision,j.revision),
 status=case when revision=j.revision then 'IDLE' else status end where id=j.conversation_id;
 select * into receipt from public.vendrex_sales_receipts where provider_id=wamid
 order by case state when 'READ' then 4 when 'DELIVERED' then 3 when 'SENT' then 2 else 1 end desc limit 1;
 if receipt.provider_id is not null then update public.vendrex_sales_outbox set state=receipt.state,confirmed_at=now() where id=job; end if;
 insert into public.vendrex_sales_audit(event,conversation_id,detail) values('META_ACCEPTED',j.conversation_id,jsonb_build_object('job',job,'wamid',wamid));
 return true;
end $$;

create function public.vendrex_sales_control(action text,conversation uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if action='pause' then update public.vendrex_sales_settings set paused=true where id;
 elsif action='resume_test' then
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

create function public.vendrex_sales_proof() returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('SALES_WHATSAPP_OPERATIONAL',exists(
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
-- Only backend service can call mutation, secret or evidence functions.
do $$ declare f record; begin
 for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname like 'vendrex_sales_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'sales_worker_secret');
select vault.create_secret(encode(extensions.gen_random_bytes(24),'hex'),'sales_meta_verify_token');
commit;
