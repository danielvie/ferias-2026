import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';

const scriptModule = '../scripts/master-key.mjs';
const { keyHash, options } = await import(scriptModule);

test('requires an explicit single database target and rejects unexpected options', () => {
  for (const args of [
    [], ['set'], ['disable'], ['set', '--local', '--project-ref', 'a'.repeat(20)],
    ['set', '--project-ref', 'bad'], ['generate', '--local'], ['disable', '--local', '--file', 'key'],
    ['set', '--local', '--key', 'secret'], ['generate', 'extra'],
  ]) expect(() => options(args)).toThrow();
  expect(options(['set', '--local'])).toMatchObject({ local: true, file: 'data/master-key.txt' });
  expect(options(['set', '--project-ref', 'a'.repeat(20), '--file', 'private-file']))
    .toMatchObject({ local: false, projectRef: 'a'.repeat(20), file: 'private-file' });
});

test('hashes generated keys without accepting low-length passwords or Supabase API keys', () => {
  const value = 'a'.repeat(43);
  expect(keyHash(`${value}\n`)).toBe(createHash('sha256').update(value).digest('hex'));
  for (const invalid of ['', 'password', 'sb_secret_example', 'a'.repeat(64)]) {
    expect(() => keyHash(invalid)).toThrow();
  }
});

test('generates only an ignored owner-readable key, never prints or overwrites it', () => {
  const directory = mkdtempSync(join(tmpdir(), 'trip-key-tool-test-'));
  const script = resolve('scripts/master-key.mjs');
  const run = () => execFileSync(process.execPath, [script, 'generate'],
    { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: directory });
    expect(run).toThrow();
    writeFileSync(join(directory, '.gitignore'), 'data/\n');
    const output = run();
    const path = join(directory, 'data/master-key.txt');
    const key = readFileSync(path, 'utf8').trim();
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(output).not.toContain(key);
    if (process.platform !== 'win32') expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(run).toThrow();
    expect(readFileSync(path, 'utf8').trim()).toBe(key);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
