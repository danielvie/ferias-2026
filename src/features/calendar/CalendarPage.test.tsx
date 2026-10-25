import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import type { City, Role, TripEvent, TripSnapshot } from '../../../shared/model';
import { TripContext } from '../../app/TripContext';
import { CalendarPage } from './CalendarPage';

function render(role: Role = 'owner', cities: City[] = [{ id: 'brussels', name: 'Brussels' }], events: TripEvent[] = []) {
  const member = { id: 'member', name: 'Daniel', role };
  const snapshot: TripSnapshot = {
    revision: 0, session: member, members: [member],
    data: {
      trip: { id: 'trip', title: 'Belgium with friends', startDate: '2030-06-01', endDate: '2030-06-06',
        timezone: 'Europe/Brussels', cities },
      events, places: [], notes: [], packing: [], transfers: [], activity: [],
    },
  };
  return renderToStaticMarkup(<TripContext value={{ snapshot, canEdit: role === 'owner' || role === 'editor',
    busy: false, command: async () => true, refresh: async () => {}, navigate: () => {} }}><CalendarPage /></TripContext>);
}

test('renders every trip day and marker even without activities', () => {
  const html = render();
  expect(html).toContain('<h1>Belgium with friends</h1>');
  expect(html.match(/data-trip-day=/g)).toHaveLength(6);
  expect(html.match(/class="day-marker"/g)).toHaveLength(6);
  expect(html.match(/class="weekday-badge"/g)).toHaveLength(6);
  expect(html.match(/data-weekend="true"/g)).toHaveLength(2);
  expect(html).toContain('aria-label="Use trip day numbers" aria-pressed="false"');
  expect(html).toContain('aria-label="Choose a trip day"');
  expect(html).toContain('Add activity on 2030-06-06');
  expect(html).not.toContain('Up next');
});

test.each(['viewer', 'family'] as const)('%s gets a read-only itinerary with no settings or edit controls', (role) => {
  const html = render(role);
  expect(html).not.toContain('Add activity');
  expect(html).not.toContain('Departure checklists');
  expect(html).not.toContain('Latest shared note');
  expect(html).toContain(role === 'family' ? 'No activities shared for this day.' : 'Read-only.');
});

test('reflects route visit order while keeping chronological days, the day rail and booked times', () => {
  const cities = [{ id: 'return', name: 'Brussels' }, { id: 'first', name: 'Brussels' }];
  const event = { startTime: '10:00', endTime: '11:00', kind: 'activity' as const,
    status: 'planned' as const, placeId: '', description: '' };
  const html = render('owner', cities, [
    { ...event, id: 'later', cityId: 'return', date: '2030-06-03', title: 'Later booking' },
    { ...event, id: 'earlier', cityId: 'first', date: '2030-06-01', title: 'Earlier booking' },
  ]);
  expect(html).toContain('Brussels · stop 1 / Brussels · stop 2');
  expect(html).toContain('Scheduled dates do not follow your route order');
  expect(html.indexOf('<h3>Earlier booking</h3>')).toBeLessThan(html.indexOf('<h3>Later booking</h3>'));
  expect(html.match(/data-trip-day=/g)).toHaveLength(6);
  expect(html.match(/class="day-marker"/g)).toHaveLength(6);
  expect(html).toContain('dateTime="2030-06-03T10:00"');
});
