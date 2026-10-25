import type { CreateTripInput, HistoryPage, InviteInfo, InviteInput, JoinTripInfo, TripCommand, TripSnapshot } from '../../shared/model';
import { createRememberedTrips, tripIdentity, type AccessContext } from './remembered-trips';

export class ApiError extends Error {
  constructor(message: string, public status: number, public sessionExpired = false) { super(message); }
}

export const isOnlineBackend = import.meta.env.VITE_BACKEND === 'supabase';
const projectUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const sessionKey = `belgium-together:session:${isOnlineBackend ? projectUrl : 'sqlite'}:${import.meta.env.BASE_URL}`;
export const rememberedTrips = createRememberedTrips({
  scope: `${isOnlineBackend ? `supabase:${projectUrl}` : 'sqlite'}:${import.meta.env.BASE_URL}`,
  sessionKey, online: isOnlineBackend, local: () => localStorage, tab: () => sessionStorage,
});

async function request<T>(path: string, init: RequestInit = {}, context = rememberedTrips.capture(),
  mode: 'authenticated' | 'exchange' | 'signout' = 'authenticated'): Promise<T> {
  if (isOnlineBackend && !projectUrl) throw new ApiError('Supabase is not configured for this website.', 503);
  if (mode !== 'signout') rememberedTrips.assertContext(context);
  const credential = context.credential;
  const response = await fetch(`${isOnlineBackend ? `${projectUrl}/functions/v1/trip-api` : '/api'}${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(15_000),
    credentials: isOnlineBackend ? 'omit' : 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(isOnlineBackend && publishableKey ? { apikey: publishableKey } : {}),
      ...(isOnlineBackend && credential ? { 'X-Trip-Session': credential } : {}),
      ...(!isOnlineBackend && credential !== null ? { 'X-Trip-Identity': credential || 'none' } : {}),
      ...init.headers,
    },
  });
  let body;
  try { body = await response.json(); }
  catch { throw new ApiError('The trip API did not return a valid response. Check deployment or try again later.', 503); }
  if (!response.ok) {
    const current = rememberedTrips.isCurrent(context);
    if (mode === 'authenticated' && response.status === 401) rememberedTrips.invalidate(context);
    throw new ApiError(body.error || 'The request could not be completed.', response.status,
      mode === 'authenticated' && current && Boolean(credential));
  }
  if (mode !== 'signout') rememberedTrips.assertContext(context);
  return body as T;
}

async function readTrip(context: AccessContext) {
  const next = await request<TripSnapshot>('/trip', {}, context);
  if (context.id && tripIdentity(next) !== context.id) {
    const current = rememberedTrips.isCurrent(context);
    rememberedTrips.invalidate(context);
    throw new ApiError('Saved access does not match this trip identity. Open a valid trip link.', 401, current);
  }
  return next;
}

async function load(context: AccessContext, explicit = false) {
  const next = await readTrip(context);
  rememberedTrips.accept(next, context.credential, context, explicit);
  return next;
}

async function mutate(path: string, body: unknown) {
  const context = rememberedTrips.capture();
  const next = await request<TripSnapshot>(path, { method: 'POST', body: JSON.stringify(body) }, context);
  rememberedTrips.accept(next, context.credential, context);
  return next;
}

async function exchangeSession(path: string, body: unknown) {
  rememberedTrips.checkStorage();
  const context = rememberedTrips.capture();
  const result = await request<TripSnapshot | { snapshot: TripSnapshot; sessionToken: string }>(path,
    { method: 'POST', body: JSON.stringify(body) }, context, 'exchange');
  const next = 'snapshot' in result ? result.snapshot : result;
  rememberedTrips.accept(next, 'sessionToken' in result ? result.sessionToken : tripIdentity(next), context, true);
  return next;
}

export function tripLink(token: string, kind: 'access' | 'join' = 'access') {
  const link = new URL(import.meta.env.BASE_URL, location.origin);
  link.hash = new URLSearchParams({ [kind]: token }).toString();
  return link.href;
}

export const api = {
  load: () => load(rememberedTrips.capture()),
  resume: (id: string) => {
    const context = rememberedTrips.capture(id);
    if (!context.credential) throw new ApiError('Open a valid trip link to restore this access.', 401);
    rememberedTrips.checkStorage();
    return load(context, true);
  },
  create: async (input: CreateTripInput) => {
    rememberedTrips.checkStorage();
    const context = rememberedTrips.capture();
    const result = await request<{ snapshot: TripSnapshot; ownerToken: string; sessionToken?: string }>('/trips',
      { method: 'POST', body: JSON.stringify(input) }, context, 'exchange');
    rememberedTrips.accept(result.snapshot, result.sessionToken ?? tripIdentity(result.snapshot), context, true);
    return result;
  },
  join: (token: string) => exchangeSession('/session', { token }),
  joinTrip: (token: string, name: string) => exchangeSession('/join', { token, name }),
  share: () => request<{ token: string }>('/share'),
  prepareJoin: async (token: string) => {
    const trip = await request<JoinTripInfo>('/join/preview',
      { method: 'POST', body: JSON.stringify({ token }) }, rememberedTrips.capture(), 'exchange');
    const current = rememberedTrips.capture();
    const candidates = rememberedTrips.getSnapshot().entries
      .filter(entry => entry.id.startsWith(`${trip.tripId}:`) && entry.credential &&
        (entry.role === 'owner' || entry.role === 'editor') && entry.id !== current.id)
      .map(entry => rememberedTrips.capture(entry.id));
    if (current.id?.startsWith(`${trip.tripId}:`) && current.credential) candidates.unshift(current);
    for (const context of candidates) {
      try {
        const next = await readTrip(context);
        if (next.data.trip.id === trip.tripId && ['owner', 'editor'].includes(next.session.role)) {
          rememberedTrips.accept(next, context.credential, context, true);
          return { trip, snapshot: next };
        }
      } catch (cause) {
        // Only invalid access allows a new registration. An outage must not
        // create a second identity and detach the traveler from private notes.
        if (!(cause instanceof ApiError && cause.status === 401)) throw cause;
      }
    }
    return { trip, snapshot: null };
  },
  command: (revision: number, command: TripCommand) => mutate('/commands', { revision, command }),
  profile: (previousName: string, name: string) => mutate('/profile', { previousName, name }),
  history: (before: string | null = null) => request<HistoryPage>('/history', { method: 'POST', body: JSON.stringify({ before }) }),
  invites: () => request<InviteInfo[]>('/invites'),
  invite: (input: InviteInput) => request<{ id: string; token: string }>('/invites', { method: 'POST', body: JSON.stringify(input) }),
  revoke: (id: string) => request<{ ok: true }>(`/invites/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  rotate: async (id: string) => {
    const context = rememberedTrips.capture();
    const result = await request<{ id: string; token: string; owner: boolean; sessionToken?: string }>('/rotate',
      { method: 'POST', body: JSON.stringify({ id }) }, context);
    if (result.sessionToken) rememberedTrips.replaceCredential(context, result.sessionToken);
    return result;
  },
  forget: async (id: string) => {
    const context = rememberedTrips.capture(id);
    rememberedTrips.forget(id);
    if (context.credential) await request('/session', { method: 'DELETE' }, context, 'signout');
  },
  logout: async () => {
    const context = rememberedTrips.capture();
    rememberedTrips.clearCurrent();
    if (context.credential) await request('/session', { method: 'DELETE' }, context, 'signout');
  },
};
