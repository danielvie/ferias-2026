-- Each domain collection has its own rows. Comments and departure items remain
-- nested with their parent, matching the application's existing access boundary.
do $$
declare v_table text;
begin
  foreach v_table in array array['places', 'events', 'notes', 'packing', 'transfers', 'activity'] loop
    execute format('create table trip_private.%I (
      trip_id uuid not null references trip_private.trips on delete cascade,
      id text not null check (id ~ ''^[A-Za-z0-9_-]{1,100}$''),
      payload jsonb not null check (jsonb_typeof(payload) = ''object'' and payload->>''id'' is not null and payload->>''id'' = id),
      position integer not null check (position >= 0),
      primary key (trip_id, id)
    )', v_table);
    execute format('alter table trip_private.%I enable row level security', v_table);
    execute format('revoke all on trip_private.%I from public, anon, authenticated, service_role', v_table);
  end loop;
end;
$$;

create table trip_private.settings (
  singleton boolean primary key default true check (singleton),
  creation_enabled boolean not null default false,
  max_trips integer not null default 10 check (max_trips between 1 and 100)
);
insert into trip_private.settings default values;
create table trip_private.request_limits (
  bucket text primary key,
  window_start bigint not null,
  requests integer not null
);
alter table trip_private.settings enable row level security;
alter table trip_private.request_limits enable row level security;
revoke all on trip_private.settings, trip_private.request_limits from public, anon, authenticated, service_role;

create function public.trip_rate_limit(p_bucket text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_limit integer; v_seconds integer; v_window bigint; v_count integer;
begin
  -- Global bounds do not trust a client-supplied IP address or create unbounded
  -- rate-limit rows. They limit DB growth, not hostile function invocation costs.
  case p_bucket
    when 'create' then v_limit := 5; v_seconds := 3600;
    when 'open' then v_limit := 60; v_seconds := 60;
    when 'write' then v_limit := 120; v_seconds := 60;
    else raise sqlstate 'PT422' using message = 'Unknown request limit.';
  end case;
  v_window := floor(extract(epoch from clock_timestamp()) / v_seconds);
  insert into trip_private.request_limits as r (bucket, window_start, requests)
    values (p_bucket, v_window, 1)
    on conflict (bucket) do update set window_start = excluded.window_start,
      requests = case when r.window_start = excluded.window_start then r.requests + 1 else 1 end
    returning requests into v_count;
  if v_count > v_limit then
    raise sqlstate 'PT429' using message = 'Too many requests. Wait before trying again.';
  end if;
end;
$$;

-- This raw state is for the trusted Edge handler only. It MUST pass through the
-- shared privacy projection before any browser response.
create function public.trip_state(p_session_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_member trip_private.members; v_link trip_private.access_links;
  v_data jsonb; v_members jsonb; v_table text; v_items jsonb; v_revision bigint;
begin
  v_member := trip_private.authorize(p_session_hash);
  select l.* into strict v_link from trip_private.access_links l
    join trip_private.sessions s on s.link_id = l.id where s.token_hash = p_session_hash;
  select revision into v_revision from trip_private.trips where id = v_member.trip_id;
  v_data := jsonb_build_object('trip', public.trip_read(p_session_hash)->'trip');
  foreach v_table in array array['places', 'events', 'notes', 'packing', 'transfers', 'activity'] loop
    execute format('select coalesce(jsonb_agg(payload order by position), ''[]''::jsonb) from trip_private.%I where trip_id = $1', v_table)
      into v_items using v_member.trip_id;
    v_data := v_data || jsonb_build_object(v_table, v_items);
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'role', m.role) order by m.created_at), '[]'::jsonb)
    into v_members from trip_private.members m where m.trip_id = v_member.trip_id
      and exists (select 1 from trip_private.access_links l where l.member_id = m.id and l.revoked_at is null);
  return jsonb_build_object('revision', v_revision, 'data', v_data, 'members', v_members,
    'access', jsonb_build_object('tripId', v_member.trip_id,
      'member', jsonb_build_object('id', v_member.id, 'name', v_member.name, 'role', v_member.role),
      'eventIds', v_link.event_ids, 'placeIds', v_link.place_ids));
end;
$$;

create function trip_private.store_items(p_trip_id uuid, p_table text, p_items jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  if p_table not in ('places', 'events', 'notes', 'packing', 'transfers', 'activity')
    or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 2000 then
    raise sqlstate 'PT422' using message = 'Invalid or oversized collection.';
  end if;
  execute format('delete from trip_private.%I where trip_id = $1', p_table) using p_trip_id;
  execute format('insert into trip_private.%I (trip_id, id, payload, position)
    select $1, value->>''id'', value, ordinality - 1 from jsonb_array_elements($2) with ordinality', p_table)
    using p_trip_id, p_items;
end;
$$;

create function public.trip_commit(p_session_hash text, p_revision bigint, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_member trip_private.members; v_table text;
begin
  v_member := trip_private.authorize(p_session_hash);
  if v_member.role not in ('owner', 'editor') then
    raise sqlstate 'PT403' using message = 'This link cannot edit the trip.';
  end if;
  if p_revision is distinct from (select revision from trip_private.trips where id = v_member.trip_id) then
    raise sqlstate 'PT409' using message = 'The trip changed. Reload before saving.';
  end if;
  if p_data#>>'{trip,id}' is distinct from v_member.trip_id::text or octet_length(p_data::text) > 2097152 then
    raise sqlstate 'PT422' using message = 'Invalid trip or trip storage limit reached.';
  end if;
  -- Defense in depth for private annotations, even if a future Edge command
  -- accidentally tries to replace another member's invisible note.
  if exists (
    select 1 from trip_private.notes old where old.trip_id = v_member.trip_id
      and old.payload->>'visibility' = 'private' and old.payload->>'authorId' <> v_member.id::text
      and not exists (select 1 from jsonb_array_elements(p_data->'notes') n where n = old.payload)
  ) or exists (
    select 1 from jsonb_array_elements(p_data->'notes') n
    left join trip_private.notes old on old.trip_id = v_member.trip_id and old.id = n->>'id'
    where (old.id is null and n->>'authorId' is distinct from v_member.id::text)
      or (old.id is not null and n->>'authorId' is distinct from old.payload->>'authorId')
      or (old.payload->>'visibility' = 'trip' and n->>'visibility' = 'private'
        and old.payload->>'authorId' <> v_member.id::text)
  ) then
    raise sqlstate 'PT403' using message = 'Private note ownership cannot be changed.';
  end if;
  perform trip_private.replace_details(v_member.trip_id, p_data->'trip');
  foreach v_table in array array['places', 'events', 'notes', 'packing', 'transfers', 'activity'] loop
    perform trip_private.store_items(v_member.trip_id, v_table, p_data->v_table);
  end loop;
  update trip_private.trips set revision = revision + 1 where id = v_member.trip_id;
  return public.trip_state(p_session_hash);
end;
$$;

create function public.trip_create_online(
  p_details jsonb, p_owner_name text, p_link_hash text, p_session_hash text, p_packing jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_settings trip_private.settings; v_created jsonb;
begin
  select * into strict v_settings from trip_private.settings where singleton for update;
  if not v_settings.creation_enabled then
    raise sqlstate 'PT403' using message = 'New trip creation is disabled. Open an existing trip link.';
  end if;
  if (select count(*) from trip_private.trips) >= v_settings.max_trips then
    raise sqlstate 'PT422' using message = 'The project trip limit has been reached.';
  end if;
  v_created := public.trip_create(p_details, p_owner_name, p_link_hash, p_session_hash);
  perform trip_private.store_items((v_created->>'tripId')::uuid, 'packing', p_packing);
  return public.trip_state(p_session_hash);
end;
$$;

create function public.trip_open_online(p_link_hash text, p_session_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_opened jsonb;
begin
  v_opened := public.trip_open(p_link_hash, p_session_hash);
  delete from trip_private.sessions where expires_at <= clock_timestamp();
  -- A reused member link does not accumulate an unlimited number of sessions.
  delete from trip_private.sessions where token_hash in (
    select s.token_hash from trip_private.sessions s join trip_private.access_links l on l.id = s.link_id
      where l.member_id = (v_opened->>'memberId')::uuid order by s.created_at desc offset 20
  );
  return public.trip_state(p_session_hash);
end;
$$;

create function public.trip_invitations(p_session_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_member trip_private.members; v_result jsonb;
begin
  v_member := trip_private.authorize(p_session_hash);
  if v_member.role <> 'owner' then raise sqlstate 'PT403' using message = 'Only the owner can manage links.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'role', m.role,
    'eventIds', l.event_ids, 'placeIds', l.place_ids, 'createdAt', l.created_at) order by l.created_at), '[]'::jsonb)
    into v_result from trip_private.members m join trip_private.access_links l on l.member_id = m.id
    where m.trip_id = v_member.trip_id and m.role <> 'owner' and l.revoked_at is null;
  return v_result;
end;
$$;

create function public.trip_invite(p_session_hash text, p_input jsonb, p_link_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_member trip_private.members; v_id uuid;
begin
  v_member := trip_private.authorize(p_session_hash);
  if v_member.role <> 'owner' then raise sqlstate 'PT403' using message = 'Only the owner can manage links.'; end if;
  if (select count(*) from trip_private.access_links where trip_id = v_member.trip_id and revoked_at is null) >= 20 then
    raise sqlstate 'PT422' using message = 'The active link limit has been reached.';
  end if;
  if p_input->>'role' is null or p_input->>'role' not in ('editor', 'viewer', 'family')
    or jsonb_typeof(p_input->'eventIds') is distinct from 'array'
    or jsonb_typeof(p_input->'placeIds') is distinct from 'array' then
    raise sqlstate 'PT422' using message = 'Invalid invitation.';
  end if;
  if exists (select 1 from jsonb_array_elements_text(p_input->'eventIds') x where not exists
    (select 1 from trip_private.events where trip_id = v_member.trip_id and id = x))
    or exists (select 1 from jsonb_array_elements_text(p_input->'placeIds') x where not exists
    (select 1 from trip_private.places where trip_id = v_member.trip_id and id = x)) then
    raise sqlstate 'PT422' using message = 'A selected event or place no longer exists.';
  end if;
  insert into trip_private.members (trip_id, name, role)
    values (v_member.trip_id, p_input->>'name', p_input->>'role') returning id into v_id;
  insert into trip_private.access_links (trip_id, member_id, token_hash, event_ids, place_ids)
    values (v_member.trip_id, v_id, p_link_hash, p_input->'eventIds', p_input->'placeIds');
  update trip_private.trips set revision = revision + 1 where id = v_member.trip_id;
  return jsonb_build_object('id', v_id);
end;
$$;

create function public.trip_revoke_member(p_session_hash text, p_member_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_member trip_private.members; v_link_id uuid;
begin
  v_member := trip_private.authorize(p_session_hash);
  if v_member.role <> 'owner' then raise sqlstate 'PT403' using message = 'Only the owner can manage links.'; end if;
  select id into v_link_id from trip_private.access_links
    where member_id = p_member_id and trip_id = v_member.trip_id and revoked_at is null;
  if not found then raise sqlstate 'PT404' using message = 'Active invitation not found.'; end if;
  perform public.trip_revoke_link(p_session_hash, v_link_id);
end;
$$;

create function public.trip_rotate(
  p_session_hash text, p_member_id uuid, p_link_hash text, p_new_session_hash text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_member trip_private.members; v_old trip_private.access_links; v_link_id uuid;
begin
  v_member := trip_private.authorize(p_session_hash);
  if v_member.role <> 'owner' then raise sqlstate 'PT403' using message = 'Only the owner can manage links.'; end if;
  select * into v_old from trip_private.access_links
    where member_id = p_member_id and trip_id = v_member.trip_id and revoked_at is null;
  if not found then raise sqlstate 'PT404' using message = 'Active link not found.'; end if;
  update trip_private.access_links set revoked_at = clock_timestamp() where id = v_old.id;
  insert into trip_private.access_links (trip_id, member_id, token_hash, event_ids, place_ids)
    values (v_old.trip_id, v_old.member_id, p_link_hash, v_old.event_ids, v_old.place_ids) returning id into v_link_id;
  if p_member_id = v_member.id then
    insert into trip_private.sessions (token_hash, link_id) values (p_new_session_hash, v_link_id);
  end if;
  update trip_private.trips set revision = revision + 1 where id = v_member.trip_id;
  return jsonb_build_object('id', p_member_id, 'owner', p_member_id = v_member.id);
end;
$$;

revoke all on all functions in schema trip_private from public, anon, authenticated, service_role;
do $$
declare v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'trip_rate_limit', 'trip_state', 'trip_commit', 'trip_create_online', 'trip_open_online',
      'trip_invitations', 'trip_invite', 'trip_revoke_member', 'trip_rotate'
    )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_function);
    execute format('grant execute on function %s to service_role', v_function);
  end loop;
end;
$$;
