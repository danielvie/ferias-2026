-- Trusted devices keep derived access until sign-out or link revocation.
-- Infinity preserves existing authorization predicates and NOT NULL constraints.
-- https://www.postgresql.org/docs/current/datatype-datetime.html#DATATYPE-DATETIME-SPECIAL-VALUES
alter table trip_private.sessions alter column expires_at set default 'infinity'::timestamptz;

-- Adopt valid sessions only. Revoked links and already-expired sessions stay invalid.
update trip_private.sessions s set expires_at = 'infinity'::timestamptz
from trip_private.access_links l
where s.link_id = l.id and l.revoked_at is null and s.expires_at > clock_timestamp();

-- Opening a link must not evict another trusted device's remembered access.
create or replace function public.trip_open_online(p_link_hash text, p_session_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.trip_open(p_link_hash, p_session_hash);
  return public.trip_state(p_session_hash);
end;
$$;
