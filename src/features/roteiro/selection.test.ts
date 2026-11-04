import { expect, test } from 'vitest';
import type { TripData, TripEvent } from '../../../shared/model';
import { mapDestination, notesForDay, restoreSelection, visitDates, visitsOnDate } from './selection';

const cities = [
  { id: 'first', name: 'Liège', arrivalDate: '2026-12-03', departureDate: '2026-12-04' },
  { id: 'bruges', name: 'Bruges', arrivalDate: '2026-12-04', departureDate: '2026-12-06' },
  { id: 'return', name: 'Liège', arrivalDate: '2026-12-07', departureDate: '2026-12-08' },
  { id: 'unknown', name: 'Uma cidade nova' },
];
const event: TripEvent = { id: 'e', title: 'Passeio', cityId: 'first', date: '2026-12-05',
  startTime: '10:00', endTime: '11:00', kind: 'activity', status: 'planned', placeId: 'p', description: '' };
const data: TripData = { trip: { id: 'trip', title: 'Viagem', startDate: '2026-12-02', endDate: '2026-12-09',
  timezone: 'Europe/Brussels', cities }, events: [event], places: [], notes: [], packing: [], transfers: [], activity: [] };

test('restores valid selections only for the current trip', () => {
  expect(restoreSelection(data, '?roteiroViagem=trip&dia=2026-12-08&parada=return', '2026-11-01'))
    .toEqual({ date: '2026-12-08', cityId: 'return' });
  expect(restoreSelection(data, '?roteiroViagem=other&dia=2026-12-08&parada=return', '2026-12-03'))
    .toEqual({ date: '2026-12-03', cityId: 'first' });
  expect(restoreSelection(data, '?roteiroViagem=trip&dia=invalid&parada=missing', '2026-11-01'))
    .toEqual({ date: '2026-12-02', cityId: '' });
});

test('keeps repeated visits distinct and includes events outside their stay', () => {
  expect(visitDates(data, cities[0])).toEqual(['2026-12-03', '2026-12-04', '2026-12-05']);
  expect(visitDates(data, cities[2])).toEqual(['2026-12-07', '2026-12-08']);
  expect(visitsOnDate(data, '2026-12-04').map(city => city.id)).toEqual(['first', 'bruges']);
  expect(visitsOnDate(data, '2026-12-02')).toEqual([]);
  expect(data.events[0]).toEqual(event);
});

test('does not invent stays from incomplete, missing, or private city dates', () => {
  expect(visitDates(data, { id: 'partial', name: 'A', arrivalDate: '2026-12-04' })).toEqual(['2026-12-04']);
  expect(visitDates(data, cities[3])).toEqual([]);
  const family = { ...data, trip: { ...data.trip, cities: cities.map(({ id, name }) => ({ id, name })) } };
  expect(visitsOnDate(family, '2026-12-04')).toEqual([]);
  expect(visitsOnDate(family, '2026-12-05').map(city => city.id)).toEqual(['first']);
  expect(visitDates(data, { id: 'outside', name: 'B', arrivalDate: '2026-11-01', departureDate: '2026-12-03' }))
    .toEqual(['2026-12-02', '2026-12-03']);
});

test('map aliases locate geography without merging visit IDs or dropping unknown cities', () => {
  expect(mapDestination(' LIÈGE ')?.name).toBe('Liège');
  expect(mapDestination('Antwerp')?.name).toBe('Antuérpia');
  expect(mapDestination('Gante')?.name).toBe('Gante');
  expect(mapDestination('Uma cidade nova')).toBeUndefined();
});

test('context notes include selected visit, day and scheduled places, not unrelated notes', () => {
  const base = { title: 'Nota', body: 'Texto', visibility: 'trip' as const, authorId: 'a', authorName: 'A', updatedAt: '', comments: [] };
  const withNotes = { ...data, notes: [
    { ...base, id: 'day', linkType: 'day' as const, linkId: '2026-12-05' },
    { ...base, id: 'visit', linkType: 'city' as const, linkId: 'first' },
    { ...base, id: 'return', linkType: 'city' as const, linkId: 'return' },
    { ...base, id: 'place', linkType: 'place' as const, linkId: 'p' },
    { ...base, id: 'trip', linkType: 'trip' as const, linkId: 'trip' },
  ] };
  expect(notesForDay(withNotes, '2026-12-05', 'first').map(note => note.id)).toEqual(['day', 'visit', 'place']);
});
