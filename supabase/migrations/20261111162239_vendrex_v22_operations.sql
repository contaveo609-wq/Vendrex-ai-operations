-- VENDREX V2.2: control plane, tenant ownership and durable jobs.
-- Apply only to a dedicated authorized project. No client production tables are modified.
begin;
create table if not exists public.vendrex_context (
 owner_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
 version text not null default '2.2.0',
 context jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);
create table if not exists public.vendrex_records (
 id text not null,
 owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
 entity text not null,
 project_id text,
 payload jsonb not null,
 updated_at timestamptz not null default now(),
 primary key(owner_id,entity,id)
);
create index if not exists vendrex_records_owner_entity on public.vendrex_records(owner_id,entity,updated_at desc);
create table if not exists public.vendrex_jobs (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
 agent text not null check(agent in ('sales','builder','growth','director')),
 kind text not null,
 state text not null default 'QUEUED' check(state in ('QUEUED','RUNNING','COMPLETED','FAILED','BLOCKED','WAITING_APPROVAL','CANCELLED')),
 priority integer not null default 50 check(priority between 1 and 100),
 input jsonb not null default '{}'::jsonb,
 result jsonb,
 idempotency_key text not null,
 executor_id text,
 claimed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(owner_id,idempotency_key)
);
create unique index if not exists vendrex_one_active_job on public.vendrex_jobs(owner_id) where state='RUNNING';
create index if not exists vendrex_queue_claim on public.vendrex_jobs(owner_id,priority,created_at) where state='QUEUED';
alter table public.vendrex_context enable row level security;
alter table public.vendrex_records enable row level security;
alter table public.vendrex_jobs enable row level security;
revoke all on public.vendrex_context, public.vendrex_records, public.vendrex_jobs from anon;
grant select,insert,update,delete on public.vendrex_context, public.vendrex_records to authenticated;
grant select,insert,update on public.vendrex_jobs to authenticated;
create policy context_owner on public.vendrex_context for all to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy records_owner on public.vendrex_records for all to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy jobs_owner on public.vendrex_jobs for all to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create or replace function public.vendrex_claim_job(requested_executor text)
returns setof public.vendrex_jobs
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if exists(select 1 from public.vendrex_jobs where owner_id=auth.uid() and state='RUNNING') then return; end if;
 return query update public.vendrex_jobs set state='RUNNING',executor_id=requested_executor,claimed_at=now(),updated_at=now()
 where id=(select id from public.vendrex_jobs where owner_id=auth.uid() and state='QUEUED' order by priority,created_at for update skip locked limit 1)
 returning *;
exception when unique_violation then return;
end $$;
revoke all on function public.vendrex_claim_job(text) from public,anon;
grant execute on function public.vendrex_claim_job(text) to authenticated;
commit;
