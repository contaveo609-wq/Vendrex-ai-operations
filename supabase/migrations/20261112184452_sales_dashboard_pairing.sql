-- Short-lived pairing images live encrypted in Vault, never in public storage or logs.
alter table public.vendrex_sales_instances
 add column pairing_secret_id uuid,
 add column pairing_boot uuid,
 add column pairing_expires_at timestamptz;

create function vendrex_private.sales_pairing_put(instance text,boot uuid,png text,expires_at timestamptz default null)
returns void language plpgsql security definer set search_path='' as $$
declare i public.vendrex_sales_instances;sid uuid;begin
 perform vendrex_private.qr_assert(instance,boot);
 select * into i from public.vendrex_sales_instances where id=instance for update;
 sid:=i.pairing_secret_id;
 if png is null then
  if sid is not null then perform vault.update_secret(sid,'CLEARED');end if;
  update public.vendrex_sales_instances set pairing_boot=null,pairing_expires_at=null where id=instance;
  return;
 end if;
 if i.state<>'WAITING_QR' or length(png)>100000 or png!~'^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$'
 or expires_at is null or expires_at<=clock_timestamp() or expires_at>clock_timestamp()+interval '60 seconds'
 then raise exception 'INVALID_PAIRING_IMAGE';end if;
 if sid is null then
  select id into sid from vault.secrets where name='sales_pairing_png.'||instance;
  if sid is null then sid:=vault.create_secret(png,'sales_pairing_png.'||instance);
  else perform vault.update_secret(sid,png);end if;
 else perform vault.update_secret(sid,png);end if;
 update public.vendrex_sales_instances set pairing_secret_id=sid,pairing_boot=boot,
  pairing_expires_at=least(expires_at,clock_timestamp()+interval '55 seconds') where id=instance;
end $$;

create function vendrex_private.sales_pairing_get() returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.vendrex_sales_settings;i public.vendrex_sales_instances;png text;begin
 select * into s from public.vendrex_sales_settings where id;
 if s.transport_policy<>'BAILEYS_QR' then return jsonb_build_object('state','DISABLED_BY_OWNER');end if;
 select * into i from public.vendrex_sales_instances where id=s.qr_instance;
 if i.lease_until is null or i.lease_until<=clock_timestamp() then return jsonb_build_object('state','HOST_REQUIRED');end if;
 if i.state='CONNECTED' then return jsonb_build_object('state','CONNECTED','host_kind',i.host_kind);end if;
 if i.state='WAITING_QR' then
  if i.pairing_boot=i.lease_owner and i.pairing_expires_at>clock_timestamp() then
   select decrypted_secret into png from vault.decrypted_secrets where id=i.pairing_secret_id;
   if png like 'data:image/png;base64,iVBORw0KGgo%' then return jsonb_build_object('state','QR_READY','qr_data_url',png,'expires_at',i.pairing_expires_at,'host_kind',i.host_kind);end if;
  end if;
  return jsonb_build_object('state','QR_EXPIRED','host_kind',i.host_kind);
 end if;
 return jsonb_build_object('state',i.state,'host_kind',i.host_kind);
end $$;

create function public.vendrex_sales_pairing_put(instance text,boot uuid,png text,expires_at timestamptz default null)
returns void language sql security invoker set search_path='' as $$select vendrex_private.sales_pairing_put(instance,boot,png,expires_at);$$;
create function public.vendrex_sales_pairing_get() returns jsonb
language sql security invoker set search_path='' as $$select vendrex_private.sales_pairing_get();$$;
revoke all on function vendrex_private.sales_pairing_put(text,uuid,text,timestamptz),vendrex_private.sales_pairing_get(),public.vendrex_sales_pairing_put(text,uuid,text,timestamptz),public.vendrex_sales_pairing_get() from public,anon,authenticated;
grant execute on function vendrex_private.sales_pairing_put(text,uuid,text,timestamptz),vendrex_private.sales_pairing_get(),public.vendrex_sales_pairing_put(text,uuid,text,timestamptz),public.vendrex_sales_pairing_get() to service_role;
