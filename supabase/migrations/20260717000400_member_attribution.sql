-- Durable history is not part of the replaceable feature collections.
-- Actor IDs deliberately have no member FK: revocation must preserve attribution.
create table trip_private.history (
  sequence bigint generated always as identity primary key,
  id uuid not null unique default gen_random_uuid(),
  operation_id uuid not null default gen_random_uuid(),
  trip_id uuid not null references trip_private.trips on delete cascade,
  actor_id uuid not null,
  actor_name text not null,
  action text not null check (action in ('added', 'changed', 'deleted', 'renamed', 'revoked', 'rotated')),
  target jsonb not null,
  note_id text not null default '',
  private_to text not null default '',
  at timestamptz not null default clock_timestamp()
);
create index history_trip on trip_private.history(trip_id, sequence desc);
alter table trip_private.history enable row level security;
revoke all on trip_private.history from public, anon, authenticated, service_role;
revoke all on sequence trip_private.history_sequence_seq from public, anon, authenticated, service_role;

create function trip_private.record_change(
  p_member trip_private.members, p_action text, p_target jsonb,
  p_note_id text default '', p_private_to text default '', p_operation_id uuid default gen_random_uuid()
)
returns void language plpgsql set search_path = '' as $$
begin
  insert into trip_private.history(trip_id, actor_id, actor_name, action, target, note_id, private_to, operation_id)
    values (p_member.trip_id, p_member.id, p_member.name, p_action,
      jsonb_build_object('type', p_target->>'type', 'id', p_target->>'id',
        'parentId', coalesce(p_target->>'parentId', ''), 'label', p_target->>'label'),
      p_note_id, p_private_to, p_operation_id);
end;
$$;

-- Move the previous writer behind the private schema. Missing history metadata
-- fails closed, so an old Edge deployment cannot silently perform unaudited writes.
alter function public.trip_commit(text, bigint, jsonb) set schema trip_private;
create function public.trip_commit(
  p_session_hash text, p_revision bigint, p_data jsonb, p_changes jsonb default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_member trip_private.members; v_state jsonb; v_change jsonb; v_operation_id uuid := gen_random_uuid();
begin
  v_member := trip_private.authorize(p_session_hash);
  v_state := trip_private.trip_commit(p_session_hash, p_revision, p_data);
  if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) > 10000 then
    raise sqlstate 'PT422' using message = 'This API version cannot record changes. Update the trip API.';
  end if;
  -- Visibility can tighten without rewriting historical actor/action payloads.
  -- Retain the restriction when a note is later deleted or shared again.
  update trip_private.history h set private_to = n->>'authorId'
    from jsonb_array_elements(p_data->'notes') n
    where h.trip_id = v_member.trip_id and h.note_id = n->>'id' and n->>'visibility' = 'private';
  for v_change in select value from jsonb_array_elements(p_changes) loop
    perform trip_private.record_change(v_member, v_change->>'action', v_change->'target',
      v_change->>'noteId', v_change->>'privateTo', v_operation_id);
  end loop;
  return v_state;
end;
$$;

create function public.trip_profile(p_session_hash text, p_previous_name text, p_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_member trip_private.members;
begin
  -- authorize takes the same trip lock used by content writes and revocations.
  v_member := trip_private.authorize(p_session_hash);
  if p_name is null or length(btrim(p_name)) not between 1 and 100 then
    raise sqlstate 'PT422' using message = 'Name is empty or too long.';
  end if;
  if v_member.name is distinct from p_previous_name then
    raise sqlstate 'PT409' using message = 'Your name changed. Reload before saving.';
  end if;
  if v_member.name <> p_name then
    perform trip_private.record_change(v_member, 'renamed',
      jsonb_build_object('type', 'member', 'id', v_member.id, 'label', p_name));
    update trip_private.members set name = p_name where id = v_member.id;
    update trip_private.trips set revision = revision + 1 where id = v_member.trip_id;
  end if;
  return public.trip_state(p_session_hash);
end;
$$;

create function public.trip_history(p_session_hash text, p_before text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_member trip_private.members; v_sequence bigint; v_items jsonb; v_count integer;
begin
  v_member := trip_private.authorize(p_session_hash);
  if v_member.role = 'family' then
    raise sqlstate 'PT403' using message = 'Family links cannot read trip history.';
  end if;
  if p_before is not null then
    select h.sequence into v_sequence from trip_private.history h
      where h.trip_id = v_member.trip_id and h.id::text = p_before
        and (h.private_to = '' or h.private_to = v_member.id::text);
    if not found then
      raise sqlstate 'PT422' using message = 'This history page is no longer available. Reload history.';
    end if;
  end if;
  select coalesce(jsonb_agg(item order by sequence desc), '[]'::jsonb), count(*)
    into v_items, v_count from (
      select h.sequence, jsonb_build_object('id', h.id, 'operationId', h.operation_id, 'actorId', h.actor_id, 'actorName', h.actor_name,
        'action', h.action, 'target', h.target, 'at', h.at) as item
      from trip_private.history h
      where h.trip_id = v_member.trip_id and (v_sequence is null or h.sequence < v_sequence)
        and (h.private_to = '' or h.private_to = v_member.id::text)
      order by h.sequence desc limit 51
    ) page;
  return jsonb_build_object(
    'items', case when v_count > 50 then v_items - 50 else v_items end,
    'before', case when v_count > 50 then v_items->49->>'id' else null end);
end;
$$;

-- Access-management writers already authorize under the trip lock. Wrapping
-- them keeps attribution in the same transaction, including owner-link rotation.
alter function public.trip_create_online(jsonb, text, text, text, jsonb) set schema trip_private;
create function public.trip_create_online(
  p_details jsonb, p_owner_name text, p_link_hash text, p_session_hash text, p_packing jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_state jsonb; v_member trip_private.members;
begin
  v_state := trip_private.trip_create_online(p_details, p_owner_name, p_link_hash, p_session_hash, p_packing);
  v_member := trip_private.authorize(p_session_hash);
  perform trip_private.record_change(v_member, 'added',
    jsonb_build_object('type', 'trip', 'id', v_member.trip_id, 'label', p_details->>'title'));
  return v_state;
end;
$$;

alter function public.trip_invite(text, jsonb, text) set schema trip_private;
create function public.trip_invite(p_session_hash text, p_input jsonb, p_link_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb; v_member trip_private.members;
begin
  v_member := trip_private.authorize(p_session_hash);
  v_result := trip_private.trip_invite(p_session_hash, p_input, p_link_hash);
  perform trip_private.record_change(v_member, 'added',
    jsonb_build_object('type', 'link', 'id', v_result->>'id', 'label', p_input->>'name'));
  return v_result;
end;
$$;

alter function public.trip_revoke_member(text, uuid) set schema trip_private;
create function public.trip_revoke_member(p_session_hash text, p_member_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_member trip_private.members; v_name text;
begin
  v_member := trip_private.authorize(p_session_hash);
  select name into v_name from trip_private.members where id = p_member_id and trip_id = v_member.trip_id;
  perform trip_private.trip_revoke_member(p_session_hash, p_member_id);
  perform trip_private.record_change(v_member, 'revoked',
    jsonb_build_object('type', 'link', 'id', p_member_id, 'label', v_name));
end;
$$;

alter function public.trip_rotate(text, uuid, text, text) set schema trip_private;
create function public.trip_rotate(
  p_session_hash text, p_member_id uuid, p_link_hash text, p_new_session_hash text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_member trip_private.members; v_name text; v_result jsonb;
begin
  v_member := trip_private.authorize(p_session_hash);
  select name into v_name from trip_private.members where id = p_member_id and trip_id = v_member.trip_id;
  v_result := trip_private.trip_rotate(p_session_hash, p_member_id, p_link_hash, p_new_session_hash);
  perform trip_private.record_change(v_member, 'rotated',
    jsonb_build_object('type', 'link', 'id', p_member_id, 'label', v_name));
  return v_result;
end;
$$;

revoke all on all functions in schema trip_private from public, anon, authenticated, service_role;
do $$
declare v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'trip_commit', 'trip_profile', 'trip_history', 'trip_create_online',
      'trip_invite', 'trip_revoke_member', 'trip_rotate'
    )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_function);
    execute format('grant execute on function %s to service_role', v_function);
  end loop;
end;
$$;
