import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TripSnapshot } from '../../shared/model';

function storage(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); }, clear: () => values.clear() };
}
const token = (letter: string) => letter.repeat(43);
const snapshot = (id = 'one'): TripSnapshot => ({
  data: { trip: { id, title: id, startDate: '2030-06-01', endDate: '2030-06-10' } },
  session: { id: 'owner', name: 'Daniel', role: 'owner' },
}) as TripSnapshot;
const reply = (body: unknown, status = 200) => Response.json(body, { status });
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_BACKEND', 'supabase');
  vi.stubEnv('VITE_SUPABASE_URL', 'http://trip-api.example');
  vi.stubEnv('BASE_URL', '/ferias-2026/');
  vi.stubGlobal('localStorage', storage());
  vi.stubGlobal('sessionStorage', storage());
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function fixture() {
  const module = await import('./api');
  const join = async (id = 'one', letter = 'a') => {
    fetchMock.mockResolvedValueOnce(reply({ snapshot: snapshot(id), sessionToken: token(letter) }));
    await module.api.join(token('z'));
  };
  return { ...module, join };
}

describe('remembered access transport', () => {
  it('previews shared joins without changing the active trip and saves only derived access', async () => {
    const { join, api, rememberedTrips } = await fixture();
    await join('one');
    fetchMock.mockResolvedValueOnce(reply({ tripId: 'two', title: 'Second trip' }));
    expect(await api.prepareJoin(token('s'))).toEqual({ trip: { tripId: 'two', title: 'Second trip' }, snapshot: null });
    expect(rememberedTrips.capture().id).toBe('one:owner');
    const traveler = { ...snapshot('two'), session: { id: 'new', name: 'Ana', role: 'editor' as const } };
    fetchMock.mockResolvedValueOnce(reply({ snapshot: traveler, sessionToken: token('b') }, 201));
    expect(await api.joinTrip(token('s'), 'Ana')).toEqual(traveler);
    expect(rememberedTrips.capture().id).toBe('two:new');
    expect(rememberedTrips.get('one:owner')?.credential).toBe(token('a'));
    const saved = Array.from({ length: localStorage.length }, (_, index) => localStorage.getItem(localStorage.key(index)!)).join();
    expect(saved).not.toContain(token('s'));
  });

  it('reuses the remembered identity for a shared link without registering again', async () => {
    const { join, api, rememberedTrips } = await fixture();
    await join('one');
    await join('two', 'b');
    fetchMock.mockResolvedValueOnce(reply({ tripId: 'one', title: 'First trip' }));
    fetchMock.mockResolvedValueOnce(reply(snapshot('one')));
    expect((await api.prepareJoin(token('s'))).snapshot?.session.id).toBe('owner');
    expect(rememberedTrips.capture().id).toBe('one:owner');
    expect(fetchMock.mock.lastCall?.[0]).toContain('/trip');
    expect(fetchMock.mock.lastCall?.[1]?.headers).toMatchObject({ 'X-Trip-Session': token('a') });
  });

  it('does not register a duplicate identity when remembered access cannot be checked', async () => {
    const { join, api, rememberedTrips } = await fixture();
    await join();
    fetchMock.mockResolvedValueOnce(reply({ tripId: 'one', title: 'First trip' }));
    fetchMock.mockResolvedValueOnce(reply({ error: 'Storage unavailable' }, 503));
    await expect(api.prepareJoin(token('s'))).rejects.toThrow('Storage unavailable');
    expect(rememberedTrips.capture().credential).toBe(token('a'));
  });

  it('offers registration after revoked remembered access, but never merges members by name', async () => {
    const { join, api, rememberedTrips } = await fixture();
    await join();
    await join('two', 'b');
    fetchMock.mockResolvedValueOnce(reply({ tripId: 'one', title: 'First trip' }));
    fetchMock.mockResolvedValueOnce(reply({ error: 'Revoked' }, 401));
    expect((await api.prepareJoin(token('s'))).snapshot).toBeNull();
    expect(rememberedTrips.capture().credential).toBe(token('b'));
    expect(rememberedTrips.get('one:owner')?.credential).toBeNull();
    fetchMock.mockResolvedValueOnce(reply({ error: 'Bad join' }, 401));
    await expect(api.joinTrip(token('s'), 'Daniel')).rejects.toMatchObject({ sessionExpired: false });
    expect(rememberedTrips.capture().credential).toBe(token('b'));
  });

  it('restores derived access with a fresh tab and never saves the reusable link', async () => {
    const { join } = await fixture();
    await join();
    const saved = [localStorage, sessionStorage].flatMap(store =>
      Array.from({ length: store.length }, (_, index) => store.getItem(store.key(index)!))).join();
    expect(saved).not.toContain(token('z'));
    vi.stubGlobal('sessionStorage', storage());
    vi.resetModules();
    const { api } = await import('./api');
    fetchMock.mockResolvedValueOnce(reply(snapshot()));
    await api.load();
    expect(fetchMock.mock.lastCall?.[1]?.headers).toMatchObject({ 'X-Trip-Session': token('a') });
  });

  it('preserves current access when another remembered trip cannot be opened', async () => {
    const { join, api, rememberedTrips } = await fixture();
    await join();
    await join('two', 'b');
    fetchMock.mockResolvedValueOnce(reply({ error: 'Unavailable' }, 503));
    await expect(api.resume('one:owner')).rejects.toThrow('Unavailable');
    expect(rememberedTrips.capture().credential).toBe(token('b'));
    expect(rememberedTrips.get('one:owner')?.credential).toBe(token('a'));
  });

  it('does not clear the current trip when an explicit link is invalid', async () => {
    const { join, api, rememberedTrips } = await fixture();
    await join();
    fetchMock.mockResolvedValueOnce(reply({ error: 'Invalid link' }, 401));
    await expect(api.join(token('x'))).rejects.toMatchObject({ sessionExpired: false });
    expect(rememberedTrips.capture().credential).toBe(token('a'));
  });

  it('rejects mismatched saved identities without switching to the returned trip', async () => {
    const { join, api, rememberedTrips } = await fixture();
    await join();
    await join('two', 'b');
    fetchMock.mockResolvedValueOnce(reply(snapshot('two')));
    await expect(api.resume('one:owner')).rejects.toThrow('does not match');
    expect(rememberedTrips.capture().credential).toBe(token('b'));
    expect(rememberedTrips.get('one:owner')?.credential).toBeNull();
  });

  it('ignores a delayed 401 from the previous trip after a successful switch', async () => {
    const { join, api, rememberedTrips } = await fixture();
    await join();
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = api.load();
    await join('two', 'b');
    finish(reply({ error: 'Revoked' }, 401));
    await expect(pending).rejects.toMatchObject({ status: 401, sessionExpired: false });
    expect(rememberedTrips.capture().credential).toBe(token('b'));
    expect(rememberedTrips.get('two:owner')?.credential).toBe(token('b'));
  });

  it('discards a successful delayed response if access was forgotten meanwhile', async () => {
    const { join, api, rememberedTrips } = await fixture();
    await join();
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = api.load();
    rememberedTrips.forget('one:owner');
    finish(reply(snapshot()));
    await expect(pending).rejects.toThrow('forgotten');
    expect(rememberedTrips.get('one:owner')).toBeNull();
  });

  it('updates the saved derived session on owner rotation without saving the new owner link', async () => {
    const { join, api, rememberedTrips } = await fixture();
    await join();
    fetchMock.mockResolvedValueOnce(reply({ id: 'owner', owner: true, token: token('x'), sessionToken: token('b') }));
    await api.rotate('owner');
    expect(rememberedTrips.get('one:owner')?.credential).toBe(token('b'));
    expect(rememberedTrips.capture().credential).toBe(token('b'));
  });

  it('forgets locally even if server sign-out is unavailable', async () => {
    const { join, api, rememberedTrips } = await fixture();
    await join();
    fetchMock.mockRejectedValueOnce(new Error('Offline'));
    await expect(api.logout()).rejects.toThrow('Offline');
    expect(rememberedTrips.get('one:owner')).toBeNull();
    expect(rememberedTrips.capture().credential).toBe('');
    expect(fetchMock.mock.lastCall?.[1]?.headers).toMatchObject({ 'X-Trip-Session': token('a') });
  });

  it('adopts SQLite cookies using a public selector and never falls back after sign-out', async () => {
    vi.stubEnv('VITE_BACKEND', 'sqlite');
    const { api } = await import('./api');
    fetchMock.mockResolvedValueOnce(reply(snapshot()));
    await api.load();
    fetchMock.mockResolvedValueOnce(reply(snapshot()));
    await api.load();
    expect(fetchMock.mock.lastCall?.[1]?.headers).toMatchObject({ 'X-Trip-Identity': 'one:owner' });
    fetchMock.mockResolvedValueOnce(reply({ ok: true }));
    await api.logout();
    fetchMock.mockResolvedValueOnce(reply({ error: 'No access' }, 401));
    await expect(api.load()).rejects.toThrow('No access');
    expect(fetchMock.mock.lastCall?.[1]?.headers).toMatchObject({ 'X-Trip-Identity': 'none' });
  });
});
