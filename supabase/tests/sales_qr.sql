-- Real Postgres, controlled rollback fixtures. No real WhatsApp account, delivery or AI is simulated as success.
begin;
update public.vendrex_sales_settings set paused=false,transport_policy='BAILEYS_QR',mode='TEST',test_recipients=array['5511999999999'],free_budget=0,free_reserved=0 where id;
update public.vendrex_sales_instances set lease_owner=null,lease_until=null,state='HOST_REQUIRED',accept_since=now()-interval '1 minute',host_kind='LOCAL_TEST' where id='vendrex-sales';
do $$ declare b uuid:='11111111-1111-4111-8111-111111111111';b2 uuid:='22222222-2222-4222-8222-222222222222';p jsonb;r jsonb;conv uuid;job public.vendrex_sales_outbox;n integer;raw text;
begin
 if not public.vendrex_sales_qr_lease('vendrex-sales',b,'LOCAL_TEST') then raise exception 'Initial lease failed';end if;
 if public.vendrex_sales_qr_lease('vendrex-sales',b2,'LOCAL_TEST') then raise exception 'Concurrent socket owner';end if;
 perform public.vendrex_sales_qr_heartbeat('vendrex-sales',b,'CONNECTED','5511888888888@s.whatsapp.net');
 perform public.vendrex_sales_qr_auth_put('vendrex-sales',b,'[{"category":"fixture","key_id":"key","box":{"v":1,"data":"CONTROLLED_CIPHERTEXT"}}]'::jsonb);
 select count(*) into n from public.vendrex_sales_qr_auth_get('vendrex-sales',b,'fixture',array['key']);
 if n<>1 then raise exception 'Encrypted auth not persisted';end if;
 p:=jsonb_build_object('instance','vendrex-sales','boot',b,'kind','INBOUND','jid','123456789@lid','alias','5511999999999@s.whatsapp.net',
 'id','CONTROLLED_QR_1','body','Preciso organizar os pedidos','message_type','text','name','CONTROLLED TEST','timestamp',extract(epoch from now())::bigint);
 r:=public.vendrex_sales_qr_ingest(p);conv:=(r->>'conversation_id')::uuid;
 if conv is null then raise exception 'QR inbound missing';end if;
 r:=public.vendrex_sales_qr_ingest(p);if not (r->>'duplicate')::boolean then raise exception 'QR dedup failed';end if;
 select count(*) into n from public.vendrex_sales_claim(b);if n<>0 then raise exception 'QR five second debounce bypass';end if;
 update public.vendrex_sales_conversations set debounce_until=now()-interval '1 second' where id=conv;
 update public.vendrex_sales_outbox set next_attempt_at=now()-interval '1 second' where conversation_id=conv;
 select count(*) into n from public.vendrex_sales_claim(b2);if n<>0 then raise exception 'Non-owner claimed work';end if;
 if not public.vendrex_sales_qr_due('vendrex-sales',b) then raise exception 'Due job not visible';end if;
 select * into job from public.vendrex_sales_claim(b);if job.id is null then raise exception 'QR phone allowlist/LID mapping failed';end if;
 -- Personality changes persist and invalidate in-flight generation before its external effect.
 r:=public.vendrex_sales_behavior_set((select bot_behavior||'{"personality":"CONTROLLED formal tone"}'::jsonb from public.vendrex_sales_settings where id));
 if not (r->>'saved')::boolean or (select bot_behavior->>'personality' from public.vendrex_sales_settings where id)<>'CONTROLLED formal tone' then raise exception 'Personality was not persisted';end if;
 select count(*) into n from public.vendrex_sales_ready(job.id,job.lease,'OLD PERSONALITY','OLLAMA_SELF_HOST','gemma3:1b');
 if n<>0 then raise exception 'Old personality was sent';end if;
 begin
  perform public.vendrex_sales_behavior_set('{"personality":"x","instructions":"x","opening":"x","permission":"x","wrong":"x"}'::jsonb);raise exception 'Invalid behavior accepted';
 exception when raise_exception then if sqlerrm<>'INVALID_BOT_BEHAVIOR' then raise;end if;end;
 update public.vendrex_sales_outbox set next_attempt_at=now()-interval '1 second' where conversation_id=conv;
 select * into job from public.vendrex_sales_claim(b);if job.id is null then raise exception 'New personality job not reclaimed';end if;
 perform public.vendrex_sales_ready(job.id,job.lease,'CONTROLLED SQL REPLY','OLLAMA_SELF_HOST','gemma3:1b');
 select * into job from public.vendrex_sales_dispatch_begin(job.id,job.lease);
 if job.state<>'DISPATCHING' or job.provider_id not like 'qr.3EB0%' then raise exception 'Deterministic dispatch ID missing';end if;
 if (select free_reserved from public.vendrex_sales_settings where id)<>0 then raise exception 'QR used Meta paid budget';end if;
 raw:=substring(job.provider_id from 4);
 perform public.vendrex_sales_qr_payload_put('vendrex-sales',b,raw,'123456789@lid','CONTROLLED SQL REPLY');
 perform public.vendrex_sales_qr_receipt('vendrex-sales',b,raw,'DELIVERED',extract(epoch from now())::bigint);
 if not public.vendrex_sales_qr_accept(job.id,job.lease,job.provider_id) then raise exception 'QR acceptance lost';end if;
 if (select state from public.vendrex_sales_outbox where id=job.id)<>'DELIVERED' then raise exception 'Early QR receipt lost';end if;
 perform public.vendrex_sales_qr_receipt('vendrex-sales',b,raw,'SENT',extract(epoch from now())::bigint);
 if (select state from public.vendrex_sales_outbox where id=job.id)<>'DELIVERED' then raise exception 'Receipt order downgraded delivery';end if;
 if (public.vendrex_sales_proof()->>'SALES_WHATSAPP_OPERATIONAL')::boolean then raise exception 'False operational proof from local fixtures';end if;
 -- Worker echo must not disable itself as a human. A manual reply must disable automation.
 r:=public.vendrex_sales_qr_ingest(p||jsonb_build_object('kind','HUMAN','id',raw));
 if r->>'ignored'<>'OWN_WORKER_MESSAGE' then raise exception 'Worker echo routed as human';end if;
 -- Switching phone/LID identifiers preserves the contact and its conversation.
 r:=public.vendrex_sales_qr_ingest(p||jsonb_build_object('id','CONTROLLED_QR_2','jid','5511999999999@s.whatsapp.net','alias','123456789@lid'));
 if (r->>'conversation_id')::uuid<>conv then raise exception 'Alias created a second conversation';end if;
 perform public.vendrex_sales_qr_ingest(p||jsonb_build_object('kind','HUMAN','id','CONTROLLED_MANUAL_REPLY','body','Vou atender pessoalmente'));
 if not exists(select 1 from public.vendrex_sales_contacts where identity='123456789@lid' and human_takeover) then raise exception 'Manual takeover missing';end if;
 if exists(select 1 from public.vendrex_sales_outbox where conversation_id=conv and state in ('QUEUED','PROCESSING','READY')) then raise exception 'Human takeover left active send';end if;
 perform public.vendrex_sales_qr_ingest(p||jsonb_build_object('id','CONTROLLED_QR_OPT_OUT','body','pare'));
 if not exists(select 1 from public.vendrex_sales_contacts where identity='123456789@lid' and opted_out) then raise exception 'QR opt-out lost';end if;
 -- Credentials survive a lease transfer, and an old worker loses all auth write access.
 update public.vendrex_sales_instances set lease_until=now()-interval '1 second' where id='vendrex-sales';
 begin
  perform public.vendrex_sales_qr_auth_get('vendrex-sales',b,'fixture',array['key']);raise exception 'Expired lease read auth';
 exception when raise_exception then if sqlerrm<>'QR_LEASE_REQUIRED' then raise;end if;end;
 if not public.vendrex_sales_qr_lease('vendrex-sales',b2,'LOCAL_TEST') then raise exception 'Restart lease failed';end if;
 select count(*) into n from public.vendrex_sales_qr_auth_get('vendrex-sales',b2,'fixture',array['key']);if n<>1 then raise exception 'Restart lost auth';end if;
 perform public.vendrex_sales_qr_heartbeat('vendrex-sales',b2,'CONNECTED','5511888888888@s.whatsapp.net');
 update public.vendrex_sales_outbox set state='DISPATCHING',lease_until=now()-interval '1 second' where id=job.id;
 perform public.vendrex_sales_claim(b2);
 if (select state from public.vendrex_sales_outbox where id=job.id)<>'RECONCILIATION_REQUIRED' then raise exception 'Ambiguous QR send retried';end if;
 begin
  perform public.vendrex_sales_control('activate_live');raise exception 'Live activated without real proof';
 exception when raise_exception then if sqlerrm<>'REAL_CONVERSATION_AND_REMOTE_RESTART_PROOF_REQUIRED' then raise;end if;end;
end $$;
set local role authenticated;
do $$begin
 if has_table_privilege(current_user,'public.vendrex_sales_qr_auth','SELECT') then raise exception 'QR auth exposed';end if;
 if has_function_privilege(current_user,'public.vendrex_sales_qr_auth_get(text,uuid,text,text[])','EXECUTE') then raise exception 'QR credential RPC exposed';end if;
end $$;
reset role;
select 'PASS QR: durable auth, exclusive lease, PN/LID identity, debounce, dedup, deterministic dispatch, receipt order, human takeover, opt-out, restart, no false success. Rollback-only fixtures; no WhatsApp message sent.' as result;
rollback;
