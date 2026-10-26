import { describe, expect, it } from 'vitest';
import { calendarWeeks, selectRangeDate, shiftDate, shiftMonth } from './date-range';

describe('trip date ranges', () => {
  it('selects a start, then an inclusive end, then starts a new range', () => {
    const start = selectRangeDate({ startDate: '', endDate: '' }, '2026-12-02');
    expect(start).toEqual({ startDate: '2026-12-02', endDate: '' });
    const range = selectRangeDate(start, '2026-12-15');
    expect(range).toEqual({ startDate: '2026-12-02', endDate: '2026-12-15' });
    expect(selectRangeDate(range, '2026-12-20')).toEqual({ startDate: '2026-12-20', endDate: '' });
  });

  it('orders reverse selections and allows single-day trips', () => {
    const start = { startDate: '2026-12-02', endDate: '' };
    expect(selectRangeDate(start, '2026-11-24')).toEqual({ startDate: '2026-11-24', endDate: '2026-12-02' });
    expect(selectRangeDate(start, '2026-12-02')).toEqual({ startDate: '2026-12-02', endDate: '2026-12-02' });
  });

  it('lays out whole weeks and leap days without adjacent-month dates', () => {
    const weeks = calendarWeeks('2028-02');
    expect(weeks[0]).toEqual([null, null, '2028-02-01', '2028-02-02', '2028-02-03', '2028-02-04', '2028-02-05']);
    expect(weeks.at(-1)).toEqual(['2028-02-27', '2028-02-28', '2028-02-29', null, null, null, null]);
    expect(calendarWeeks('2026-08')).toHaveLength(6);
    expect(calendarWeeks('2026-02').flat().filter(Boolean)).toHaveLength(28);
    expect(calendarWeeks('0096-02').flat().filter(Boolean)).toHaveLength(29);
  });

  it('moves between days across months, years and daylight-saving changes', () => {
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDate('2028-03-01', -1)).toBe('2028-02-29');
    expect(shiftDate('2026-03-29', 1)).toBe('2026-03-30');
    expect(shiftDate('0001-01-01', -1)).toBe('0001-01-01');
    expect(shiftDate('9999-12-31', 1)).toBe('9999-12-31');
  });

  it('clamps month and year navigation to the last available day', () => {
    expect(shiftMonth('2026-01-31', 1)).toBe('2026-02-28');
    expect(shiftMonth('2028-03-31', -1)).toBe('2028-02-29');
    expect(shiftMonth('2028-02-29', 12)).toBe('2029-02-28');
    expect(shiftMonth('2026-12-15', 1)).toBe('2027-01-15');
    expect(shiftMonth('0001-01-01', -1)).toBe('0001-01-01');
    expect(shiftMonth('9999-12-31', 1)).toBe('9999-12-31');
  });
});
