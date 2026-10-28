import { afterEach, describe, expect, it } from 'vitest';
import { Store } from '../server/store';
import { commandInput } from '../server/validation';
import { activityOutsideCityDates } from '../shared/route';
import type { Place, TripCommand, TripEvent } from '../shared/model';

const stores: Store[] = [];
afterEach(() => { for (const store of stores.splice(0)) store.close(); });

describe('city dates', () => {
  it('validates, saves and preserves dates when editing and moving the route', () => {
    const store = new Store(':memory:'); stores.push(store);
    const created = store.create({ title: 'Trip', ownerName: 'Owner',
      startDate: '2030-06-01', endDate: '2030-06-10', cities: ['Brussels', 'Ghent'] });
    const access = store.authenticate(created.sessionToken);
    const send = (command: TripCommand) => store.command(access, store.snapshot(access).revision, commandInput(command));
    const [first, second] = created.snapshot.data.trip.cities;
    let state = send({ type: 'visit.dates', id: first.id, arrivalDate: '2030-06-01', departureDate: '2030-06-03' });
    expect(state.data.trip.cities[0]).toMatchObject({ arrivalDate: '2030-06-01', departureDate: '2030-06-03' });
    send({ type: 'visit.dates', id: second.id, arrivalDate: '2030-06-03', departureDate: '2030-06-04' });
    state = send({ type: 'visit.move', id: second.id, beforeId: first.id });
    state = send({ type: 'trip.update', trip: { ...state.data.trip,
      startDate: '2030-06-02', cities: state.data.trip.cities.map(({ id, name }) => ({ id, name })) } });
    expect(state.data.trip.cities.find(city => city.id === first.id)?.arrivalDate).toBe('2030-06-01');
    expect(() => send({ type: 'visit.dates', id: first.id, arrivalDate: '2030-05-31', departureDate: '' })).toThrow('within the trip');
    expect(() => send({ type: 'visit.dates', id: first.id, arrivalDate: '2030-06-05', departureDate: '2030-06-04' })).toThrow();
    expect(() => commandInput({ type: 'visit.dates', id: first.id, arrivalDate: '2030-02-30', departureDate: '' })).toThrow();
    expect(() => store.command({ ...access, member: { ...access.member, role: 'viewer' } }, state.revision,
      { type: 'visit.dates', id: first.id, arrivalDate: '', departureDate: '' })).toThrow('does not allow');
    state = send({ type: 'visit.dates', id: first.id, arrivalDate: '', departureDate: '' });
    expect(state.data.trip.cities.find(city => city.id === first.id)?.arrivalDate).toBe('');
  });

  it('checks every linked scheduled date, including both boundary days', () => {
    const city = { id: 'one', name: 'Brussels', arrivalDate: '2030-06-02', departureDate: '2030-06-04' };
    const place = { id: 'museum', cityId: city.id } as Place;
    const event = (date: string, placeId = place.id) => ({ date, placeId } as TripEvent);
    expect(activityOutsideCityDates(city, place, [event('2030-06-02'), event('2030-06-04')])).toBe(false);
    expect(activityOutsideCityDates(city, place, [event('2030-06-03'), event('2030-06-05')])).toBe(true);
    expect(activityOutsideCityDates(city, place, [event('2030-06-01', 'other')])).toBe(false);
    expect(activityOutsideCityDates({ ...city, departureDate: '' }, place, [event('2030-06-05')])).toBe(false);
  });
});
