import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { changesBetween } from '../server/history.ts';

// Two disposable local databases prove restoration without exporting user trips.
const container = 'supabase_db_ferias-2026';
const suffix = randomUUID().replaceAll('-', '');
const source = `trip_backup_${suffix}`, target = `trip_restore_${suffix}`;
const databases = [];
const sql = (database, input) => execFileSync('docker', [
  'exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1',
], { input, encoding: 'utf8' }).trim();
const literal = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
try {
  for (const name of [source, target]) {
    sql('postgres', `create database "${name}";`);
    databases.push(name);
    for (const migration of readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort()) {
      sql(name, readFileSync(`supabase/migrations/${migration}`, 'utf8'));
    }
  }
  const link = randomBytes(32).toString('hex'), session = randomBytes(32).toString('hex');
  const details = { title: 'Synthetic backup fixture', startDate: '2026-12-02', endDate: '2026-12-15', cities: [{ id: 'brussels', name: 'Brussels' }] };
  const created = JSON.parse(sql(source, `select public.trip_create(${literal(details)}, 'Backup owner', '${link}', '${session}');`));
  const original = JSON.parse(sql(source, `select public.trip_state('${session}');`));
  const before = structuredClone(original.data);
  original.data.notes.push({
    id: 'private-backup-note', title: 'Private backup fixture', body: 'Synthetic data only',
    authorId: created.memberId, authorName: 'Backup owner', visibility: 'private',
    linkType: 'trip', linkId: created.tripId, updatedAt: new Date().toISOString(), comments: [],
  });
  sql(source, `select public.trip_commit('${session}', 0, ${literal(original.data)}, ${literal(changesBetween(before, original.data))}, 1);`);
  const dump = execFileSync('docker', [
    'exec', container, 'pg_dump', '-U', 'postgres', '-d', source, '--data-only', '--schema=trip_private',
    '--exclude-table-data=trip_private.sessions', '--exclude-table-data=trip_private.request_limits', '--exclude-table-data=trip_private.settings',
  ]);
  sql(target, dump);
  assert.equal(sql(target, 'select count(*) from trip_private.sessions;'), '0');
  assert.equal(sql(target, 'select creation_enabled from trip_private.settings;'), 'f');
  const restoredSession = randomBytes(32).toString('hex');
  sql(target, `select public.trip_open('${link}', '${restoredSession}');`);
  const restored = JSON.parse(sql(target, `select public.trip_state('${restoredSession}');`));
  assert.equal(restored.access.member.id, created.memberId);
  assert.equal(restored.data.notes[0].authorId, created.memberId);
  assert.equal(restored.data.notes[0].body, 'Synthetic data only');
  const history = JSON.parse(sql(target, `select public.trip_history('${restoredSession}');`));
  assert.equal(history.items[0].actorId, created.memberId);
  assert.equal(history.items[0].target.id, 'private-backup-note');
  console.log('Local backup/restore passed: trip, private note and durable attribution restored; sessions omitted and creation remains disabled.');
} finally {
  for (const name of databases.reverse()) sql('postgres', `drop database "${name}";`);
}
