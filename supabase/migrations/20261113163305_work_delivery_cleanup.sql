begin;
create or replace function vendrex_private.work_wake() returns void language plpgsql security definer set search_path='' as $$
declare endpoint text; token text; begin
 select dispatch_url into endpoint from public.vendrex_work_settings where id and enabled;
 if endpoint is null then return; end if;
 update public.vendrex_work_deliveries d set state='FAILED',lease=null,lease_until=null
 where d.state in ('PENDING','SENDING') and (
  exists(select 1 from public.vendrex_work_jobs j where j.id=d.job_id and j.state<>'PENDING') or
  exists(select 1 from public.vendrex_work_subscriptions s where s.id=d.subscription_id
   and (not s.active or s.expires_at<=now() or not exists(select 1 from public.vendrex_sales_operators o where o.user_id=s.owner_id))));
 if not exists(select 1 from public.vendrex_work_deliveries d where d.next_attempt_at<=now() and d.attempts<5
  and (d.state='PENDING' or (d.state='SENDING' and d.lease_until<now()))) then return; end if;
 select decrypted_secret into token from vault.decrypted_secrets where name='work_dispatch_secret';
 if token is null then return; end if;
 perform net.http_post(url:=endpoint,body:='{}'::jsonb,
  headers:=jsonb_build_object('Content-Type','application/json','x-work-dispatch-secret',token),timeout_milliseconds:=15000);
end $$;
commit;
