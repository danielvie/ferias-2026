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

  describe('event time pairs', () => {
    const event = {
      id: 'walk', title: 'City walk', cityId: 'ghent', date: '2026-07-02',
      startTime: '10:00', endTime: '11:00', kind: 'activity', status: 'planned', placeId: '', description: '',
    };
    const parse = (overrides: Record<string, unknown>) => commandInput({ type: 'event.save', event: { ...event, ...overrides } });

    it.each(['planned', 'tentative'])('accepts an empty activity pair without changing date or %s status', (status) => {
      const overrides = { startTime: '', endTime: '', status };
      expect(parse(overrides)).toEqual({ type: 'event.save', event: { ...event, ...overrides } });
    });

    it.each(['activity', 'transport', 'stay'])('keeps normal timed %s events', (kind) => {
      expect(parse({ kind })).toEqual({ type: 'event.save', event: { ...event, kind } });
    });

    it('accepts an empty pair for tentative transport only', () => {
      const overrides = { kind: 'transport', status: 'tentative', startTime: '', endTime: '' };
      expect(parse(overrides)).toEqual({ type: 'event.save', event: { ...event, ...overrides } });
      expect(() => parse({ ...overrides, startTime: '10:00' })).toThrow();
      expect(() => parse({ ...overrides, status: 'planned' })).toThrow();
      expect(() => parse({ ...overrides, kind: 'stay' })).toThrow();
    });

    it.each(['activity', 'transport', 'stay'])('requires complete, valid and ordered time pairs for %s', (kind) => {
      for (const [startTime, endTime] of [
        ['', '11:00'], ['10:00', ''], [undefined, undefined], [null, null], [' ', ' '],
        ['9:00', '11:00'], ['10:00', '24:00'], ['10:60', '11:00'],
        ['10:00', '10:00'], ['11:00', '10:00'], ['23:00', '01:00'],
      ]) {
        expect(() => parse({ kind, startTime, endTime })).toThrow();
      }
    });

    it('still requires a valid date and existing status for untimed activities', () => {
      for (const overrides of [{ date: '' }, { date: '2026-02-29' }, { status: 'idea' }]) {
        expect(() => parse({ startTime: '', endTime: '', ...overrides })).toThrow();
      }
    });
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
