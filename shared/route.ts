import type { City, Place, TripEvent } from './model.ts';

export function canOmitEventTime({ kind, status }: Pick<TripEvent, 'kind' | 'status'>): boolean {
  return kind === 'activity' || (kind === 'transport' && status === 'tentative');
}

export function activityOutsideCityDates(city: City, place: Place, events: TripEvent[]): boolean {
  if (!city.arrivalDate || !city.departureDate) return false;
  return events.some(event => event.placeId === place.id &&
    (event.date < city.arrivalDate! || event.date > city.departureDate!));
}

export function visitLabel(cities: City[], id: string): string {
  const index = cities.findIndex(city => city.id === id);
  if (index < 0) return 'Visita removida';
  const city = cities[index];
  const repeats = cities.filter(item => item.name.trim().toLowerCase() === city.name.trim().toLowerCase()).length > 1;
  return repeats ? `${city.name} · parada ${index + 1}` : city.name;
}
