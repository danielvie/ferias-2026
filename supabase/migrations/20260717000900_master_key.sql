-- Disabled until an operator provisions a random key's SHA-256 hash.
create table trip_private.master_key (
  singleton boolean primary key default true check (singleton),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$')
);
alter table trip_private.master_key enable row level security;
revoke all on trip_private.master_key from public, anon, authenticated, service_role;

-- Normal sessions remain untagged. Deleting a key deletes only its sessions.
alter table trip_private.sessions add column master_key_hash text
  references trip_private.master_key(token_hash) on delete cascade;
create index sessions_master_key on trip_private.sessions(master_key_hash)
  where master_key_hash is not null;

create function trip_private.set_master_key(p_hash text)
returns void language plpgsql set search_path = '' as $$
begin
  if p_hash is not null and p_hash !~ '^[a-f0-9]{64}$' then
    raise sqlstate 'PT422' using message = 'Invalid master key hash.';
  end if;
  -- Configuration locks the key before trips, as opening does. Wait for any
  -- authorized trip operation before revoking; pending operations then recheck.
  lock table trip_private.master_key in share row exclusive mode;
  perform 1 from trip_private.master_key for update;
  if exists (select 1 from trip_private.master_key where token_hash = p_hash) then
    return;
  end if;
  perform 1 from trip_private.trips t where exists (
    select 1 from trip_private.access_links l join trip_private.sessions s on s.link_id = l.id
    where l.trip_id = t.id and s.master_key_hash is not null
  ) order by t.id for update;
  delete from trip_private.master_key where token_hash is distinct from p_hash;
  if p_hash is not null then
    insert into trip_private.master_key(token_hash) values (p_hash)
      on conflict (singleton) do nothing;
  end if;
end;
$$;
revoke all on function trip_private.set_master_key(text) from public, anon, authenticated, service_role;

create function trip_private.check_master_key(p_key_hash text)
returns void language plpgsql set search_path = '' as $$
begin
  -- Hold the key until listing/opening finishes; replacement cannot race a grant.
  perform 1 from trip_private.master_key where token_hash = p_key_hash for key share;
  if not found then
    raise sqlstate 'PT401' using message = 'Master key is invalid or access is disabled.';
  end if;
end;
$$;
revoke all on function trip_private.check_master_key(text) from public, anon, authenticated, service_role;

create function public.trip_master_list(p_key_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_trips jsonb;
begin
  perform trip_private.check_master_key(p_key_hash);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'title', t.title, 'startDate', to_char(t.start_date, 'YYYY-MM-DD'),
    'endDate', to_char(t.end_date, 'YYYY-MM-DD'), 'ownerName', m.name
  ) order by t.created_at desc, t.id), '[]'::jsonb) into v_trips
  from trip_private.trips t
  join trip_private.members m on m.trip_id = t.id and m.role = 'owner';
  return v_trips;
end;
$$;

create function public.trip_master_open(p_key_hash text, p_trip_id uuid, p_session_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_link_id uuid;
begin
  perform trip_private.check_master_key(p_key_hash);
  -- Match the existing trip-first access lock, then resolve the current link.
  perform 1 from trip_private.trips where id = p_trip_id for update;
  select l.id into v_link_id from trip_private.members m
    join trip_private.access_links l on l.member_id = m.id and l.trip_id = m.trip_id
    where m.trip_id = p_trip_id and m.role = 'owner' and l.revoked_at is null;
  if not found then
    raise sqlstate 'PT404' using message = 'This trip no longer has an active owner link.';
  end if;
  insert into trip_private.sessions(token_hash, link_id, master_key_hash)
    values (p_session_hash, v_link_id, p_key_hash);
  return public.trip_state(p_session_hash);
end;
$$;

revoke all on function public.trip_master_list(text) from public, anon, authenticated;
revoke all on function public.trip_master_open(text, uuid, text) from public, anon, authenticated;
grant execute on function public.trip_master_list(text) to service_role;
grant execute on function public.trip_master_open(text, uuid, text) to service_role;
