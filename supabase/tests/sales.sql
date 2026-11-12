-- Real Postgres, controlled rollback-only fixtures. No WhatsApp or inference API is called.
begin;
update public.vendrex_sales_settings set transport_policy='META_CLOUD_API',waba_id='12345',phone_number_id='123456',paused=false,
 test_recipients=array['5511999999999'],budget_month=to_char(now() at time zone 'America/Recife','YYYY-MM'),
 budget_verified_at=now(),free_budget=3,free_reserved=0;
do $$ declare p jsonb; r jsonb; job public.vendrex_sales_outbox; conv uuid; n integer;
begin
 p:=jsonb_build_object('object','whatsapp_business_account','entry',jsonb_build_array(jsonb_build_object('id','12345',
 'changes',jsonb_build_array(jsonb_build_object('field','messages','value',jsonb_build_object(
 'metadata',jsonb_build_object('phone_number_id','123456'),
 'messages',jsonb_build_array(jsonb_build_object('id','wamid.CONTROLLED_1','from','5511999999999','from_user_id','US.CONTROLLED123',
 'timestamp',extract(epoch from now())::bigint::text,'type','text','text',jsonb_build_object('body','Preciso organizar pedidos')))))))));
 r:=public.vendrex_sales_ingest(p);if (r->>'received')::int<>1 then raise exception 'Inbound not stored'; end if;
 r:=public.vendrex_sales_ingest(p);if (r->>'received')::int<>0 then raise exception 'Duplicate inbound accepted'; end if;
 select conversation_id into conv from public.vendrex_sales_messages where id='wamid.CONTROLLED_1';
 if not exists(select 1 from public.vendrex_sales_conversations where id=conv and debounce_until>=now()+interval '4 seconds') then raise exception 'Five second debounce missing'; end if;
 select count(*) into n from public.vendrex_sales_claim('11111111-1111-4111-8111-111111111111');
 if n<>0 then raise exception 'Debounce bypass'; end if;
 update public.vendrex_sales_conversations set debounce_until=now()-interval '1 second' where id=conv;
 update public.vendrex_sales_outbox set next_attempt_at=now()-interval '1 second' where conversation_id=conv;
 select * into job from public.vendrex_sales_claim('11111111-1111-4111-8111-111111111111');
 if job.id is null then raise exception 'Claim failed for phone allowlist with BSUID identity'; end if;
 select count(*) into n from public.vendrex_sales_claim('22222222-2222-4222-8222-222222222222');
 if n<>0 then raise exception 'Concurrent duplicate claim'; end if;
 -- New inbound invalidates an in-flight generation and resets the quiet period.
 p:=jsonb_set(p,'{entry,0,changes,0,value,messages,0,id}','"wamid.CONTROLLED_2"');
 perform public.vendrex_sales_ingest(p);
 select count(*) into n from public.vendrex_sales_ready(job.id,job.lease,'Stale answer','GEMMA_API','controlled');
 if n<>0 then raise exception 'Stale generation accepted'; end if;
 update public.vendrex_sales_conversations set debounce_until=now()-interval '1 second' where id=conv;
 update public.vendrex_sales_outbox set next_attempt_at=now()-interval '1 second' where conversation_id=conv;
 select * into job from public.vendrex_sales_claim('11111111-1111-4111-8111-111111111111');
 perform public.vendrex_sales_ready(job.id,job.lease,'CONTROLLED SQL ANSWER','GEMMA_API','controlled');
 update public.vendrex_sales_settings set paused=true where id;
 begin
  perform public.vendrex_sales_dispatch_begin(job.id,job.lease);raise exception 'Emergency pause bypass';
 exception when raise_exception then if sqlerrm not in ('FREE_META_BUDGET_REQUIRED','SALES_PAUSED') then raise; end if;end;
 update public.vendrex_sales_settings set paused=false,free_budget=0 where id;
 begin
  perform public.vendrex_sales_dispatch_begin(job.id,job.lease);raise exception 'Zero cost budget bypass';
 exception when raise_exception then if sqlerrm<>'FREE_META_BUDGET_REQUIRED' then raise; end if;end;
 update public.vendrex_sales_settings set free_budget=3 where id;
 perform public.vendrex_sales_dispatch_begin(job.id,job.lease);
 if (select free_reserved from public.vendrex_sales_settings where id)<>1 then raise exception 'Budget not reserved before send'; end if;
 -- Delivery may arrive before the HTTP acceptance is saved.
 perform public.vendrex_sales_ingest(jsonb_build_object('object','whatsapp_business_account','entry',jsonb_build_array(jsonb_build_object('id','12345',
 'changes',jsonb_build_array(jsonb_build_object('field','messages','value',jsonb_build_object('metadata',jsonb_build_object('phone_number_id','123456'),
 'statuses',jsonb_build_array(jsonb_build_object('id','wamid.CONTROLLED_OUT','status','delivered','timestamp',extract(epoch from now())::bigint::text)))))))));
 if not public.vendrex_sales_accept(job.id,job.lease,'wamid.CONTROLLED_OUT') then raise exception 'Accept not saved'; end if;
 if (select state from public.vendrex_sales_outbox where id=job.id)<>'DELIVERED' then raise exception 'Early receipt lost'; end if;
 if (public.vendrex_sales_proof()->>'SALES_WHATSAPP_OPERATIONAL')::boolean then raise exception 'Operational without restart proof'; end if;
 -- Explicit opt-out cancels pending generation and persists consent withdrawal.
 p:=jsonb_set(p,'{entry,0,changes,0,value,messages,0,id}','"wamid.CONTROLLED_3"');
 p:=jsonb_set(p,'{entry,0,changes,0,value,messages,0,text,body}','"pare"');
 perform public.vendrex_sales_ingest(p);
 if not exists(select 1 from public.vendrex_sales_contacts where identity='US.CONTROLLED123' and opted_out) then raise exception 'Opt-out not persisted'; end if;
 if exists(select 1 from public.vendrex_sales_outbox where conversation_id=conv and state in ('QUEUED','READY','PROCESSING')) then raise exception 'Opt-out left active send'; end if;
 -- A dispatch with unknown outcome must never automatically send again after restart.
 update public.vendrex_sales_outbox set state='DISPATCHING',lease_until=now()-interval '1 second' where id=job.id;
 perform public.vendrex_sales_claim('22222222-2222-4222-8222-222222222222');
 if (select state from public.vendrex_sales_outbox where id=job.id)<>'RECONCILIATION_REQUIRED' then raise exception 'Ambiguous send retried'; end if;
end $$;
-- Revoked authorization must survive restart, manual calls, valid credentials and resume controls.
update public.vendrex_sales_settings set paused=true,transport_policy='NO_WHATSAPP_API' where id;
do $$ declare n integer; begin
 begin
  perform public.vendrex_sales_control('resume_test');raise exception 'No-API resume bypass';
 exception when raise_exception then if sqlerrm<>'OWNER_REQUIRES_NO_WHATSAPP_API' then raise; end if;end;
 begin
  update public.vendrex_sales_settings set paused=false where id;raise exception 'No-API unpause bypass';
 exception when check_violation then null;end;
 begin
  perform public.vendrex_sales_ingest('{}'::jsonb);raise exception 'No-API ingest bypass';
 exception when raise_exception then if sqlerrm<>'OWNER_REQUIRES_NO_WHATSAPP_API' then raise; end if;end;
 select count(*) into n from public.vendrex_sales_claim(gen_random_uuid());
 if n<>0 then raise exception 'No-API claim bypass';end if;
 if public.vendrex_sales_dispatch() is not null then raise exception 'No-API dispatch bypass';end if;
 if (public.vendrex_sales_proof()->>'SALES_WHATSAPP_OPERATIONAL')::boolean then raise exception 'No-API false success';end if;
end $$;
set local role authenticated;
do $$ begin
 if has_table_privilege(current_user,'public.vendrex_sales_messages','SELECT') then raise exception 'Conversations publicly accessible'; end if;
 if has_function_privilege(current_user,'public.vendrex_sales_secrets()','EXECUTE') then raise exception 'Sales Vault exposed'; end if;
 if has_function_privilege(current_user,'public.vendrex_sales_ingest(jsonb)','EXECUTE') then raise exception 'Webhook forgery exposed'; end if;
end $$;
reset role;
select 'PASS: real PostgreSQL, debounce, dedupe, BSUID/phone mapping, stale cancellation, emergency pause, free budget, early receipts, opt-out and crash safety. Fixtures rolled back.' as result;
rollback;
