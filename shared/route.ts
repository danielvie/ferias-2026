import type { City, TripEvent } from './model.ts';

export function visitLabel(cities: City[], id: string): string {
  const index = cities.findIndex(city => city.id === id);
  if (index < 0) return 'Removed visit';
  const city = cities[index];
  const repeats = cities.filter(item => item.name.trim().toLowerCase() === city.name.trim().toLowerCase()).length > 1;
  return repeats ? `${city.name} · stop ${index + 1}` : city.name;
}

// Consume each matching visit once. A name lookup alone would reuse the first
// Brussels ID for both stops when the trip details form is saved.
export function reconcileVisits(names: string[], cities: City[], createId = () => crypto.randomUUID()): City[] {
  const remaining = [...cities];
  return names.map(name => {
    const index = remaining.findIndex(city => city.name.toLowerCase() === name.toLowerCase());
    return index < 0 ? { id: createId(), name } : { ...remaining.splice(index, 1)[0], name };
  });
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
