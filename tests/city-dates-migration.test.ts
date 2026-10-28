import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('adds optional city dates to an existing PostgreSQL trip without changing its data', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;');
    const migrations = readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort();
    const index = migrations.findIndex(name => name.endsWith('_city_dates.sql'));
    for (const name of migrations.slice(0, index)) await db.exec(readFileSync(`supabase/migrations/${name}`, 'utf8'));
    await db.exec('update trip_private.settings set creation_enabled = true');
    const details = { title: 'Existing trip', startDate: '2030-06-01', endDate: '2030-06-10',
      cities: [{ id: 'brussels', name: 'Brussels' }] };
    const args = [details, 'Owner', 'a'.repeat(64), 'b'.repeat(64), []];
    const read = async () => (await db.query<{ state: unknown }>('select public.trip_state($1) as state', [args[3]])).rows[0].state;
    await db.query('select public.trip_create_online($1, $2, $3, $4, $5)', args);
    const before = await read();
    await db.exec(readFileSync(`supabase/migrations/${migrations[index]}`, 'utf8'));
    expect(await read()).toEqual(before);
  } finally {
    await db.close();
  }
}, 30_000);
