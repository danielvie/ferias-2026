import { describe, expect, it, vi } from 'vitest';
import { quickStartEvents, quickStartTrip } from './quick-start';

describe('quick start', () => {
  it('starts today in Brussels rather than the UTC date', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2030-05-31T22:30:00Z'));
      expect(quickStartTrip()).toMatchObject({ startDate: '2030-06-01', endDate: '2030-06-07' });
    } finally { vi.useRealTimers(); }
  });

  it('fills a seven-day trip with explicit sample details across month and year boundaries', () => {
    const sample = quickStartTrip('2026-12-28');
    expect(sample).toMatchObject({
      title: 'Sample Belgium trip', ownerName: 'Demo traveler',
      startDate: '2026-12-28', endDate: '2027-01-03',
    });
    expect(sample.cities).toEqual(['Brussels', 'Ghent', 'Bruges']);
  });

  it('creates tentative sample activities for the saved city IDs and trip dates', () => {
    const events = quickStartEvents({
      id: 'trip', title: 'Sample Belgium trip', startDate: '2026-12-28', endDate: '2027-01-03',
      timezone: 'Europe/Brussels', cities: ['Brussels', 'Ghent', 'Bruges'].map((name, i) => ({ id: `city-${i}`, name })),
    });
    expect(events.map(event => [event.cityId, event.date, event.status])).toEqual([
      ['city-0', '2026-12-28', 'tentative'],
      ['city-1', '2026-12-30', 'tentative'],
      ['city-2', '2027-01-01', 'tentative'],
    ]);
    expect(new Set(events.map(event => event.id)).size).toBe(3);
  });
});
