import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { checklistStrategies } from '../shared/checklists';
import type { CreateTripInput, HistoryPage, HistoryRecord, InviteInfo, InviteInput, Member, TripCommand, TripData } from '../shared/model';
import { addActivity, applyCommand } from './commands';
import { changesBetween, memberChange, type Change } from './history';
import { type Access, requirePermission, snapshot } from './permissions';
import { check, HttpError } from './validation';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

interface MemberRow {
  id: string; trip_id: string; name: string; role: Member['role'];
  event_ids: string; place_ids: string; created_at: string;
}

export class Store {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true, mode: 0o700 });
    // Uses the v24 baseline API only, not newer StatementSync.close()/tag-store methods.
    // https://nodejs.org/docs/latest-v24.x/api/sqlite.html#class-databasesync
    this.db = new DatabaseSync(dbPath, { timeout: 5000, enableForeignKeyConstraints: true });
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS trips (
        id TEXT PRIMARY KEY, revision INTEGER NOT NULL, data TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','editor','viewer','family')),
        token_hash TEXT NOT NULL UNIQUE, event_ids TEXT NOT NULL, place_ids TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS members_trip ON members(trip_id);
      CREATE INDEX IF NOT EXISTS sessions_member ON sessions(member_id);
      CREATE TABLE IF NOT EXISTS history (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
        trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        note_id TEXT NOT NULL, private_to TEXT NOT NULL, payload TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS history_trip ON history(trip_id, sequence DESC);
    `);
  }

  close() { this.db.close(); }

  private transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private access(row: MemberRow): Access {
    return {
      member: { id: row.id, name: row.name, role: row.role }, tripId: row.trip_id,
      eventIds: JSON.parse(row.event_ids), placeIds: JSON.parse(row.place_ids),
    };
  }

  authenticate(sessionToken: string | undefined): Access {
    if (!sessionToken) throw new HttpError(401, 'Open your invitation or recovery link to continue.');
    const row = this.db.prepare(`
      SELECT members.* FROM sessions JOIN members ON members.id = sessions.member_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `).get(hash(sessionToken), Date.now()) as unknown as MemberRow | undefined;
    if (!row) throw new HttpError(401, 'This session has expired or its invitation was revoked.');
    return this.access(row);
  }

  private session(memberId: string, oldSession?: string): string {
    if (oldSession) this.logout(oldSession);
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    const secret = token();
    this.db.prepare('INSERT INTO sessions (token_hash, member_id, expires_at) VALUES (?, ?, ?)').run(hash(secret), memberId, Date.now() + SESSION_MS);
    return secret;
  }

  logout(secret: string | undefined) {
    if (secret) this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(secret));
  }

  private load(tripId: string): { revision: number; data: TripData } {
    const row = this.db.prepare('SELECT revision, data FROM trips WHERE id = ?').get(tripId) as { revision: number; data: string } | undefined;
    if (!row) throw new HttpError(404, 'Trip not found.');
    return { revision: row.revision, data: JSON.parse(row.data) };
  }

  private write(tripId: string, revision: number, data: TripData) {
    this.db.prepare('UPDATE trips SET revision = ?, data = ? WHERE id = ?').run(revision, JSON.stringify(data), tripId);
  }

  private record(access: Access, changes: Change[], data?: TripData) {
    const operationId = randomUUID();
    for (const note of data?.notes ?? []) {
      if (note.visibility === 'private') {
        this.db.prepare('UPDATE history SET private_to = ? WHERE trip_id = ? AND note_id = ?')
          .run(note.authorId, access.tripId, note.id);
      }
    }
    for (const change of changes) {
      const record: HistoryRecord = {
        id: randomUUID(), operationId, actorId: access.member.id, actorName: access.member.name,
        action: change.action, target: change.target, at: new Date().toISOString(),
      };
      this.db.prepare('INSERT INTO history (id, trip_id, note_id, private_to, payload) VALUES (?, ?, ?, ?, ?)')
        .run(record.id, access.tripId, change.noteId, change.privateTo, JSON.stringify(record));
    }
  }

  history(access: Access, before: string | null): HistoryPage {
    if (access.member.role === 'family') throw new HttpError(403, 'Family links cannot read trip history.');
    let sequence = Number.MAX_SAFE_INTEGER;
    if (before) {
      const cursor = this.db.prepare("SELECT sequence FROM history WHERE trip_id = ? AND id = ? AND (private_to = '' OR private_to = ?)")
        .get(access.tripId, before, access.member.id) as { sequence: number } | undefined;
      check(cursor, 'This history page is no longer available. Reload history.');
      sequence = cursor.sequence;
    }
    const rows = this.db.prepare(`SELECT payload FROM history WHERE trip_id = ? AND sequence < ?
      AND (private_to = '' OR private_to = ?) ORDER BY sequence DESC LIMIT 51`)
      .all(access.tripId, sequence, access.member.id) as { payload: string }[];
    const items = rows.slice(0, 50).map((row) => JSON.parse(row.payload) as HistoryRecord);
    return { items, before: rows.length > 50 ? items[items.length - 1].id : null };
  }

  rename(access: Access, previousName: string, name: string) {
    return this.transaction(() => {
      const member = this.db.prepare('SELECT name FROM members WHERE id = ? AND trip_id = ?')
        .get(access.member.id, access.tripId) as { name: string };
      if (member.name !== previousName) throw new HttpError(409, 'Your name changed. Reload before saving.');
      if (member.name !== name) {
        this.db.prepare('UPDATE members SET name = ? WHERE id = ?').run(name, access.member.id);
        const { revision, data } = this.load(access.tripId);
        this.record(access, [memberChange('renamed', 'member', access.member.id, name)]);
        this.write(access.tripId, revision + 1, data);
      }
      return this.snapshot({ ...access, member: { ...access.member, name } });
    });
  }

  snapshot(access: Access) {
    const { revision, data } = this.load(access.tripId);
    const members = this.db.prepare('SELECT id, name, role FROM members WHERE trip_id = ? ORDER BY created_at, id').all(access.tripId) as unknown as Member[];
    return snapshot(revision, data, access, members);
  }

  private insertMember(tripId: string, input: { name: string; role: Member['role']; eventIds: string[]; placeIds: string[] }) {
    const secret = token(), id = randomUUID(), createdAt = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO members (id, trip_id, name, role, token_hash, event_ids, place_ids, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, tripId, input.name, input.role, hash(secret), JSON.stringify(input.eventIds), JSON.stringify(input.placeIds), createdAt);
    return { id, token: secret };
  }

  create(input: CreateTripInput, oldSession?: string) {
    return this.transaction(() => {
      const tripId = randomUUID();
      const data: TripData = {
        trip: { id: tripId, title: input.title, startDate: input.startDate, endDate: input.endDate,
          timezone: 'Europe/Brussels', cities: input.cities.map((name) => ({ id: randomUUID(), name })) },
        places: [], events: [], notes: [], transfers: [], activity: [], packing: checklistStrategies.packing.create(randomUUID),
      };
      addActivity(data, `${input.ownerName} created the trip.`);
      this.db.prepare('INSERT INTO trips (id, revision, data) VALUES (?, ?, ?)').run(tripId, 0, JSON.stringify(data));
      const owner = this.insertMember(tripId, { name: input.ownerName, role: 'owner', eventIds: [], placeIds: [] });
      const sessionToken = this.session(owner.id, oldSession);
      const access = this.authenticate(sessionToken);
      this.record(access, [{
        action: 'added', target: { type: 'trip', id: tripId, parentId: '', label: input.title }, noteId: '', privateTo: '',
      }]);
      return { snapshot: this.snapshot(access), ownerToken: owner.token, sessionToken };
    });
  }

  join(secret: string, oldSession?: string) {
    return this.transaction(() => {
      const row = this.db.prepare('SELECT * FROM members WHERE token_hash = ?').get(hash(secret)) as unknown as MemberRow | undefined;
      if (!row) throw new HttpError(401, 'This invitation is invalid or has been revoked.');
      const sessionToken = this.session(row.id, oldSession);
      return { snapshot: this.snapshot(this.access(row)), sessionToken };
    });
  }

  command(access: Access, revision: number, command: TripCommand) {
    requirePermission(access.member, 'mutate');
    return this.transaction(() => {
      const current = this.load(access.tripId);
      if (current.revision !== revision) throw new HttpError(409, 'The trip changed. Reload it before trying again.');
      const before = structuredClone(current.data);
      applyCommand(current.data, access.member, command);
      this.record(access, changesBetween(before, current.data), current.data);
      this.write(access.tripId, revision + 1, current.data);
      return this.snapshot(access);
    });
  }

  invites(access: Access): InviteInfo[] {
    requirePermission(access.member, 'manageInvites');
    const rows = this.db.prepare("SELECT * FROM members WHERE trip_id = ? AND role != 'owner' ORDER BY created_at, id").all(access.tripId) as unknown as MemberRow[];
    return rows.map((row) => ({
      id: row.id, name: row.name, role: row.role as InviteInfo['role'], eventIds: JSON.parse(row.event_ids),
      placeIds: JSON.parse(row.place_ids), createdAt: row.created_at,
    }));
  }

  invite(access: Access, input: InviteInput) {
    requirePermission(access.member, 'manageInvites');
    return this.transaction(() => {
      const { data, revision } = this.load(access.tripId);
      check(input.eventIds.every((id) => data.events.some((event) => event.id === id)), 'An invited event no longer exists.');
      check(input.placeIds.every((id) => data.places.some((place) => place.id === id)), 'An invited place no longer exists.');
      const invite = this.insertMember(access.tripId, input);
      this.record(access, [memberChange('added', 'link', invite.id, input.name)]);
      addActivity(data, `${access.member.name} created a ${input.role} link for ${input.name}.`);
      this.write(access.tripId, revision + 1, data);
      return invite;
    });
  }

  revoke(access: Access, id: string) {
    requirePermission(access.member, 'manageInvites');
    return this.transaction(() => {
      const member = this.db.prepare("SELECT name FROM members WHERE id = ? AND trip_id = ? AND role != 'owner'")
        .get(id, access.tripId) as { name: string } | undefined;
      const result = this.db.prepare("DELETE FROM members WHERE id = ? AND trip_id = ? AND role != 'owner'").run(id, access.tripId);
      if (!result.changes) throw new HttpError(404, 'Invitation not found.');
      const { data, revision } = this.load(access.tripId);
      this.record(access, [memberChange('revoked', 'link', id, member!.name)]);
      addActivity(data, `${access.member.name} revoked an invitation.`);
      this.write(access.tripId, revision + 1, data);
      // Foreign key cascade removes every session created from the invitation.
      return { ok: true as const };
    });
  }
}
