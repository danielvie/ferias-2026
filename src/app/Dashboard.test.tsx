import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Role, TripSnapshot } from '../../shared/model';
import { Dashboard } from './Dashboard';

function trip(role: Role = 'owner'): TripSnapshot {
  const member = { id: 'member', name: 'Daniel', role };
  return {
    revision: 0, session: member, members: [member],
    data: {
      trip: { id: 'trip', title: 'Belgium with friends', startDate: '2030-06-01', endDate: '2030-06-06', timezone: 'Europe/Brussels',
        cities: [{ id: 'brussels', name: 'Brussels' }, { id: 'ghent', name: 'Ghent' }] },
      events: [], places: [], notes: [], packing: [], transfers: [], activity: [],
    },
  };
}

const render = (snapshot: TripSnapshot | null) =>
  renderToStaticMarkup(<Dashboard snapshot={snapshot} onNavigate={() => {}} onDetails={() => {}} />);

describe('reference dashboard', () => {
  it('shows the main page without inventing a trip or requiring a form', () => {
    const html = render(null);
    expect(html).toContain('<h1>Today</h1>');
    expect(html).toContain('Up next');
    expect(html).toContain('Before the next move');
    expect(html).toContain('No cities added yet.');
    expect(html).toContain('Add trip details');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('2030-06');
    expect(html).not.toContain('Brussels');
    expect(html).not.toContain('trip-banner');
  });
  it('shows saved trip metadata and linked route stops without a hero', () => {
    const html = render(trip());
    expect(html).toContain('Belgium with friends');
    expect(html).toContain('Explore places in Brussels');
    expect(html).toContain('Explore places in Ghent');
    expect(html).toContain('Edit trip details');
    expect(html).not.toContain('city-sketch');
  });
  it('keeps family views read-only and excludes the note and checklist panels', () => {
    const html = render(trip('family'));
    expect(html).toContain('Trip overview');
    expect(html).not.toContain('Edit trip details');
    expect(html).not.toContain('Latest shared note');
    expect(html).not.toContain('Before the next move');
  });
  it('does not offer quick-add actions to viewers', () => {
    const html = render(trip('viewer'));
    expect(html).toContain('Latest shared note');
    expect(html).not.toContain('Quick add:');
    expect(html).not.toContain('Edit trip details');
  });
});
