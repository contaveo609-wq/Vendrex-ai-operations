begin;

create or replace function public.vendrex_sales_qr_ingest(payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
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

create or replace function public.vendrex_sales_qr_payload_put(instance text,boot uuid,raw_id text,jid text,body text) returns void language plpgsql security invoker set search_path='' as $$
begin
 perform vendrex_private.qr_assert(instance,boot);
 if not exists(select 1 from public.vendrex_sales_outbox o join public.vendrex_sales_conversations c on c.id=o.conversation_id
 join public.vendrex_sales_contacts p on p.id=c.contact_id where o.provider_id='qr.'||raw_id and o.state='DISPATCHING'
 and o.worker_boot_id=boot and p.identity=$4 and o.body=$5) then raise exception 'QR_DISPATCH_REQUIRED';end if;
 insert into public.vendrex_sales_qr_payloads(provider_id,jid,body) values('qr.'||raw_id,$4,$5) on conflict(provider_id) do nothing;
end $$;

commit;
