import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import type { Role, TripSnapshot } from '../../../shared/model';
import { TripContext } from '../../app/TripContext';
import { CalendarPage } from './CalendarPage';

function render(role: Role = 'owner') {
  const member = { id: 'member', name: 'Daniel', role };
  const snapshot: TripSnapshot = {
    revision: 0, session: member, members: [member],
    data: {
      trip: { id: 'trip', title: 'Belgium with friends', startDate: '2030-06-01', endDate: '2030-06-06',
        timezone: 'Europe/Brussels', cities: [{ id: 'brussels', name: 'Brussels' }] },
      events: [], places: [], notes: [], packing: [], transfers: [], activity: [],
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
