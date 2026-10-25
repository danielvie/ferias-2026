import type { CreateTripInput, HistoryPage, InviteInfo, InviteInput, TripCommand, TripSnapshot } from '../../shared/model';

export class ApiError extends Error {
  constructor(message: string, public status: number, public sessionExpired = false) { super(message); }
}

export const isOnlineBackend = import.meta.env.VITE_BACKEND === 'supabase';
const projectUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const sessionKey = `belgium-together:session:${projectUrl}:${import.meta.env.BASE_URL}`;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let credential = '';
  if (isOnlineBackend) {
    if (!projectUrl) throw new ApiError('Supabase is not configured for this website.', 503);
    try {
      credential = sessionStorage.getItem(sessionKey) || '';
      // Check storage before a create/exchange, not after issuing a one-time link.
      sessionStorage.setItem(sessionKey, credential);
    } catch { throw new ApiError('Enable browser session storage to open or create a trip.', 503); }
  }
  const response = await fetch(`${isOnlineBackend ? `${projectUrl}/functions/v1/trip-api` : '/api'}${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(15_000),
    credentials: isOnlineBackend ? 'omit' : 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(isOnlineBackend && publishableKey ? { apikey: publishableKey } : {}),
      ...(isOnlineBackend && credential ? { 'X-Trip-Session': credential } : {}),
      ...init.headers,
    },
  });
  let body;
  try { body = await response.json(); }
  catch { throw new ApiError('The trip API did not return a valid response. Check deployment or try again later.', 503); }
  if (!response.ok) {
    // A stale refresh must not discard a session established by a newer request.
    if (isOnlineBackend && response.status === 401 && sessionStorage.getItem(sessionKey) === credential) sessionStorage.removeItem(sessionKey);
    throw new ApiError(body.error || 'The request could not be completed.', response.status, isOnlineBackend && Boolean(credential));
  }
  if (isOnlineBackend && typeof body?.sessionToken === 'string') sessionStorage.setItem(sessionKey, body.sessionToken);
  if (isOnlineBackend && path === '/session' && init.method === 'DELETE') sessionStorage.removeItem(sessionKey);
  return body as T;
}

export function tripLink(token: string) {
  const link = new URL(import.meta.env.BASE_URL, location.origin);
  link.hash = new URLSearchParams({ access: token }).toString();
  return link.href;
}

export const api = {
  load: () => request<TripSnapshot>('/trip'),
  create: (input: CreateTripInput) => request<{ snapshot: TripSnapshot; ownerToken: string }>('/trips', { method: 'POST', body: JSON.stringify(input) }),
  join: async (token: string) => {
    const result = await request<TripSnapshot | { snapshot: TripSnapshot }>('/session', { method: 'POST', body: JSON.stringify({ token }) });
    return 'snapshot' in result ? result.snapshot : result;
  },
  command: (revision: number, command: TripCommand) => request<TripSnapshot>('/commands', { method: 'POST', body: JSON.stringify({ revision, command }) }),
  profile: (previousName: string, name: string) => request<TripSnapshot>('/profile', { method: 'POST', body: JSON.stringify({ previousName, name }) }),
  history: (before: string | null = null) => request<HistoryPage>('/history', { method: 'POST', body: JSON.stringify({ before }) }),
  invites: () => request<InviteInfo[]>('/invites'),
  invite: (input: InviteInput) => request<{ id: string; token: string }>('/invites', { method: 'POST', body: JSON.stringify(input) }),
  revoke: (id: string) => request<{ ok: true }>(`/invites/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  rotate: (id: string) => request<{ id: string; token: string; owner: boolean }>('/rotate', { method: 'POST', body: JSON.stringify({ id }) }),
  logout: () => request<{ ok: true }>('/session', { method: 'DELETE' }),
};
