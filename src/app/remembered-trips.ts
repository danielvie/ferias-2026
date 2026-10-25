import type { Member, TripSnapshot } from '../../shared/model';

export interface RememberedTrip {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  memberName: string;
  role: Member['role'];
  credential: string | null;
  lastUsed: number;
}

export interface AccessContext {
  credential: string | null;
  id: string | null;
  version: number;
  remembered: boolean;
}

export class AccessChangedError extends Error {
  constructor() { super('This trip access changed or was forgotten. Open it again from Trips.'); }
}

export const tripIdentity = (snapshot: TripSnapshot) => `${snapshot.data.trip.id}:${snapshot.session.id}`;
const identityPattern = /^[A-Za-z0-9_-]{1,100}:[A-Za-z0-9_-]{1,100}$/;

export function createRememberedTrips({ scope, sessionKey, online, local, tab }: {
  scope: string; sessionKey: string; online: boolean;
  local: () => Storage; tab: () => Storage;
}) {
  const prefix = `belgium-together:trips:v1:${scope}:`;
  const lastKey = `${prefix}last`;
  const entryKey = (id: string) => `${prefix}entry:${id}`;
  const forgottenKey = (id: string) => `${prefix}forgotten:${id}`;
  let warning = '';
  let active: string | null | undefined;
  let activeId: string | null = null;
  let version = 0;
  let cached: { entries: RememberedTrip[]; warning: string; activeId: string | null } =
    { entries: [], warning: '', activeId: null };
  const listeners = new Set<() => void>();

  function unavailable() { warning = 'This browser cannot remember all trip access. Enable browser storage to keep trips after closing it.'; }
  function read(key: string) {
    try { return local().getItem(key); } catch { unavailable(); return null; }
  }
  function write(key: string, value: string | null) {
    try {
      if (value === null) local().removeItem(key);
      else local().setItem(key, value);
    } catch { unavailable(); }
  }
  function readEntry(id: string): RememberedTrip | null {
    try {
      const entry = JSON.parse(read(entryKey(id)) || 'null') as RememberedTrip | null;
      if (!entry || entry.id !== id || !identityPattern.test(id) ||
        typeof entry.title !== 'string' || entry.title.length > 200 ||
        typeof entry.memberName !== 'string' || entry.memberName.length > 100 ||
        !['owner', 'editor', 'viewer', 'family'].includes(entry.role) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(entry.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(entry.endDate) ||
        !Number.isFinite(entry.lastUsed) || entry.lastUsed < 0 ||
        (entry.credential !== null && (online ? !/^[A-Za-z0-9_-]{43}$/.test(entry.credential) : entry.credential !== id))) return null;
      return entry;
    } catch { return null; }
  }
  function saveTab(value: string) {
    try { tab().setItem(sessionKey, value); } catch { unavailable(); }
  }
  function dropActive() {
    active = '';
    activeId = null;
    version += 1;
    saveTab('');
  }
  function refresh() {
    const entries: RememberedTrip[] = [];
    try {
      const storage = local();
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key?.startsWith(`${prefix}entry:`)) continue;
        const entry = readEntry(key.slice(`${prefix}entry:`.length));
        if (entry) entries.push(entry);
      }
    } catch { unavailable(); }
    entries.sort((a, b) => b.lastUsed - a.lastUsed || a.id.localeCompare(b.id));
    const next = { entries, warning, activeId };
    if (JSON.stringify(next) !== JSON.stringify(cached)) {
      cached = next;
      listeners.forEach(listener => listener());
    }
  }
  function initialize() {
    if (active !== undefined) return;
    try { active = tab().getItem(sessionKey); } catch { unavailable(); }
    if (active == null) {
      const last = read(lastKey);
      active = (last && readEntry(last)?.credential) || (online ? '' : null);
    }
    if (active) {
      activeId = online ? cached.entries.find(entry => entry.credential === active)?.id ?? null : active;
      saveTab(active);
    }
  }
  function onStorage(event: StorageEvent) {
    if (event.key !== null && !event.key.startsWith(prefix)) return;
    if (activeId && (!readEntry(activeId)?.credential || read(forgottenKey(activeId)))) dropActive();
    refresh();
  }
  function assertContext(context: AccessContext) {
    if (context.version !== version ||
      (context.id && (read(forgottenKey(context.id)) ||
        (context.remembered && !readEntry(context.id)?.credential)))) throw new AccessChangedError();
  }

  refresh();
  return {
    getSnapshot: () => cached,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1 && typeof window !== 'undefined') window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(listener);
        if (!listeners.size && typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
      };
    },
    get: readEntry,
    capture(id?: string): AccessContext {
      initialize();
      const entry = id ? readEntry(id) : null;
      return { credential: id ? entry?.credential ?? '' : active!, id: id ?? activeId, version,
        remembered: Boolean(readEntry(id ?? activeId ?? '')) };
    },
    assertContext,
    checkStorage() {
      // Check before creating/exchanging credentials. Local-storage failure can
      // fall back to the current tab, but the tab must retain newly issued access.
      try { tab().setItem(sessionKey, tab().getItem(sessionKey) || ''); }
      catch { throw new Error('Enable browser session storage to open or create a trip.'); }
    },
    accept(snapshot: TripSnapshot, credential: string | null, context: AccessContext, explicit = false) {
      assertContext(context);
      const id = tripIdentity(snapshot);
      if (!explicit && read(forgottenKey(id))) throw new AccessChangedError();
      const previous = readEntry(id);
      const nextCredential = online ? credential! : id;
      if (!nextCredential) throw new AccessChangedError();
      if (active !== nextCredential || activeId !== id) version += 1;
      active = nextCredential;
      activeId = id;
      saveTab(nextCredential);
      if (explicit) write(forgottenKey(id), null);
      write(entryKey(id), JSON.stringify({
        id, title: snapshot.data.trip.title, startDate: snapshot.data.trip.startDate,
        endDate: snapshot.data.trip.endDate, memberName: snapshot.session.name, role: snapshot.session.role,
        credential: !explicit && previous?.credential ? previous.credential : nextCredential,
        lastUsed: explicit || !previous ? Date.now() : previous.lastUsed,
      } satisfies RememberedTrip));
      if (explicit || (!previous && !read(lastKey))) write(lastKey, id);
      refresh();
    },
    replaceCredential(context: AccessContext, credential: string) {
      assertContext(context);
      if (!context.id || active !== context.credential) throw new AccessChangedError();
      const entry = readEntry(context.id);
      if (entry) write(entryKey(context.id), JSON.stringify({ ...entry, credential }));
      active = credential;
      version += 1;
      saveTab(credential);
      refresh();
    },
    invalidate(context: AccessContext) {
      const entry = context.id && readEntry(context.id);
      if (entry && entry.credential === context.credential) {
        write(entryKey(entry.id), JSON.stringify({ ...entry, credential: null }));
        if (read(lastKey) === entry.id) write(lastKey, null);
      }
      if (context.version === version && active === context.credential) dropActive();
      refresh();
    },
    forget(id: string) {
      write(entryKey(id), null);
      write(forgottenKey(id), '1');
      if (read(lastKey) === id) write(lastKey, null);
      if (activeId === id) dropActive();
      refresh();
    },
    clearCurrent() {
      initialize();
      if (activeId) this.forget(activeId);
      else { dropActive(); refresh(); }
    },
    isCurrent(context: AccessContext) {
      return context.version === version && active === context.credential;
    },
  };
}
