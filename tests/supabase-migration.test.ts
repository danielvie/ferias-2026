import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

// Embedded PostgreSQL verifies SQL semantics without Docker. Native Supabase
// grants and multi-connection behavior still require `task db:test`.
const migration = readFileSync(new URL('../supabase/migrations/20260717000100_trip_access_foundation.sql', import.meta.url), 'utf8');
const ownerLink = 'a'.repeat(64);
const ownerSession = 'b'.repeat(64);
const details = {
  title: 'Synthetic Belgium trip', startDate: '2026-12-02', endDate: '2026-12-15',
  cities: [{ id: 'brussels', name: 'Brussels' }, { id: 'bruges', name: 'Bruges' }],
};

describe('Supabase foundation migration in embedded PostgreSQL', () => {
  let db: PGlite;
  let tripId: string;
  let ownerId: string;
  let revision = 0;
  const links: Record<string, string> = {};
  const sessions: Record<string, string> = { owner: ownerSession };

  async function read(session = ownerSession) {
    const result = await db.query<{ snapshot: { revision: number; trip: typeof details & { id: string }; session: { id: string; role: string } } }>(
      'select public.trip_read($1) as snapshot', [session],
    );
    return result.rows[0].snapshot;
  }

  beforeAll(async () => {
    db = new PGlite();
    await db.exec('create role anon; create role authenticated; create role service_role;');
    await db.exec(migration);
    await db.exec('set role service_role');
    const created = await db.query<{ created: { tripId: string; memberId: string } }>(
      'select public.trip_create($1, $2, $3, $4) as created', [details, 'Owner', ownerLink, ownerSession],
    );
    tripId = created.rows[0].created.tripId;
    ownerId = created.rows[0].created.memberId;
    await db.exec('reset role');
    for (const [index, role] of ['editor', 'viewer', 'family'].entries()) {
      const member = await db.query<{ id: string }>(
        'insert into trip_private.members (trip_id, name, role) values ($1, $2, $2) returning id', [tripId, role],
      );
      const link = await db.query<{ id: string }>(
        'insert into trip_private.access_links (trip_id, member_id, token_hash) values ($1, $2, $3) returning id',
        [tripId, member.rows[0].id, (index + 1).toString().repeat(64)],
      );
      links[role] = link.rows[0].id;
      sessions[role] = (index + 4).toString().repeat(64);
      await db.query('insert into trip_private.sessions (link_id, token_hash) values ($1, $2)', [links[role], sessions[role]]);
    }
    await db.exec('set role service_role');
  }, 30_000);
  afterAll(async () => { await db?.close(); });

  test('creates and reads a trip without provisioning a Supabase Auth user', async () => {
    const snapshot = await read();
    expect(snapshot).toEqual({ revision: 0, trip: { id: tripId, timezone: 'Europe/Brussels', ...details }, session: { id: ownerId, name: 'Owner', role: 'owner' } });
    expect(JSON.stringify(snapshot)).not.toContain(ownerLink);
    expect(JSON.stringify(snapshot)).not.toContain(ownerSession);
  });

  test.each(['anon', 'authenticated'])('denies %s direct schema access and all backend routines', async (role) => {
    await db.exec(`set role ${role}`);
    try {
      await expect(db.query('select * from trip_private.trips')).rejects.toMatchObject({ code: '42501' });
      await expect(read()).rejects.toMatchObject({ code: '42501' });
      const functions = await db.query<{ allowed: boolean }>(
        `select has_function_privilege(current_user, p.oid, 'EXECUTE') as allowed
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname like 'trip_%'`,
      );
      expect(functions.rows).toHaveLength(6);
      expect(functions.rows.every((row) => !row.allowed)).toBe(true);
    } finally {
      await db.exec('set role service_role');
    }
  });

  test('enables RLS on every table and denies direct backend table access too', async () => {
    const tables = await db.query<{ relrowsecurity: boolean }>(
      `select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'trip_private' and c.relkind = 'r'`,
    );
    expect(tables.rows).toHaveLength(5);
    expect(tables.rows.every((row) => row.relrowsecurity)).toBe(true);
    await expect(db.query('select * from trip_private.sessions')).rejects.toMatchObject({ code: '42501' });
    await expect(db.query('select trip_private.authorize($1)', [ownerSession])).rejects.toMatchObject({ code: '42501' });
  });

  test.each([null, '', '0'.repeat(64), 'raw-link-is-not-a-session'])('rejects missing or forged sessions: %s', async (session) => {
    await expect(db.query('select public.trip_read($1)', [session])).rejects.toMatchObject({ code: 'PT401' });
  });

  test('exchanges an owner link for a new session without changing logical identity', async () => {
    const anotherSession = 'c'.repeat(64);
    await db.query('select public.trip_open($1, $2)', [ownerLink, anotherSession]);
    expect((await read(anotherSession)).session.id).toBe(ownerId);
    await db.query('select public.trip_end_session($1)', [anotherSession]);
    await expect(read(anotherSession)).rejects.toMatchObject({ code: 'PT401' });
    expect((await read()).session.id).toBe(ownerId);
  });

  test('rejects expired sessions even when the link is still active', async () => {
    const expired = 'd'.repeat(64);
    await db.query('select public.trip_open($1, $2)', [ownerLink, expired]);
    await db.exec('reset role');
    await db.query("update trip_private.sessions set expires_at = clock_timestamp() - interval '1 second' where token_hash = $1", [expired]);
    await db.exec('set role service_role');
    await expect(read(expired)).rejects.toMatchObject({ code: 'PT401' });
    await expect(db.query('select public.trip_update_details($1, $2, $3)', [expired, revision, details])).rejects.toMatchObject({ code: 'PT401' });
  });

  test('saves atomically with a revision check and preserves city order', async () => {
    const updated = { ...details, title: 'Updated trip', cities: [...details.cities].reverse() };
    await db.query('select public.trip_update_details($1, $2, $3)', [ownerSession, revision, updated]);
    revision += 1;
    const saved = await read();
    expect(saved.revision).toBe(revision);
    expect(saved.trip.title).toBe(updated.title);
    expect(saved.trip.cities).toEqual(updated.cities);
    await expect(db.query('select public.trip_update_details($1, $2, $3)', [ownerSession, revision - 1, details])).rejects.toMatchObject({ code: 'PT409' });
    expect(await read()).toEqual(saved);
  });

  test('rolls back the whole save if a late city constraint fails', async () => {
    const before = await read();
    const invalid = { ...details, title: 'Must not persist', cities: [details.cities[0], { id: 'different', name: 'BRUSSELS' }] };
    await expect(db.query('select public.trip_update_details($1, $2, $3)', [ownerSession, revision, invalid])).rejects.toMatchObject({ code: '23505' });
    expect(await read()).toEqual(before);
  });

  test.each(['viewer', 'family'])('prevents %s edits and link revocation', async (role) => {
    await expect(db.query('select public.trip_update_details($1, $2, $3)', [sessions[role], revision, details])).rejects.toMatchObject({ code: 'PT403' });
    await expect(db.query('select public.trip_revoke_link($1, $2)', [sessions[role], links.editor])).rejects.toMatchObject({ code: 'PT403' });
  });

  test('allows editor updates but does not expose revisions in family reads', async () => {
    await db.query('select public.trip_update_details($1, $2, $3)', [sessions.editor, revision, details]);
    revision += 1;
    expect((await read(sessions.editor)).revision).toBe(revision);
    expect((await read(sessions.family)).revision).toBe(0);
    await expect(db.query('select public.trip_revoke_link($1, $2)', [sessions.editor, links.viewer])).rejects.toMatchObject({ code: 'PT403' });
  });

  test('does not let a session select another trip by supplying its ID', async () => {
    await db.query('select public.trip_create($1, $2, $3, $4)', [{ ...details, title: 'Other trip' }, 'Other owner', 'e'.repeat(64), 'f'.repeat(64)]);
    const other = await read('f'.repeat(64));
    await db.query('select public.trip_update_details($1, $2, $3)', [ownerSession, revision, { ...details, id: other.trip.id, title: 'Only my trip' }]);
    revision += 1;
    expect((await read()).trip.title).toBe('Only my trip');
    expect((await read('f'.repeat(64))).trip.title).toBe('Other trip');
    await expect(db.query('select public.trip_revoke_link($1, $2)', ['f'.repeat(64), links.viewer])).rejects.toMatchObject({ code: 'PT404' });
    expect((await read(sessions.viewer)).session.role).toBe('viewer');
  });

  test('revocation invalidates existing sessions, writes, and future link exchanges', async () => {
    await db.query('select public.trip_revoke_link($1, $2)', [ownerSession, links.editor]);
    revision += 1;
    await expect(read(sessions.editor)).rejects.toMatchObject({ code: 'PT401' });
    await expect(db.query('select public.trip_update_details($1, $2, $3)', [sessions.editor, revision, details])).rejects.toMatchObject({ code: 'PT401' });
    await expect(db.query('select public.trip_open($1, $2)', ['1'.repeat(64), '9'.repeat(64)])).rejects.toMatchObject({ code: 'PT401' });
    expect((await read()).revision).toBe(revision);
  });
});
