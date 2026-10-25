import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, test } from 'vitest';

test('upgrades an existing trip without changing its IDs, content or revision', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;');
    await db.exec(readFileSync('supabase/migrations/20260717000100_trip_access_foundation.sql', 'utf8'));
    const details = { title: 'Existing trip', startDate: '2030-06-01', endDate: '2030-06-10',
      cities: [{ id: 'original', name: 'Brussels' }] };
    await db.query('select public.trip_create($1, $2, $3, $4)', [details, 'Owner', 'a'.repeat(64), 'b'.repeat(64)]);
    const read = async () => (await db.query<{ state: unknown }>('select public.trip_read($1) as state', ['b'.repeat(64)])).rows[0].state;
    const before = await read();
    await db.exec(readFileSync('supabase/migrations/20260717000300_repeat_city_visits.sql', 'utf8'));
    expect(await read()).toEqual(before);
    const cities = [...details.cities, { id: 'return', name: 'Brussels' }];
    await db.query('select public.trip_update_details($1, $2, $3)', ['b'.repeat(64), 0, { ...details, cities }]);
    expect(await read()).toMatchObject({ revision: 1, trip: { cities } });
    await expect(db.query('select public.trip_update_details($1, $2, $3)',
      ['b'.repeat(64), 1, { ...details, cities: [cities[0], cities[0]] }])).rejects.toMatchObject({ code: '23505' });
    expect(await read()).toMatchObject({ revision: 1, trip: { cities } });
  } finally { await db.close(); }
}, 30_000);
