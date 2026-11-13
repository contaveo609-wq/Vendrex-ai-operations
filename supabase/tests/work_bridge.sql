-- Rollback-only database fixtures. No model, WhatsApp, webhook or account login is performed.
begin;
update public.vendrex_work_settings set enabled=false;
do $$
declare person uuid; conversation uuid; first_job uuid; second_job uuid; snapshot jsonb;
 operator_id uuid:=gen_random_uuid(); subscription uuid; repeated uuid; response jsonb; task uuid; director_task uuid;
begin
 insert into public.vendrex_sales_contacts(identity,display_name,consent_at)
 values('5511999988888@s.whatsapp.net','CONTROLLED WORK FIXTURE',now()) returning id into person;
 insert into public.vendrex_sales_conversations(contact_id,revision) values(person,1) returning id into conversation;
 update public.vendrex_sales_settings set mode='TEST',test_recipients=array['5511999988888'] where id;
 insert into public.vendrex_sales_messages(id,conversation_id,direction,body,revision,platform_at,source)
 values('qr.CONTROLLED_WORK_1',conversation,'IN','Preciso de uma página com botão de contato.',1,now(),'CONTROLLED_TEST');
 select id into first_job from public.vendrex_work_jobs where message_id='qr.CONTROLLED_WORK_1';
 if first_job is null then raise exception 'Work job was not created'; end if;
 snapshot:=public.vendrex_work_context(first_job);
 if jsonb_array_length(snapshot->'history')<>1 then raise exception 'Work history missing'; end if;
 if exists(select 1 from public.vendrex_work_deliveries where job_id=first_job) then raise exception 'Disabled forwarding made a delivery'; end if;
 update public.vendrex_sales_conversations set revision=2 where id=conversation;
 insert into public.vendrex_sales_messages(id,conversation_id,direction,body,revision,platform_at,source)
 values('qr.CONTROLLED_WORK_2',conversation,'IN','A página deve mostrar serviços e horário.',2,now(),'CONTROLLED_TEST');
 select id into second_job from public.vendrex_work_jobs where message_id='qr.CONTROLLED_WORK_2';
 if (select state from public.vendrex_work_jobs where id=first_job)<>'SUPERSEDED' then raise exception 'Old request remained active'; end if;
 begin perform public.vendrex_work_context(first_job); raise exception 'Stale request accepted';
 exception when raise_exception then if sqlerrm<>'WORK_CONTEXT_CHANGED' then raise; end if; end;
 update public.vendrex_sales_contacts set opted_out=true where id=person;
 begin perform public.vendrex_work_context(second_job); raise exception 'Opt-out reached Work';
 exception when raise_exception then if sqlerrm<>'WORK_CONTACT_INELIGIBLE' then raise; end if; end;
 update public.vendrex_sales_contacts set opted_out=false where id=person;
 begin perform public.vendrex_work_complete(second_job,operator_id,'{"reply":"Qual serviço deve aparecer primeiro?"}'); raise exception 'Unregistered operator accepted';
 exception when raise_exception then if sqlerrm<>'OPERATOR_REQUIRED' then raise; end if; end;

 -- This temporary test identity has no password/session and is rolled back with the fixture.
 insert into auth.users(id,email,email_confirmed_at) values(operator_id,'work-rollback-fixture@example.invalid',now());
 insert into public.vendrex_sales_operators(user_id) values(operator_id);
 response:=public.vendrex_work_complete(second_job,operator_id,'{"reply":"Qual serviço deve aparecer primeiro?"}');
 if not(response->>'saved')::boolean or (response->>'customer_sent')::boolean then raise exception 'Draft result was misstated'; end if;
 response:=public.vendrex_work_complete(second_job,operator_id,'{"reply":"Qual serviço deve aparecer primeiro?"}');
 if not(response->>'duplicate')::boolean then raise exception 'Draft completion is not idempotent'; end if;
 response:=public.vendrex_work_handoff(operator_id,second_job,'builder','CONTROLLED: mini página com serviços, horário e contato.');
 task:=(response->>'job_id')::uuid;
 if not exists(select 1 from public.vendrex_work_jobs where id=task and agent='builder' and payload->>'kind'='CUSTOMER_MINI_PROJECT') then raise exception 'Sales did not hand off to Builder'; end if;
 response:=public.vendrex_work_handoff(operator_id,second_job,'builder','CONTROLLED: mini página com serviços, horário e contato.');
 if not(response->>'duplicate')::boolean then raise exception 'Builder brief duplicated'; end if;
 response:=public.vendrex_work_order('CONTROLLED: melhore a clareza das legendas e informe a fonte da orientação.');
 director_task:=(response->>'job_id')::uuid;
 response:=public.vendrex_work_handoff(operator_id,director_task,'growth','CONTROLLED: prepare uma revisão de legendas, sem publicar.');
 if not exists(select 1 from public.vendrex_work_jobs where id=(response->>'job_id')::uuid and agent='growth') then raise exception 'Director instruction was not routed'; end if;
 subscription:=public.vendrex_work_subscribe(operator_id,'sales','https://chatgpt.com/mcp-events/controlled','whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',now()+interval '1 day');
 repeated:=public.vendrex_work_subscribe(operator_id,'sales','https://chatgpt.com/mcp-events/controlled','whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',now()+interval '1 day');
 if subscription<>repeated then raise exception 'Subscription refresh changed identity'; end if;
 if subscription<>public.vendrex_work_subscription_id(operator_id,'sales','https://chatgpt.com/mcp-events/controlled') then raise exception 'Verification subscription ID mismatch'; end if;
 insert into public.vendrex_work_deliveries(job_id,subscription_id) values(second_job,subscription);
 update public.vendrex_work_settings set enabled=true;
 perform vendrex_private.work_wake();
 if exists(select 1 from public.vendrex_work_deliveries where job_id=second_job and state<>'FAILED') then raise exception 'Completed work kept retrying'; end if;
 if has_table_privilege('anon','public.vendrex_work_jobs','SELECT') or has_table_privilege('authenticated','public.vendrex_work_jobs','SELECT')
 or has_function_privilege('anon','public.vendrex_work_secret()','EXECUTE') then raise exception 'Private Work data is public'; end if;
 if (select count(*) from public.vendrex_sales_outbox where conversation_id=conversation)<>0 then raise exception 'Draft bridge unexpectedly queued WhatsApp'; end if;
end $$;
rollback;
