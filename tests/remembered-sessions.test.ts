import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, vi } from 'vitest';
import { Store } from '../server/store';

test('SQLite upgrades only valid legacy access and keeps it valid after long inactivity', () => {
  const directory = mkdtempSync(join(tmpdir(), 'remembered-sessions-'));
  const path = join(directory, 'trips.sqlite');
  let store = new Store(path);
  try {
    const created = store.create({ title: 'Legacy trip', ownerName: 'Daniel', startDate: '2030-06-01',
      endDate: '2030-06-05', cities: ['Brussels'] });
    const expired = store.join(created.ownerToken);
    store.close();
    const db = new DatabaseSync(path);
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    db.prepare('update sessions set expires_at = ? where token_hash = ?')
      .run(Date.now() + 3600000, hash(created.sessionToken));
    db.prepare('update sessions set expires_at = ? where token_hash = ?')
      .run(Date.now() - 3600000, hash(expired.sessionToken));
    db.close();
    store = new Store(path);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 100 * 365 * 86400000);
    try {
      expect(store.authenticate(created.sessionToken).member.id).toBe(created.snapshot.session.id);
      expect(() => store.authenticate(expired.sessionToken)).toThrow('expired');
      store.logout(created.sessionToken);
      expect(() => store.authenticate(created.sessionToken)).toThrow();
    } finally { clock.mockRestore(); }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
