import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TripSnapshot } from '../../shared/model';
import { AccessChangedError, createRememberedTrips, tripIdentity } from './remembered-trips';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const token = (letter: string) => letter.repeat(43);
const snapshot = (id = 'one', member = 'owner', role = 'owner'): TripSnapshot => ({
  data: { trip: { id, title: `Trip ${id}`, startDate: '2030-06-01', endDate: '2030-06-10' } },
  session: { id: member, name: member, role },
}) as TripSnapshot;
function fixture(local = new MemoryStorage(), tab = new MemoryStorage(), scope = 'test', online = true) {
  return { local, tab, store: createRememberedTrips({ scope, sessionKey: 'session', online, local: () => local, tab: () => tab }) };
}
function select(store: ReturnType<typeof fixture>['store'], value: TripSnapshot, credential = token('a')) {
  store.accept(value, credential, store.capture(), true);
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('remembered trips', () => {
  it('resumes the last selected identity with a fresh tab and preserves existing tab selection', () => {
    const first = fixture();
    select(first.store, snapshot());
    const originalTab = new MemoryStorage();
    originalTab.setItem('session', token('a'));
    select(first.store, snapshot('two'), token('b'));
    expect(fixture(first.local).store.capture().credential).toBe(token('b'));
    expect(fixture(first.local, originalTab).store.capture().credential).toBe(token('a'));
    expect(first.store.getSnapshot().entries).toHaveLength(2);
  });

  it('deduplicates by trip/member without merging different roles or private identities', () => {
    const { store } = fixture();
    select(store, snapshot());
    select(store, snapshot('one', 'viewer', 'viewer'), token('b'));
    select(store, snapshot(), token('c'));
    expect(store.getSnapshot().entries).toHaveLength(2);
    expect(store.get('one:owner')?.credential).toBe(token('c'));
    expect(store.get('one:viewer')?.role).toBe('viewer');
  });

  it('adopts an existing session without caching trip contents or an invitation link', () => {
    const { store, local, tab } = fixture();
    tab.setItem('session', token('a'));
    const value = snapshot();
    value.data.notes = [{ body: 'PRIVATE CONTENT' }] as TripSnapshot['data']['notes'];
    store.accept(value, token('a'), store.capture());
    const serialized = Array.from({ length: local.length }, (_, index) => local.getItem(local.key(index)!)).join();
    expect(serialized).not.toContain('PRIVATE CONTENT');
    expect(serialized).not.toContain('access=');
    expect(fixture(local).store.capture().credential).toBe(token('a'));
  });

  it('keeps recency stable on background refresh and never times entries out', () => {
    const { store, local } = fixture();
    select(store, snapshot());
    const used = store.get('one:owner')!.lastUsed;
    select(store, snapshot('two'), token('b'));
    const background = fixture(local);
    background.tab.setItem('session', token('a'));
    background.store.accept(snapshot(), token('a'), background.store.capture());
    expect(store.get('one:owner')!.lastUsed).toBe(used);
    vi.spyOn(Date, 'now').mockReturnValue(used + 100 * 365 * 86400000);
    expect(fixture(local).store.capture().credential).toBe(token('b'));
    vi.restoreAllMocks();
  });

  it('forgets only the selected entry and prevents stale responses from resurrecting it', () => {
    const { store, local } = fixture();
    select(store, snapshot());
    const old = store.capture();
    const other = fixture(local);
    other.store.forget('one:owner');
    expect(() => store.accept(snapshot(), token('a'), old)).toThrow(AccessChangedError);
    expect(store.get('one:owner')).toBeNull();
    // Even an old tab restored before receiving a storage event cannot re-adopt it.
    const restored = fixture(local);
    restored.tab.setItem('session', token('a'));
    expect(() => restored.store.accept(snapshot(), token('a'), restored.store.capture())).toThrow(AccessChangedError);
    select(restored.store, snapshot(), token('b'));
    expect(restored.store.get('one:owner')?.credential).toBe(token('b'));
  });

  it('does not invalidate a newer credential when an older tab receives a delayed 401', () => {
    const { store, local } = fixture();
    select(store, snapshot());
    const old = store.capture();
    const other = fixture(local);
    select(other.store, snapshot(), token('b'));
    store.invalidate(old);
    expect(store.get('one:owner')?.credential).toBe(token('b'));
  });

  it('preserves newer saved access when an old session refreshes its labels', () => {
    const { store, local } = fixture();
    select(store, snapshot());
    const old = store.capture();
    select(fixture(local).store, snapshot(), token('b'));
    store.accept(snapshot(), token('a'), old);
    expect(store.get('one:owner')?.credential).toBe(token('b'));
  });

  it('retains a label but removes invalid access without opening another trip', () => {
    const { store, local } = fixture();
    select(store, snapshot());
    select(store, snapshot('two'), token('b'));
    store.invalidate(store.capture());
    expect(store.get('two:owner')?.credential).toBeNull();
    expect(store.get('one:owner')?.credential).toBe(token('a'));
    expect(fixture(local).store.capture().credential).toBe('');
  });

  it('forgets the current trip without immediately falling back to another', () => {
    const { store, local } = fixture();
    select(store, snapshot());
    select(store, snapshot('two'), token('b'));
    store.clearCurrent();
    expect(store.capture().credential).toBe('');
    expect(fixture(local).store.capture().credential).toBe('');
    expect(store.get('one:owner')).not.toBeNull();
  });

  it('isolates projects/base paths and ignores malformed saved entries', () => {
    const { store, local } = fixture();
    select(store, snapshot());
    expect(fixture(local, new MemoryStorage(), 'another-project').store.getSnapshot().entries).toEqual([]);
    local.setItem('belgium-together:trips:v1:test:entry:bad:entry', '{"id":"bad:entry","role":"admin"}');
    expect(fixture(local).store.getSnapshot().entries).toHaveLength(1);
  });

  it('keeps SQLite secrets out of browser storage and selects cookies by public identity', () => {
    const { store, local } = fixture(new MemoryStorage(), new MemoryStorage(), 'sqlite', false);
    expect(store.capture().credential).toBeNull();
    select(store, snapshot(), 'not-a-cookie-secret');
    expect(store.get('one:owner')?.credential).toBe(tripIdentity(snapshot()));
    expect(fixture(local, new MemoryStorage(), 'sqlite', false).store.capture().credential).toBe('one:owner');
  });

  it('warns when persistence is blocked while keeping current-tab access usable', () => {
    const tab = new MemoryStorage();
    const store = createRememberedTrips({ scope: 'blocked', sessionKey: 'session', online: true, tab: () => tab,
      local: () => { throw new Error('Blocked'); } });
    select(store, snapshot());
    expect(store.getPage('one:owner')).toBe('today');
    expect(() => store.setPage('one:owner', 'notes')).not.toThrow();
    expect(store.capture().credential).toBe(token('a'));
    expect(store.getSnapshot().warning).toContain('Enable browser storage');
  });

  it('persists navigation separately for each trip, member and backend scope', () => {
    const { store, local } = fixture();
    select(store, snapshot());
    store.setPage('one:owner', 'notes');
    select(store, snapshot('one', 'viewer', 'viewer'), token('b'));
    store.setPage('one:viewer', 'places');
    select(store, snapshot('two'), token('c'));
    store.setPage('two:owner', 'sharing');
    const restored = fixture(local).store;
    expect(restored.getPage('one:owner')).toBe('notes');
    expect(restored.getPage('one:viewer')).toBe('places');
    expect(restored.getPage('two:owner')).toBe('sharing');
    expect(fixture(local, new MemoryStorage(), 'other-backend').store.getPage('one:owner')).toBe('today');
  });

  it('defaults missing or invalid pages to the itinerary and normalizes the old calendar page', () => {
    const { store, local } = fixture();
    select(store, snapshot());
    expect(store.getPage('one:owner')).toBe('today');
    for (const invalid of ['missing-page', '{"page":"notes"}', 'null', 'calendar']) {
      local.setItem('belgium-together:trips:v1:test:page:one:owner', invalid);
      expect(store.getPage('one:owner')).toBe('today');
    }
    store.setPage('one:owner', 'calendar');
    expect(local.getItem('belgium-together:trips:v1:test:page:one:owner')).toBe('today');
  });

  it('clears navigation when forgetting access and prevents stale tabs from restoring it', () => {
    const { store, local } = fixture();
    select(store, snapshot());
    store.setPage('one:owner', 'notes');
    fixture(local).store.forget('one:owner');
    store.setPage('one:owner', 'sharing');
    expect(store.getPage('one:owner')).toBe('today');
    select(fixture(local).store, snapshot(), token('b'));
    expect(store.getPage('one:owner')).toBe('today');
  });
});
