import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createHandler, type Rpc } from '../supabase/functions/trip-api/handler.ts';
import { HttpError } from '../server/validation.ts';
import type { HistoryPage, TripCommand, TripSnapshot } from '../shared/model.ts';

const origin = 'http://127.0.0.1:5173';
const input = { title: 'Online test trip', ownerName: 'Owner', startDate: '2026-12-02', endDate: '2026-12-15', cities: ['Brussels', 'Bruges'] };
describe('online API with actual PostgreSQL migrations', () => {
  let db: PGlite;
  let handle: ReturnType<typeof createHandler>;
  let session: string;
  let ownerToken: string;
  let state: TripSnapshot;
  async function call(path: string, method = 'GET', body?: unknown, credential = session) {
    return handle(new Request(`http://local/functions/v1/trip-api${path}`, {
      method, headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Trip-Session': credential },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }));
  }
  async function load(credential = session): Promise<TripSnapshot> {
    const response = await call('/trip', 'GET', undefined, credential);
    expect(response.status).toBe(200);
    return response.json();
  }
  async function command(command: TripCommand, credential = session) {
    const previous = await load(credential);
    const response = await call('/commands', 'POST', { revision: previous.revision, command }, credential);
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
    const next: TripSnapshot = await response.json();
    if (credential === session) state = next;
    return next;
  }
  async function invite(role: 'editor' | 'viewer' | 'family', eventIds: string[] = [], placeIds: string[] = []) {
    const response = await call('/invites', 'POST', { name: role, role, eventIds, placeIds });
    expect(response.status).toBe(201);
    const link = await response.json();
    const opened = await call('/session', 'POST', { token: link.token }, '');
    expect(opened.status).toBe(200);
    return { ...link, ...await opened.json() } as { id: string; token: string; sessionToken: string; snapshot: TripSnapshot };
  }
  const place = () => ({
    id: '', title: 'Museum', cityId: state.data.trip.cities[0].id, category: 'museum' as const, status: 'idea' as const,
    description: 'Private planning details', address: 'Private address', url: 'https://example.com/', durationMinutes: 60, cost: 'Booking 123',
  });
  beforeAll(async () => {
    db = new PGlite();
    await db.exec('create role anon; create role authenticated; create role service_role;');
    for (const name of readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort()) {
      await db.exec(readFileSync(`supabase/migrations/${name}`, 'utf8'));
    }
    const rpc: Rpc = async (name, args) => {
      try {
        const keys = Object.keys(args);
        const result = await db.query<{ result: unknown }>(`select public.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(',')}) as result`, Object.values(args));
        return result.rows[0].result;
      } catch (error) {
        const failure = error as { code: string; message: string };
        if (/^PT[45]\d{2}$/.test(failure.code)) throw new HttpError(Number(failure.code.slice(2)), failure.message);
        throw error;
      }
    };
    handle = createHandler(rpc, [origin]);
  }, 30_000);
  beforeEach(async () => {
    await db.exec('truncate trip_private.trips cascade; truncate trip_private.request_limits; update trip_private.settings set creation_enabled = true;');
    const response = await call('/trips', 'POST', input, '');
    expect(response.status).toBe(201);
    const created = await response.json();
    session = created.sessionToken; ownerToken = created.ownerToken; state = created.snapshot;
  });
  afterAll(async () => { await db?.close(); });

  async function history(credential = session, before: string | null = null): Promise<HistoryPage> {
    const response = await call('/history', 'POST', { before }, credential);
    expect(response.status).toBe(200);
    return response.json();
  }

  test('shares a reusable join link and registers distinct editors with private notes and attribution', async () => {
    const response = await call('/share');
    expect(response.status).toBe(200);
    const shared = await response.json();
    expect(shared.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(shared.token).not.toBe(ownerToken);
    expect(await (await call('/share')).json()).toEqual(shared);
    expect(await (await call('/join/preview', 'POST', shared, '')).json()).toEqual({
      tripId: state.data.trip.id, title: input.title,
    });
    const travelers: { snapshot: TripSnapshot; sessionToken: string }[] = [];
    for (let i = 0; i < 2; i++) {
      const joined = await call('/join', 'POST', { ...shared, name: ' Ana ', role: 'owner' }, '');
      expect(joined.status).toBe(201);
      const traveler = await joined.json();
      expect(traveler.snapshot.session).toMatchObject({ name: 'Ana', role: 'editor' });
      travelers.push(traveler);
      expect(await (await call('/share', 'GET', undefined, traveler.sessionToken)).json()).toEqual(shared);
    }
    const [ana, other] = travelers;
    expect(ana.snapshot.session.id).not.toBe(other.snapshot.session.id);
    await command({ type: 'packing.add', title: 'Ana item', assignee: '' }, ana.sessionToken);
    await command({ type: 'note.save', note: {
      id: '', title: 'Only Ana', body: 'Private', visibility: 'private', linkType: 'trip', linkId: '',
    } }, ana.sessionToken);
    expect((await load()).data.notes).toEqual([]);
    expect((await load(other.sessionToken)).data.notes).toEqual([]);
    expect((await history()).items).toContainEqual(expect.objectContaining({
      actorId: ana.snapshot.session.id, actorName: 'Ana', target: expect.objectContaining({ type: 'packing' }),
    }));
    expect((await load()).members).toHaveLength(3);
    expect((await call('/session', 'POST', shared, '')).status).toBe(401);
    expect((await call('/session', 'POST', { token: ownerToken }, '')).status).toBe(200);
    expect((await db.query<{ permanent: boolean }>(
      "select bool_and(expires_at = 'infinity'::timestamptz) as permanent from trip_private.sessions")).rows[0].permanent).toBe(true);
  });

  test('rejects invalid joins and read-only sharing while protecting stored join credentials', async () => {
    const shared = await (await call('/share')).json();
    for (const name of ['', ' ', 'x'.repeat(101), '\u0001', 'Ana\tBob', 'Ana\nBob']) {
      expect((await call('/join', 'POST', { ...shared, name }, '')).status).toBe(422);
    }
    for (const token of ['', 'bad', 'x'.repeat(43)]) {
      expect((await call('/join/preview', 'POST', { token }, '')).status).toBe(401);
      expect((await call('/join', 'POST', { token, name: 'No access' }, '')).status).toBe(401);
    }
    expect((await load()).members).toHaveLength(1);
    for (const role of ['viewer', 'family'] as const) {
      const guest = await invite(role);
      expect((await call('/share', 'GET', undefined, guest.sessionToken)).status).toBe(403);
    }
    expect((await call('/share', 'GET', undefined, '')).status).toBe(401);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await db.exec(`set role ${role}`);
      try {
        await expect(db.query('select * from trip_private.join_links')).rejects.toMatchObject({ code: '42501' });
        if (role !== 'service_role') {
          await expect(db.query('select public.trip_join_preview($1)', [shared.token])).rejects.toMatchObject({ code: '42501' });
          await expect(db.query('select public.trip_share($1, $2)', ['', shared.token])).rejects.toMatchObject({ code: '42501' });
          await expect(db.query('select public.trip_join($1, $2, $3, $4)',
            [shared.token, 'No access', 'a'.repeat(64), 'b'.repeat(64)])).rejects.toMatchObject({ code: '42501' });
        }
      } finally { await db.exec('reset role'); }
    }
    expect(JSON.stringify(await load())).not.toContain(shared.token);
  });

  test('keeps remembered sessions without expiry or eviction while preserving sign-out', async () => {
    const result = await db.query<{ permanent: boolean }>(
      "select bool_and(expires_at > clock_timestamp() + interval '100 years') as permanent from trip_private.sessions");
    expect(result.rows[0].permanent).toBe(true);
    const { hash } = await import('../supabase/functions/trip-api/handler.ts');
    for (let i = 0; i < 22; i++) {
      await db.query('select public.trip_open_online($1, $2)', [await hash(ownerToken), String(i).padStart(64, '0')]);
    }
    expect((await load()).session.id).toBe(state.session.id);
    expect((await call('/session', 'DELETE')).status).toBe(200);
    expect((await call('/trip')).status).toBe(401);
  });

  test('renames only the authenticated member and keeps stable identity and past attribution', async () => {
    const editor = await invite('editor');
    await command({ type: 'packing.add', title: 'Adapter', assignee: '' }, editor.sessionToken);
    const response = await call('/profile', 'POST', {
      previousName: 'editor', name: ' Ana ', memberId: state.session.id, role: 'owner',
    }, editor.sessionToken);
    expect(response.status).toBe(200);
    const renamed: TripSnapshot = await response.json();
    expect(renamed.session).toEqual({ id: editor.id, name: 'Ana', role: 'editor' });
    expect((await load()).session.name).toBe('Owner');
    expect((await load(editor.sessionToken)).session).toEqual(renamed.session);
    await command({ type: 'packing.add', title: 'Tickets', assignee: '' }, editor.sessionToken);
    expect((await call('/profile', 'POST', { previousName: 'editor', name: 'Stale' }, editor.sessionToken)).status).toBe(409);
    const records = (await history()).items.filter((item) => item.actorId === editor.id);
    expect(records.map((item) => item.actorName)).toEqual(['Ana', 'editor', 'editor']);
    expect(JSON.stringify(records)).not.toContain(editor.sessionToken);
    expect((await call(`/invites/${editor.id}`, 'DELETE')).status).toBe(200);
    expect((await history()).items.filter((item) => item.actorId === editor.id)).toEqual(records);
    expect((await call('/history', 'POST', {}, editor.sessionToken)).status).toBe(401);
    expect((await call('/profile', 'POST', { previousName: 'Ana', name: 'Denied' }, editor.sessionToken)).status).toBe(401);
  });

  test('read-only roles can rename without content access or family history/revision leakage', async () => {
    for (const role of ['viewer', 'family'] as const) {
      const guest = await invite(role);
      const response = await call('/profile', 'POST', { previousName: role, name: `New ${role}` }, guest.sessionToken);
      expect(response.status).toBe(200);
      const next: TripSnapshot = await response.json();
      expect(next.session).toEqual({ id: guest.id, name: `New ${role}`, role });
      expect((await call('/commands', 'POST', {
        revision: next.revision, command: { type: 'packing.add', title: 'Denied', assignee: '' },
      }, guest.sessionToken)).status).toBe(403);
      if (role === 'family') {
        expect(next.revision).toBe(0);
        expect(next.members).toEqual([next.session]);
        expect(next.data.activity).toEqual([]);
        expect((await call('/history', 'POST', {}, guest.sessionToken)).status).toBe(403);
      } else expect((await history(guest.sessionToken)).items.length).toBeGreaterThan(0);
    }
    for (const name of ['', ' ', 'x'.repeat(101), '\u0001']) {
      expect((await call('/profile', 'POST', { previousName: 'Owner', name })).status).toBe(422);
    }
    expect((await call('/profile', 'POST', { previousName: 'Owner', name: 'Forged' }, '')).status).toBe(401);
  });

  test('keeps durable paginated history and ignores browser-supplied actor metadata', async () => {
    for (let i = 0; i < 55; i++) await command({ type: 'packing.add', title: `Item ${i}`, assignee: '' });
    const first = await history();
    expect(first.items).toHaveLength(50);
    expect((await history(session, first.before)).items).toHaveLength(6);
    expect(JSON.stringify(first)).not.toContain('sequence');
    const beforeFailure = await history();
    expect((await call('/commands', 'POST', {
      revision: 0, command: { type: 'packing.add', title: 'Stale', assignee: '' },
    })).status).toBe(409);
    expect(await history()).toEqual(beforeFailure);
    const current = await load();
    expect((await call('/commands', 'POST', {
      revision: current.revision, actorId: 'forged', actorName: 'Forged', p_changes: [],
      command: { type: 'packing.delete', id: current.data.packing[0].id },
    })).status).toBe(200);
    expect((await history()).items[0]).toMatchObject({
      actorId: state.session.id, actorName: 'Owner', action: 'deleted', target: { type: 'packing' },
    });
    expect((await call('/history', 'POST', { before: 'unknown-cursor' })).status).toBe(422);
  });

  test('hides earlier note and comment history after privacy changes and deletion', async () => {
    const editor = await invite('editor');
    const next = await command({ type: 'note.save', note: {
      id: '', title: 'SECRET TITLE', body: 'SECRET BODY', visibility: 'trip', linkType: 'trip', linkId: '',
    } }, editor.sessionToken);
    const note = next.data.notes[0];
    await command({ type: 'note.comment', id: note.id, body: 'SECRET COMMENT' });
    expect((await history()).items.some((item) => item.target.type === 'comment')).toBe(true);
    await command({ type: 'note.save', note: { ...note, visibility: 'private' } }, editor.sessionToken);
    await command({ type: 'note.delete', id: note.id }, editor.sessionToken);
    expect(JSON.stringify(await history())).not.toContain(note.id);
    const own = await history(editor.sessionToken);
    expect(own.items.filter((item) => ['note', 'comment'].includes(item.target.type))).toHaveLength(5);
    expect(JSON.stringify(own)).not.toContain('SECRET');
    expect(JSON.stringify((await load()).data.activity)).not.toContain('note');
  });

  test('guards history storage and legacy unaudited writes at the database boundary', async () => {
    const { hash } = await import('../supabase/functions/trip-api/handler.ts');
    const current = await load();
    await expect(db.query('select public.trip_commit($1, $2, $3)', [await hash(session), current.revision, current.data]))
      .rejects.toMatchObject({ code: 'PT422' });
    expect(await load()).toEqual(current);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await db.exec(`set role ${role}`);
      try {
        await expect(db.query('select * from trip_private.history')).rejects.toMatchObject({ code: '42501' });
        if (role !== 'service_role') {
          await expect(db.query('select public.trip_history($1)', [await hash(session)])).rejects.toMatchObject({ code: '42501' });
          await expect(db.query('select public.trip_profile($1, $2, $3)', [await hash(session), 'Owner', 'Denied']))
            .rejects.toMatchObject({ code: '42501' });
        }
      } finally { await db.exec('reset role'); }
    }
  });

  test('creates a complete snapshot, hashes credentials, handles CORS and rejects missing access', async () => {
    expect(state.data.packing).toHaveLength(5);
    expect(await load()).toEqual(state);
    expect((await call('/trip', 'GET', undefined, '')).status).toBe(401);
    expect((await call('/trip', 'GET', undefined, ownerToken)).status).toBe(401);
    const preflight = await call('/commands', 'OPTIONS');
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(origin);
    expect(preflight.headers.get('access-control-allow-headers')).toContain('x-trip-session');
    expect((await handle(new Request('http://local/trip-api/trip', { headers: { Origin: 'https://unrelated.example' } }))).status).toBe(403);
    const stored = await db.query<{ token_hash: string }>('select token_hash from trip_private.access_links');
    expect(stored.rows[0].token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.rows[0].token_hash).not.toContain(ownerToken);
    expect(JSON.stringify(state)).not.toContain(session);
  });

  test('persists places/calendar, clears deleted place links and rejects stale writes', async () => {
    await command({ type: 'place.save', place: place() });
    const savedPlace = state.data.places[0];
    await command({ type: 'event.save', event: {
      id: '', title: 'Museum visit', cityId: savedPlace.cityId, date: '2026-12-03', startTime: '10:00', endTime: '11:00',
      kind: 'activity', status: 'planned', placeId: savedPlace.id, description: 'Booking code',
    } });
    expect(state.data.places[0].status).toBe('planned');
    const related = (await history()).items.slice(0, 2);
    expect(related.map((record) => record.target.type)).toEqual(['event', 'place']);
    expect(new Set(related.map((record) => record.operationId)).size).toBe(1);
    const stale = await call('/commands', 'POST', { revision: 0, command: { type: 'place.delete', id: savedPlace.id } });
    expect(stale.status).toBe(409);
    await command({ type: 'place.delete', id: savedPlace.id });
    expect(state.data.events[0].placeId).toBe('');
    expect((await load()).data.places).toEqual([]);
  });

  test('persists repeat visits and ordered activity moves without losing bookings or private references', async () => {
    const first = state.data.trip.cities[0];
    await command({ type: 'place.save', place: { ...place(), id: 'a' } });
    await command({ type: 'place.save', place: { ...place(), id: 'b', title: 'Second activity' } });
    await command({ type: 'event.save', event: {
      id: 'booking', title: 'Booked museum', cityId: first.id, date: '2026-12-03', startTime: '10:00', endTime: '11:00',
      kind: 'activity', status: 'planned', placeId: 'a', description: 'Keep booking details',
    } });
    const editor = await invite('editor');
    await command({ type: 'note.save', note: {
      id: 'private-route-note', title: 'Private activity note', body: 'Keep this note', visibility: 'private', linkType: 'place', linkId: 'a',
    } }, editor.sessionToken);
    await command({ type: 'visit.add', visit: { id: 'return', name: first.name }, beforeId: null });
    await command({ type: 'place.move', id: 'b', cityId: first.id, beforeId: 'a' });
    expect(state.data.places.map(place => place.id)).toEqual(['b', 'a']);
    const before = state.data.events[0];
    await command({ type: 'place.move', id: 'a', cityId: 'return', beforeId: null });
    await command({ type: 'visit.move', id: 'return', beforeId: first.id });
    const saved = await load();
    expect(saved.data.trip.cities.map(city => city.id)).toEqual(['return', first.id, state.data.trip.cities[2].id]);
    expect(saved.data.places.find(place => place.id === 'a')?.cityId).toBe('return');
    expect(saved.data.events[0]).toEqual({ ...before, cityId: 'return' });
    expect(saved.data.notes).toEqual([]);
    expect((await load(editor.sessionToken)).data.notes[0]).toMatchObject({ id: 'private-route-note', linkId: 'a', body: 'Keep this note' });
    const invalid = await call('/commands', 'POST', { revision: saved.revision,
      command: { type: 'visit.add', visit: { id: 'return', name: 'Another name' }, beforeId: null } });
    expect(invalid.status).toBe(422);
    expect((await load()).revision).toBe(saved.revision);
  });

  test('keeps private authorship and references isolated from owner edits', async () => {
    await command({ type: 'place.save', place: place() });
    const savedPlace = state.data.places[0];
    const editor = await invite('editor');
    const next = await command({ type: 'note.save', note: { id: '', title: 'Secret', body: 'Only editor', visibility: 'private', linkType: 'place', linkId: savedPlace.id } }, editor.sessionToken);
    expect(next.data.notes[0].authorId).toBe(editor.id);
    const commented = await command({ type: 'note.comment', id: next.data.notes[0].id, body: 'Private comment' }, editor.sessionToken);
    expect(commented.data.notes[0].comments[0].authorId).toBe(editor.id);
    const owner = await load();
    expect(owner.data.notes).toEqual([]);
    const blocked = await call('/commands', 'POST', { revision: owner.revision, command: { type: 'note.delete', id: next.data.notes[0].id } });
    expect(blocked.status).toBe(403);
    await command({ type: 'place.delete', id: savedPlace.id });
    expect((await load(editor.sessionToken)).data.notes[0].linkId).toBe(savedPlace.id);
    expect((await load()).data.notes).toEqual([]);
  });

  test('redacts every family snapshot and invalidates all derived access on revocation', async () => {
    await command({ type: 'place.save', place: place() });
    const savedPlace = state.data.places[0];
    await command({ type: 'event.save', event: {
      id: '', title: 'Selected visit', cityId: savedPlace.cityId, date: '2026-12-03', startTime: '10:00', endTime: '11:00',
      kind: 'activity', status: 'planned', placeId: savedPlace.id, description: 'Private booking',
    } });
    const family = await invite('family', [state.data.events[0].id], [savedPlace.id]);
    const visible = family.snapshot;
    expect(visible.revision).toBe(0);
    expect(visible.data.places[0]).toMatchObject({ description: '', address: '', url: '', cost: '' });
    expect(visible.data.events[0].description).toBe('');
    expect(visible.data.notes).toEqual([]);
    expect(visible.data.packing).toEqual([]);
    expect(visible.members).toHaveLength(1);
    const mutation = await call('/commands', 'POST', { revision: (await load()).revision, command: { type: 'packing.add', title: 'No', assignee: '' } }, family.sessionToken);
    expect(mutation.status).toBe(403);
    for (const revision of [0, 100000]) {
      const probe = await call('/commands', 'POST', { revision, command: { type: 'packing.add', title: 'No', assignee: '' } }, family.sessionToken);
      expect(probe.status).toBe(403);
    }
    expect((await call(`/invites/${family.id}`, 'DELETE')).status).toBe(200);
    expect((await call('/trip', 'GET', undefined, family.sessionToken)).status).toBe(401);
    expect((await call('/session', 'POST', { token: family.token }, '')).status).toBe(401);
  });

  test('discards forged authorship and protects private rows at the database commit boundary', async () => {
    const editor = await invite('editor');
    const previous = await load(editor.sessionToken);
    const response = await call('/commands', 'POST', {
      revision: previous.revision, command: { type: 'note.save', note: {
        id: '', title: 'Private editor note', body: 'Unchanged', visibility: 'private', linkType: 'trip', linkId: state.data.trip.id,
        authorId: state.session.id, authorName: 'Forged owner',
      } },
    }, editor.sessionToken);
    expect(response.status).toBe(200);
    expect((await response.json()).data.notes[0].authorId).toBe(editor.id);
    const { hash } = await import('../supabase/functions/trip-api/handler.ts');
    const result = await db.query<{ result: { revision: number; data: { notes: { body: string }[] } } }>(
      'select public.trip_state($1) as result', [await hash(session)],
    );
    const raw = result.rows[0].result;
    raw.data.notes[0].body = 'Unauthorized replacement';
    await expect(db.query('select public.trip_commit($1, $2, $3)', [await hash(session), raw.revision, raw.data])).rejects.toMatchObject({ code: 'PT403' });
    expect((await load(editor.sessionToken)).data.notes[0].body).toBe('Unchanged');
  });

  test('keeps departure checklists independent and persists packing ownership', async () => {
    await command({ type: 'packing.update', id: state.data.packing[0].id, status: 'done', assignee: 'Owner' });
    expect((await load()).data.packing[0].assignee).toBe('Owner');
    const [from, to] = state.data.trip.cities;
    await command({ type: 'transfer.add', fromCityId: from.id, toCityId: to.id, date: '2026-12-05', time: '10:00' });
    await command({ type: 'transfer.add', fromCityId: to.id, toCityId: from.id, date: '2026-12-09', time: '11:00' });
    const [first, second] = state.data.transfers;
    await command({ type: 'transfer.item.update', transferId: first.id, id: first.items[0].id, status: 'done', assignee: 'Owner' });
    expect(state.data.transfers[0].items[0].status).toBe('done');
    expect(state.data.transfers[1].items[0].status).toBe('pending');
    expect(first.items[0].id).not.toBe(second.items[0].id);
  });

  test('rotates owner credentials without changing identity or losing private notes', async () => {
    await command({ type: 'note.save', note: { id: '', title: 'Owner note', body: 'Private', visibility: 'private', linkType: 'trip', linkId: state.data.trip.id } });
    const rotated = await (await call('/rotate', 'POST', { id: state.session.id })).json();
    expect(rotated.owner).toBe(true);
    expect((await call('/trip')).status).toBe(401);
    expect((await call('/session', 'POST', { token: ownerToken }, '')).status).toBe(401);
    const next = await load(rotated.sessionToken);
    expect(next.session.id).toBe(state.session.id);
    expect(next.data.notes[0].title).toBe('Owner note');
    const reopened = await (await call('/session', 'POST', { token: rotated.token }, '')).json();
    expect(reopened.snapshot.session.id).toBe(state.session.id);
  });

  test('allows only owners to invite, and viewers cannot write', async () => {
    const viewer = await invite('viewer');
    expect((await call('/invites', 'POST', { name: 'Forged owner', role: 'owner', eventIds: [], placeIds: [] })).status).toBe(422);
    expect((await call('/invites', 'POST', { name: 'Other', role: 'editor', eventIds: [], placeIds: [] }, viewer.sessionToken)).status).toBe(403);
    expect((await call('/commands', 'POST', { revision: (await load()).revision, command: { type: 'packing.add', title: 'No', assignee: '' } }, viewer.sessionToken)).status).toBe(403);
  });

  test('disables new creation without disabling existing links and bounds bodies', async () => {
    await db.exec('update trip_private.settings set creation_enabled = false;');
    expect((await call('/trips', 'POST', input, '')).status).toBe(403);
    expect((await call('/trip')).status).toBe(200);
    expect((await call('/session', 'POST', { token: ownerToken }, '')).status).toBe(200);
    expect((await call('/commands', 'POST', { padding: 'x'.repeat(140000) })).status).toBe(413);
  });
});
