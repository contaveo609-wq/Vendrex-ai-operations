-- Owner-authenticated private dashboard writes the free-tier key to Vault.
begin;
create function public.vendrex_sales_groq_key_set(api_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 if api_key is null or api_key !~ '^gsk_[A-Za-z0-9_-]{32,200}$' then raise exception 'GROQ_KEY_INVALID';end if;
 select id into sid from vault.secrets where name='sales_groq_api_key';
 if sid is null then perform vault.create_secret(api_key,'sales_groq_api_key');
 else perform vault.update_secret(sid,api_key,'sales_groq_api_key');end if;
 update public.vendrex_sales_settings set paused=true,inference_verified_at=null,inference_quality_verified_at=null where id;
 return jsonb_build_object('saved',true,'paused',true);
end $$;
revoke all on function public.vendrex_sales_groq_key_set(text) from public,anon,authenticated;
grant execute on function public.vendrex_sales_groq_key_set(text) to service_role;
commit;
