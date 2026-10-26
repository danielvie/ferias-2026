import { afterEach, describe, expect, it } from 'vitest';
import { Store } from '../server/store';
import { commandInput } from '../server/validation';
import { tripChecklists } from '../shared/checklists';
import type { TripCommand, TripData } from '../shared/model';

const stores: Store[] = [];
afterEach(() => { for (const store of stores.splice(0)) store.close(); });

function setup() {
  const store = new Store(':memory:');
  stores.push(store);
  const created = store.create({
    title: 'Checklist trip', ownerName: 'Owner', startDate: '2026-08-01', endDate: '2026-08-07',
    cities: ['Brussels', 'Ghent'],
  });
  const access = store.authenticate(created.sessionToken);
  const command = (value: TripCommand) => store.command(access, store.snapshot(access).revision, commandInput(value));
  return { store, access, created, command };
}

describe('named checklists', () => {
  it('adopts legacy packing without changing identity, ownership or completion', () => {
    const packing: TripData['packing'] = [{ id: 'old-item', title: 'Passport', assignee: 'Ana', status: 'done' }];
    expect(tripChecklists({ packing })).toEqual([{ id: 'packing', title: 'Packing', items: packing }]);
    expect(tripChecklists({ packing, checklists: [] })).toEqual([]);
  });

  it('creates independent lists, edits text/status/assignment and keeps legacy packing commands working', () => {
    const { command, created } = setup();
    const original = created.snapshot.data.packing;
    command({ type: 'checklist.add', id: 'documents', title: 'Documents' });
    command({ type: 'checklist.add', id: 'snacks', title: 'Snacks' });
    let next = command({ type: 'checklist.item.add', checklistId: 'documents', title: 'Print tickets' });
    const item = next.data.checklists![1].items[0];
    command({ type: 'checklist.item.rename', checklistId: 'documents', id: item.id, title: 'Download tickets' });
    next = command({ type: 'checklist.item.update', checklistId: 'documents', id: item.id, status: 'done', assignee: 'Ana' });
    expect(next.data.checklists![1].items).toEqual([{ ...item, title: 'Download tickets', status: 'done', assignee: 'Ana' }]);
    expect(next.data.checklists![2].items).toEqual([]);
    expect(next.data.packing).toEqual(original);
    next = command({ type: 'packing.update', id: original[0].id, status: 'done', assignee: 'Owner' });
    expect(next.data.checklists![0].items[0]).toEqual(next.data.packing[0]);
    next = command({ type: 'checklist.rename', id: 'packing', title: 'Bring along' });
    expect(next.data.checklists![0].title).toBe('Bring along');
    next = command({ type: 'checklist.item.delete', checklistId: 'documents', id: item.id });
    expect(next.data.checklists![1].items).toEqual([]);
  });

  it('reorders items without changing their data and records the list order under the trusted actor', () => {
    const { store, access, command, created } = setup();
    const original = created.snapshot.data.packing;
    const [passport, charger, jacket] = original;
    command({ type: 'checklist.add', id: 'documents', title: 'Documents' });
    const history = store.history(access, null).items;
    let next = command({ type: 'checklist.item.move', checklistId: 'packing', id: passport.id, beforeId: jacket.id });
    expect(next.data.packing.map(item => item.id)).toEqual([charger.id, passport.id, ...original.slice(2).map(item => item.id)]);
    next = command({ type: 'checklist.item.move', checklistId: 'packing', id: charger.id, beforeId: null });
    expect(next.data.packing.map(item => item.id)).toEqual([...original.filter(item => item.id !== charger.id).map(item => item.id), charger.id]);
    expect(store.snapshot(access).data.packing).toEqual(next.data.packing);
    expect(next.data.checklists![0].items).toEqual(next.data.packing);
    expect(new Map(next.data.packing.map(item => [item.id, item]))).toEqual(new Map(original.map(item => [item.id, item])));
    expect(next.data.checklists![1].items).toEqual([]);
    const records = store.history(access, null).items;
    expect(records).toHaveLength(history.length + 2);
    expect(records[0]).toMatchObject({
      action: 'changed', actorId: access.member.id, target: { type: 'checklist', id: 'packing', label: 'Packing' },
    });
  });

  it('rejects invalid or cross-section moves without changing the saved order', () => {
    const { store, access, command, created } = setup();
    const [passport, charger] = created.snapshot.data.packing;
    command({ type: 'packing.update', id: charger.id, status: 'done', assignee: 'Ana' });
    const original = store.snapshot(access);
    const history = store.history(access, null);
    for (const move of [
      { checklistId: 'packing', id: passport.id, beforeId: charger.id },
      { checklistId: 'packing', id: passport.id, beforeId: passport.id },
      { checklistId: 'packing', id: passport.id, beforeId: 'missing' },
      { checklistId: 'missing', id: passport.id, beforeId: null },
    ]) expect(() => command({ type: 'checklist.item.move', ...move })).toThrow();
    expect(store.snapshot(access)).toEqual(original);
    expect(store.history(access, null)).toEqual(history);
    expect(() => commandInput({ type: 'checklist.item.move', checklistId: 'packing', id: passport.id })).toThrow();
  });

  it('records list/item changes under the trusted actor and rejects stale writes', () => {
    const { store, access, command } = setup();
    const revision = store.snapshot(access).revision;
    command({ type: 'checklist.add', id: 'snacks', title: 'Snacks' });
    command({ type: 'checklist.item.add', checklistId: 'snacks', title: 'Fruit' });
    command({ type: 'checklist.delete', id: 'snacks' });
    const records = store.history(access, null).items;
    expect(records).toContainEqual(expect.objectContaining({
      actorId: access.member.id, action: 'deleted', target: { type: 'checklist', id: 'snacks', parentId: '', label: 'Snacks' },
    }));
    expect(records).toContainEqual(expect.objectContaining({
      action: 'deleted', target: expect.objectContaining({ type: 'checklist-item', parentId: 'snacks', label: 'Fruit' }),
    }));
    expect(() => store.command(access, revision, { type: 'checklist.add', id: 'stale', title: 'Stale' })).toThrow('trip changed');
    expect(store.snapshot(access).data.checklists).toHaveLength(1);
  });

  it('enforces permissions, family redaction, parent references, limits and validation', () => {
    const { store, access, command } = setup();
    command({ type: 'checklist.add', id: 'snacks', title: 'Snacks' });
    for (const role of ['viewer', 'family'] as const) {
      const invited = store.invite(access, { name: role, role, eventIds: [], placeIds: [] });
      const guest = store.authenticate(store.join(invited.token).sessionToken);
      expect(() => store.command(guest, store.snapshot(guest).revision, {
        type: 'checklist.delete', id: 'snacks',
      })).toThrow('does not allow');
      const visible = store.snapshot(guest);
      expect(visible.data.checklists).toHaveLength(role === 'family' ? 0 : 2);
    }
    expect(() => command({ type: 'checklist.add', id: 'snacks', title: 'Duplicate' })).toThrow('ID already exists');
    expect(() => command({ type: 'checklist.item.add', checklistId: 'missing', title: 'Fruit' })).toThrow('does not exist');
    expect(() => commandInput({ type: 'checklist.rename', id: 'snacks', title: ' ' })).toThrow('empty or too long');
    expect(() => commandInput({ type: 'checklist.item.update', checklistId: 'snacks', id: 'item', status: 'skipped', assignee: '' })).toThrow('check status');
    for (let i = 2; i < 100; i++) command({ type: 'checklist.add', id: `list-${i}`, title: `List ${i}` });
    expect(() => command({ type: 'checklist.add', id: 'over-limit', title: 'Too many' })).toThrow('at most 100');
  });
});
