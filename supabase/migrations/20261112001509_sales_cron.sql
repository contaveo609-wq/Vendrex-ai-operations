begin;
select vault.create_secret((select decrypted_secret from vault.decrypted_secrets where name='growth_project_url'),'sales_project_url');
create function public.vendrex_sales_dispatch() returns bigint language plpgsql security invoker set search_path='' as $$
declare s public.vendrex_sales_settings; request_id bigint;
begin
 select * into s from public.vendrex_sales_settings where id for update;
 if s.paused or (s.worker_day=current_date and s.worker_calls>=300) or s.last_dispatch>now()-interval '1 second' then return null; end if;
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
revoke all on function public.vendrex_sales_dispatch() from public,anon,authenticated;
grant execute on function public.vendrex_sales_dispatch() to service_role;
-- No schedule is installed. The owner subsequently prohibited WhatsApp API use.
-- Policy migration 20261112003406 also fences manual invocation and resume controls.
commit;
