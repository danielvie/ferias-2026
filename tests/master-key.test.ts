import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createHandler, hash } from '../supabase/functions/trip-api/handler.ts';
import { HttpError } from '../server/validation.ts';
import type { MasterTrip, TripSnapshot } from '../shared/model.ts';

const key = 'm'.repeat(43), replacement = 'n'.repeat(43);
const origin = 'http://127.0.0.1:5173';
let db: PGlite;
let handle: ReturnType<typeof createHandler>;
let owner: { snapshot: TripSnapshot; sessionToken: string; ownerToken: string };
const details = { title: 'Same name', ownerName: 'Owner', startDate: '2026-12-02', endDate: '2026-12-15', cities: ['Brussels'] };
async function call(path: string, body?: unknown, session = '', method = body === undefined ? 'GET' : 'POST') {
  return handle(new Request(`http://local/trip-api${path}`, {
    method, headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Trip-Session': session },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
}
const configure = async (value: string | null) =>
  db.query('select trip_private.set_master_key($1)', [value === null ? null : await hash(value)]);
const open = (value = key, tripId = owner.snapshot.data.trip.id) => call('/master/open', { key: value, tripId });
beforeAll(async () => {
  db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role;');
  for (const name of readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(`supabase/migrations/${name}`, 'utf8'));
  }
  handle = createHandler(async (name, args) => {
    try {
      const keys = Object.keys(args);
      const result = await db.query<{ value: unknown }>(
        `select public.${name}(${keys.map((key, index) => `${key} => $${index + 1}`).join(',')}) as value`,
        Object.values(args));
      return result.rows[0].value;
    } catch (error) {
      const failure = error as { code: string; message: string };
      if (/^PT[45]\d{2}$/.test(failure.code)) throw new HttpError(Number(failure.code.slice(2)), failure.message);
      throw error;
    }
  }, [origin]);
}, 30_000);
beforeEach(async () => {
  await db.exec(`truncate trip_private.trips cascade; delete from trip_private.master_key;
    truncate trip_private.request_limits; update trip_private.settings set creation_enabled=true;`);
  const created = await call('/trips', details);
  expect(created.status).toBe(201);
  owner = await created.json();
});
afterAll(async () => { await db?.close(); });

test('is disabled by default and rejects invalid credentials without revealing trip metadata', async () => {
  for (const value of [undefined, '', 'short', key]) {
    const response = await call('/master/trips', { key: value });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Master key is invalid or access is disabled.' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  }
  await configure(key);
  expect((await call('/master/trips', { key: replacement })).status).toBe(401);
  expect((await open(replacement)).status).toBe(401);
  expect((await call('/master/trips', undefined, owner.sessionToken)).status).toBe(404);
  expect((await call('/master/open', { key, tripId: 'invalid' })).status).toBe(422);
  expect((await open(key, crypto.randomUUID())).status).toBe(404);
  expect((await call(`/master/trips?key=${key}`, { key })).status).toBe(400);
});

test('lists only metadata, distinguishes duplicate names, and includes future trips', async () => {
  await configure(key);
  const first = await (await call('/master/trips', { key })).json() as MasterTrip[];
  expect(first).toEqual([{
    id: owner.snapshot.data.trip.id, title: details.title, ownerName: 'Owner',
    startDate: details.startDate, endDate: details.endDate,
  }]);
  const second = await (await call('/trips', { ...details, ownerName: 'Another owner' })).json();
  const list = await (await call('/master/trips', { key })).json() as MasterTrip[];
  expect(list).toHaveLength(2);
  expect(list[0].id).toBe(second.snapshot.data.trip.id);
  const opened = await (await open(key, second.snapshot.data.trip.id)).json();
  expect(opened.snapshot.session).toEqual(second.snapshot.session);
  await db.exec('truncate trip_private.trips cascade');
  expect(await (await call('/master/trips', { key })).json()).toEqual([]);
});

test('opens the existing owner with normal privacy, edits, history and no replacement links', async () => {
  await configure(key);
  const invited = await (await call('/invites', { name: 'Editor', role: 'editor', eventIds: [], placeIds: [] }, owner.sessionToken)).json();
  const editor = await (await call('/session', { token: invited.token })).json();
  for (const [session, title] of [[owner.sessionToken, 'Owner private'], [editor.sessionToken, 'Editor private']]) {
    const current = await (await call('/trip', undefined, session)).json();
    const saved = await call('/commands', { revision: current.revision, command: { type: 'note.save', note: {
      id: '', title, body: 'Private text', visibility: 'private', linkType: 'trip', linkId: '',
    } } }, session);
    expect(saved.status).toBe(200);
  }
  const before = await db.query('select * from trip_private.access_links order by id');
  const response = await open();
  expect(response.status).toBe(200);
  const opened = await response.json();
  expect(Object.keys(opened).sort()).toEqual(['sessionToken', 'snapshot']);
  expect(opened.snapshot.session).toEqual(owner.snapshot.session);
  expect(opened.snapshot.members).toHaveLength(2);
  expect(opened.snapshot.data.notes.map((note: { title: string }) => note.title)).toEqual(['Owner private']);
  expect((await db.query('select * from trip_private.access_links order by id')).rows).toEqual(before.rows);
  const saved = await call('/commands', { revision: opened.snapshot.revision,
    command: { type: 'packing.add', title: 'Added via master', assignee: '' } }, opened.sessionToken);
  expect(saved.status).toBe(200);
  const history = await (await call('/history', {}, opened.sessionToken)).json();
  expect(history.items[0].actorId).toBe(owner.snapshot.session.id);
  const unchanged = await (await call('/trip', undefined, editor.sessionToken)).json();
  expect(unchanged.data.notes.map((note: { title: string }) => note.title)).toEqual(['Editor private']);
});

test('replacement and disable revoke derived sessions but leave ordinary links and sessions working', async () => {
  await configure(key);
  const master = await (await open()).json();
  await configure(key);
  expect((await call('/trip', undefined, master.sessionToken)).status).toBe(200);
  await configure(replacement);
  expect((await call('/trip', undefined, master.sessionToken)).status).toBe(401);
  expect((await open()).status).toBe(401);
  expect((await call('/trip', undefined, owner.sessionToken)).status).toBe(200);
  expect((await call('/session', { token: owner.ownerToken })).status).toBe(200);
  const next = await (await open(replacement)).json();
  await configure(null);
  expect((await call('/trip', undefined, next.sessionToken)).status).toBe(401);
  expect((await call('/master/trips', { key: replacement })).status).toBe(401);
  expect((await call('/trip', undefined, owner.sessionToken)).status).toBe(200);
});

test('owner link replacement revokes master sessions and subsequent opening resolves the new link', async () => {
  await configure(key);
  const master = await (await open()).json();
  expect((await call('/rotate', { id: owner.snapshot.session.id }, owner.sessionToken)).status).toBe(200);
  expect((await call('/trip', undefined, master.sessionToken)).status).toBe(401);
  expect((await open()).status).toBe(200);
});

test('browser roles cannot read hashes or invoke privileged routines; service role cannot provision a key', async () => {
  await configure(key);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await db.exec(`set role ${role}`);
    try {
      await expect(db.query('select * from trip_private.master_key')).rejects.toMatchObject({ code: '42501' });
      await expect(db.query('select trip_private.set_master_key(null)')).rejects.toMatchObject({ code: '42501' });
      if (role !== 'service_role') {
        await expect(db.query('select public.trip_master_list($1)', [await hash(key)])).rejects.toMatchObject({ code: '42501' });
        await expect(db.query('select public.trip_master_open($1,$2,$3)',
          [await hash(key), owner.snapshot.data.trip.id, 'a'.repeat(64)])).rejects.toMatchObject({ code: '42501' });
      } else {
        expect((await db.query('select public.trip_master_list($1)', [await hash(key)])).rows).toHaveLength(1);
      }
    } finally { await db.exec('reset role'); }
  }
});

test('rejects unrelated origins and bounds invalid-key attempts before checking the key', async () => {
  const denied = await handle(new Request('http://local/trip-api/master/trips', {
    method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  }));
  expect(denied.status).toBe(403);
  for (let i = 0; i < 60; i++) expect((await call('/master/trips', { key: '' })).status).toBe(401);
  expect((await call('/master/trips', { key: '' })).status).toBe(429);
});

test('upgrades existing trips and ordinary sessions without enabling master access', async () => {
  const previous = new PGlite();
  try {
    await previous.exec('create role anon; create role authenticated; create role service_role;');
    const migrations = readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort();
    const index = migrations.findIndex(name => name.endsWith('_master_key.sql'));
    for (const name of migrations.slice(0, index)) await previous.exec(readFileSync(`supabase/migrations/${name}`, 'utf8'));
    await previous.exec('update trip_private.settings set creation_enabled=true;');
    const linkHash = 'a'.repeat(64), sessionHash = 'b'.repeat(64);
    await previous.query('select public.trip_create_online($1,$2,$3,$4,$5)', [
      { ...details, cities: [{ id: 'brussels', name: 'Brussels' }] }, 'Owner', linkHash, sessionHash, [],
    ]);
    const read = async () => (await previous.query('select public.trip_state($1) as state', [sessionHash])).rows;
    const before = await read();
    await previous.exec(readFileSync(`supabase/migrations/${migrations[index]}`, 'utf8'));
    expect(await read()).toEqual(before);
    await expect(previous.query('select public.trip_master_list($1)', [await hash(key)]))
      .rejects.toMatchObject({ code: 'PT401' });
    const opened = await previous.query<{ state: { access: { member: { role: string } } } }>(
      'select public.trip_open_online($1,$2) as state', [linkHash, 'c'.repeat(64)]);
    expect(opened.rows[0].state.access.member.role).toBe('owner');
  } finally { await previous.close(); }
}, 30_000);
