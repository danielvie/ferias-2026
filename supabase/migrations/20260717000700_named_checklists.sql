-- Named lists are the canonical store. Retain the old packing table for a
-- non-destructive upgrade, but never read/write it after adopting its items.
create table trip_private.checklists (
  trip_id uuid not null references trip_private.trips on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,100}$'),
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object' and payload->>'id' is not null
    and payload->>'id' = id and jsonb_typeof(payload->'items') is not distinct from 'array'
  ),
  position integer not null check (position >= 0),
  primary key (trip_id, id)
);
alter table trip_private.checklists enable row level security;
revoke all on trip_private.checklists from public, anon, authenticated, service_role;

insert into trip_private.checklists(trip_id, id, payload, position)
select t.id, 'packing', jsonb_build_object('id', 'packing', 'title', 'Packing',
  'items', coalesce((select jsonb_agg(p.payload order by p.position)
    from trip_private.packing p where p.trip_id = t.id), '[]'::jsonb)), 0
from trip_private.trips t;

create or replace function trip_private.store_items(p_trip_id uuid, p_table text, p_items jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  if p_table not in ('places', 'events', 'notes', 'packing', 'checklists', 'transfers', 'activity')
    or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 2000 then
    raise sqlstate 'PT422' using message = 'Invalid or oversized collection.';
  end if;
  execute format('delete from trip_private.%I where trip_id = $1', p_table) using p_trip_id;
  execute format('insert into trip_private.%I (trip_id, id, payload, position)
    select $1, value->>''id'', value, ordinality - 1 from jsonb_array_elements($2) with ordinality', p_table)
    using p_trip_id, p_items;
end;
$$;

-- This raw state still goes through the Edge permission projection.
create or replace function public.trip_state(p_session_hash text)
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
  foreach v_table in array array['places', 'events', 'notes', 'checklists', 'transfers', 'activity'] loop
    execute format('select coalesce(jsonb_agg(payload order by position), ''[]''::jsonb) from trip_private.%I where trip_id = $1', v_table)
      into v_items using v_member.trip_id;
    v_data := v_data || jsonb_build_object(v_table, v_items);
  end loop;
  -- Compatibility field for earlier clients, derived from the canonical list.
  select payload->'items' into v_items from trip_private.checklists
    where trip_id = v_member.trip_id and id = 'packing';
  v_data := v_data || jsonb_build_object('packing', coalesce(v_items, '[]'::jsonb));
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'role', m.role) order by m.created_at), '[]'::jsonb)
    into v_members from trip_private.members m where m.trip_id = v_member.trip_id
      and exists (select 1 from trip_private.access_links l where l.member_id = m.id and l.revoked_at is null);
  return jsonb_build_object('revision', v_revision, 'data', v_data, 'members', v_members,
    'access', jsonb_build_object('tripId', v_member.trip_id,
      'member', jsonb_build_object('id', v_member.id, 'name', v_member.name, 'role', v_member.role),
      'eventIds', v_link.event_ids, 'placeIds', v_link.place_ids));
end;
$$;

-- The public history wrapper continues to call this private transactional writer.
create or replace function trip_private.trip_commit(p_session_hash text, p_revision bigint, p_data jsonb)
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
  if jsonb_typeof(p_data->'checklists') is distinct from 'array' then
    raise sqlstate 'PT422' using message = 'This API version cannot save checklists. Update the trip API.';
  end if;
  if p_data#>>'{trip,id}' is distinct from v_member.trip_id::text or octet_length(p_data::text) > 2097152 then
    raise sqlstate 'PT422' using message = 'Invalid trip or trip storage limit reached.';
  end if;
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
  foreach v_table in array array['places', 'events', 'notes', 'checklists', 'transfers', 'activity'] loop
    perform trip_private.store_items(v_member.trip_id, v_table, p_data->v_table);
  end loop;
  update trip_private.trips set revision = revision + 1 where id = v_member.trip_id;
  return public.trip_state(p_session_hash);
end;
$$;

create or replace function trip_private.trip_create_online(
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
  perform trip_private.store_items((v_created->>'tripId')::uuid, 'checklists',
    jsonb_build_array(jsonb_build_object('id', 'packing', 'title', 'Packing', 'items', p_packing)));
  return public.trip_state(p_session_hash);
end;
$$;

-- A pre-checklist Edge handler reads the new state too, but edits only its
-- derived packing array. Require an explicit writer capability so those saves
-- cannot return success while silently ignoring packing edits.
alter function public.trip_commit(text, bigint, jsonb, jsonb) set schema trip_private;
alter function trip_private.trip_commit(text, bigint, jsonb, jsonb) rename to trip_commit_with_history;
create function public.trip_commit(
  p_session_hash text, p_revision bigint, p_data jsonb,
  p_changes jsonb default null, p_checklist_version integer default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_member trip_private.members;
begin
  v_member := trip_private.authorize(p_session_hash);
  if v_member.role not in ('owner', 'editor') then
    raise sqlstate 'PT403' using message = 'This link cannot edit the trip.';
  end if;
  if p_checklist_version is distinct from 1 then
    raise sqlstate 'PT422' using message = 'This API version cannot save checklists. Update the trip API.';
  end if;
  return trip_private.trip_commit_with_history(p_session_hash, p_revision, p_data, p_changes);
end;
$$;
revoke all on function public.trip_commit(text, bigint, jsonb, jsonb, integer) from public, anon, authenticated;
grant execute on function public.trip_commit(text, bigint, jsonb, jsonb, integer) to service_role;
revoke all on all functions in schema trip_private from public, anon, authenticated, service_role;
