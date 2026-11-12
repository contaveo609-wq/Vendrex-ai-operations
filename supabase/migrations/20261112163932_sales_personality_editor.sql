begin;
alter table public.vendrex_sales_settings add column bot_behavior jsonb not null default '{
 "personality":"Consultivo, educado e direto. Use português brasileiro natural, sem pressão e com mensagens curtas.",
 "instructions":"Entenda a necessidade, consulte o histórico e faça uma pergunta por vez. Não repita o que o cliente já informou.",
 "opening":"Olá! Aqui é a Vendrex. Como posso te chamar?",
 "permission":"Prazer, {nome}. Tenho uma proposta da Vendrex para sua empresa. Gostaria de ouvir? Posso apresentar em um minuto?",
 "proposal":"A Vendrex desenvolve sistemas e automações sob medida. Podemos avaliar uma solução para organizar sua operação. Qual problema do sistema atual mais atrapalha seu trabalho?"
 }'::jsonb;
alter table public.vendrex_sales_settings add column behavior_revision integer not null default 1;
create function public.vendrex_sales_behavior_set(behavior jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare field_name text;rev integer;max_length integer;
begin
 if jsonb_typeof(behavior)<>'object' or (select count(*) from jsonb_object_keys(behavior))<>5 then raise exception 'INVALID_BOT_BEHAVIOR';end if;
 foreach field_name in array array['personality','instructions','opening','permission','proposal'] loop
  max_length:=1200;
  if field_name='instructions' then max_length:=2000;end if;
  if coalesce(jsonb_typeof(behavior->field_name),'')<>'string' or length(trim(behavior->>field_name)) not between 1 and max_length
  then raise exception 'INVALID_BOT_BEHAVIOR';end if;
 end loop;
 update public.vendrex_sales_settings set bot_behavior=behavior,behavior_revision=behavior_revision+1 where id returning behavior_revision into rev;
 -- Fence work that has not started its external send; a stale generator cannot overwrite the new behavior.
 update public.vendrex_sales_outbox j set state='QUEUED',phase='GENERATE',body=null,inference_real=false,
  inference_provider=null,inference_model=null,lease=null,lease_until=null,attempts=0,next_attempt_at=greatest(now()+interval '5 seconds',c.debounce_until)
 from public.vendrex_sales_conversations c where c.id=j.conversation_id and j.state in ('QUEUED','PROCESSING','READY','RETRY');
 insert into public.vendrex_sales_audit(event,detail) values('BOT_BEHAVIOR_CHANGED',jsonb_build_object('revision',rev));
 return jsonb_build_object('saved',true,'behavior_revision',rev);
end $$;
revoke all on function public.vendrex_sales_behavior_set(jsonb) from public,anon,authenticated;
grant execute on function public.vendrex_sales_behavior_set(jsonb) to service_role;
commit;
