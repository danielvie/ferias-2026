import type { City, Place, TripEvent } from './model.ts';

export function activityOutsideCityDates(city: City, place: Place, events: TripEvent[]): boolean {
  if (!city.arrivalDate || !city.departureDate) return false;
  return events.some(event => event.placeId === place.id &&
    (event.date < city.arrivalDate! || event.date > city.departureDate!));
}

export function visitLabel(cities: City[], id: string): string {
  const index = cities.findIndex(city => city.id === id);
  if (index < 0) return 'Removed visit';
  const city = cities[index];
  const repeats = cities.filter(item => item.name.trim().toLowerCase() === city.name.trim().toLowerCase()).length > 1;
  return repeats ? `${city.name} · stop ${index + 1}` : city.name;
}

export function routeDateConflicts(cities: City[], events: TripEvent[]): string[] {
  const conflicts = new Set<string>();
  let latest: { at: string; cityId: string } | undefined;
  for (const city of cities) {
    const times = events.filter(event => event.cityId === city.id)
      .map(event => `${event.date}T${event.startTime}`).sort();
    if (!times.length) continue;
    if (latest && times[0] < latest.at) {
      conflicts.add(latest.cityId);
      conflicts.add(city.id);
    }
    const at = times[times.length - 1];
    if (!latest || at > latest.at) latest = { at, cityId: city.id };
  }
  return [...conflicts];
}
