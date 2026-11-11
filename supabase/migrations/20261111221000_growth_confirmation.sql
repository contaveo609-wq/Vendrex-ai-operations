begin;
create function public.vendrex_growth_confirm(post uuid,lease_id uuid,link text)
returns setof public.vendrex_growth_posts language plpgsql security invoker set search_path='' as $$
declare published public.vendrex_growth_posts;
begin
 if link !~ '^https://([a-zA-Z0-9-]+\.)*(instagram|facebook)\.com/' then raise exception 'Invalid platform link'; end if;
 update public.vendrex_growth_posts set state='PUBLISHED',permalink=link,confirmed_at=now(),
 error_code=null,lease=null,lease_until=null,updated_at=now()
 where id=post and lease=lease_id and state='RUNNING' and phase='CONFIRM' and remote_id is not null and lease_until>now()
 returning * into published;
 if published.id is null then return; end if;
 update public.vendrex_growth_connections set proven_at=now(),status='CONNECTED' where id=published.connection_id;
 insert into public.vendrex_growth_audit(owner_id,action,detail) values(published.owner_id,'META_PUBLICATION_CONFIRMED',
 jsonb_build_object('post_id',published.id,'remote_id',published.remote_id,'permalink',link));
 return next published;
end $$;
revoke all on function public.vendrex_growth_confirm(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.vendrex_growth_confirm(uuid,uuid,text) to service_role;
commit;
