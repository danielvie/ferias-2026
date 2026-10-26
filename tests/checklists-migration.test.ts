import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { Store } from '../server/store';
import type { TripData } from '../shared/model';

const packing = [{ id: 'existing-passport', title: 'Passport', assignee: 'Ana', status: 'done' }];

describe('checklist adoption from existing storage', () => {
  it('upgrades SQLite on load and persists one canonical collection across restart', () => {
    const directory = mkdtempSync(join(tmpdir(), 'checklist-upgrade-'));
    const path = join(directory, 'test.sqlite');
    let store = new Store(path);
    try {
      const created = store.create({
        title: 'Existing trip', ownerName: 'Owner', startDate: '2026-08-01', endDate: '2026-08-07', cities: ['Brussels'],
      });
      store.close();
      const db = new DatabaseSync(path);
      const legacy = { ...created.snapshot.data, packing };
      delete legacy.checklists;
      db.prepare('update trips set data = ?').run(JSON.stringify(legacy));
      db.close();
      store = new Store(path);
      const session = created.sessionToken;
      let access = store.authenticate(session);
      expect(store.snapshot(access).data.checklists![0].items).toEqual(packing);
      store.command(access, 0, { type: 'checklist.add', id: 'documents', title: 'Documents' });
      store.close();
      store = new Store(path);
      access = store.authenticate(session);
      const next = store.snapshot(access);
      expect(next.data.checklists).toHaveLength(2);
      expect(next.data.packing).toEqual(packing);
      const raw = new DatabaseSync(path);
      const persisted = JSON.parse((raw.prepare('select data from trips').get() as { data: string }).data);
      raw.close();
      expect(persisted).not.toHaveProperty('packing');
      expect(persisted.checklists[0].items).toEqual(packing);
      store.command(access, next.revision, { type: 'checklist.delete', id: 'packing' });
      expect(store.snapshot(access).data.checklists!.map(list => list.id)).toEqual(['documents']);
      expect(store.snapshot(access).data.packing).toEqual([]);
    } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
  });

  it('upgrades PostgreSQL without altering item IDs, revision, members or history and rejects old writers', async () => {
    const db = new PGlite();
    try {
      await db.exec('create role anon; create role authenticated; create role service_role;');
      const migrations = readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort();
      for (const name of migrations.slice(0, -1)) await db.exec(readFileSync(`supabase/migrations/${name}`, 'utf8'));
      await db.exec('update trip_private.settings set creation_enabled = true;');
      const details = { title: 'Existing trip', startDate: '2026-08-01', endDate: '2026-08-07', cities: [{ id: 'brussels', name: 'Brussels' }] };
      const args = [details, 'Owner', 'a'.repeat(64), 'b'.repeat(64), packing];
      const before = (await db.query<{ state: { revision: number; data: TripData; members: unknown[] } }>(
        'select public.trip_create_online($1, $2, $3, $4, $5) as state', args)).rows[0].state;
      const read = async () => (await db.query<{ state: typeof before }>(
        'select public.trip_state($1) as state', [args[3]])).rows[0].state;
      await db.exec(readFileSync(`supabase/migrations/${migrations.at(-1)}`, 'utf8'));
      const after = await read();
      expect(after.revision).toBe(before.revision);
      expect(after.members).toEqual(before.members);
      expect(after.data.packing).toEqual(packing);
      expect(after.data.checklists).toEqual([{ id: 'packing', title: 'Packing', items: packing }]);
      await expect(db.query('select public.trip_commit($1, $2, $3, $4)',
        [args[3], before.revision, before.data, []])).rejects.toMatchObject({ code: 'PT422' });
      await expect(db.query('select public.trip_commit($1, $2, $3, $4)',
        [args[3], after.revision, after.data, []])).rejects.toMatchObject({ code: 'PT422' });
      expect(await read()).toEqual(after);
      const data = { ...after.data, checklists: [] };
      await db.query('select public.trip_commit($1, $2, $3, $4, 1)', [args[3], after.revision, data, []]);
      expect((await read()).data.checklists).toEqual([]);
      expect((await read()).data.packing).toEqual([]);
      expect((await db.query<{ count: number }>('select count(*)::int as count from trip_private.history')).rows[0].count).toBe(1);
    } finally { await db.close(); }
  }, 30_000);
});
