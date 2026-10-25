import { afterEach, describe, expect, it, vi } from 'vitest';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { mkdtemp, readFile, rm, symlink, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, type AppOptions } from '../server/app';
import type { CreateTripInput, Note, Place, TripCommand, TripEvent, TripSnapshot } from '../shared/model';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  cleanups.length = 0;
});

async function directory() {
  const dir = await mkdtemp(join(tmpdir(), 'trip-server-'));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function start(options: AppOptions = {}) {
  const server = createApp({ dbPath: ':memory:', ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let closed = false;
  const close = () => new Promise<void>((resolve, reject) => {
    if (closed) return resolve();
    closed = true;
    server.close((error) => error ? reject(error) : resolve());
    server.closeIdleConnections();
  });
  cleanups.push(close);
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { base, close, server, client: () => new Client(base) };
}

class Client {
  cookie = '';
  snapshot!: TripSnapshot;
  constructor(readonly base: string) {}
  async request(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
    const response = await fetch(`${this.base}/api${path}`, {
      method, headers: { 'Content-Type': 'application/json', Cookie: this.cookie, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0];
    const result = await response.json();
    return { response, body: result };
  }
  async create(input: Partial<CreateTripInput> = {}) {
    const result = await this.request('/trips', 'POST', {
      title: 'Belgium', ownerName: 'Owner', startDate: '2026-07-01', endDate: '2026-07-10',
      cities: ['Brussels', 'Ghent'], ...input,
    });
    expect(result.response.status).toBe(201);
    this.snapshot = result.body.snapshot;
    return result;
  }
  async load(): Promise<TripSnapshot> {
    const result = await this.request('/trip');
    expect(result.response.status).toBe(200);
    return this.snapshot = result.body;
  }
  async command(command: TripCommand): Promise<TripSnapshot> {
    const result = await this.request('/commands', 'POST', { revision: this.snapshot.revision, command });
    expect(result.response.status, JSON.stringify(result.body)).toBe(200);
    return this.snapshot = result.body;
  }
  async invite(role: 'editor' | 'viewer' | 'family', eventIds: string[] = [], placeIds: string[] = []) {
    const result = await this.request('/invites', 'POST', { role, name: `${role} guest`, eventIds, placeIds });
    expect(result.response.status).toBe(201);
    await this.load();
    const client = new Client(this.base);
    const joined = await client.request('/session', 'POST', { token: result.body.token });
    expect(joined.response.status).toBe(200);
    client.snapshot = joined.body;
    return { client, ...result.body } as { client: Client; id: string; token: string };
  }
  city(index = 0) { return this.snapshot.data.trip.cities[index].id; }
}

function place(cityId: string, overrides: Partial<Place> = {}): Place {
  return {
    id: 'place-1', title: 'Grand Place', cityId, category: 'sight', status: 'idea', description: 'Booking secret',
    address: 'Secret address', url: 'https://example.com/secret', durationMinutes: 60, cost: 'Secret price', ...overrides,
  };
}
function event(cityId: string, overrides: Partial<TripEvent> = {}): TripEvent {
  return {
    id: 'event-1', title: 'City walk', cityId, date: '2026-07-02', startTime: '10:00', endTime: '11:00',
    kind: 'activity', status: 'planned', placeId: '', description: 'Secret booking code', ...overrides,
  };
}
function note(overrides: Partial<Pick<Note, 'id' | 'title' | 'body' | 'visibility' | 'linkType' | 'linkId'>> = {}) {
  return { id: 'note-1', title: 'Private medical plan', body: 'Very private body', visibility: 'private' as const,
    linkType: 'trip' as const, linkId: '', ...overrides };
}

describe('trip API', () => {
  it('keeps trusted sessions valid after long inactivity until explicitly signed out', async () => {
    const app = await start(), owner = app.client();
    await owner.create();
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 100 * 365 * 24 * 60 * 60 * 1000);
    try {
      expect((await owner.load()).session.role).toBe('owner');
      await owner.request('/session', 'DELETE');
      expect((await owner.request('/trip')).response.status).toBe(401);
    } finally { clock.mockRestore(); }
  });

  it('selects separate HttpOnly trip cookies without falling back to another identity', async () => {
    const app = await start(), client = app.client();
    const first = await client.create({ title: 'First' });
    const firstIdentity = `${client.snapshot.data.trip.id}:${client.snapshot.session.id}`;
    const second = await client.create({ title: 'Second' });
    const secondIdentity = `${client.snapshot.data.trip.id}:${client.snapshot.session.id}`;
    const jar = new Map<string, string>();
    for (const response of [first.response, second.response]) {
      for (const header of response.headers.getSetCookie()) {
        expect(header).toContain('HttpOnly; SameSite=Strict');
        const pair = header.split(';')[0];
        jar.set(pair.slice(0, pair.indexOf('=')), pair);
      }
    }
    client.cookie = [...jar.values()].join('; ');
    expect((await client.request('/trip', 'GET', undefined, { 'X-Trip-Identity': firstIdentity })).body.data.trip.title).toBe('First');
    client.cookie = [...jar.values()].join('; ');
    expect((await client.request('/trip', 'GET', undefined, { 'X-Trip-Identity': secondIdentity })).body.data.trip.title).toBe('Second');
    client.cookie = [...jar.values()].join('; ');
    expect((await client.request('/trip', 'GET', undefined, { 'X-Trip-Identity': `${firstIdentity}x` })).response.status).toBe(401);
    expect((await client.request('/trip', 'GET', undefined, { 'X-Trip-Identity': 'none' })).response.status).toBe(401);
    expect((await client.request('/session', 'DELETE', undefined, { 'X-Trip-Identity': firstIdentity })).response.status).toBe(200);
    client.cookie = [...jar.values()].join('; ');
    expect((await client.request('/trip', 'GET', undefined, { 'X-Trip-Identity': firstIdentity })).response.status).toBe(401);
    expect((await client.request('/trip', 'GET', undefined, { 'X-Trip-Identity': secondIdentity })).response.status).toBe(200);
  });

  it('validates self-only profile edits and denies unauthenticated or revoked history', async () => {
    const app = await start(), owner = app.client();
    await owner.create();
    const { client: viewer, id: viewerId } = await owner.invite('viewer');
    expect((await app.client().request('/history', 'POST', {})).response.status).toBe(401);
    for (const name of ['', ' ', 'x'.repeat(101), '\u0001']) {
      expect((await viewer.request('/profile', 'POST', { previousName: 'viewer guest', name })).response.status).toBe(422);
    }
    const renamed = await viewer.request('/profile', 'POST', {
      previousName: 'viewer guest', name: 'Ana', memberId: owner.snapshot.session.id, role: 'owner',
    });
    expect(renamed.body.session).toEqual({ id: viewerId, name: 'Ana', role: 'viewer' });
    expect((await owner.load()).session.name).toBe('Owner');
    expect((await viewer.request('/profile', 'POST', { previousName: 'viewer guest', name: 'Stale' })).response.status).toBe(409);
    expect((await viewer.request('/history', 'POST', {})).response.status).toBe(200);
    await owner.request(`/invites/${viewerId}`, 'DELETE');
    expect((await viewer.request('/history', 'POST', {})).response.status).toBe(401);
    expect((await viewer.request('/profile', 'POST', { previousName: 'Ana', name: 'Denied' })).response.status).toBe(401);
  });

  it('creates an empty plan with strategy packing, secure cookie flags and whitelisted fields', async () => {
    const app = await start();
    const owner = app.client();
    const { response, body } = await owner.create();
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly; SameSite=Strict/);
    expect(body.ownerToken).toMatch(/^[\w-]{43}$/);
    expect(body.sessionToken).toBeUndefined();
    expect(owner.snapshot.data).toMatchObject({ places: [], events: [], notes: [], transfers: [] });
    expect(owner.snapshot.data.packing).toHaveLength(5);
    expect(owner.snapshot.data.trip.cities.map((city) => city.name)).toEqual(['Brussels', 'Ghent']);
    await owner.command({ type: 'note.save', note: { ...note(), authorId: 'attacker', comments: [{ body: 'injected' }] } } as unknown as TripCommand);
    expect(owner.snapshot.data.notes[0]).toMatchObject({ authorId: owner.snapshot.session.id, comments: [] });
    expect((await app.client().request('/trip')).response.status).toBe(401);

    const httpsApp = await start({ publicOrigin: 'https://trips.example' });
    const created = await httpsApp.client().create();
    expect(created.response.headers.get('set-cookie')).toContain('; Secure');
  });

  it('authorizes each role on the server and reflects members without exposing invitation tokens', async () => {
    const app = await start(), owner = app.client();
    await owner.create();
    const { client: editor } = await owner.invite('editor');
    const { client: viewer } = await owner.invite('viewer');
    const { client: family } = await owner.invite('family');
    for (const reader of [viewer, family]) {
      const result = await reader.request('/commands', 'POST', {
        revision: owner.snapshot.revision, command: { type: 'packing.add', title: 'Hack', assignee: '' },
      });
      expect(result.response.status).toBe(403);
    }
    for (const member of [editor, viewer, family]) {
      expect((await member.request('/invites')).response.status).toBe(403);
      expect((await member.request('/invites', 'POST', { name: 'No', role: 'viewer', eventIds: [], placeIds: [] })).response.status).toBe(403);
      expect((await member.request('/invites/fake', 'DELETE')).response.status).toBe(403);
    }
    await editor.load();
    await editor.command({ type: 'packing.add', title: 'Editor coat', assignee: '' });
    const members = (await viewer.load()).members;
    expect(members.map((member) => member.role).sort()).toEqual(['editor', 'family', 'owner', 'viewer']);
    expect(Object.keys(members[0]).sort()).toEqual(['id', 'name', 'role']);
    const listing = await owner.request('/invites');
    expect(listing.body).toHaveLength(3);
    expect(JSON.stringify(listing.body)).not.toMatch(/token|hash/i);
    expect((await owner.request('/invites', 'POST', { name: 'No', role: 'owner', eventIds: [], placeIds: [] })).response.status).toBe(422);
  });

  it('isolates private notes even from owner and prevents activity and comment-author leaks', async () => {
    const app = await start(), owner = app.client();
    await owner.create();
    const { client: editor } = await owner.invite('editor');
    const { client: viewer } = await owner.invite('viewer');
    await editor.load();
    await editor.command({ type: 'note.save', note: note() });
    expect(editor.snapshot.data.notes).toHaveLength(1);
    await owner.load();
    expect(owner.snapshot.data.notes).toEqual([]);
    expect((await viewer.load()).data.notes).toEqual([]);
    for (const command of [
      { type: 'note.delete', id: 'note-1' },
      { type: 'note.save', note: note({ body: 'overwrite' }) },
      { type: 'note.comment', id: 'note-1', body: 'intrusion' },
    ]) {
      expect((await owner.request('/commands', 'POST', { revision: owner.snapshot.revision, command })).response.status).toBe(403);
    }
    await editor.command({ type: 'note.save', note: note({ visibility: 'trip' }) });
    await owner.load();
    expect((await owner.request('/commands', 'POST', { revision: owner.snapshot.revision,
      command: { type: 'note.save', note: note() } })).response.status).toBe(403);
    await owner.command({ type: 'note.comment', id: 'note-1', body: 'Shared reply', authorId: 'forged', authorName: 'forged' } as unknown as TripCommand);
    expect(owner.snapshot.data.notes[0].comments[0]).toMatchObject({ authorId: owner.snapshot.session.id, authorName: 'Owner' });
    await editor.load();
    await editor.command({ type: 'note.save', note: note() });
    const filtered = await owner.load();
    expect(filtered.data.notes).toEqual([]);
    expect(JSON.stringify(filtered)).not.toMatch(/Private medical plan|Very private body|Shared reply/);
    expect(JSON.stringify((await viewer.load()).data.activity)).not.toMatch(/Private medical plan|Very private body/);
    await editor.command({ type: 'note.delete', id: 'note-1' });
  });

  it('projects only selected family content, strips booking fields and excludes selected stays', async () => {
    const app = await start(), owner = app.client();
    await owner.create();
    await owner.command({ type: 'place.save', place: place(owner.city()) });
    await owner.command({ type: 'place.save', place: place(owner.city(), { id: 'hidden-place', title: 'Hidden cafe' }) });
    await owner.command({ type: 'event.save', event: event(owner.city(), { placeId: 'hidden-place' }) });
    await owner.command({ type: 'event.save', event: event(owner.city(), { id: 'stay', kind: 'stay', title: 'Secret hotel' }) });
    await owner.command({ type: 'event.save', event: event(owner.city(), { id: 'hidden-event', title: 'Hidden meeting' }) });
    await owner.command({ type: 'note.save', note: note({ visibility: 'trip' }) });
    await owner.command({ type: 'transfer.add', fromCityId: owner.city(), toCityId: owner.city(1), date: '2026-07-03', time: '09:00' });
    const { client: family } = await owner.invite('family', ['event-1', 'stay'], ['place-1']);
    const snapshot = family.snapshot;
    expect(snapshot.revision).toBe(0);
    expect(snapshot.members).toEqual([snapshot.session]);
    expect(snapshot.data.events).toHaveLength(1);
    expect(snapshot.data.events[0]).toMatchObject({ id: 'event-1', description: '', placeId: '' });
    expect(snapshot.data.places).toHaveLength(1);
    expect(snapshot.data.places[0]).toMatchObject({ address: '', description: '', cost: '', url: '' });
    for (const field of ['notes', 'packing', 'transfers', 'activity'] as const) expect(snapshot.data[field]).toEqual([]);
    expect(Object.keys(snapshot.data.trip).sort()).toEqual(['cities', 'endDate', 'id', 'startDate', 'timezone', 'title']);
    expect(JSON.stringify(snapshot)).not.toMatch(/Secret|Booking|Hidden|medical|Owner|editor|Very private/);
    // The same projection must apply to subsequent GETs, not just the initial join.
    expect((await family.load()).data).toEqual(snapshot.data);
  });

  it('revokes all sessions for an invite and logout invalidates only the current session', async () => {
    const app = await start(), owner = app.client();
    await owner.create();
    const invite = await owner.invite('viewer');
    const second = app.client();
    expect((await second.request('/session', 'POST', { token: invite.token })).response.status).toBe(200);
    const loggedOutCookie = second.cookie;
    expect((await second.request('/session', 'DELETE')).body).toEqual({ ok: true });
    second.cookie = loggedOutCookie;
    expect((await second.request('/trip')).response.status).toBe(401);
    expect((await second.request('/session', 'POST', { token: invite.token })).response.status).toBe(200);
    expect((await owner.request(`/invites/${invite.id}`, 'DELETE')).body).toEqual({ ok: true });
    expect((await invite.client.request('/trip')).response.status).toBe(401);
    expect((await second.request('/trip')).response.status).toBe(401);
    expect((await second.request('/session', 'POST', { token: invite.token })).response.status).toBe(401);
    expect((await owner.load()).members).toHaveLength(1);
    expect((await owner.request(`/invites/${owner.snapshot.session.id}`, 'DELETE')).response.status).toBe(404);
  });

  it('persists plans, hashed credentials and sessions across reopening SQLite', async () => {
    const path = join(await directory(), 'nested', 'trips.sqlite');
    const first = await start({ dbPath: path }), owner = first.client();
    const { body: created } = await owner.create();
    await owner.command({ type: 'place.save', place: place(owner.city()) });
    const invite = await owner.invite('editor');
    const cookie = owner.cookie;
    await first.close();
    const raw = await readFile(path);
    for (const secret of [created.ownerToken, invite.token, cookie.split('=')[1]]) expect(raw.includes(Buffer.from(secret))).toBe(false);
    const second = await start({ dbPath: path }), restored = second.client();
    restored.cookie = cookie;
    expect((await restored.load()).data.places[0].title).toBe('Grand Place');
    const history = await restored.request('/history', 'POST', {});
    expect(history.response.status).toBe(200);
    expect(history.body.items).toHaveLength(3);
    expect(history.body.items.find((item: { target: { type: string } }) => item.target.type === 'place'))
      .toMatchObject({ actorId: created.snapshot.session.id, actorName: 'Owner', target: { id: 'place-1' } });
    expect((await restored.request('/session', 'POST', { token: created.ownerToken })).response.status).toBe(200);
    expect((await second.client().request('/session', 'POST', { token: invite.token })).response.status).toBe(200);
  });

  it('copies independent departure strategies and rejects stale writes without losing updates', async () => {
    const app = await start(), owner = app.client();
    await owner.create();
    const transfer = { type: 'transfer.add' as const, fromCityId: owner.city(), toCityId: owner.city(1), date: '2026-07-03', time: '09:00' };
    await owner.command(transfer);
    await owner.command(transfer);
    const [a, b] = owner.snapshot.data.transfers;
    expect(a.items).toHaveLength(6);
    expect(a.items.map((item) => item.id).some((id) => b.items.some((item) => item.id === id))).toBe(false);
    const revision = owner.snapshot.revision;
    await owner.command({ type: 'transfer.item.update', transferId: a.id, id: a.items[0].id, status: 'done', assignee: 'Owner' });
    expect(owner.snapshot.data.transfers[0].items[0].status).toBe('done');
    expect(owner.snapshot.data.transfers[1].items[0].status).toBe('pending');
    expect((await owner.request('/commands', 'POST', { revision, command: { type: 'packing.delete', id: owner.snapshot.data.packing[0].id } })).response.status).toBe(409);
    expect((await owner.load()).data.packing).toHaveLength(5);
  });

  it('maintains place/event/note references and refuses trip changes that orphan plans', async () => {
    const app = await start(), owner = app.client();
    await owner.create();
    await owner.command({ type: 'place.save', place: place(owner.city()) });
    await owner.command({ type: 'event.save', event: event(owner.city(), { placeId: 'place-1' }) });
    expect(owner.snapshot.data.places[0].status).toBe('planned');
    await owner.command({ type: 'note.save', note: note({ visibility: 'trip', linkType: 'place', linkId: 'place-1' }) });
    const original = owner.snapshot;
    const trip = original.data.trip;
    const invalid: unknown[] = [
      { type: 'trip.update', trip: { ...trip, startDate: '2026-07-03' } },
      { type: 'trip.update', trip: { ...trip, cities: [trip.cities[1]] } },
      { type: 'event.save', event: event(owner.city(), { placeId: 'missing' }) },
      { type: 'event.save', event: event(owner.city(1), { placeId: 'place-1' }) },
      { type: 'event.save', event: event(owner.city(), { date: '2026-06-30' }) },
      { type: 'transfer.add', fromCityId: owner.city(), toCityId: 'missing', date: '2026-07-03', time: '09:00' },
      { type: 'note.save', note: note({ linkType: 'day', linkId: '2026-07-11' }) },
    ];
    for (const command of invalid) {
      expect((await owner.request('/commands', 'POST', { revision: original.revision, command })).response.status).toBe(422);
      expect((await owner.load()).revision).toBe(original.revision);
    }
    await owner.command({ type: 'place.delete', id: 'place-1' });
    expect(owner.snapshot.data.events[0].placeId).toBe('');
    expect(owner.snapshot.data.notes[0]).toMatchObject({ linkType: 'trip', linkId: trip.id });
    await owner.command({ type: 'event.delete', id: 'event-1' });
    await owner.command({ type: 'note.save', note: note({ visibility: 'trip', linkType: 'day', linkId: '2026-07-02' }) });
    expect((await owner.request('/commands', 'POST', { revision: owner.snapshot.revision,
      command: { type: 'trip.update', trip: { ...trip, startDate: '2026-07-03' } } })).response.status).toBe(422);
    await owner.command({ type: 'note.delete', id: 'note-1' });
    await owner.command({ type: 'transfer.add', fromCityId: owner.city(), toCityId: owner.city(1), date: '2026-07-02', time: '09:00' });
    expect((await owner.request('/commands', 'POST', { revision: owner.snapshot.revision,
      command: { type: 'trip.update', trip: { ...trip, startDate: '2026-07-03' } } })).response.status).toBe(422);
  });

  it('preserves private annotations without letting them block shared itinerary changes', async () => {
    const app = await start(), owner = app.client();
    await owner.create();
    const cityId = owner.city(1);
    await owner.command({ type: 'place.save', place: place(cityId) });
    const { client: editor } = await owner.invite('editor');
    await editor.command({ type: 'note.save', note: note({ linkType: 'place', linkId: 'place-1' }) });
    await editor.command({ type: 'note.save', note: note({ id: 'city-note', linkType: 'city', linkId: cityId }) });
    await editor.command({ type: 'note.save', note: note({ id: 'day-note', linkType: 'day', linkId: '2026-07-02' }) });
    await owner.load();
    expect(owner.snapshot.data.notes).toEqual([]);
    await owner.command({ type: 'place.delete', id: 'place-1' });
    await owner.command({ type: 'trip.update', trip: {
      ...owner.snapshot.data.trip, cities: [owner.snapshot.data.trip.cities[0]], startDate: '2026-07-03',
    } });
    const visible = await editor.load();
    expect(visible.data.notes.find((item) => item.id === 'note-1')).toMatchObject({ linkType: 'place', linkId: 'place-1' });
    expect(visible.data.notes.find((item) => item.id === 'city-note')).toMatchObject({ linkType: 'city', linkId: cityId });
    expect(visible.data.notes.find((item) => item.id === 'day-note')).toMatchObject({ linkType: 'day', linkId: '2026-07-02' });
    expect((await editor.request('/commands', 'POST', { revision: visible.revision,
      command: { type: 'note.save', note: note({ linkType: 'place', linkId: 'place-1' }) } })).response.status).toBe(422);
    await editor.command({ type: 'note.save', note: note({ linkType: 'trip', linkId: visible.data.trip.id }) });
    expect(editor.snapshot.data.notes.find((item) => item.id === 'note-1')?.linkType).toBe('trip');
  });

  it('validates URL schemes, times, dates, fields and malformed JSON with bounded bodies', async () => {
    const app = await start(), owner = app.client();
    await owner.create();
    for (const url of ['javascript:alert(1)', 'data:text/html,x', '//example.com', 'https://user:pass@example.com', 'https://example.com\\@evil.com', 'https://exa\nmple.com']) {
      expect((await owner.request('/commands', 'POST', { revision: owner.snapshot.revision,
        command: { type: 'place.save', place: place(owner.city(), { url }) } })).response.status).toBe(422);
    }
    for (const command of [
      null, {}, { type: 'oops' }, { type: 'packing.add', title: '', assignee: '' },
      { type: 'event.save', event: event(owner.city(), { date: '2026-02-30' }) },
      { type: 'event.save', event: event(owner.city(), { startTime: '25:00' }) },
      { type: 'event.save', event: event(owner.city(), { endTime: '09:00' }) },
    ]) {
      expect((await owner.request('/commands', 'POST', { revision: owner.snapshot.revision, command })).response.status).toBe(422);
    }
    for (const revision of [-1, 1.5, '0', null]) {
      expect((await owner.request('/commands', 'POST', { revision, command: { type: 'packing.add', title: 'X', assignee: '' } })).response.status).toBe(422);
    }
    const malformed = await fetch(`${app.base}/api/commands`, { method: 'POST',
      headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' }, body: '{"bad":' });
    expect(malformed.status).toBe(400);
    const large = await owner.request('/commands', 'POST', { junk: 'x'.repeat(140000) });
    expect(large.response.status).toBe(413);
    await owner.command({ type: 'place.save', place: place(owner.city(), { url: 'https://example.com/okay?q=1' }) });
    expect(owner.snapshot.data.places[0].url).toBe('https://example.com/okay?q=1');
  });

  it('rejects cross-origin writes and non-JSON content while providing JSON API 404s', async () => {
    const app = await start(), owner = app.client();
    await owner.create();
    const command = { revision: owner.snapshot.revision, command: { type: 'packing.add', title: 'X', assignee: '' } };
    expect((await owner.request('/commands', 'POST', command, { Origin: 'https://evil.example' })).response.status).toBe(403);
    expect((await owner.request('/commands', 'POST', command, { 'Sec-Fetch-Site': 'cross-site' })).response.status).toBe(403);
    expect((await owner.request('/commands', 'POST', command, { 'Content-Type': 'text/plain' })).response.status).toBe(415);
    expect((await owner.request('/commands', 'POST', command, { Origin: app.base })).response.status).toBe(200);
    expect((await owner.request('/unknown')).body).toEqual({ error: 'API route not found.' });
    expect((await app.client().request('/unknown')).response.status).toBe(404);
    const unknownPost = await fetch(`${app.base}/api/unknown`, { method: 'POST', body: 'not JSON' });
    expect(unknownPost.status).toBe(404);
    expect(await unknownPost.json()).toEqual({ error: 'API route not found.' });
    expect((await owner.request('/session', 'DELETE', undefined, { Origin: 'https://evil.example' })).response.status).toBe(403);
    expect((await owner.request('/trips', 'POST', {}, { Origin: 'https://evil.example' })).response.status).toBe(403);
  });

  it('serves only built assets and extensionless SPA routes, not source, database files or symlink escapes', async () => {
    const root = await directory(), dist = join(root, 'dist');
    await mkdir(dist);
    await writeFile(join(dist, 'index.html'), '<h1>Trip app</h1>');
    await writeFile(join(dist, 'client.js'), 'console.log("app")');
    await writeFile(join(dist, 'trips.sqlite'), 'secret database');
    const outside = join(root, 'private');
    await mkdir(outside);
    await writeFile(join(outside, 'secret.js'), 'private token');
    // NTFS directory junctions do not require file-symlink privileges.
    // https://nodejs.org/docs/latest-v24.x/api/fs.html#fspromisessymlinktarget-path-type
    await symlink(outside, join(dist, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    expect(await readFile(join(dist, 'escape', 'secret.js'), 'utf8')).toBe('private token');
    const app = await start({ distPath: dist });
    expect(await (await fetch(`${app.base}/calendar/day`)).text()).toBe('<h1>Trip app</h1>');
    expect((await fetch(`${app.base}/client.js`)).headers.get('content-type')).toContain('javascript');
    expect((await fetch(`${app.base}/client.js`, { method: 'HEAD' })).status).toBe(200);
    for (const path of ['/server/app.ts', '/data/trips.sqlite', '/trips.sqlite', '/.env', '/assets/missing.js', '/escape/secret.js', '/src', '/api/missing']) {
      const response = await fetch(`${app.base}${path}`);
      expect(response.status, path).toBe(404);
      expect(response.headers.get('content-type')).toContain('application/json');
      const body = await response.text();
      expect(body).not.toContain('Trip app');
      expect(body).not.toContain('private token');
    }
    expect((await fetch(`${app.base}/escape/secret.js`, { method: 'HEAD' })).status).toBe(404);
  });

  it('rechecks access after a delayed request body when an invitation is revoked', async () => {
    const app = await start(), owner = app.client();
    await owner.create();
    const invite = await owner.invite('editor');
    const body = JSON.stringify({ revision: invite.client.snapshot.revision,
      command: { type: 'packing.add', title: 'Should never be saved', assignee: '' } });
    const arrived = once(app.server, 'request');
    const pending = httpRequest(`${app.base}/api/commands`, {
      method: 'POST', headers: {
        Cookie: invite.client.cookie, 'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    });
    const result = new Promise<number>((resolve, reject) => {
      pending.on('error', reject);
      pending.on('response', (response) => {
        response.resume();
        response.on('end', () => resolve(response.statusCode!));
      });
    });
    pending.write(body.slice(0, 1));
    await arrived;
    try {
      expect((await owner.request(`/invites/${invite.id}`, 'DELETE')).response.status).toBe(200);
    } finally { pending.end(body.slice(1)); }
    expect(await result).toBe(401);
    expect((await owner.load()).data.packing.some((item) => item.title === 'Should never be saved')).toBe(false);
  });

  it('caps meaningful activity at 50 entries and keeps failed commands out', async () => {
    const app = await start(), owner = app.client();
    await owner.create();
    for (let i = 0; i < 55; i++) await owner.command({ type: 'packing.add', title: `Item ${i}`, assignee: '' });
    expect(owner.snapshot.data.activity).toHaveLength(50);
    expect(owner.snapshot.data.activity.every((item) => item.message.includes('Owner added a packing item.'))).toBe(true);
  });
});
