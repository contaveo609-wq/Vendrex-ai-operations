-- Dedicated Vendrex project. No client can write evidence, tokens, or queue state.
begin;
create schema if not exists vendrex_private;
revoke all on schema vendrex_private from public, anon, authenticated;
grant usage on schema vendrex_private to service_role;
create table public.vendrex_growth_connections (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 platform text not null check(platform in ('instagram','facebook')), external_id text not null,
 page_id text not null, name text not null, status text not null default 'CONNECTED'
 check(status in ('CONNECTED','AUTH_REQUIRED','DISABLED','DEGRADED')),
 permissions text[] not null default '{}', paused boolean not null default true,
 token_expires_at timestamptz, data_access_expires_at timestamptz, checked_at timestamptz,
 proven_at timestamptz, created_at timestamptz not null default now(),
 unique(owner_id,platform,external_id), unique(id,owner_id)
);
create table public.vendrex_growth_tokens (
 connection_id uuid primary key references public.vendrex_growth_connections(id) on delete cascade,
 ciphertext text not null, updated_at timestamptz not null default now()
);
create table public.vendrex_growth_oauth (
 state_hash text primary key, browser_hash text not null, owner_id uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null default now()+interval '10 minutes'
);
create table public.vendrex_growth_posts (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 connection_id uuid not null, kind text not null check(kind in ('IMAGE','VIDEO','REEL')),
 caption text not null, media_url text not null, mime_type text not null,
 scheduled_for timestamptz not null, next_attempt_at timestamptz not null default now(),
 state text not null default 'QUEUED' check(state in
 ('QUEUED','RUNNING','RETRY','PUBLISHED','FAILED','AUTH_REQUIRED','RECONCILIATION_REQUIRED','CANCELLED','MISSED')),
 phase text not null default 'PREPARE', checkpoint jsonb not null default '{}',
 attempts integer not null default 0, lease uuid, lease_until timestamptz,
 fingerprint text not null, test_post boolean not null default false,
 remote_id text, permalink text, confirmed_at timestamptz, error_code text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(connection_id,owner_id) references public.vendrex_growth_connections(id,owner_id) on delete cascade,
 unique(connection_id,fingerprint),
 check(state<>'PUBLISHED' or (remote_id is not null and permalink is not null and confirmed_at is not null))
);
create unique index growth_slot_unique on public.vendrex_growth_posts(connection_id,scheduled_for) where state<>'CANCELLED';
create index growth_due on public.vendrex_growth_posts(next_attempt_at,scheduled_for) where state in ('QUEUED','RETRY');
create index growth_owner_posts on public.vendrex_growth_posts(owner_id,created_at desc);
create index growth_owner_connections on public.vendrex_growth_connections(owner_id);
create table public.vendrex_growth_metrics (
 post_id uuid primary key references public.vendrex_growth_posts(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 data jsonb not null, collected_at timestamptz not null default now()
);
create index growth_metrics_owner on public.vendrex_growth_metrics(owner_id);
create table public.vendrex_growth_alerts (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 dedupe_key text not null, code text not null, detail text not null,
 created_at timestamptz not null default now(), resolved_at timestamptz, unique(owner_id,dedupe_key)
);
create table public.vendrex_growth_audit (
 id bigint generated always as identity primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 action text not null, detail jsonb not null default '{}', created_at timestamptz not null default now()
);
create index growth_alerts_owner on public.vendrex_growth_alerts(owner_id,created_at desc);
create index growth_audit_owner on public.vendrex_growth_audit(owner_id,created_at desc);
create table public.vendrex_growth_runtime (id boolean primary key default true check(id), last_tick timestamptz);
insert into public.vendrex_growth_runtime(id) values(true);
do $$ declare t text; begin
 foreach t in array array['connections','tokens','oauth','posts','metrics','alerts','audit','runtime'] loop
  execute format('alter table public.vendrex_growth_%I enable row level security',t);
  execute format('revoke all on public.vendrex_growth_%I from public,anon,authenticated',t);
  execute format('grant all on public.vendrex_growth_%I to service_role',t);
 end loop;
 foreach t in array array['connections','posts','metrics','alerts','audit'] loop
  execute format('grant select on public.vendrex_growth_%I to authenticated',t);
  execute format('create policy owner_read on public.vendrex_growth_%I for select to authenticated using ((select auth.uid())=owner_id)',t);
 end loop;
end $$;
grant usage,select on sequence public.vendrex_growth_audit_id_seq to service_role;

create function public.vendrex_growth_consume_oauth(s text,b text)
returns setof public.vendrex_growth_oauth language sql security invoker set search_path='' as $$
 delete from public.vendrex_growth_oauth where state_hash=s and browser_hash=b and expires_at>now() returning *;
$$;
revoke all on function public.vendrex_growth_consume_oauth(text,text) from public,anon,authenticated;
grant execute on function public.vendrex_growth_consume_oauth(text,text) to service_role;

create function public.vendrex_growth_claim()
returns setof public.vendrex_growth_posts language plpgsql security invoker set search_path='' as $$
begin
 update public.vendrex_growth_runtime set last_tick=now() where id;
 -- An expired lease after an external mutation is ambiguous. Never publish it again automatically.
 update public.vendrex_growth_posts set state='RECONCILIATION_REQUIRED',error_code='LEASE_EXPIRED',lease=null,lease_until=null
 where state='RUNNING' and lease_until<now();
 update public.vendrex_growth_posts set state='MISSED',error_code='SCHEDULE_EXPIRED'
 where state in ('QUEUED','RETRY') and scheduled_for<now()-interval '3 hours' and phase='PREPARE';
 delete from public.vendrex_growth_oauth where expires_at<now();
 return query update public.vendrex_growth_posts p
 set state='RUNNING',lease=gen_random_uuid(),lease_until=now()+interval '90 seconds',attempts=attempts+1,updated_at=now()
 where p.id=(select j.id from public.vendrex_growth_posts j
 join public.vendrex_growth_connections c on c.id=j.connection_id
 where j.state in ('QUEUED','RETRY') and j.scheduled_for<=now() and j.next_attempt_at<=now()
 and (c.status='CONNECTED' or j.phase in ('CONFIRM','RECONCILE')) and (not c.paused or j.test_post)
 order by j.scheduled_for for update of j skip locked limit 1)
 returning p.*;
end $$;
revoke all on function public.vendrex_growth_claim() from public,anon,authenticated;
grant execute on function public.vendrex_growth_claim() to service_role;

-- Vault is accessed only through this private helper and a service-only invoker wrapper.
create function vendrex_private.growth_secrets() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(name,decrypted_secret),'{}'::jsonb) from vault.decrypted_secrets
 where name in ('growth_encryption_key','growth_worker_secret','growth_meta_app_id','growth_meta_app_secret',
 'growth_meta_config_id','growth_frontend_origin','growth_allowed_page_ids');
$$;
revoke all on function vendrex_private.growth_secrets() from public,anon,authenticated;
grant execute on function vendrex_private.growth_secrets() to service_role;
create function public.vendrex_growth_secrets() returns jsonb language sql security invoker set search_path='' as $$
 select vendrex_private.growth_secrets();
$$;
revoke all on function public.vendrex_growth_secrets() from public,anon,authenticated;
grant execute on function public.vendrex_growth_secrets() to service_role;
select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'growth_encryption_key');
select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'growth_worker_secret');
commit;
