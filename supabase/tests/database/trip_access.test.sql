begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(37);

select ok(not has_schema_privilege('anon', 'trip_private', 'USAGE'), 'anon cannot access the private schema');
select ok(not has_schema_privilege('authenticated', 'trip_private', 'USAGE'), 'authenticated cannot access the private schema');
select ok(
  (select count(*) >= 5 and bool_and(c.relrowsecurity)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'trip_private' and c.relkind = 'r'),
  'all application tables have RLS enabled'
);
select ok(
  not exists (
    select 1 from pg_tables t
    cross join (values ('anon'), ('authenticated'), ('service_role')) roles(name)
    where t.schemaname = 'trip_private'
      and has_table_privilege(roles.name, format('%I.%I', t.schemaname, t.tablename), 'SELECT,INSERT,UPDATE,DELETE')
  ),
  'no client or backend role has direct table privileges'
);
select ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    cross join (values ('anon'), ('authenticated')) roles(name)
    where n.nspname = 'public' and p.proname like 'trip_%'
      and has_function_privilege(roles.name, p.oid, 'EXECUTE')
  ),
  'both browser roles are denied every backend routine'
);
select ok(
  (select count(*) >= 6 and bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE'))
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'trip_%'),
  'the backend can execute the public routines'
);
select ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    cross join (values ('anon'), ('authenticated'), ('service_role')) roles(name)
    where n.nspname = 'trip_private' and has_function_privilege(roles.name, p.oid, 'EXECUTE')
  ),
  'internal helpers cannot be called directly'
);
select ok(
  (select bool_and(p.prosecdef and 'search_path=""' = any(p.proconfig))
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'trip_%'),
  'backend routines use SECURITY DEFINER and an empty search_path'
);

set local role anon;
select throws_ok('select * from trip_private.trips', '42501', null, 'anon table reads are rejected');
select throws_ok($$select public.trip_read(repeat('b', 64))$$, '42501', null, 'anon routine execution is rejected');
reset role;
set local role authenticated;
select throws_ok('select * from trip_private.sessions', '42501', null, 'authenticated table reads are rejected');
select throws_ok($$select public.trip_read(repeat('b', 64))$$, '42501', null, 'authenticated routine execution is rejected');
reset role;

do $$
begin
  perform set_config('test.details', '{"title":"Synthetic trip","startDate":"2026-12-02","endDate":"2026-12-15","cities":[{"id":"brussels","name":"Brussels"}]}', true);
end;
$$;
set local role service_role;
select throws_ok('select * from trip_private.members', '42501', null, 'backend table reads must also use a routine');
select lives_ok(
  $$select public.trip_create(current_setting('test.details')::jsonb, 'Owner', repeat('a', 64), repeat('b', 64))$$,
  'backend creates trip, owner, hashed link and session without Supabase Auth'
);
select is(public.trip_read(repeat('b', 64))#>>'{trip,title}', 'Synthetic trip', 'owner can read the saved trip');
select throws_ok($$select public.trip_read(repeat('0', 64))$$, 'PT401', null, 'forged sessions fail');
select throws_ok('select public.trip_read(null)', 'PT401', null, 'missing sessions fail');
select lives_ok($$select public.trip_open(repeat('a', 64), repeat('c', 64))$$, 'owner link opens a new session');
select is(
  public.trip_read(repeat('b', 64))#>>'{session,id}',
  public.trip_read(repeat('c', 64))#>>'{session,id}',
  'opening a link preserves logical member identity'
);
select lives_ok(
  $$select public.trip_update_details(repeat('b', 64), 0, jsonb_set(current_setting('test.details')::jsonb, '{title}', '"Updated trip"'))$$,
  'owner saves with the current revision'
);
select is(public.trip_read(repeat('b', 64))->>'revision', '1', 'successful save increments revision');
select throws_ok(
  $$select public.trip_update_details(repeat('b', 64), 0, current_setting('test.details')::jsonb)$$,
  'PT409', null, 'a stale save fails'
);
select is(public.trip_read(repeat('b', 64))#>>'{trip,title}', 'Updated trip', 'conflict leaves the saved trip unchanged');
select throws_ok(
  $$select public.trip_update_details(repeat('b', 64), 1,
    jsonb_set(current_setting('test.details')::jsonb, '{cities}', '[{"id":"a","name":"Brussels"},{"id":"a","name":"Ghent"}]'))$$,
  '23505', null, 'duplicate city IDs fail after entering the mutation'
);
select is(public.trip_read(repeat('b', 64))#>>'{trip,title}', 'Updated trip', 'failed mutation rolls back title and cities');
reset role;

-- Synthetic fixtures only, rolled back at the end. No real links or trip data.
do $$
declare
  v_trip uuid;
  v_owner_link uuid;
  v_member uuid;
  v_link uuid;
  v_role text;
  v_index integer := 1;
begin
  select trip_id, id into v_trip, v_owner_link from trip_private.access_links where token_hash = repeat('a', 64);
  perform set_config('test.owner_link', v_owner_link::text, true);
  for v_role in select unnest(array['editor', 'viewer', 'family']) loop
    insert into trip_private.members (trip_id, name, role)
      values (v_trip, v_role, v_role) returning id into v_member;
    insert into trip_private.access_links (trip_id, member_id, token_hash)
      values (v_trip, v_member, repeat(v_index::text, 64)) returning id into v_link;
    insert into trip_private.sessions (link_id, token_hash)
      values (v_link, repeat((v_index + 3)::text, 64));
    perform set_config('test.' || v_role || '_link', v_link::text, true);
    v_index := v_index + 1;
  end loop;
  insert into trip_private.sessions (token_hash, link_id, expires_at)
    values (repeat('d', 64), v_owner_link, clock_timestamp() - interval '1 second');
end;
$$;

set local role service_role;
select throws_ok($$select public.trip_read(repeat('d', 64))$$, 'PT401', null, 'expired sessions fail');
select throws_ok(
  $$select public.trip_update_details(repeat('5', 64), 1, current_setting('test.details')::jsonb)$$,
  'PT403', null, 'viewer cannot save'
);
select throws_ok(
  $$select public.trip_update_details(repeat('6', 64), 1, current_setting('test.details')::jsonb)$$,
  'PT403', null, 'family cannot save'
);
select lives_ok(
  $$select public.trip_update_details(repeat('4', 64), 1, current_setting('test.details')::jsonb)$$,
  'editor can save'
);
select is(public.trip_read(repeat('6', 64))->>'revision', '0', 'family receives no global revision counter');
select throws_ok(
  $$select public.trip_revoke_link(repeat('4', 64), current_setting('test.viewer_link')::uuid)$$,
  'PT403', null, 'editor cannot revoke links'
);
select throws_ok(
  $$select public.trip_revoke_link(repeat('b', 64), current_setting('test.owner_link')::uuid)$$,
  'PT403', null, 'owner cannot accidentally revoke their recovery link'
);
select lives_ok(
  $$select public.trip_revoke_link(repeat('b', 64), current_setting('test.editor_link')::uuid)$$,
  'owner revokes an editor link'
);
select throws_ok($$select public.trip_read(repeat('4', 64))$$, 'PT401', null, 'revocation stops an existing session from reading');
select throws_ok($$select public.trip_open(repeat('1', 64), repeat('9', 64))$$, 'PT401', null, 'revoked links cannot create sessions');
select throws_ok(
  $$select public.trip_update_details(repeat('4', 64), 3, current_setting('test.details')::jsonb)$$,
  'PT401', null, 'revoked sessions cannot save even with a current revision'
);
select is(public.trip_read(repeat('b', 64))->>'revision', '3', 'rejected revoked writes do not change revision');
reset role;

select * from finish();
rollback;
