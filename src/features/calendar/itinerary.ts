import type { Trip, TripEvent } from '../../../shared/model';
import { canOmitEventTime } from '../../../shared/route';

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

export function tripWeekday(date: string): { name: string; initial: string; weekend: boolean } {
  const value = new Date(`${date}T12:00:00Z`);
  const name = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(value);
  return { name, initial: name[0], weekend: value.getUTCDay() === 0 || value.getUTCDay() === 6 };
}

export function tripDates(trip: Pick<Trip, 'startDate' | 'endDate'>): string[] {
  const dates: string[] = [];
  for (let date = trip.startDate; date <= trip.endDate; date = shiftTripDate(date, 1)) {
    dates.push(date);
    if (date === trip.endDate) break;
  }
  return dates;
}

export function validateEventTime(
  event: Pick<TripEvent, 'date' | 'startTime' | 'endTime' | 'kind' | 'status'>,
  trip: Pick<Trip, 'startDate' | 'endDate'>,
): string {
  if (!event.date || event.date < trip.startDate || event.date > trip.endDate) {
    return 'Escolha uma data dentro do período da viagem.';
  }
  if (canOmitEventTime(event) && !event.startTime && !event.endTime) return '';
  if (!event.startTime || !event.endTime) return 'Preencha o início e o fim.';
  if (event.endTime <= event.startTime) return 'O fim deve ser depois do início, no mesmo dia.';
  return '';
}

export function overlappingEvents(
  event: Pick<TripEvent, 'id' | 'date' | 'startTime' | 'endTime'>,
  events: TripEvent[],
): TripEvent[] {
  if (!event.startTime || !event.endTime) return [];
  return events.filter(other =>
    other.id !== event.id && other.date === event.date && other.startTime && other.endTime &&
    other.startTime < event.endTime && event.startTime < other.endTime,
  );
}

export function sortEvents(events: TripEvent[]): TripEvent[] {
  return [...events].sort((a, b) =>
    a.date.localeCompare(b.date) || Number(!a.startTime) - Number(!b.startTime) || a.startTime.localeCompare(b.startTime) ||
    a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
  );
}

export function emptyEvent(cityId: string, date: string): TripEvent {
  return {
    id: crypto.randomUUID(), cityId, date, title: '', startTime: '', endTime: '',
    kind: 'activity', status: 'planned', placeId: '', description: '',
  };
}
