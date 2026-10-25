import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Isolate schema changes from the database used by the running app. This uses
// the existing local PostgreSQL container/image, never hosted configuration.
const container = 'supabase_db_ferias-2026';
const suffix = randomBytes(8).toString('hex');
const database = `trip_attribution_${suffix}`;
const login = `trip_fixture_${suffix}`;
const password = randomBytes(32).toString('hex');
const rest = `trip-attribution-${suffix}`;
const scratch = mkdtempSync(join(tmpdir(), 'trip-attribution-'));
const children = [];
let createdDatabase = false, createdRole = false, createdRest = false;
const redact = (text) => text.replaceAll(password, '[redacted]');
const env = { ...process.env, TRIP_TEST_DATABASE: database, TRIP_TEST_API_URL: 'http://127.0.0.1:8000/functions/v1/trip-api' };
// Other auth changes can reuse this disposable fixture without running unrelated
// browser workflows or touching the database used by the running application.
const browserGrep = process.env.TRIP_TEST_GREP;
function sql(name, input, user = 'postgres') {
  return execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-qAt', '-U', user, '-d', name, '-v', 'ON_ERROR_STOP=1'],
    { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}
async function run(args, extraEnv = {}) {
  const child = spawn(process.execPath, args, { env: { ...env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  child.stdout.on('data', (chunk) => process.stdout.write(redact(String(chunk))));
  child.stderr.on('data', (chunk) => process.stderr.write(redact(String(chunk))));
  const status = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  assert.equal(status, 0, `Check failed: ${args[0]}`);
}
async function ready(url) {
  for (let i = 0; i < 60; i++) {
    if ((await fetch(url, { signal: AbortSignal.timeout(1000) }).catch(() => null))?.ok) return;
    await delay(250);
  }
  throw new Error(`Fixture did not start: ${url}`);
}
const proxy = createServer(async (request, response) => {
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const result = await fetch(`http://127.0.0.1:54391${request.url.replace(/^\/rest\/v1/, '')}`, {
      method: request.method, headers: { 'Content-Type': 'application/json' },
      ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
    });
    response.writeHead(result.status, { 'Content-Type': 'application/json' });
    response.end(await result.text());
  } catch { response.writeHead(503); response.end('{}'); }
});

try {
  const probe = createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(8000, '127.0.0.1', resolve); });
  await new Promise((resolve) => probe.close(resolve));
  const image = execFileSync('docker', ['inspect', 'supabase_rest_ferias-2026', '--format', '{{.Config.Image}}'], { encoding: 'utf8' }).trim();
  sql('postgres', `create role "${login}" login superuser password '${password}';`, 'supabase_admin');
  createdRole = true;
  sql('postgres', `create database "${database}";`);
  createdDatabase = true;
  sql(database, 'create schema extensions; grant usage on schema extensions to public;');
  for (const name of readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort()) {
    sql(database, readFileSync(`supabase/migrations/${name}`, 'utf8'));
  }
  if (!browserGrep) {
    await run(['node_modules/supabase/dist/supabase.js', 'test', 'db', '--db-url', `postgresql://${login}:${password}@127.0.0.1:54322/${database}`]);
    await run(['--test', 'tests/supabase-concurrency.test.mjs']);
  }
  sql(database, 'update trip_private.settings set creation_enabled = true;');
  execFileSync('docker', ['run', '--detach', '--rm', '--name', rest,
    '--network', 'supabase_network_ferias-2026', '--publish', '127.0.0.1:54391:3000',
    '--env', `PGRST_DB_URI=postgresql://${login}:${password}@${container}:5432/${database}`,
    '--env', 'PGRST_DB_ANON_ROLE=service_role', '--env', 'PGRST_DB_SCHEMAS=public', image],
  { stdio: ['ignore', 'pipe', 'pipe'] });
  createdRest = true;
  await ready('http://127.0.0.1:54391/');
  await new Promise((resolve, reject) => { proxy.once('error', reject); proxy.listen(54390, '127.0.0.1', resolve); });
  const deno = spawn(process.execPath, ['node_modules/deno/bin.cjs', 'run', '--allow-env', '--allow-net=127.0.0.1',
    'supabase/functions/trip-api/index.ts'], {
    env: { ...env, TRIP_BIND_HOST: '127.0.0.1', SUPABASE_URL: 'http://127.0.0.1:54390', SUPABASE_SECRET_KEYS: '{}',
      SUPABASE_SECRET_KEY: 'local-fixture', SUPABASE_SERVICE_ROLE_KEY: 'local-fixture' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(deno);
  deno.stderr.on('data', (chunk) => process.stderr.write(redact(String(chunk))));
  await ready(`${env.TRIP_TEST_API_URL}/health`);
  const built = join(scratch, 'dist');
  await run(['node_modules/vite/bin/vite.js', 'build', '--outDir', built, '--emptyOutDir'], {
    VITE_BACKEND: 'supabase', VITE_SUPABASE_URL: 'http://127.0.0.1:8000',
    VITE_SUPABASE_PUBLISHABLE_KEY: '', VITE_BASE_PATH: '/ferias-2026/',
  });
  const config = join(scratch, 'online.config.mjs');
  writeFileSync(config, 'export default ' + JSON.stringify({
    testDir: resolve('tests/e2e'), testMatch: 'online.spec.ts', timeout: 45000, workers: 1, reporter: 'list',
    outputDir: join(scratch, 'results'), use: {
      baseURL: 'http://127.0.0.1:4173/ferias-2026/',
      launchOptions: env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {},
    },
    webServer: [{
      command: `node node_modules/vite/bin/vite.js preview --outDir "${built}" --host 127.0.0.1 --port 4173 --strictPort`,
      cwd: process.cwd(), url: 'http://127.0.0.1:4173/ferias-2026/', reuseExistingServer: false,
      env: { VITE_BASE_PATH: '/ferias-2026/' },
    }],
  }));
  await run(['node_modules/@playwright/test/cli.js', 'test', '--config', config, '--max-failures=1',
    ...(browserGrep ? ['--grep', browserGrep] : [])]);
  console.log(browserGrep
    ? 'Focused browser fixture passed through Deno + PostgREST with fresh native migrations. Native pgTAP/concurrency checks were skipped. The shared local database was not migrated.'
    : 'Attribution fixture passed: fresh native migrations, pgTAP, concurrency and Pages-path browser workflows through Deno + PostgREST. The shared local database was not migrated.');
} catch (error) {
  // Child-process exceptions can contain connection-string arguments.
  console.error(redact(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
} finally {
  for (const child of children) {
    if (child.exitCode === null) {
      try {
        if (process.platform === 'win32') {
          execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        } else child.kill('SIGTERM');
      } catch { /* A completed child may have exited between checking and killing. */ }
    }
  }
  await new Promise((resolve) => proxy.close(resolve));
  if (createdRest) execFileSync('docker', ['rm', '--force', rest], { stdio: 'ignore' });
  if (createdDatabase) sql('postgres', `drop database "${database}" with (force);`);
  if (createdRole) sql('postgres', `drop role "${login}";`, 'supabase_admin');
  rmSync(scratch, { recursive: true, force: true });
}
