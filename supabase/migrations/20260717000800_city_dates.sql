-- City dates are optional. Existing visits and their identities are unchanged.
alter table trip_private.cities
  add column arrival_date date,
  add column departure_date date,
  add constraint city_dates_order check (
    arrival_date is null or departure_date is null or arrival_date <= departure_date
  );

-- Older writers omit these fields. Preserve saved dates for surviving IDs rather
-- than letting a trip settings edit silently erase them.
create or replace function trip_private.replace_details(p_trip_id uuid, p_details jsonb)
returns void language plpgsql set search_path = '' as $$
declare
  v_city jsonb;
  v_previous jsonb;
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

  select coalesce(jsonb_object_agg(id, jsonb_build_object(
    'arrivalDate', arrival_date, 'departureDate', departure_date)), '{}'::jsonb)
    into v_previous from trip_private.cities where trip_id = p_trip_id;
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
    insert into trip_private.cities (trip_id, id, name, position, arrival_date, departure_date)
      values (p_trip_id, v_city->>'id', btrim(v_city->>'name'), v_position,
        nullif(case when v_city ? 'arrivalDate' then v_city->>'arrivalDate'
          else v_previous->(v_city->>'id')->>'arrivalDate' end, '')::date,
        nullif(case when v_city ? 'departureDate' then v_city->>'departureDate'
          else v_previous->(v_city->>'id')->>'departureDate' end, '')::date);
    v_position := v_position + 1;
  end loop;
end;
$$;

create or replace function public.trip_read(p_session_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_member trip_private.members;
  v_trip trip_private.trips;
  v_cities jsonb;
begin
  v_member := trip_private.authorize(p_session_hash);
  select * into strict v_trip from trip_private.trips where id = v_member.trip_id;
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', id, 'name', name,
    'arrivalDate', to_char(arrival_date, 'YYYY-MM-DD'),
    'departureDate', to_char(departure_date, 'YYYY-MM-DD'))) order by position), '[]'::jsonb)
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
