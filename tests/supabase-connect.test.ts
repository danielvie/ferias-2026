import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const execute = promisify(execFile);
const script = fileURLToPath(new URL('../scripts/check-supabase-env.mjs', import.meta.url));
const publishable = 'sb_publishable_nonfunctional_connection_fixture';

it.each([200, 401])('checks only public project settings and handles HTTP %i without printing credentials or response bodies', async (status) => {
  const requests: { method?: string; url?: string; key?: string }[] = [];
  const server = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url, key: request.headers.apikey as string });
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ internal: 'response-body-must-not-be-printed' }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const directory = mkdtempSync(join(tmpdir(), 'trip-supabase-connect-'));
  try {
    writeFileSync(join(directory, '.env.local'),
      `VITE_SUPABASE_URL=http://127.0.0.1:${(server.address() as AddressInfo).port}\nVITE_SUPABASE_PUBLISHABLE_KEY=${publishable}\n`);
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('VITE_')));
    let output = '';
    let exitCode = 0;
    try {
      const result = await execute(process.execPath, [script, '--connect'], { cwd: directory, env });
      output = result.stdout + result.stderr;
    } catch (cause) {
      const error = cause as { code: number; stdout: string; stderr: string };
      exitCode = error.code;
      output = error.stdout + error.stderr;
    }
    expect(requests).toEqual([{ method: 'GET', url: '/auth/v1/settings', key: publishable }]);
    expect(exitCode).toBe(status === 200 ? 0 : 1);
    expect(output).toContain(status === 200 ? 'No sign-in or table-row access was performed' : 'HTTP 401');
    expect(output).not.toContain(publishable);
    expect(output).not.toContain('response-body-must-not-be-printed');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
});
