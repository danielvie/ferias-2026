-- The common join link is deliberately retrievable for this trusted,
-- disposable app. It permits new membership, not an existing member's identity.
-- Private member/owner credentials remain hashed in access_links.
create table trip_private.join_links (
  trip_id uuid primary key references trip_private.trips on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{43}$')
);
alter table trip_private.join_links enable row level security;
revoke all on trip_private.join_links from public, anon, authenticated, service_role;

create function public.trip_share(p_session_hash text, p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_member trip_private.members; v_token text;
begin
  v_member := trip_private.authorize(p_session_hash);
  if v_member.role not in ('owner', 'editor') then
    raise sqlstate 'PT403' using message = 'This link cannot invite editors.';
  end if;
  -- authorize holds the trip lock. Existing trips acquire a stable token lazily.
  -- https://www.postgresql.org/docs/17/sql-insert.html#SQL-ON-CONFLICT
  insert into trip_private.join_links (trip_id, token) values (v_member.trip_id, p_token)
    on conflict (trip_id) do nothing;
  select token into strict v_token from trip_private.join_links where trip_id = v_member.trip_id;
  return jsonb_build_object('token', v_token);
end;
$$;

create function public.trip_join_preview(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_trip trip_private.trips;
begin
  select t.* into v_trip from trip_private.trips t
    join trip_private.join_links j on j.trip_id = t.id where j.token = p_token;
  if not found then raise sqlstate 'PT401' using message = 'This trip join link is invalid.'; end if;
  return jsonb_build_object('tripId', v_trip.id, 'title', v_trip.title);
end;
$$;

create function public.trip_join(
  p_token text, p_name text, p_link_hash text, p_session_hash text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_trip_id uuid; v_member trip_private.members; v_link_id uuid;
begin
  if p_name is null or length(btrim(p_name)) not between 1 and 100 or p_name ~ '[[:cntrl:]]' then
    raise sqlstate 'PT422' using message = 'Name is empty, too long or contains invalid characters.';
  end if;
  select trip_id into v_trip_id from trip_private.join_links where token = p_token;
  perform 1 from trip_private.trips where id = v_trip_id for update;
  if not exists (select 1 from trip_private.join_links where trip_id = v_trip_id and token = p_token) then
    raise sqlstate 'PT401' using message = 'This trip join link is invalid.';
  end if;
  insert into trip_private.members (trip_id, name, role)
    values (v_trip_id, btrim(p_name), 'editor') returning * into v_member;
  insert into trip_private.access_links (trip_id, member_id, token_hash)
    values (v_trip_id, v_member.id, p_link_hash) returning id into v_link_id;
  insert into trip_private.sessions (token_hash, link_id) values (p_session_hash, v_link_id);
  perform trip_private.record_change(v_member, 'added',
    jsonb_build_object('type', 'member', 'id', v_member.id, 'label', v_member.name));
  update trip_private.trips set revision = revision + 1 where id = v_trip_id;
  return public.trip_state(p_session_hash);
end;
$$;

revoke all on function public.trip_share(text, text) from public, anon, authenticated;
revoke all on function public.trip_join_preview(text) from public, anon, authenticated;
revoke all on function public.trip_join(text, text, text, text) from public, anon, authenticated;
grant execute on function public.trip_share(text, text) to service_role;
grant execute on function public.trip_join_preview(text) to service_role;
grant execute on function public.trip_join(text, text, text, text) to service_role;
