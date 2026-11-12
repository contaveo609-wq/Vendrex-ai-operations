create or replace function public.vendrex_sales_ready(job uuid,lease_id uuid,reply text,provider text,model text)
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

create or replace function public.vendrex_sales_dispatch_begin(job uuid,lease_id uuid) returns setof public.vendrex_sales_outbox
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


