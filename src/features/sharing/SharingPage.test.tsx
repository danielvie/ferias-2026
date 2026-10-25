import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Role, TripSnapshot } from '../../../shared/model';
import { TripContext, type TripContextValue } from '../../app/TripContext';
import { SharingPage } from './SharingPage';
import { SecretLink } from './SecretLink';
import type { ReactNode } from 'react';

function render(role: Role, content: ReactNode) {
  const snapshot: TripSnapshot = {
    revision: 1, session: { id: 'me', name: 'Me', role }, members: [],
    data: {
      trip: { id: 'trip', title: 'Belgium', startDate: '2026-08-01', endDate: '2026-08-07', timezone: 'Europe/Brussels',
        cities: [{ id: 'city', name: 'Ghent' }] },
      notes: [], packing: [], transfers: [], activity: [],
      events: [
        { id: 'walk', title: 'Canal walk', cityId: 'city', date: '2026-08-02', startTime: '10:00', endTime: '11:00', kind: 'activity', status: 'planned', placeId: '', description: 'PRIVATE EVENT DESCRIPTION' },
        { id: 'stay', title: 'PRIVATE HOTEL', cityId: 'city', date: '2026-08-02', startTime: '20:00', endTime: '23:00', kind: 'stay', status: 'planned', placeId: '', description: 'PRIVATE STAY DETAILS' },
      ],
      places: [{ id: 'place', title: 'Art museum', cityId: 'city', category: 'museum', status: 'idea',
        description: 'PRIVATE PLACE DESCRIPTION', address: 'PRIVATE ADDRESS', url: 'PRIVATE URL', durationMinutes: 90, cost: 'PRIVATE COST' }],
    },
  };
  const value: TripContextValue = {
    snapshot, canEdit: role === 'owner' || role === 'editor', busy: false,
    command: async () => true, refresh: async () => {}, navigate: () => {},
  };
  return renderToStaticMarkup(<TripContext.Provider value={value}>{content}</TripContext.Provider>);
}

describe('sharing', () => {
  it.each(['owner', 'editor'] as const)('offers one common join link without invitation setup for %s', (role) => {
    const html = render(role, <SharingPage />);
    expect(html).toContain('Share your trip');
    expect(html).toContain('Invite people with this link');
    expect(html).toContain('Loading your trip link');
    expect(html).toContain('Each person gets their own identity');
    expect(html).not.toContain('Recipient name');
    expect(html).not.toContain('Access role');
    expect(html).not.toContain('Replace owner link');
    expect(html).not.toContain('PRIVATE');
  });

  it.each(['viewer', 'family'] as const)('keeps existing %s access read-only', (role) => {
    const html = render(role, <SharingPage />);
    expect(html).not.toContain('Invite people with this link');
    expect(html).not.toContain('Revoke access');
    expect(html).toContain('This access is read-only');
  });

  it.each(['/', '/ferias-2026/'])('shows a selectable readonly link under %s with its bearer access warning', (base) => {
    vi.stubGlobal('location', { origin: 'https://trip.example' });
    vi.stubEnv('BASE_URL', base);
    try {
      const html = renderToStaticMarkup(<SecretLink token="test-token" onDismiss={() => {}} />);
      expect(html).toContain(`https://trip.example${base}#access=test-token`);
      expect(html).toContain('readOnly=""');
      expect(html).toContain('Anyone with the link obtains its role');
    } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
  });
});
