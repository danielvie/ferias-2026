import { describe, expect, it, vi } from 'vitest';
import { brusselsTime, brusselsToday, displayDate } from './dates';

describe('trip date formatting', () => {
  it('displays a trip date without shifting it to the browser timezone', () => {
    expect(displayDate('2026-06-01')).toBe('1 Jun');
    expect(displayDate('2026-06-01', { day: 'numeric', month: 'short', year: 'numeric' })).toBe('1 Jun 2026');
  });
  it('uses the current date in Brussels even near UTC midnight', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-06-01T23:30:00Z'));
      expect(brusselsToday()).toBe('2026-06-02');
      expect(brusselsTime()).toBe('01:30');
      vi.setSystemTime(new Date('2026-01-01T22:30:00Z'));
      expect(brusselsToday()).toBe('2026-01-01');
      expect(brusselsTime()).toBe('23:30');
    } finally { vi.useRealTimers(); }
  });
});
