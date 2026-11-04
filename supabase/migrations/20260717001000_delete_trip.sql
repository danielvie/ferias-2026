-- Whole-trip deletion is explicit and password-authorized.
-- Existing foreign keys remove the trip's content, links and sessions together.
create function public.trip_master_delete(p_key_hash text, p_trip_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform trip_private.check_master_key(p_key_hash);
  delete from trip_private.trips where id = p_trip_id;
  -- Idempotent so a lost response can be retried before clearing browser access.
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.trip_master_delete(text, uuid) from public, anon, authenticated;
grant execute on function public.trip_master_delete(text, uuid) to service_role;
