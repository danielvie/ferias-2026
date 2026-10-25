import { describe, expect, it } from 'vitest';
import { commandInput, createTripInput } from '../server/validation';
import { permissionStrategies } from '../server/permissions';

describe('server input boundary', () => {
  it('whitelists fields and rejects empty item titles', () => {
    expect(commandInput({ type: 'packing.add', title: 'Coat', assignee: '', authorId: 'forged', status: 'done' }))
      .toEqual({ type: 'packing.add', title: 'Coat', assignee: '' });
    expect(() => commandInput({ type: 'packing.add', title: '  ', assignee: '' })).toThrow();
    expect(() => commandInput({ type: 'transfer.item.add', transferId: 'x', title: '', assignee: '' })).toThrow();
  });

  it('validates dates rather than accepting JavaScript date rollover', () => {
    const input = { title: 'Trip', ownerName: 'A', startDate: '2026-02-29', endDate: '2026-03-02', cities: ['Ghent'] };
    expect(() => createTripInput(input)).toThrow('Invalid calendar date');
    expect(() => createTripInput({ ...input, startDate: '2026-03-03' })).toThrow('end date');
    expect(createTripInput({ ...input, startDate: '2028-02-29', endDate: '2028-03-02' }).startDate).toBe('2028-02-29');
  });

  it('rejects unknown commands and malformed objects', () => {
    for (const command of [null, [], {}, { type: 'nope' }, { type: 'note.save', note: {} }]) {
      expect(() => commandInput(command)).toThrow();
    }
  });

  it('keeps viewer/family read-only and access management owner-only', () => {
    expect(permissionStrategies.owner.manageInvites).toBe(true);
    expect(permissionStrategies.editor).toMatchObject({ mutate: true, manageInvites: false });
    expect(permissionStrategies.viewer.mutate).toBe(false);
    expect(permissionStrategies.family.mutate).toBe(false);
  });
});
