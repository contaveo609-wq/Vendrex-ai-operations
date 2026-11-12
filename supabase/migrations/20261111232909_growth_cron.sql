begin;
create extension if not exists pg_cron;
create extension if not exists pg_net;
-- The invocation credential is generated in Vault and never appears in cron.job.command.
-- Provision growth_project_url in Vault for the target project during deployment.
-- Do not embed a generated project reference in a reusable migration.
select cron.schedule('vendrex-growth-worker','* * * * *',$job$
 select net.http_post(
  url:=(select decrypted_secret from vault.decrypted_secrets where name='growth_project_url')||'/functions/v1/growth/worker',
  headers:=jsonb_build_object('Content-Type','application/json','x-growth-worker-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='growth_worker_secret')),
  body:='{}'::jsonb,timeout_milliseconds:=30000);
$job$);
commit;
