import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, test } from 'vitest';

test('adopts valid legacy sessions without reviving expired or revoked access', async () => {
  const db = new PGlite();
  const migration = '20260717000500_remembered_sessions.sql';
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;');
    for (const name of readdirSync('supabase/migrations').filter(name => name.endsWith('.sql') && name < migration).sort()) {
      await db.exec(readFileSync(`supabase/migrations/${name}`, 'utf8'));
    }
    const details = { title: 'Legacy trip', startDate: '2030-06-01', endDate: '2030-06-05',
      cities: [{ id: 'original', name: 'Brussels' }] };
    await db.query('select public.trip_create($1, $2, $3, $4)', [details, 'Owner', 'a'.repeat(64), 'b'.repeat(64)]);
    const read = async () => (await db.query<{ state: unknown }>('select public.trip_read($1) as state', ['b'.repeat(64)])).rows[0].state;
    const before = await read();
    await db.exec(`
      insert into trip_private.sessions (link_id, token_hash, expires_at)
      select link_id, repeat('c', 64), clock_timestamp() - interval '1 day' from trip_private.sessions limit 1;
      insert into trip_private.members (trip_id, name, role)
      select id, 'Revoked', 'viewer' from trip_private.trips;
      insert into trip_private.access_links (trip_id, member_id, token_hash, revoked_at)
      select trip_id, id, repeat('d', 64), clock_timestamp() from trip_private.members where role = 'viewer';
      insert into trip_private.sessions (link_id, token_hash)
      select id, repeat('e', 64) from trip_private.access_links where revoked_at is not null;
    `);
    await db.exec(readFileSync(`supabase/migrations/${migration}`, 'utf8'));
    expect(await read()).toEqual(before);
    const expiries = await db.query<{ token_hash: string; permanent: boolean }>(
      "select token_hash, expires_at = 'infinity'::timestamptz as permanent from trip_private.sessions");
    expect(expiries.rows.find(row => row.token_hash === 'b'.repeat(64))?.permanent).toBe(true);
    expect(expiries.rows.find(row => row.token_hash === 'c'.repeat(64))?.permanent).toBe(false);
    expect(expiries.rows.find(row => row.token_hash === 'e'.repeat(64))?.permanent).toBe(false);
    for (const credential of ['c', 'e']) {
      await expect(db.query('select public.trip_read($1)', [credential.repeat(64)])).rejects.toMatchObject({ code: 'PT401' });
    }
  } finally { await db.close(); }
}, 30_000);
