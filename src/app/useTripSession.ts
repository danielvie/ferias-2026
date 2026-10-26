import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CreateTripInput, JoinTripInfo, TripCommand, TripSnapshot } from '../../shared/model';
import { api, ApiError, rememberedTrips, tripLink } from './api';
import { tripIdentity } from './remembered-trips';

export function useTripSession() {
  const [snapshot, setSnapshot] = useState<TripSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recoveryLink, setRecoveryLink] = useState('');
  const [pendingAccess, setPendingAccess] = useState('');
  const [pendingJoin, setPendingJoin] = useState<{ token: string; trip: JoinTripInfo | null } | null>(null);
  const [accessLost, setAccessLost] = useState(false);
  const saved = useSyncExternalStore(rememberedTrips.subscribe, rememberedTrips.getSnapshot);
  const locked = useRef(false);
  const generation = useRef(0);
  const current = useRef(snapshot);
  current.current = snapshot;

  function opened(next: TripSnapshot) {
    setAccessLost(false);
    setSnapshot(next);
  }

  function joinedShared(result: Awaited<ReturnType<typeof api.prepareJoin>>, token: string) {
    if (result.snapshot) {
      opened(result.snapshot);
      setPendingJoin(null);
      setPendingAccess('');
      setRecoveryLink('');
      history.replaceState(null, '', location.pathname + location.search);
    } else setPendingJoin({ token, trip: result.trip });
  }

  useEffect(() => {
    if (snapshot && !saved.activeId && rememberedTrips.capture().credential === '') {
      generation.current += 1;
      setAccessLost(true);
      setError('This access was forgotten, signed out or revoked. Your open draft is kept, but saving is disabled. Use Trips to continue.');
    }
  }, [saved.activeId, snapshot]);

  const refresh = useCallback(async () => {
    if (locked.current) return;
    const previous = current.current;
    const startedAt = generation.current;
    try {
      const next = await api.load();
      // Ignore a refresh that started before a mutation or a switch to another trip.
      if (!locked.current && generation.current === startedAt && current.current === previous) setSnapshot(next);
    } catch (cause) {
      if (generation.current !== startedAt) return;
      if (cause instanceof ApiError && cause.status === 401) {
        setAccessLost(true);
        setError('This access is no longer valid. Open a valid trip link from Trips to continue.');
      } else setError('Could not refresh the trip. Check your connection and try again.');
    }
  }, []);

  useEffect(() => {
    // Opening another capability on the same Pages URL is a fragment-only
    // navigation. Reload so it follows the same bootstrap path as a fresh link.
    const reopen = () => {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      if (fragment.get('access') || fragment.get('join')) window.location.reload();
    };
    window.addEventListener('hashchange', reopen);
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token = fragment.get('access');
    const joinToken = token ? null : fragment.get('join');
    if (joinToken) setPendingJoin({ token: joinToken, trip: null });
    if (token) {
      setPendingAccess(token);
      history.replaceState(null, '', location.pathname + location.search);
    }
    const initial = joinToken ? api.prepareJoin(joinToken).then(result => {
      joinedShared(result, joinToken);
      return null;
    }) : token ? api.join(token) : api.load();
    void initial.then((next) => {
      if (next) opened(next);
      setPendingAccess('');
    }).catch((cause: unknown) => {
      if (cause instanceof ApiError && cause.status === 401) setPendingAccess('');
      if (token || joinToken || !(cause instanceof ApiError && cause.status === 401) || cause.sessionExpired) {
        setError(cause instanceof Error ? cause.message : 'Could not open the trip.');
      }
    }).finally(() => setLoading(false));
    return () => window.removeEventListener('hashchange', reopen);
  }, []);

  useEffect(() => {
    if (!snapshot) return;
    let lastRefresh = Date.now();
    const onFocus = () => {
      if (!document.hidden && Date.now() - lastRefresh >= 30_000) {
        lastRefresh = Date.now();
        void refresh();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [Boolean(snapshot), refresh]);

  async function run<T>(operation: () => Promise<T>, success: (result: T) => void): Promise<boolean> {
    if (locked.current) return false;
    locked.current = true;
    generation.current += 1;
    setBusy(true);
    setError('');
    try { success(await operation()); return true; }
    catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        try { setSnapshot(await api.load()); } catch { /* Preserve the original conflict message. */ }
        setError('Someone changed the trip while you were editing. The latest plan is loaded. Your form is kept; review it and save again.');
      } else if (cause instanceof ApiError && cause.status === 401 && cause.sessionExpired) {
        setAccessLost(true);
        setError('Your access is no longer valid. Open a current trip link to continue.');
      } else setError(cause instanceof Error ? cause.message : 'Could not save. Please try again.');
      return false;
    } finally { locked.current = false; setBusy(false); }
  }

  async function forget(id?: string) {
    if (locked.current) return false;
    locked.current = true;
    generation.current += 1;
    setBusy(true);
    setError('');
    try {
      if (id) await api.forget(id);
      else await api.logout();
    } catch {
      setError('Saved access was removed from this browser. The server sign-out could not be confirmed; check your connection.');
    } finally {
      if (!id || (current.current && tripIdentity(current.current) === id)) {
        setSnapshot(null);
        setRecoveryLink('');
        setPendingAccess('');
        setAccessLost(false);
      }
      locked.current = false;
      setBusy(false);
    }
    return true;
  }

  return {
    snapshot, loading, busy, error, recoveryLink, pendingAccess, pendingJoin, accessLost,
    remembered: saved.entries, storageWarning: saved.warning,
    dismissError: () => setError(''),
    dismissRecovery: () => setRecoveryLink(''),
    cancelJoin: () => {
      setPendingJoin(null);
      setError('');
      history.replaceState(null, '', location.pathname + location.search);
    },
    openJoinLink: (token: string) => {
      setPendingJoin({ token, trip: null });
      return run(() => api.prepareJoin(token), result => joinedShared(result, token));
    },
    joinTrip: (name: string) => {
      if (!pendingJoin?.trip) return Promise.resolve(false);
      return run(() => api.joinTrip(pendingJoin.token, name), next => {
        opened(next);
        setPendingJoin(null);
        setPendingAccess('');
        setRecoveryLink('');
        history.replaceState(null, '', location.pathname + location.search);
      });
    },
    refresh,
    create: async (input: CreateTripInput) => {
      return run(() => api.create(input), (result) => {
        opened(result.snapshot);
        setPendingAccess('');
        setRecoveryLink(tripLink(result.ownerToken));
      });
    },
    join: async (token: string) => {
      setPendingAccess(token);
      return run(async () => {
        try { return await api.join(token); }
        catch (cause) {
          if (cause instanceof ApiError && cause.status === 401) setPendingAccess('');
          throw cause;
        }
      }, (next) => { opened(next); setPendingAccess(''); setRecoveryLink(''); });
    },
    resume: (id: string) => run(() => api.resume(id), next => {
      opened(next); setPendingAccess(''); setRecoveryLink('');
    }),
    command: (command: TripCommand) => {
      if (!current.current || accessLost) return Promise.resolve(false);
      return run(() => api.command(current.current!.revision, command), setSnapshot);
    },
    rename: (name: string) => {
      if (!current.current || accessLost) return Promise.resolve(false);
      return run(() => api.profile(current.current!.session.name, name), setSnapshot);
    },
    forget,
    logout: () => forget(snapshot ? tripIdentity(snapshot) : undefined),
  };
}
