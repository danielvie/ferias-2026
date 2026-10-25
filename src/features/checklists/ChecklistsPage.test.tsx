import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TripSnapshot } from '../../../shared/model';
import { TripContext, type TripContextValue } from '../../app/TripContext';
import { ChecklistsPage } from './ChecklistsPage';

function render(role: 'owner' | 'viewer', status: 'pending' | 'done' | 'skipped') {
  const snapshot: TripSnapshot = {
    revision: 1, session: { id: 'me', name: 'Me', role }, members: [],
    data: {
      trip: { id: 'trip', title: 'Belgium', startDate: '2026-08-01', endDate: '2026-08-07', timezone: 'Europe/Brussels',
        cities: [{ id: 'brussels', name: 'Brussels' }, { id: 'ghent', name: 'Ghent' }] },
      places: [], events: [], notes: [], activity: [],
      packing: [{ id: 'packing', title: 'Rain jacket', status: 'pending', assignee: '' }],
      transfers: [{ id: 'leg', fromCityId: 'brussels', toCityId: 'ghent', date: '2026-08-02', time: '09:00',
        items: [{ id: 'check', title: 'Keys returned', status, assignee: 'Me' }] }],
    },
  };
  const value: TripContextValue = {
    snapshot, canEdit: role === 'owner', busy: false,
    command: async () => true, refresh: async () => {}, navigate: () => {},
  };
  return renderToStaticMarkup(<TripContext.Provider value={value}><ChecklistsPage /></TripContext.Provider>);
}

describe('ChecklistsPage', () => {
  it('counts skipped departure checks as resolved, not packing', () => {
    const html = render('owner', 'skipped');
    expect(html).toContain('Ready to go');
    expect(html).toContain('1 skipped');
    expect(html).toContain('0 of 1 packed');
    expect(html).toContain('type="checkbox"');
    // Only the departure status selector offers skipping.
    expect(html.match(/value="skipped"/g)).toHaveLength(1);
  });

  it('does not call a pending departure ready', () => {
    expect(render('owner', 'pending')).toContain('Departure checks pending');
    expect(render('owner', 'pending')).not.toContain('Ready to go');
  });

  it('shows checklist content but no mutation controls to viewers', () => {
    const html = render('viewer', 'done');
    expect(html).toContain('Rain jacket');
    expect(html).toContain('Keys returned');
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain('Save owner');
    expect(html).not.toContain('Add item');
    expect(html).not.toContain('Delete departure');
    expect(html).not.toContain('New departure');
  });
});
