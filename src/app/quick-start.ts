import { shiftDate } from '../components/date-range';
import { brusselsToday } from './dates';
import type { CreateTripInput, Trip, TripEvent } from '../../shared/model';

export function quickStartTrip(startDate = brusselsToday()): CreateTripInput {
  return {
    title: 'Sample Belgium trip',
    ownerName: 'Demo traveler',
    startDate,
    endDate: shiftDate(startDate, 6),
    cities: ['Brussels', 'Ghent', 'Bruges'],
  };
}

export function quickStartEvents(trip: Trip): TripEvent[] {
  return [
    { title: 'Explore the Grand Place', day: 0, city: 0 },
    { title: 'Walk along the canals in Ghent', day: 2, city: 1 },
    { title: 'Explore the historic centre of Bruges', day: 4, city: 2 },
  ].map(({ title, day, city }) => ({
    id: crypto.randomUUID(), title, cityId: trip.cities[city].id,
    date: shiftDate(trip.startDate, day), startTime: '10:00', endTime: '11:00',
    kind: 'activity', status: 'tentative', placeId: '',
    description: 'Sample activity. Nothing is booked.',
  }));
}
