import { describe, expect, it } from 'vitest';
import type { TripEvent } from '../../../shared/model';
import { formatTripDate, overlappingEvents, shiftTripDate, sortEvents, validateEventTime } from './itinerary';

const event: TripEvent = {
  id: 'one', title: 'Walk', date: '2026-07-01', cityId: 'brussels',
  startTime: '10:00', endTime: '11:00', kind: 'activity', status: 'planned',
  placeId: '', description: '',
};

describe('itinerary dates and intervals', () => {
  it('formats ISO dates without changing the day', () => {
    expect(formatTripDate('2026-07-01')).toBe('Wed, 1 Jul 2026');
    expect(shiftTripDate('2026-03-29', 1)).toBe('2026-03-30');
    expect(shiftTripDate('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('accepts trip boundaries and rejects outside dates or nonpositive intervals', () => {
    const trip = { startDate: '2026-07-01', endDate: '2026-07-03' };
    expect(validateEventTime(event, trip)).toBe('');
    expect(validateEventTime({ ...event, date: trip.endDate }, trip)).toBe('');
    expect(validateEventTime({ ...event, date: '2026-06-30' }, trip)).not.toBe('');
    expect(validateEventTime({ ...event, date: '2026-07-04' }, trip)).not.toBe('');
    expect(validateEventTime({ ...event, endTime: '10:00' }, trip)).not.toBe('');
    expect(validateEventTime({ ...event, endTime: '09:00' }, trip)).not.toBe('');
  });

  it('warns about intersecting events but not adjacency, another date or itself', () => {
    const overlap = { ...event, id: 'two', startTime: '10:30', endTime: '12:00' };
    expect(overlappingEvents(event, [
      event, overlap, { ...event, id: 'adjacent', startTime: '11:00' },
      { ...event, id: 'tomorrow', date: '2026-07-02' },
    ])).toEqual([overlap]);
  });

  it('sorts by date then time without mutating the snapshot', () => {
    const early = { ...event, id: 'early', startTime: '09:00' };
    const events = [event, early];
    expect(sortEvents(events)).toEqual([early, event]);
    expect(events).toEqual([event, early]);
  });
});
