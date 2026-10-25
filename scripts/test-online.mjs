import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

// Local-only integration. Never read hosted configuration or use deployment keys.
const base = process.env.LOCAL_TRIP_API_URL || 'http://127.0.0.1:54321/functions/v1/trip-api';
const apiUrl = new URL(base);
assert.ok(apiUrl.protocol === 'http:' && apiUrl.hostname === '127.0.0.1' &&
  apiUrl.pathname === '/functions/v1/trip-api' && !apiUrl.username && !apiUrl.password && !apiUrl.search && !apiUrl.hash,
  'The integration API must use a local loopback HTTP endpoint.');
const origin = 'http://127.0.0.1:5173';
const sql = (input) => execFileSync('docker', [
  'exec', '-i', 'supabase_db_ferias-2026', 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
], { input, encoding: 'utf8' }).trim();
const enabled = sql('select creation_enabled from trip_private.settings where singleton;') === 't';
const existing = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2_000) }).catch(() => null);
const server = existing?.ok ? null : spawn('npx', ['--no-install', 'supabase', 'functions', 'serve', 'trip-api'], {
  detached: true, env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
server?.stdout.on('data', (chunk) => { log += chunk; });
server?.stderr.on('data', (chunk) => { log += chunk; });
let tripId = '';
async function request(path, method = 'GET', body, session = '', status = 200) {
  const response = await fetch(`${base}${path}`, {
    method, signal: AbortSignal.timeout(15_000),
    headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Trip-Session': session },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  assert.equal(response.status, status, result.error || `Unexpected API status on ${path}`);
  return result;
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { if ((await fetch(`${base}/health`)).ok) { ready = true; break; } } catch { /* Runtime is still starting. */ }
    await delay(500);
  }
  assert.ok(ready, 'Local Edge runtime did not become ready.');
  sql('update trip_private.settings set creation_enabled = true; delete from trip_private.request_limits;');
  const created = await request('/trips', 'POST', {
    title: 'Synthetic Edge integration trip', ownerName: 'Owner', startDate: '2026-12-02', endDate: '2026-12-15', cities: ['Brussels', 'Bruges'],
  }, '', 201);
  tripId = created.snapshot.data.trip.id;
  const owner = created.sessionToken;
  const city = created.snapshot.data.trip.cities[0].id;
  assert.equal(created.snapshot.data.packing.length, 5);
  const load = (session = owner) => request('/trip', 'GET', undefined, session);
  const command = async (command, session = owner) => {
    const state = await load(session);
    return request('/commands', 'POST', { revision: state.revision, command }, session);
  };
  await request('/trip', 'GET', undefined, '', 401);
  const preflight = await fetch(`${base}/commands`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Headers': 'x-trip-session,content-type' } });
  assert.equal(preflight.status, 204);
  // The local Kong gateway can answer OPTIONS before the Edge handler. The
  // browser omits cookies; wildcard preflight is valid, but actual requests
  // still have to pass the handler's explicit origin and capability checks.
  assert.ok([origin, '*'].includes(preflight.headers.get('access-control-allow-origin')));
  const allowedHeaders = preflight.headers.get('access-control-allow-headers')?.toLowerCase() || '';
  assert.ok(allowedHeaders === '*' || allowedHeaders.includes('x-trip-session'));
  const unrelated = await fetch(`${base}/trip`, { headers: { Origin: 'https://unrelated.example', 'X-Trip-Session': owner } });
  assert.equal(unrelated.status, 403);
  const saved = await command({ type: 'place.save', place: {
    id: '', title: 'Synthetic museum', cityId: city, category: 'museum', status: 'idea',
    description: 'Private place details', address: 'Private address', url: '', durationMinutes: 60, cost: 'Booking secret',
  } });
  const place = saved.data.places[0];
  const scheduled = await command({ type: 'event.save', event: {
    id: '', title: 'Museum visit', cityId: city, date: '2026-12-03', startTime: '10:00', endTime: '11:00',
    kind: 'activity', status: 'planned', placeId: place.id, description: 'Private booking code',
  } });
  await command({ type: 'visit.add', visit: { id: 'synthetic-return', name: 'Brussels' }, beforeId: null });
  await command({ type: 'place.move', id: place.id, cityId: 'synthetic-return', beforeId: null });
  const moved = await command({ type: 'visit.move', id: 'synthetic-return', beforeId: city });
  assert.equal(moved.data.trip.cities[0].id, 'synthetic-return');
  assert.equal(moved.data.places[0].id, place.id);
  assert.equal(moved.data.events[0].cityId, 'synthetic-return');
  assert.equal(moved.data.events[0].date, scheduled.data.events[0].date);
  assert.equal(moved.data.events[0].description, 'Private booking code');
  const editorLink = await request('/invites', 'POST', { name: 'Editor', role: 'editor', eventIds: [], placeIds: [] }, owner, 201);
  const editor = await request('/session', 'POST', { token: editorLink.token });
  await command({ type: 'note.save', note: {
    id: '', title: 'Private editor note', body: 'Only editor', visibility: 'private', linkType: 'trip', linkId: tripId,
  } }, editor.sessionToken);
  assert.equal((await load()).data.notes.length, 0);
  assert.equal((await load(editor.sessionToken)).data.notes[0].authorId, editorLink.id);
  const familyLink = await request('/invites', 'POST', {
    name: 'Family', role: 'family', eventIds: [scheduled.data.events[0].id], placeIds: [place.id],
  }, owner, 201);
  const family = await request('/session', 'POST', { token: familyLink.token });
  assert.equal(family.snapshot.data.packing.length, 0);
  assert.equal(family.snapshot.data.places[0].address, '');
  assert.equal(family.snapshot.data.events[0].description, '');
  assert.equal(family.snapshot.revision, 0);
  await request(`/invites/${familyLink.id}`, 'DELETE', undefined, owner);
  await request('/trip', 'GET', undefined, family.sessionToken, 401);
  const rotated = await request('/rotate', 'POST', { id: created.snapshot.session.id }, owner);
  await request('/trip', 'GET', undefined, owner, 401);
  const reopened = await request('/session', 'POST', { token: rotated.token });
  assert.equal(reopened.snapshot.session.id, created.snapshot.session.id);
  console.log('Native Edge integration passed: create/open/read, CORS, repeat visits, route/activity moves, places/calendar, private authorship, family redaction, revocation and owner rotation.');
} catch (error) {
  console.error(log.replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, '[redacted]').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted]'));
  throw error;
} finally {
  if (tripId) sql(`delete from trip_private.trips where id = '${tripId}';`);
  sql(`update trip_private.settings set creation_enabled = ${enabled};`);
  if (server) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch { /* The CLI may already have exited. */ }
  }
}
