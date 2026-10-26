import type { Member, TripData } from '../../../shared/model.ts';
import { checklistStrategies } from '../../../shared/checklists.ts';
import { applyCommand } from '../../../server/commands.ts';
import { changesBetween } from '../../../server/history.ts';
import { requirePermission, snapshot, type Access } from '../../../server/permissions.ts';
import { check, commandInput, createTripInput, historyInput, HttpError, id, inviteInput, joinInput, joinToken, object, profileInput } from '../../../server/validation.ts';

export type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
interface State { revision: number; data: TripData; access: Access; members: Member[] }
const project = (state: State) => snapshot(state.revision, state.data, state.access, state.members);
export const hash = async (token: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))))
  .map((byte) => byte.toString(16).padStart(2, '0')).join('');
const token = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

async function jsonBody(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'Send a JSON request.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Expected a JSON body.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new HttpError(408, 'The request timed out.')); void reader.cancel(); }, 10_000);
  });
  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), timeout]);
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > 131072) { void reader.cancel(); throw new HttpError(413, 'The request is too large.'); }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder().decode(bytes)) as unknown; }
    catch { throw new HttpError(400, 'Invalid JSON.'); }
  } finally { clearTimeout(timer); reader.releaseLock(); }
}

export function createHandler(rpc: Rpc, allowedOrigins: string[]) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const headers: Record<string, string> = {
      'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin',
    };
    if (origin && allowedOrigins.includes(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Headers'] = 'content-type,apikey,x-trip-session';
      headers['Access-Control-Allow-Methods'] = 'GET,POST,DELETE,OPTIONS';
    }
    const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
    try {
      if (origin && !allowedOrigins.includes(origin)) throw new HttpError(403, 'This website origin is not allowed.');
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      const url = new URL(request.url);
      const path = url.pathname.replace(/^\/(?:functions\/v1\/)?trip-api/, '');
      if (url.search) throw new HttpError(400, 'Do not put credentials or request data in the URL.');
      if (path === '/health' && request.method === 'GET') return reply({ ok: true });
      const body = request.method === 'POST' ? object(await jsonBody(request)) : {};
      const session = request.headers.get('x-trip-session') || '';
      const sessionHash = /^[A-Za-z0-9_-]{43}$/.test(session) ? await hash(session) : '';
      if (path === '/trips' && request.method === 'POST') {
        await rpc('trip_rate_limit', { p_bucket: 'create' });
        const input = createTripInput(body);
        const ownerToken = token(), sessionToken = token();
        const state = await rpc('trip_create_online', {
          p_details: { ...input, cities: input.cities.map((name) => ({ id: crypto.randomUUID(), name })) },
          p_owner_name: input.ownerName, p_link_hash: await hash(ownerToken), p_session_hash: await hash(sessionToken),
          p_packing: checklistStrategies.packing.create(() => crypto.randomUUID()),
        }) as State;
        return reply({ snapshot: project(state), ownerToken, sessionToken }, 201);
      }
      if (path === '/session' && request.method === 'POST') {
        await rpc('trip_rate_limit', { p_bucket: 'open' });
        if (typeof body.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.token)) throw new HttpError(401, 'Invalid trip link.');
        const sessionToken = token();
        const state = await rpc('trip_open_online', { p_link_hash: await hash(body.token), p_session_hash: await hash(sessionToken) }) as State;
        return reply({ snapshot: project(state), sessionToken });
      }
      if (path === '/join/preview' && request.method === 'POST') {
        await rpc('trip_rate_limit', { p_bucket: 'open' });
        return reply(await rpc('trip_join_preview', { p_token: joinToken(body.token) }));
      }
      if (path === '/join' && request.method === 'POST') {
        const input = joinInput(body);
        await rpc('trip_rate_limit', { p_bucket: 'open' });
        const sessionToken = token();
        const state = await rpc('trip_join', {
          p_token: input.token, p_name: input.name, p_link_hash: await hash(token()), p_session_hash: await hash(sessionToken),
        }) as State;
        return reply({ snapshot: project(state), sessionToken }, 201);
      }
      if (!sessionHash) throw new HttpError(401, 'Open a valid trip link to continue.');
      if (path === '/session' && request.method === 'DELETE') {
        await rpc('trip_end_session', { p_session_hash: sessionHash });
        return reply({ ok: true });
      }
      if (path === '/trip' && request.method === 'GET') {
        return reply(project(await rpc('trip_state', { p_session_hash: sessionHash }) as State));
      }
      if (path === '/share' && request.method === 'GET') {
        return reply(await rpc('trip_share', { p_session_hash: sessionHash, p_token: token() }));
      }
      if (path === '/profile' && request.method === 'POST') {
        const input = profileInput(body);
        await rpc('trip_rate_limit', { p_bucket: 'write' });
        return reply(project(await rpc('trip_profile', {
          p_session_hash: sessionHash, p_previous_name: input.previousName, p_name: input.name,
        }) as State));
      }
      if (path === '/history' && request.method === 'POST') {
        return reply(await rpc('trip_history', { p_session_hash: sessionHash, p_before: historyInput(body) }));
      }
      if (path === '/commands' && request.method === 'POST') {
        check(Number.isSafeInteger(body.revision) && Number(body.revision) >= 0, 'Invalid trip revision.');
        const command = commandInput(body.command);
        const state = await rpc('trip_state', { p_session_hash: sessionHash }) as State;
        requirePermission(state.access.member, 'mutate');
        if (!Array.isArray(state.data.checklists)) {
          throw new HttpError(503, 'Checklist storage needs its database update. Your changes were not saved.');
        }
        if (state.revision !== body.revision) throw new HttpError(409, 'The trip changed. Reload before saving.');
        await rpc('trip_rate_limit', { p_bucket: 'write' });
        const before = structuredClone(state.data);
        applyCommand(state.data, state.access.member, command);
        // The database reauthorizes and compares the revision inside the write
        // transaction. The earlier state is not permission to finish a save.
        const saved = await rpc('trip_commit', {
          p_session_hash: sessionHash, p_revision: body.revision, p_data: state.data,
          p_changes: changesBetween(before, state.data), p_checklist_version: 1,
        }) as State;
        return reply(project(saved));
      }
      if (path === '/invites' && request.method === 'GET') return reply(await rpc('trip_invitations', { p_session_hash: sessionHash }));
      if (path === '/invites' && request.method === 'POST') {
        const input = inviteInput(body), invitationToken = token();
        const result = await rpc('trip_invite', { p_session_hash: sessionHash, p_input: input, p_link_hash: await hash(invitationToken) }) as { id: string };
        return reply({ ...result, token: invitationToken }, 201);
      }
      if (path.startsWith('/invites/') && request.method === 'DELETE') {
        await rpc('trip_revoke_member', { p_session_hash: sessionHash, p_member_id: id(path.slice('/invites/'.length)) });
        return reply({ ok: true });
      }
      if (path === '/rotate' && request.method === 'POST') {
        const nextToken = token(), nextSession = token();
        const result = await rpc('trip_rotate', {
          p_session_hash: sessionHash, p_member_id: id(body.id), p_link_hash: await hash(nextToken), p_new_session_hash: await hash(nextSession),
        }) as { id: string; owner: boolean };
        return reply({ ...result, token: nextToken, ...(result.owner ? { sessionToken: nextSession } : {}) });
      }
      throw new HttpError(404, 'API route not found.');
    } catch (error) {
      if (error instanceof HttpError) return reply({ error: error.message }, error.status);
      // Database details, request bodies and credentials must not reach logs or
      // browser responses. Availability failures are never a signal to upgrade.
      return reply({ error: 'Trip storage is unavailable. Your changes were not confirmed. Try again later.' }, 503);
    }
  };
}
