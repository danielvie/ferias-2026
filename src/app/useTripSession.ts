import { useCallback, useEffect, useRef, useState } from 'react';
import type { CreateTripInput, TripCommand, TripSnapshot } from '../../shared/model';
import { api, ApiError, tripLink } from './api';

export function useTripSession() {
  const [snapshot, setSnapshot] = useState<TripSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recoveryLink, setRecoveryLink] = useState('');
  const [pendingAccess, setPendingAccess] = useState('');
  const locked = useRef(false);
  const generation = useRef(0);
  const current = useRef(snapshot);
  current.current = snapshot;

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
        setSnapshot(null);
        setError('This session has expired or its invitation was revoked. Open a valid trip link to continue.');
      } else setError('Could not refresh the trip. Check your connection and try again.');
    }
  }, []);

  useEffect(() => {
    // Opening another capability on the same Pages URL is a fragment-only
    // navigation. Re-bootstrap through a real reload so existing beforeunload
    // draft protections still apply instead of silently switching identities.
    const reopen = () => {
      if (new URLSearchParams(window.location.hash.slice(1)).get('access')) window.location.reload();
    };
    window.addEventListener('hashchange', reopen);
    const token = new URLSearchParams(window.location.hash.slice(1)).get('access');
    if (token) {
      setPendingAccess(token);
      history.replaceState(null, '', location.pathname + location.search);
    }
    const initial = token ? api.join(token) : api.load();
    void initial.then((next) => {
      setSnapshot(next);
      setPendingAccess('');
    }).catch((cause: unknown) => {
      if (cause instanceof ApiError && cause.status === 401) setPendingAccess('');
      if (token || !(cause instanceof ApiError && cause.status === 401) || cause.sessionExpired) {
        setError(cause instanceof Error ? cause.message : 'Could not open the trip.');
      }
    }).finally(() => setLoading(false));
    return () => window.removeEventListener('hashchange', reopen);
  }, []);

  useEffect(() => {
    if (!pendingAccess) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [pendingAccess]);

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
      } else if (cause instanceof ApiError && cause.status === 401) {
        setSnapshot(null);
        setError('Your access is no longer valid. Open a current trip link to continue.');
      } else setError(cause instanceof Error ? cause.message : 'Could not save. Please try again.');
      return false;
    } finally { locked.current = false; setBusy(false); }
  }

  return {
    snapshot, loading, busy, error, recoveryLink, pendingAccess,
    dismissError: () => setError(''),
    dismissRecovery: () => setRecoveryLink(''),
    refresh,
    create: async (input: CreateTripInput) => {
      return run(() => api.create(input), (result) => {
        setSnapshot(result.snapshot);
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
      }, (next) => { setSnapshot(next); setPendingAccess(''); setRecoveryLink(''); });
    },
    command: (command: TripCommand) => {
      if (!current.current) return Promise.resolve(false);
      return run(() => api.command(current.current!.revision, command), setSnapshot);
    },
    rename: (name: string) => {
      if (!current.current) return Promise.resolve(false);
      return run(() => api.profile(current.current!.session.name, name), setSnapshot);
    },
    logout: async () => {
      await run(() => api.logout(), () => { setSnapshot(null); setRecoveryLink(''); });
    },
  };
}
