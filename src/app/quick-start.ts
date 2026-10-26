import { shiftDate } from '../components/date-range';
import { brusselsToday } from './dates';
import type { TripDetailsInput } from './TripDetailsForm';

/** Sample form values only. Creating the trip still uses the normal save flow. */
export function quickStartTrip(startDate = brusselsToday()): TripDetailsInput {
  return {
    title: 'Sample Belgium trip',
    ownerName: 'Demo traveler',
    startDate,
    endDate: shiftDate(startDate, 6),
    cities: ['Brussels', 'Ghent', 'Bruges'].map(name => ({ id: crypto.randomUUID(), name })),
  };
}
