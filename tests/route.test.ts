import { afterEach, describe, expect, it } from 'vitest';
import { Store } from '../server/store';
import { commandInput, createTripInput } from '../server/validation';
import { reconcileVisits, routeDateConflicts, visitLabel } from '../shared/route';
import type { Place, TripCommand } from '../shared/model';

const stores: Store[] = [];
afterEach(() => { for (const store of stores) store.close(); stores.length = 0; });

function setup() {
  const store = new Store(':memory:');
  stores.push(store);
  const created = store.create(createTripInput({
    title: 'Route', ownerName: 'Owner', startDate: '2030-06-01', endDate: '2030-06-10',
    cities: ['Brussels', 'Ghent', 'Brussels'],
  }));
  const access = store.authenticate(created.sessionToken);
  const state = () => store.snapshot(access);
  const command = (value: TripCommand) => store.command(access, state().revision, commandInput(value));
  return { store, access, state, command };
}

const activity = (id: string, cityId: string): Place => ({
  id, cityId, title: id, category: 'walk', status: 'idea', description: 'Keep these notes',
  address: 'Original address', url: 'https://example.com/', durationMinutes: 60, cost: '€10',
});

describe('route visits and activity identities', () => {
  it('allows repeated city names and reuses each existing visit ID only once', () => {
    const { state } = setup();
    const cities = state().data.trip.cities;
    expect(new Set(cities.map(city => city.id)).size).toBe(3);
    expect(reconcileVisits(['Brussels', 'Ghent', 'Brussels'], cities)).toEqual(cities);
    expect(reconcileVisits(['Brussels', 'Brussels', 'Ghent'], cities).map(city => city.id))
      .toEqual([cities[0].id, cities[2].id, cities[1].id]);
    expect(visitLabel(cities, cities[2].id)).toBe('Brussels · stop 3');
  });

  it('inserts an empty repeat visit and reorders without changing linked data or dates', () => {
    const { state, command } = setup();
    const [first, ghent] = state().data.trip.cities;
    command({ type: 'place.save', place: activity('walk', first.id) });
    const before = state().data.places;
    command({ type: 'visit.add', visit: { id: 'return', name: 'Brussels' }, beforeId: ghent.id });
    expect(state().data.trip.cities[1].id).toBe('return');
    expect(state().data.places).toEqual(before);
    command({ type: 'visit.move', id: first.id, beforeId: null });
    expect(state().data.trip.cities.at(-1)?.id).toBe(first.id);
    expect(state().data.places).toEqual(before);
  });

  it('moves the same activity, its scheduled visit references, and no private note content', () => {
    const { state, command } = setup();
    const [first, ghent, last] = state().data.trip.cities;
    command({ type: 'place.save', place: activity('walk', first.id) });
    command({ type: 'place.save', place: activity('museum', last.id) });
    command({ type: 'event.save', event: {
      id: 'booking', cityId: first.id, placeId: 'walk', title: 'Booked walk', date: '2030-06-02',
      startTime: '10:00', endTime: '11:00', kind: 'activity', status: 'planned', description: 'Keep booking',
    } });
    command({ type: 'note.save', note: {
      id: 'note', title: 'Private', body: 'Keep me', linkType: 'place', linkId: 'walk', visibility: 'private',
    } });
    const before = state().data;
    command({ type: 'place.move', id: 'walk', cityId: last.id, beforeId: 'museum' });
    expect(state().data.places.map(place => place.id)).toEqual(['walk', 'museum']);
    expect(state().data.places[0]).toEqual({ ...before.places[0], cityId: last.id });
    expect(state().data.events[0]).toEqual({ ...before.events[0], cityId: last.id });
    expect(state().data.notes).toEqual(before.notes);
    command({ type: 'place.move', id: 'walk', cityId: ghent.id, beforeId: null });
    expect(state().data.events[0].cityId).toBe(ghent.id);
    expect(state().data.events[0].date).toBe('2030-06-02');
    command({ type: 'place.save', place: { ...state().data.places.find(p => p.id === 'walk')!, cityId: first.id } });
    expect(state().data.events[0].cityId).toBe(first.id);
  });

  it('rolls back invalid moves, duplicate IDs and stale writes', () => {
    const { state, command, store, access } = setup();
    const [first, second] = state().data.trip.cities;
    command({ type: 'place.save', place: activity('a', first.id) });
    command({ type: 'place.save', place: activity('b', second.id) });
    const before = state();
    const invalid: TripCommand[] = [
      { type: 'visit.add', visit: first, beforeId: null },
      { type: 'visit.move', id: first.id, beforeId: first.id },
      { type: 'visit.move', id: first.id, beforeId: 'missing' },
      { type: 'place.move', id: 'a', cityId: 'missing', beforeId: null },
      { type: 'place.move', id: 'a', cityId: second.id, beforeId: 'a' },
      { type: 'place.move', id: 'a', cityId: first.id, beforeId: 'b' },
    ];
    for (const value of invalid) {
      expect(() => command(value)).toThrow();
      expect(state()).toEqual(before);
    }
    expect(() => store.command(access, before.revision - 1, { type: 'visit.move', id: first.id, beforeId: null })).toThrow('changed');
    for (const role of ['viewer', 'family'] as const) {
      expect(() => store.command({ ...access, member: { ...access.member, role } }, before.revision,
        { type: 'visit.move', id: first.id, beforeId: null })).toThrow('does not allow');
    }
    expect(() => commandInput({ type: 'visit.move', id: first.id })).toThrow();
  });

  it('warns when calendar times contradict the route, including same-day plans', () => {
    const { state, command } = setup();
    const [first, second] = state().data.trip.cities;
    const event = { title: 'Plan', date: '2030-06-02', endTime: '19:00', kind: 'activity' as const,
      status: 'planned' as const, placeId: '', description: '' };
    command({ type: 'event.save', event: { ...event, id: 'late', cityId: first.id, startTime: '18:00' } });
    command({ type: 'event.save', event: { ...event, id: 'early', cityId: second.id, startTime: '10:00' } });
    expect(routeDateConflicts(state().data.trip.cities, state().data.events)).toEqual([first.id, second.id]);
  });
});
