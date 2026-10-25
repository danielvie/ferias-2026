import { execFileSync, spawn } from 'node:child_process';

// Cloud keys in .env.local are not used for local development. Only this local
// project's Docker database is prepared; real SQLite data are left untouched.
execFileSync('task', ['db:start'], { stdio: 'inherit' });
execFileSync('docker', [
  'exec', '-i', 'supabase_db_ferias-2026', 'psql', '-X', '-q', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
], { input: 'update trip_private.settings set creation_enabled = true;', stdio: ['pipe', 'inherit', 'inherit'] });
const status = JSON.parse(execFileSync('npx', ['--no-install', 'supabase', 'status', '--output', 'json'], {
  encoding: 'utf8', env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'ignore'],
}));
const env = {
  ...process.env, SUPABASE_TELEMETRY_DISABLED: '1', VITE_BACKEND: 'supabase',
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY || status.ANON_KEY || '',
};
const children = [
  spawn('npx', ['--no-install', 'supabase', 'functions', 'serve', 'trip-api'], { stdio: 'inherit', env }),
  spawn('npm', ['run', 'dev:client'], { stdio: 'inherit', env }),
];
let stopped = false;
function stop(code = 0) {
  if (stopped) return;
  stopped = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
for (const child of children) child.on('exit', (code) => stop(code ?? 0));
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
