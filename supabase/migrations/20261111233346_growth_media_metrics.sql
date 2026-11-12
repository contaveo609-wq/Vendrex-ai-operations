begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('growth-media','growth-media',true,1073741824,array['image/jpeg','video/mp4']);
create policy growth_media_insert on storage.objects for insert to authenticated
with check(bucket_id='growth-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy growth_media_owner_read on storage.objects for select to authenticated
using(bucket_id='growth-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- Files are immutable. No UPDATE or DELETE policy is granted to browser sessions.
create function public.vendrex_growth_metric_due() returns setof public.vendrex_growth_posts
language sql security invoker set search_path='' as $$
 select p.* from public.vendrex_growth_posts p
 join public.vendrex_growth_connections c on c.id=p.connection_id
 left join public.vendrex_growth_metrics m on m.post_id=p.id
 where p.state='PUBLISHED' and c.status='CONNECTED' and p.confirmed_at>now()-interval '30 days'
 and (m.post_id is null or m.collected_at<now()-interval '6 hours')
 order by m.collected_at asc nulls first,p.confirmed_at desc limit 1;
$$;
revoke all on function public.vendrex_growth_metric_due() from public,anon,authenticated;
grant execute on function public.vendrex_growth_metric_due() to service_role;
commit;
