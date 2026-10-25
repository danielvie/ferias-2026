import { HttpError } from '../../../server/validation.ts';
import { createHandler, type Rpc } from './handler.ts';

const env = Deno.env;
const url = env.get('SUPABASE_URL');
const secret = JSON.parse(env.get('SUPABASE_SECRET_KEYS') || '{}').default
  || env.get('SUPABASE_SECRET_KEY') || env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !secret) throw new Error('Supabase server credentials are unavailable.');

const rpc: Rpc = async (name, args) => {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST', signal: AbortSignal.timeout(10_000),
    headers: {
      apikey: secret, 'Content-Type': 'application/json',
      ...(secret.startsWith('eyJ') ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify(args),
  });
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const status = /^PT[45][0-9]{2}$/.test(result.code) ? Number(result.code.slice(2)) : 0;
    if (status) throw new HttpError(status, result.message);
    if (['23505', '23514', '23502', '22007', '22008', '22P02'].includes(result.code)) throw new HttpError(422, 'Invalid or conflicting trip data.');
    console.error(`Trip RPC ${name} failed with HTTP ${response.status}, code ${result.code || 'unavailable'}.`);
    throw new Error('Database request failed.');
  }
  return result;
};
const origins = (env.get('TRIP_ALLOWED_ORIGINS') || 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173')
  .split(',').map((origin) => origin.trim()).filter(Boolean);
// Keep Supabase's defaults, but let a local worktree preview bind separately
// without replacing another checkout's running Edge server.
// https://docs.deno.com/api/deno/~/Deno.serve
const port = Number(env.get('TRIP_HTTP_PORT') || 8000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid TRIP_HTTP_PORT.');
Deno.serve({ hostname: env.get('TRIP_HTTP_HOST') || env.get('TRIP_BIND_HOST') || '0.0.0.0', port }, createHandler(rpc, origins));
