import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Run the pinned CLI entrypoints with Node, not npm/npx's Windows .cmd shims.
// https://nodejs.org/docs/latest-v24.x/api/child_process.html#spawning-bat-and-cmd-files-on-windows
const supabaseCli = fileURLToPath(new URL('../node_modules/supabase/dist/supabase.js', import.meta.url));
const viteCli = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));

// Cloud keys in .env.local are not used for local development. Only this local
// project's Docker database is prepared; real SQLite data are left untouched.
execFileSync('task', ['db:start'], { stdio: 'inherit' });
execFileSync('docker', [
  'exec', '-i', 'supabase_db_ferias-2026', 'psql', '-X', '-q', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
], { input: 'update trip_private.settings set creation_enabled = true;', stdio: ['pipe', 'inherit', 'inherit'] });
const status = JSON.parse(execFileSync(process.execPath, [supabaseCli, 'status', '--output', 'json'], {
  encoding: 'utf8', env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'ignore'],
}));
const env = {
  ...process.env, SUPABASE_TELEMETRY_DISABLED: '1', VITE_BACKEND: 'supabase',
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY || status.ANON_KEY || '',
};
const children = [
  spawn(process.execPath, [supabaseCli, 'functions', 'serve', 'trip-api'], { stdio: 'inherit', env }),
  spawn(process.execPath, [viteCli, '--host', '127.0.0.1', '--strictPort'], { stdio: 'inherit', env }),
];
let stopped = false;
function stop(code = 0) {
  if (stopped) return;
  stopped = true;
  for (const child of children) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) continue;
    if (process.platform === 'win32') {
      // Killing only the Node wrapper on Windows leaves its CLI process alive.
      try { execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' }); }
      catch { /* The child may already have exited. */ }
    } else child.kill('SIGTERM');
  }
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', (error) => {
    console.error('Development process failed to start:', error.message);
    stop(1);
  });
  child.on('exit', (code) => stop(code ?? 1));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
