import { loadEnv } from 'vite';

// Use the same development-mode file precedence as Vite, without logging values.
// https://vite.dev/guide/env-and-mode#env-files
const production = process.argv.includes('--production');
const env = loadEnv(production ? 'production' : 'development', process.cwd(), 'VITE_');
const errors = [];
const url = env.VITE_SUPABASE_URL?.trim();
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

const hasBackendSecret = Object.entries(env).some(([name, value]) => {
  if (/SECRET|SERVICE_ROLE|PASSWORD|DATABASE_URL/i.test(name)) return true;
  if (value.trim().startsWith('sb_secret_')) return true;
  try {
    return JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString()).role === 'service_role';
  } catch { return false; }
});
if (hasBackendSecret) errors.push('Remove backend secrets from VITE_* variables. Only public configuration belongs there.');

try {
  const parsed = new URL(url);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (production && (parsed.protocol !== 'https:' || local)) throw new Error();
  if ((parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:'))
    || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw new Error();
} catch {
  errors.push(production
    ? 'Hosted builds require an HTTPS Supabase project origin.'
    : 'Set VITE_SUPABASE_URL in .env.local to an HTTPS project origin or an HTTP localhost origin.');
}
if (!key || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
  errors.push('Set VITE_SUPABASE_PUBLISHABLE_KEY in .env.local to the sb_publishable_ key from Supabase Connect.');
}

if (errors.length) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else {
  if (process.argv.includes('--connect')) {
    try {
      // Public metadata only; database schema introspection requires a backend key.
      // This probe does not create an Auth account or perform a sign-in.
      // https://github.com/supabase/auth/blob/master/internal/api/settings.go
      const response = await fetch(`${new URL(url).origin}/auth/v1/settings`, {
        headers: { apikey: key }, signal: AbortSignal.timeout(10_000),
      });
      await response.body?.cancel();
      if (!response.ok) {
        console.error(`Supabase API check failed with HTTP ${response.status}. Check the project status and publishable key.`);
        process.exitCode = 1;
      } else {
        console.log('Public Supabase endpoint accepted the publishable key. No sign-in or table-row access was performed.');
      }
    } catch {
      console.error('Could not reach the Supabase API within the timeout. Check the project URL, network and project status.');
      process.exitCode = 1;
    }
  } else {
    console.log('Public Supabase configuration format is valid. No key values were printed and no network request was made.');
  }
  console.log('Supabase integration is prepared. This check does not apply migrations or deploy the site.');
}
