import type { Trip, TripEvent } from '../../../shared/model';

// Date-only values are always formatted in UTC, never shifted into the device timezone.
export function formatTripDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

export function shiftTripDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function validateEventTime(
  event: Pick<TripEvent, 'date' | 'startTime' | 'endTime'>,
  trip: Pick<Trip, 'startDate' | 'endDate'>,
): string {
  if (!event.date || event.date < trip.startDate || event.date > trip.endDate) {
    return 'Choose a date within the trip dates.';
  }
  if (!event.startTime || !event.endTime || event.endTime <= event.startTime) {
    return 'End time must be after start time on the same day.';
  }
  return '';
}

export function overlappingEvents(
  event: Pick<TripEvent, 'id' | 'date' | 'startTime' | 'endTime'>,
  events: TripEvent[],
): TripEvent[] {
  return events.filter(other =>
    other.id !== event.id && other.date === event.date &&
    other.startTime < event.endTime && event.startTime < other.endTime,
  );
}

export function sortEvents(events: TripEvent[]): TripEvent[] {
  return [...events].sort((a, b) =>
    a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) ||
    a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
  );
}

export function emptyEvent(cityId: string, date: string): TripEvent {
  return {
    id: crypto.randomUUID(), cityId, date, title: '', startTime: '10:00', endTime: '11:00',
    kind: 'activity', status: 'planned', placeId: '', description: '',
  };
}
