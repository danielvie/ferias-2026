import { afterEach, describe, expect, test } from 'vitest';
import { Store } from '../server/store';
import type { Access } from '../server/permissions';

const stores: Store[] = [];
afterEach(() => { for (const store of stores.splice(0)) store.close(); });
function fixture() {
  const store = new Store(':memory:');
  stores.push(store);
  const created = store.create({ title: 'Test trip', ownerName: 'Daniel', startDate: '2026-12-02', endDate: '2026-12-15', cities: ['Brussels', 'Ghent'] });
  const owner = store.authenticate(created.sessionToken);
  const guest = (role: 'editor' | 'viewer' | 'family') => {
    const link = store.invite(owner, { name: role, role, eventIds: [], placeIds: [] });
    return { link, access: store.authenticate(store.join(link.token).sessionToken) };
  };
  const command = (access: Access, command: Parameters<Store['command']>[2]) =>
    store.command(access, store.snapshot(access).revision, command);
  return { store, owner, guest, command, created };
}

describe('durable attribution', () => {
  test('preserves IDs and historical names across renames and revocation', () => {
    const { store, owner, guest, command } = fixture();
    const editor = guest('editor');
    command(editor.access, { type: 'packing.add', title: 'Adapter', assignee: '' });
    const next = store.rename(editor.access, 'editor', 'Ana');
    expect(next.session).toEqual({ ...editor.access.member, name: 'Ana' });
    const renamed = { ...editor.access, member: next.session };
    command(renamed, { type: 'packing.update', id: next.data.packing.at(-1)!.id, status: 'done', assignee: '' });
    store.revoke(owner, editor.link.id);
    const records = store.history(owner, null).items.filter((record) => record.actorId === editor.access.member.id);
    expect(records.map((record) => record.actorName)).toEqual(['Ana', 'editor', 'editor']);
    expect(records[0]).toMatchObject({ action: 'changed', target: { type: 'packing', label: 'Adapter' } });
  });

  test('keeps more than 50 records, pages without counters, and does not log failed writes', () => {
    const { store, owner, command } = fixture();
    for (let i = 0; i < 55; i++) command(owner, { type: 'packing.add', title: `Item ${i}`, assignee: '' });
    const first = store.history(owner, null);
    expect(first.items).toHaveLength(50);
    expect(first.before).toBe(first.items[49].id);
    const older = store.history(owner, first.before);
    expect(older.items).toHaveLength(6);
    expect(older.before).toBeNull();
    expect(() => store.command(owner, 0, { type: 'packing.add', title: 'Stale', assignee: '' })).toThrow('changed');
    expect(store.history(owner, null)).toEqual(first);
    expect(store.snapshot(owner).data.activity).toHaveLength(50);
    expect(JSON.stringify(first)).not.toContain('sequence');
  });

  test('distinguishes identical display names editing the same item', () => {
    const { store, owner, guest, command } = fixture();
    const access = guest('editor').access;
    const renamed = store.rename(access, 'editor', 'Daniel');
    const editor = { ...access, member: renamed.session };
    const next = command(owner, { type: 'packing.add', title: 'Adapter', assignee: '' });
    const itemId = next.data.packing.at(-1)!.id;
    command(editor, { type: 'packing.update', id: itemId, status: 'done', assignee: '' });
    const records = store.history(owner, null).items.filter((record) => record.target.id === itemId);
    expect(records.map((record) => record.actorName)).toEqual(['Daniel', 'Daniel']);
    expect(records.map((record) => record.actorId)).toEqual([editor.member.id, owner.member.id]);
    expect(records.map((record) => record.action)).toEqual(['changed', 'added']);
  });

  test('records automatic place changes and nested departure items with the same actor', () => {
    const { store, owner, command } = fixture();
    const [from, to] = store.snapshot(owner).data.trip.cities;
    command(owner, { type: 'place.save', place: {
      id: 'museum', title: 'Museum', cityId: from.id, category: 'museum', status: 'idea',
      description: '', address: '', url: '', durationMinutes: 60, cost: '',
    } });
    command(owner, { type: 'event.save', event: {
      id: 'visit', title: 'Museum visit', cityId: from.id, date: '2026-12-03', startTime: '10:00', endTime: '11:00',
      kind: 'activity', status: 'planned', placeId: 'museum', description: '',
    } });
    expect(store.history(owner, null).items.slice(0, 2).map((record) => [record.target.type, record.action]))
      .toEqual([['event', 'added'], ['place', 'changed']]);
    expect(new Set(store.history(owner, null).items.slice(0, 2).map((record) => record.operationId)).size).toBe(1);
    const next = command(owner, { type: 'transfer.add', fromCityId: from.id, toCityId: to.id, date: '2026-12-04', time: '09:00' });
    const departure = next.data.transfers[0];
    const records = store.history(owner, null).items.filter((record) => record.target.parentId === departure.id);
    expect(records).toHaveLength(departure.items.length);
    expect(records.every((record) => record.actorId === owner.member.id && record.target.label.includes('Brussels to Ghent'))).toBe(true);
    const beforeNoop = store.history(owner, null);
    command(owner, { type: 'packing.update', ...next.data.packing[0] });
    expect(store.history(owner, null)).toEqual(beforeNoop);
  });

  test('restricts prior shared-note/comment history when private and after deletion', () => {
    const { store, owner, guest, command } = fixture();
    const editor = guest('editor').access;
    let state = command(editor, { type: 'note.save', note: { id: '', title: 'SECRET TITLE', body: 'SECRET BODY', visibility: 'trip', linkType: 'trip', linkId: '' } });
    const note = state.data.notes[0];
    command(owner, { type: 'note.comment', id: note.id, body: 'SECRET COMMENT' });
    expect(store.history(owner, null).items.some((record) => record.target.type === 'comment')).toBe(true);
    state = command(editor, { type: 'note.save', note: { ...note, visibility: 'private' } });
    expect(store.history(owner, null).items.every((record) => !['note', 'comment'].includes(record.target.type))).toBe(true);
    command(editor, { type: 'note.delete', id: note.id });
    const own = store.history(editor, null).items;
    expect(own.filter((record) => ['note', 'comment'].includes(record.target.type))).toHaveLength(5);
    expect(JSON.stringify(own)).not.toContain('SECRET');
    expect(JSON.stringify(store.history(owner, null))).not.toContain(note.id);
    expect(JSON.stringify(state.data.activity)).not.toContain('note');
  });

  test('allows read-only identities to rename themselves without gaining permissions', () => {
    const { store, guest, command } = fixture();
    for (const role of ['viewer', 'family'] as const) {
      const access = guest(role).access;
      const next = store.rename(access, role, `New ${role}`);
      expect(next.session).toEqual({ ...access.member, name: `New ${role}` });
      expect(() => command(access, { type: 'packing.add', title: 'Denied', assignee: '' })).toThrow('does not allow');
      expect(() => store.rename(access, role, 'Stale')).toThrow('changed');
      if (role === 'family') {
        expect(next.revision).toBe(0);
        expect(next.data.activity).toEqual([]);
        expect(() => store.history(access, null)).toThrow('cannot read');
      }
    }
  });
});
