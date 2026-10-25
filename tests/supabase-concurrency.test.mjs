import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { changesBetween } from '../server/history.ts';

// Native tests deliberately target only the project container, never a URL or
// credentials from .env.local. Cleanup deletes only each test's generated trip.
const container = 'supabase_db_ferias-2026';
const database = process.env.TRIP_TEST_DATABASE || 'postgres';
if (database !== 'postgres' && !/^trip_attribution_[0-9a-f]+$/.test(database)) throw new Error('Invalid disposable test database.');
const details = {
  title: 'Synthetic concurrency trip', startDate: '2026-12-02', endDate: '2026-12-15',
  cities: [{ id: 'brussels', name: 'Brussels' }],
};
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${literal(JSON.stringify(value))}::jsonb`;

function connection(name = `trip-test-${randomUUID()}`) {
  const child = spawn('docker', [
    'exec', '-i', '--env', `PGAPPNAME=${name}`,
    '--env', 'PGOPTIONS=-c statement_timeout=10000 -c lock_timeout=10000', container,
    'psql', '-X', '-qAt', '-U', 'postgres', '-d', database,
    '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose',
  ], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.stdin.on('error', (error) => { stderr += error.message; });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
  return {
    name, done,
    write: (sql) => child.stdin.write(`${sql}\n`),
    end(sql = 'rollback;') {
      if (!child.stdin.writableEnded && !child.stdin.destroyed) child.stdin.end(`${sql}\n`);
    },
    async ready() {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (stdout.includes('trip-test-ready')) return;
        if (child.exitCode !== null) throw new Error(stderr || 'Database test connection exited early.');
        await delay(50);
      }
      throw new Error('Database test connection did not acquire its trip lock.');
    },
  };
}

async function query(sql) {
  const client = connection();
  client.end(sql);
  const result = await client.done;
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

async function waitUntilBlocked(name) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await query(`select exists (
      select 1 from pg_stat_activity where application_name = ${literal(name)}
        and cardinality(pg_blocking_pids(pid)) > 0
    );`) === 't') return;
    await delay(50);
  }
  throw new Error('Expected a database transaction to wait on the trip lock.');
}

async function fixture() {
  const ownerLink = randomBytes(32).toString('hex');
  const ownerSession = randomBytes(32).toString('hex');
  const created = JSON.parse(await query(`select public.trip_create(${json(details)}, 'Test owner', ${literal(ownerLink)}, ${literal(ownerSession)});`));
  const editorLink = randomBytes(32).toString('hex');
  const editorSession = randomBytes(32).toString('hex');
  const memberId = randomUUID();
  const linkId = randomUUID();
  try {
    await query(`begin;
      insert into trip_private.members (id, trip_id, name, role)
        values (${literal(memberId)}, ${literal(created.tripId)}, 'Test editor', 'editor');
      insert into trip_private.access_links (id, trip_id, member_id, token_hash)
        values (${literal(linkId)}, ${literal(created.tripId)}, ${literal(memberId)}, ${literal(editorLink)});
      insert into trip_private.sessions (token_hash, link_id) values (${literal(editorSession)}, ${literal(linkId)});
      commit;`);
  } catch (error) {
    await query(`delete from trip_private.trips where id = ${literal(created.tripId)};`);
    throw error;
  }
  return { ...created, ownerSession, editorSession, linkId };
}

async function withConnections(run) {
  const data = await fixture();
  const holder = connection();
  const waiting = connection();
  try {
    await run(data, holder, waiting);
  } finally {
    // Terminating psql rolls back any unfinished transactions before cleanup.
    holder.end();
    waiting.end();
    await Promise.all([holder.done, waiting.done]);
    await query(`delete from trip_private.trips where id = ${literal(data.tripId)};`);
  }
}

test('native concurrent saves reject the stale writer after it acquires the trip lock', { timeout: 20_000 }, async () => {
  await withConnections(async (data, holder, waiting) => {
    holder.write(`begin;
      select public.trip_update_details(${literal(data.ownerSession)}, 0, ${json({ ...details, title: 'First save' })});
      select 'trip-test-ready';`);
    await holder.ready();
    waiting.write(`select public.trip_update_details(${literal(data.editorSession)}, 0, ${json({ ...details, title: 'Stale save' })});`);
    await waitUntilBlocked(waiting.name);
    holder.write('commit;');
    waiting.end('');
    const result = await waiting.done;
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /PT409/);
    const saved = JSON.parse(await query(`select public.trip_read(${literal(data.ownerSession)});`));
    assert.equal(saved.revision, 1);
    assert.equal(saved.trip.title, 'First save');
  });
});

test('native pending writes recheck revocation after waiting for the trip lock', { timeout: 20_000 }, async () => {
  await withConnections(async (data, holder, waiting) => {
    holder.write(`begin;
      select public.trip_read(${literal(data.ownerSession)});
      select 'trip-test-ready';`);
    await holder.ready();
    // Anticipate the revision after revocation. Authorization, not a revision
    // conflict, must prevent this pre-started request from saving.
    waiting.write(`select public.trip_update_details(${literal(data.editorSession)}, 1, ${json({ ...details, title: 'Must not persist' })});`);
    await waitUntilBlocked(waiting.name);
    holder.write(`select public.trip_revoke_link(${literal(data.ownerSession)}, ${literal(data.linkId)}); commit;`);
    waiting.end('');
    const result = await waiting.done;
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /PT401/);
    const saved = JSON.parse(await query(`select public.trip_read(${literal(data.ownerSession)});`));
    assert.equal(saved.revision, 1);
    assert.equal(saved.trip.title, details.title);
  });
});

test('native pending reads recheck session expiry after waiting for the trip lock', { timeout: 20_000 }, async () => {
  await withConnections(async (data, holder, waiting) => {
    holder.write(`begin;
      select public.trip_read(${literal(data.ownerSession)});
      select 'trip-test-ready';`);
    await holder.ready();
    waiting.write(`select public.trip_read(${literal(data.editorSession)});`);
    await waitUntilBlocked(waiting.name);
    holder.write(`update trip_private.sessions set expires_at = clock_timestamp() - interval '1 second'
      where token_hash = ${literal(data.editorSession)}; commit;`);
    waiting.end('');
    const result = await waiting.done;
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /PT401/);
  });
});

test('native full-state commits reauthorize after an earlier state read and pending revocation', { timeout: 20_000 }, async () => {
  await withConnections(async (data, holder, waiting) => {
    const state = JSON.parse(await query(`select public.trip_state(${literal(data.editorSession)});`));
    state.data.packing.push({ id: 'not-persisted', title: 'Must not persist', assignee: '', status: 'pending' });
    holder.write(`begin;
      select public.trip_read(${literal(data.ownerSession)});
      select 'trip-test-ready';`);
    await holder.ready();
    waiting.write(`select public.trip_commit(${literal(data.editorSession)}, 1, ${json(state.data)});`);
    await waitUntilBlocked(waiting.name);
    holder.write(`select public.trip_revoke_link(${literal(data.ownerSession)}, ${literal(data.linkId)}); commit;`);
    waiting.end('');
    const result = await waiting.done;
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /PT401/);
    const saved = JSON.parse(await query(`select public.trip_state(${literal(data.ownerSession)});`));
    assert.equal(saved.revision, 1);
    assert.deepEqual(saved.data.packing, []);
  });
});

test('native pending profile saves recheck revoked access before recording a rename', { timeout: 20_000 }, async () => {
  await withConnections(async (data, holder, waiting) => {
    holder.write(`begin; select public.trip_read(${literal(data.ownerSession)}); select 'trip-test-ready';`);
    await holder.ready();
    waiting.write(`select public.trip_profile(${literal(data.editorSession)}, 'Test editor', 'Must not persist');`);
    await waitUntilBlocked(waiting.name);
    holder.write(`select public.trip_revoke_link(${literal(data.ownerSession)}, ${literal(data.linkId)}); commit;`);
    waiting.end('');
    const result = await waiting.done;
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /PT401/);
    assert.equal(await query(`select count(*) from trip_private.history where trip_id = ${literal(data.tripId)};`), '0');
  });
});

test('native rename/content races reject stale attribution and stamp the committed member name', { timeout: 20_000 }, async () => {
  await withConnections(async (data, holder, waiting) => {
    const state = JSON.parse(await query(`select public.trip_state(${literal(data.editorSession)});`));
    const before = structuredClone(state.data);
    state.data.packing.push({ id: 'race-item', title: 'Adapter', assignee: '', status: 'pending' });
    const changes = changesBetween(before, state.data);
    holder.write(`begin;
      select public.trip_profile(${literal(data.editorSession)}, 'Test editor', 'Ana');
      select 'trip-test-ready';`);
    await holder.ready();
    waiting.write(`select public.trip_commit(${literal(data.editorSession)}, 0, ${json(state.data)}, ${json(changes)});`);
    await waitUntilBlocked(waiting.name);
    holder.write('commit;');
    waiting.end('');
    const result = await waiting.done;
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /PT409/);
    const saved = JSON.parse(await query(`select public.trip_state(${literal(data.editorSession)});`));
    assert.deepEqual(saved.data.packing, []);
    await query(`select public.trip_commit(${literal(data.editorSession)}, ${saved.revision}, ${json(state.data)}, ${json(changes)});`);
    const history = JSON.parse(await query(`select public.trip_history(${literal(data.editorSession)});`));
    assert.equal(history.items.length, 2);
    assert.equal(history.items[0].actorName, 'Ana');
    assert.equal(history.items[0].target.id, 'race-item');
    assert.equal(history.items[1].actorName, 'Test editor');
    assert.equal(history.items[0].actorId, history.items[1].actorId);
  });
});
