import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const directories: string[] = [];
const script = fileURLToPath(new URL('../scripts/check-supabase-env.mjs', import.meta.url));
const publishable = 'sb_publishable_nonfunctional_test_fixture';
const project = 'https://env-fixture.supabase.co';
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function check(files: Record<string, string>, args: string[] = []) {
  const directory = mkdtempSync(join(tmpdir(), 'trip-env-test-'));
  directories.push(directory);
  for (const [name, value] of Object.entries(files)) writeFileSync(join(directory, name), value);
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('VITE_')));
  const result = spawnSync(process.execPath, [script, ...args], { cwd: directory, env, encoding: 'utf8' });
  expect(result.error).toBeUndefined();
  return { status: result.status, output: result.stdout + result.stderr };
}

describe('local Supabase environment check', () => {
  it('identifies a missing publishable key without displaying configuration values', () => {
    const result = check({ '.env.local': `VITE_SUPABASE_URL=${project}\nVITE_SUPABASE_PUBLISHABLE_KEY=\n` });
    expect(result.status).toBe(1);
    expect(result.output).toContain('Set VITE_SUPABASE_PUBLISHABLE_KEY');
    expect(result.output).not.toContain(project);
  });

  it('accepts public configuration and explicitly does not claim a database connection', () => {
    const result = check({ '.env.local': `VITE_SUPABASE_URL=${project}\nVITE_SUPABASE_PUBLISHABLE_KEY=${publishable}\n` });
    expect(result.status).toBe(0);
    expect(result.output).toContain('no network request was made');
    expect(result.output).toContain('does not apply migrations or deploy the site');
    expect(result.output).not.toContain(publishable);
  });

  it('rejects a secret in the publishable field without echoing it', () => {
    const secret = 'sb_secret_nonfunctional_test_fixture';
    const result = check({ '.env.local': `VITE_SUPABASE_URL=${project}\nVITE_SUPABASE_PUBLISHABLE_KEY=${secret}\n` });
    expect(result.status).toBe(1);
    expect(result.output).toContain('Remove backend secrets');
    expect(result.output).not.toContain(secret);
  });

  it('rejects privileged keys placed under other VITE variables', () => {
    const secret = 'sb_secret_nonfunctional_other_fixture';
    const result = check({ '.env.local': `VITE_SUPABASE_URL=${project}\nVITE_SUPABASE_PUBLISHABLE_KEY=${publishable}\nVITE_OTHER=${secret}\n` });
    expect(result.status).toBe(1);
    expect(result.output).toContain('Remove backend secrets');
    expect(result.output).not.toContain(secret);
  });

  it('rejects legacy service-role JWTs without exposing their value', () => {
    const jwt = `fixture.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.not-a-real-signature`;
    const result = check({ '.env.local': `VITE_SUPABASE_URL=${project}\nVITE_SUPABASE_PUBLISHABLE_KEY=${publishable}\nVITE_OTHER=${jwt}\n` });
    expect(result.status).toBe(1);
    expect(result.output).toContain('Remove backend secrets');
    expect(result.output).not.toContain(jwt);
  });

  it('uses Vite development-mode env precedence', () => {
    const result = check({
      '.env.local': 'VITE_SUPABASE_URL=invalid\nVITE_SUPABASE_PUBLISHABLE_KEY=\n',
      '.env.development.local': `VITE_SUPABASE_URL=${project}\nVITE_SUPABASE_PUBLISHABLE_KEY=${publishable}\n`,
    });
    expect(result.status).toBe(0);
  });

  it('rejects non-local plain HTTP URLs', () => {
    const result = check({ '.env.local': `VITE_SUPABASE_URL=http://env-fixture.supabase.co\nVITE_SUPABASE_PUBLISHABLE_KEY=${publishable}\n` });
    expect(result.status).toBe(1);
    expect(result.output).toContain('HTTPS project origin');
  });

  it('accepts localhost origins for a future local Supabase stack', () => {
    const result = check({ '.env.local': `VITE_SUPABASE_URL=http://127.0.0.1:54321\nVITE_SUPABASE_PUBLISHABLE_KEY=${publishable}\n` });
    expect(result.status).toBe(0);
  });

  it('refuses localhost in a hosted build', () => {
    const result = check({ '.env.local': `VITE_SUPABASE_URL=http://127.0.0.1:54321\nVITE_SUPABASE_PUBLISHABLE_KEY=${publishable}\n` }, ['--production']);
    expect(result.status).toBe(1);
    expect(result.output).toContain('Hosted builds require an HTTPS Supabase project origin');
  });

  it('checks production-mode files before building and does not expose their values', () => {
    const secret = 'sb_secret_nonfunctional_production_fixture';
    const result = check({
      '.env.local': `VITE_SUPABASE_URL=${project}\nVITE_SUPABASE_PUBLISHABLE_KEY=${publishable}\n`,
      '.env.production.local': `VITE_SUPABASE_PUBLISHABLE_KEY=${secret}\n`,
    }, ['--production']);
    expect(result.status).toBe(1);
    expect(result.output).not.toContain(secret);
    expect(result.output).toContain('Remove backend secrets');
  });
});
