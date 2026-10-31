import { execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export function options(args) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    local: { type: 'boolean' }, 'project-ref': { type: 'string' }, file: { type: 'string' },
  } });
  const [action] = positionals;
  if (positionals.length !== 1 || !['generate', 'set', 'disable'].includes(action)) {
    throw new Error('Use generate, set --local, set --project-ref REF, or disable with one explicit target.');
  }
  if (action === 'generate') {
    if (Object.keys(values).length) throw new Error('generate takes no options and never changes a database.');
  } else {
    if (Boolean(values.local) === Boolean(values['project-ref'])) throw new Error('Choose exactly one target: --local or --project-ref REF.');
    if (values['project-ref'] && !/^[a-z]{20}$/.test(values['project-ref'])) throw new Error('Invalid Supabase project reference.');
    if (action === 'disable' && values.file) throw new Error('disable does not read a key file.');
  }
  return { action, local: Boolean(values.local), projectRef: values['project-ref'], file: values.file || 'data/master-key.txt' };
}

export function keyHash(key) {
  const value = key.trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error('Expected a generated 43-character master key, not a password or Supabase API key.');
  return createHash('sha256').update(value).digest('hex');
}

export function main(args) {
  const config = options(args);
  if (config.action === 'generate') {
    // Never generate into a tracked or shareable path, even if ignore rules change.
    execFileSync('git', ['check-ignore', '--quiet', config.file], { stdio: 'ignore' });
    mkdirSync('data', { recursive: true, mode: 0o700 });
    writeFileSync(config.file, `${randomBytes(32).toString('base64url')}\n`, { flag: 'wx', mode: 0o600 });
    console.log(`Created ${config.file}. Store it in your password manager; its contents were not printed. No database changed.`);
    return;
  }
  const hash = config.action === 'set' ? keyHash(readFileSync(config.file, 'utf8')) : null;
  const scratch = mkdtempSync(join(tmpdir(), 'trip-master-key-'));
  try {
    const sqlFile = join(scratch, 'configure.sql');
    writeFileSync(sqlFile, `select trip_private.set_master_key(${hash ? `'${hash}'` : 'null'});`, { mode: 0o600 });
    const cli = fileURLToPath(new URL('../node_modules/supabase/dist/supabase.js', import.meta.url));
    execFileSync(process.execPath, [cli, 'db', 'query',
      ...(config.local ? ['--local'] : ['--linked', '--project-ref', config.projectRef]),
      '--file', sqlFile], { stdio: ['ignore', 'pipe', 'pipe'] });
    console.log(`Master access ${hash ? 'configured' : 'disabled'} for ${config.local ? 'local Supabase' : config.projectRef}.`);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); }
  catch {
    // Subprocess errors can include SQL and credentials. Never echo their output.
    console.error('Master-key operation failed. Check arguments, file permissions, Supabase login and migration 009. An existing key file is never overwritten.');
    process.exitCode = 1;
  }
}
