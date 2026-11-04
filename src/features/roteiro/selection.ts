import type { City, Note, TripData } from '../../../shared/model';
import { tripDates } from '../calendar/itinerary';

export function restoreSelection(data: TripData, search: string, today: string) {
  const params = new URLSearchParams(search);
  const dates = tripDates(data.trip);
  const sameTrip = params.get('roteiroViagem') === data.trip.id;
  const requested = sameTrip ? params.get('dia') : null;
  const date = requested && dates.includes(requested) ? requested : dates.includes(today) ? today : data.trip.startDate;
  const requestedCity = sameTrip ? params.get('parada') : null;
  const cityId = data.trip.cities.some(city => city.id === requestedCity) ? requestedCity! : visitsOnDate(data, date)[0]?.id ?? '';
  return { date, cityId };
}

// Dates belong to visits, not city names. Events outside a stay remain visible.
export function visitDates(data: TripData, city: City): string[] {
  const dates = new Set(data.events.filter(event => event.cityId === city.id).map(event => event.date));
  for (const date of tripDates(data.trip)) {
    if (city.arrivalDate && city.departureDate && date >= city.arrivalDate && date <= city.departureDate) dates.add(date);
    if (date === city.arrivalDate || date === city.departureDate) dates.add(date);
  }
  return [...dates].filter(date => date >= data.trip.startDate && date <= data.trip.endDate).sort();
}

export function visitsOnDate(data: TripData, date: string): City[] {
  return data.trip.cities.filter(city => visitDates(data, city).includes(date));
}

export function notesForDay(data: TripData, date: string, cityId: string | undefined): Note[] {
  const placeIds = new Set(data.events.filter(event => event.date === date).map(event => event.placeId));
  return data.notes.filter(note => note.linkType === 'day' && note.linkId === date ||
    note.linkType === 'city' && note.linkId === cityId ||
    note.linkType === 'place' && placeIds.has(note.linkId));
}

export const mapDestinations = [
  { name: 'Bruges', aliases: ['bruges', 'brugge'], x: 15, y: 32 },
  { name: 'Gante', aliases: ['gante', 'gent', 'ghent'], x: 33, y: 47 },
  { name: 'Antuérpia', aliases: ['antuerpia', 'antwerp', 'antwerpen'], x: 48, y: 21 },
  { name: 'Bruxelas', aliases: ['bruxelas', 'brussels', 'bruxelles', 'brussel'], x: 39, y: 73 },
  { name: 'Liège', aliases: ['liege', 'luik'], x: 63, y: 87 },
  { name: 'Maastricht', aliases: ['maastricht'], x: 74, y: 64 },
  { name: 'Eindhoven', aliases: ['eindhoven'], x: 70, y: 13 },
  { name: 'Helmond', aliases: ['helmond'], x: 88, y: 30 },
  { name: 'Asten', aliases: ['asten'], x: 88, y: 47 },
  { name: 'Valkenburg', aliases: ['valkenburg'], x: 88, y: 83 },
];

export function mapDestination(name: string) {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return mapDestinations.find(destination => destination.aliases.includes(normalized));
}
