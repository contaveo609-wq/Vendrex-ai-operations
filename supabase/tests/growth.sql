-- Real PostgreSQL checks. Fixtures are rolled back; no Meta request is made.
begin;
insert into auth.users(id,email) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','growth-test-a@example.invalid'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','growth-test-b@example.invalid');
insert into public.vendrex_growth_connections(id,owner_id,platform,external_id,page_id,name,paused) values
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','instagram','fixture-1','fixture-page','CONTROLLED TEST A',false),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','facebook','fixture-2','fixture-page','CONTROLLED TEST B',false);
insert into public.vendrex_growth_tokens(connection_id,ciphertext) values
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','CONTROLLED NON-TOKEN CIPHERTEXT');
insert into public.vendrex_growth_posts(id,owner_id,connection_id,kind,caption,media_url,mime_type,scheduled_for,fingerprint) values
 ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','IMAGE','CONTROLLED TEST','https://example.invalid/test.jpg','image/jpeg',now()-interval '1 minute','fixture-hash-1');
do $$ begin
 begin
  insert into public.vendrex_growth_posts(owner_id,connection_id,kind,caption,media_url,mime_type,scheduled_for,fingerprint)
  select owner_id,connection_id,kind,caption,media_url,mime_type,now(),'fixture-hash-1' from public.vendrex_growth_posts where id='cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  raise exception 'Duplicate fingerprint was accepted';
 exception when unique_violation then null; end;
 begin
  insert into public.vendrex_growth_posts(owner_id,connection_id,kind,caption,media_url,mime_type,scheduled_for,fingerprint)
  select owner_id,connection_id,kind,caption,media_url,mime_type,scheduled_for,'fixture-hash-2' from public.vendrex_growth_posts where id='cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  raise exception 'Duplicate slot was accepted';
 exception when unique_violation then null; end;
 begin
  update public.vendrex_growth_posts set state='PUBLISHED' where id='cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  raise exception 'Unconfirmed PUBLISHED evidence was accepted';
 exception when check_violation then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.vendrex_growth_connections)<>1 then raise exception 'RLS owner isolation failed'; end if;
 if exists(select 1 from public.vendrex_growth_connections where owner_id<>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1') then raise exception 'RLS foreign owner leak'; end if;
 if has_table_privilege(current_user,'public.vendrex_growth_tokens','SELECT') then raise exception 'Tokens exposed'; end if;
 if has_function_privilege(current_user,'public.vendrex_growth_secrets()','EXECUTE') then raise exception 'Vault exposed'; end if;
 if has_function_privilege(current_user,'public.vendrex_growth_claim()','EXECUTE') then raise exception 'Worker exposed'; end if;
 begin
  update public.vendrex_growth_connections set proven_at=now();
  raise exception 'Client could forge evidence';
 exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin
  perform * from public.vendrex_growth_connections;
  raise exception 'Anonymous access allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
insert into public.vendrex_growth_oauth(state_hash,browser_hash,owner_id) values
 ('controlled-state','controlled-browser','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
do $$ declare n integer; begin
 select count(*) into n from public.vendrex_growth_consume_oauth('controlled-state','wrong-browser');
 if n<>0 then raise exception 'OAuth browser binding failed'; end if;
 select count(*) into n from public.vendrex_growth_consume_oauth('controlled-state','controlled-browser');
 if n<>1 then raise exception 'OAuth valid state not consumed'; end if;
 select count(*) into n from public.vendrex_growth_consume_oauth('controlled-state','controlled-browser');
 if n<>0 then raise exception 'OAuth replay accepted'; end if;
end $$;
do $$ declare job public.vendrex_growth_posts; n integer; begin
 select * into job from public.vendrex_growth_claim();
 if job.id<>'cccccccc-cccc-4ccc-8ccc-ccccccccccc1' or job.lease is null then raise exception 'Queue claim failed'; end if;
 select count(*) into n from public.vendrex_growth_claim();
 if n<>0 then raise exception 'Queue claimed same post twice'; end if;
 select count(*) into n from public.vendrex_growth_confirm(job.id,job.lease,'https://www.instagram.com/p/controlled-test/');
 if n<>0 then raise exception 'Proof accepted before CONFIRM'; end if;
 -- Pure SQL proof fixture. No Meta request is made; the transaction is rolled back.
 update public.vendrex_growth_posts set phase='CONFIRM',remote_id='CONTROLLED_SQL_FIXTURE' where id=job.id;
 select count(*) into n from public.vendrex_growth_confirm(job.id,job.lease,'https://www.instagram.com/p/controlled-sql-fixture/');
 if n<>1 then raise exception 'Atomic proof failed'; end if;
 if not exists(select 1 from public.vendrex_growth_connections where id=job.connection_id and proven_at is not null)
 or not exists(select 1 from public.vendrex_growth_audit where owner_id=job.owner_id and action='META_PUBLICATION_CONFIRMED') then raise exception 'Proof and audit not atomic'; end if;
 update public.vendrex_growth_posts set state='RUNNING',lease=job.lease where id=job.id;
 update public.vendrex_growth_posts set lease_until=now()-interval '1 minute' where id=job.id;
 perform public.vendrex_growth_claim();
 if (select state from public.vendrex_growth_posts where id=job.id)<>'RECONCILIATION_REQUIRED' then raise exception 'Crash recovery permits duplicate'; end if;
end $$;
reset role;
select 'PASS: real Postgres RLS, grants, deduplication, slots, evidence, claim and crash recovery; all fixtures rolled back' as result;
rollback;
