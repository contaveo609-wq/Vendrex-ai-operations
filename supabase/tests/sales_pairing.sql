-- Real Postgres; all controlled images, leases and Vault entries are rolled back.
begin;
update public.vendrex_sales_settings set paused=true,transport_policy='BAILEYS_QR' where id;
update public.vendrex_sales_instances set lease_owner=null,lease_until=null,state='HOST_REQUIRED' where id='vendrex-sales';
do $$declare b uuid:='11111111-1111-4111-8111-111111111111';other uuid:='22222222-2222-4222-8222-222222222222';r jsonb;sid uuid;
 png text:='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5+J0EAAAAASUVORK5CYII=';
begin
 if public.vendrex_sales_pairing_get()->>'state'<>'HOST_REQUIRED' then raise exception 'False active host';end if;
 if has_function_privilege('anon','public.vendrex_sales_pairing_get()','execute') or has_function_privilege('authenticated','public.vendrex_sales_pairing_get()','execute') then raise exception 'Pairing exposed to client role';end if;
 perform public.vendrex_sales_qr_lease('vendrex-sales',b,'LOCAL_TEST');
 perform public.vendrex_sales_qr_heartbeat('vendrex-sales',b,'WAITING_QR',null);
 begin
  perform public.vendrex_sales_pairing_put('vendrex-sales',other,png,clock_timestamp()+interval '15 seconds');raise exception 'Wrong boot accepted';
 exception when raise_exception then if sqlerrm<>'QR_LEASE_REQUIRED' then raise;end if;end;
 begin
  perform public.vendrex_sales_pairing_put('vendrex-sales',b,'javascript:INVALID',clock_timestamp()+interval '15 seconds');raise exception 'Invalid image accepted';
 exception when raise_exception then if sqlerrm<>'INVALID_PAIRING_IMAGE' then raise;end if;end;
 perform public.vendrex_sales_pairing_put('vendrex-sales',b,png,clock_timestamp()+interval '15 seconds');
 r:=public.vendrex_sales_pairing_get();if r->>'state'<>'QR_READY' or r->>'qr_data_url'<>png then raise exception 'Pairing image not retrievable';end if;
 select pairing_secret_id into sid from public.vendrex_sales_instances where id='vendrex-sales';
 if not exists(select 1 from vault.secrets where id=sid and secret<>png) then raise exception 'Pairing not encrypted in Vault';end if;
 update public.vendrex_sales_instances set pairing_expires_at=clock_timestamp()-interval '1 second' where id='vendrex-sales';
 r:=public.vendrex_sales_pairing_get();if r->>'state'<>'QR_EXPIRED' or r?'qr_data_url' then raise exception 'Expired QR exposed';end if;
 perform public.vendrex_sales_pairing_put('vendrex-sales',b,png,clock_timestamp()+interval '15 seconds');
 update public.vendrex_sales_instances set pairing_boot=other where id='vendrex-sales';
 if public.vendrex_sales_pairing_get()?'qr_data_url' then raise exception 'Old process QR exposed';end if;
 perform public.vendrex_sales_pairing_put('vendrex-sales',b,null);
 if (select decrypted_secret from vault.decrypted_secrets where id=sid)<>'CLEARED' then raise exception 'Pairing material not cleared';end if;
 perform public.vendrex_sales_qr_heartbeat('vendrex-sales',b,'CONNECTED',null);
 r:=public.vendrex_sales_pairing_get();if r->>'state'<>'CONNECTED' or r?'qr_data_url' then raise exception 'QR retained after connection';end if;
 perform public.vendrex_sales_qr_release('vendrex-sales',b);
 if public.vendrex_sales_pairing_get()->>'state'<>'HOST_REQUIRED' then raise exception 'Stopped host exposed';end if;
 if (public.vendrex_sales_proof()->>'SALES_WHATSAPP_OPERATIONAL')::boolean then raise exception 'Pairing falsely claims operational';end if;
end $$;
rollback;
