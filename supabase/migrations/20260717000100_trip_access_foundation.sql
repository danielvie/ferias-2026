-- First slice: trip details and link-derived sessions. No auth.users dependency.
-- Browser roles cannot access these tables or call the backend-only routines.
create schema trip_private;
revoke all on schema trip_private from public, anon, authenticated, service_role;

create table trip_private.trips (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 200),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  timezone text not null default 'Europe/Brussels' check (timezone = 'Europe/Brussels'),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default clock_timestamp()
);

create table trip_private.cities (
  trip_id uuid not null references trip_private.trips on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,100}$'),
  name text not null check (length(btrim(name)) between 1 and 100),
  position integer not null check (position between 0 and 29),
  primary key (trip_id, id),
  unique (trip_id, position)
);
create unique index cities_unique_name on trip_private.cities (trip_id, lower(btrim(name)));

create table trip_private.members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trip_private.trips on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  role text not null check (role in ('owner', 'editor', 'viewer', 'family')),
  created_at timestamptz not null default clock_timestamp(),
  unique (id, trip_id)
);
create unique index members_one_owner on trip_private.members (trip_id) where role = 'owner';

create table trip_private.access_links (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null,
  member_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  event_ids jsonb not null default '[]' check (jsonb_typeof(event_ids) = 'array'),
  place_ids jsonb not null default '[]' check (jsonb_typeof(place_ids) = 'array'),
  created_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  foreign key (member_id, trip_id) references trip_private.members (id, trip_id) on delete cascade
);
create unique index access_links_one_active_per_member
  on trip_private.access_links (member_id) where revoked_at is null;
create index access_links_trip on trip_private.access_links (trip_id);

create table trip_private.sessions (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  link_id uuid not null references trip_private.access_links on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '24 hours')
);
create index sessions_link on trip_private.sessions (link_id);
create index sessions_expiry on trip_private.sessions (expires_at);

alter table trip_private.trips enable row level security;
alter table trip_private.cities enable row level security;
alter table trip_private.members enable row level security;
alter table trip_private.access_links enable row level security;
alter table trip_private.sessions enable row level security;
revoke all on all tables in schema trip_private from public, anon, authenticated, service_role;

-- Internal helpers run as the calling SECURITY DEFINER routine's owner.
create function trip_private.replace_details(p_trip_id uuid, p_details jsonb)
returns void language plpgsql set search_path = '' as $$
declare
  v_city jsonb;
  v_position integer := 0;
begin
  if jsonb_typeof(p_details) is distinct from 'object'
    or jsonb_typeof(p_details->'title') is distinct from 'string'
    or jsonb_typeof(p_details->'startDate') is distinct from 'string'
    or jsonb_typeof(p_details->'endDate') is distinct from 'string'
    or (p_details->>'startDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or (p_details->>'endDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or jsonb_typeof(p_details->'cities') is distinct from 'array' then
    raise sqlstate 'PT422' using message = 'Invalid trip details.';
  end if;
  if jsonb_array_length(p_details->'cities') not between 1 and 30 then
    raise sqlstate 'PT422' using message = 'Choose between one and thirty cities.';
  end if;

  update trip_private.trips set
    title = btrim(p_details->>'title'),
    start_date = (p_details->>'startDate')::date,
    end_date = (p_details->>'endDate')::date
  where id = p_trip_id;
  delete from trip_private.cities where trip_id = p_trip_id;
  for v_city in select value from jsonb_array_elements(p_details->'cities') loop
    if jsonb_typeof(v_city) is distinct from 'object'
      or jsonb_typeof(v_city->'id') is distinct from 'string'
      or jsonb_typeof(v_city->'name') is distinct from 'string' then
      raise sqlstate 'PT422' using message = 'Invalid city.';
    end if;
    insert into trip_private.cities (trip_id, id, name, position)
      values (p_trip_id, v_city->>'id', btrim(v_city->>'name'), v_position);
    v_position := v_position + 1;
  end loop;
end;
$$;

create function trip_private.authorize(p_session_hash text)
returns trip_private.members language plpgsql set search_path = '' as $$
declare
  v_trip_id uuid;
  v_member trip_private.members;
begin
  select l.trip_id into v_trip_id
    from trip_private.sessions s join trip_private.access_links l on l.id = s.link_id
    where s.token_hash = p_session_hash;

  -- All access changes and writes must lock this same trip first. Recheck the
  -- credential after waiting, not using a previously captured authorization.
  perform 1 from trip_private.trips where id = v_trip_id for update;
  select m.* into v_member
    from trip_private.sessions s
    join trip_private.access_links l on l.id = s.link_id
    join trip_private.members m on m.id = l.member_id and m.trip_id = l.trip_id
    where s.token_hash = p_session_hash and s.expires_at > clock_timestamp()
      and l.revoked_at is null;
  if not found then
    raise sqlstate 'PT401' using message = 'This session has expired or is no longer valid.';
  end if;
  return v_member;
end;
$$;

-- The future Edge handler generates independent random 32-byte link/session
-- credentials and passes their SHA-256 hex hashes here. Never pass raw secrets.
create function public.trip_create(
  p_details jsonb, p_owner_name text, p_link_hash text, p_session_hash text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_trip_id uuid;
  v_member_id uuid;
  v_link_id uuid;
begin
  insert into trip_private.trips (title, start_date, end_date)
    values ('New trip', current_date, current_date) returning id into v_trip_id;
  perform trip_private.replace_details(v_trip_id, p_details);
  insert into trip_private.members (trip_id, name, role)
    values (v_trip_id, btrim(p_owner_name), 'owner') returning id into v_member_id;
  insert into trip_private.access_links (trip_id, member_id, token_hash)
    values (v_trip_id, v_member_id, p_link_hash) returning id into v_link_id;
  insert into trip_private.sessions (token_hash, link_id) values (p_session_hash, v_link_id);
  return jsonb_build_object('tripId', v_trip_id, 'memberId', v_member_id);
end;
$$;

create function public.trip_open(p_link_hash text, p_session_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_trip_id uuid;
  v_link trip_private.access_links;
  v_expires_at timestamptz;
begin
  select trip_id into v_trip_id from trip_private.access_links where token_hash = p_link_hash;
  perform 1 from trip_private.trips where id = v_trip_id for update;
  select * into v_link from trip_private.access_links
    where token_hash = p_link_hash and revoked_at is null;
  if not found then
    raise sqlstate 'PT401' using message = 'This trip link is no longer valid.';
  end if;
  delete from trip_private.sessions where link_id = v_link.id and expires_at <= clock_timestamp();
  insert into trip_private.sessions (token_hash, link_id)
    values (p_session_hash, v_link.id) returning expires_at into v_expires_at;
  return jsonb_build_object('tripId', v_link.trip_id, 'memberId', v_link.member_id, 'expiresAt', v_expires_at);
end;
$$;

-- This is the foundation read contract, not the complete browser TripSnapshot.
-- Feature rows and privacy projections are added in subsequent migrations.
create function public.trip_read(p_session_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_member trip_private.members;
  v_trip trip_private.trips;
  v_cities jsonb;
begin
  v_member := trip_private.authorize(p_session_hash);
  select * into strict v_trip from trip_private.trips where id = v_member.trip_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by position), '[]'::jsonb)
    into v_cities from trip_private.cities where trip_id = v_trip.id;
  return jsonb_build_object(
    'revision', case when v_member.role = 'family' then 0 else v_trip.revision end,
    'trip', jsonb_build_object('id', v_trip.id, 'title', v_trip.title,
      'startDate', to_char(v_trip.start_date, 'YYYY-MM-DD'),
      'endDate', to_char(v_trip.end_date, 'YYYY-MM-DD'), 'timezone', v_trip.timezone, 'cities', v_cities),
    'session', jsonb_build_object('id', v_member.id, 'name', v_member.name, 'role', v_member.role)
  );
end;
$$;

create function public.trip_update_details(p_session_hash text, p_revision bigint, p_details jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_member trip_private.members;
begin
  v_member := trip_private.authorize(p_session_hash);
  if v_member.role not in ('owner', 'editor') then
    raise sqlstate 'PT403' using message = 'This link cannot edit the trip.';
  end if;
  if p_revision is distinct from (select revision from trip_private.trips where id = v_member.trip_id) then
    raise sqlstate 'PT409' using message = 'The trip changed. Reload before saving.';
  end if;
  perform trip_private.replace_details(v_member.trip_id, p_details);
  update trip_private.trips set revision = revision + 1 where id = v_member.trip_id;
  return public.trip_read(p_session_hash);
end;
$$;

create function public.trip_end_session(p_session_hash text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform trip_private.authorize(p_session_hash);
  delete from trip_private.sessions where token_hash = p_session_hash;
end;
$$;

create function public.trip_revoke_link(p_session_hash text, p_link_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_member trip_private.members;
begin
  v_member := trip_private.authorize(p_session_hash);
  if v_member.role <> 'owner' then
    raise sqlstate 'PT403' using message = 'Only the owner can revoke a link.';
  end if;
  if exists (
    select 1 from trip_private.access_links
    where id = p_link_id and member_id = v_member.id and trip_id = v_member.trip_id
  ) then
    raise sqlstate 'PT403' using message = 'The owner link must be rotated, not revoked.';
  end if;
  update trip_private.access_links set revoked_at = clock_timestamp()
    where id = p_link_id and trip_id = v_member.trip_id and revoked_at is null;
  if not found then
    raise sqlstate 'PT404' using message = 'Active invitation not found.';
  end if;
  update trip_private.trips set revision = revision + 1 where id = v_member.trip_id;
end;
$$;

revoke all on all functions in schema trip_private from public, anon, authenticated, service_role;
revoke all on function public.trip_create(jsonb, text, text, text) from public, anon, authenticated;
revoke all on function public.trip_open(text, text) from public, anon, authenticated;
revoke all on function public.trip_read(text) from public, anon, authenticated;
revoke all on function public.trip_update_details(text, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.trip_end_session(text) from public, anon, authenticated;
revoke all on function public.trip_revoke_link(text, uuid) from public, anon, authenticated;
grant execute on function public.trip_create(jsonb, text, text, text) to service_role;
grant execute on function public.trip_open(text, text) to service_role;
grant execute on function public.trip_read(text) to service_role;
grant execute on function public.trip_update_details(text, bigint, jsonb) to service_role;
grant execute on function public.trip_end_session(text) to service_role;
grant execute on function public.trip_revoke_link(text, uuid) to service_role;
