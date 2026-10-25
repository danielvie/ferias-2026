import { describe, expect, it } from 'vitest';
import { checklistStrategies } from './checklists';

describe('checklist strategies', () => {
  let sequence = 0;
  const id = () => String(++sequence);
  it('creates fresh pending departure items without changing previous legs', () => {
    const first = checklistStrategies.departure.create(id);
    first[0].status = 'done';
    const second = checklistStrategies.departure.create(id);
    expect(second.every((item) => item.status === 'pending')).toBe(true);
    expect(second[0].id).not.toBe(first[0].id);
    expect(first[0].status).toBe('done');
  });
  it('requires all departure checks resolved and does not treat an empty list as ready', () => {
    const list = checklistStrategies.departure.create(id);
    expect(checklistStrategies.departure.isReady(list)).toBe(false);
    list.forEach((item) => { item.status = 'done'; });
    list[0].status = 'skipped';
    expect(checklistStrategies.departure.isReady(list)).toBe(true);
    expect(checklistStrategies.departure.isReady([])).toBe(false);
  });
  it('keeps packing stricter than departure resolution', () => {
    const list = checklistStrategies.packing.create(id);
    list.forEach((item) => { item.status = 'done'; });
    expect(checklistStrategies.packing.isReady(list)).toBe(true);
    list[0].status = 'skipped';
    expect(checklistStrategies.packing.isReady(list)).toBe(false);
  });
});
