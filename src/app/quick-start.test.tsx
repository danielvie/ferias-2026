import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TripDetailsForm } from './TripDetailsForm';
import { quickStartTrip } from './quick-start';

describe('quick start', () => {
  it('starts today in Brussels rather than the UTC date', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2030-05-31T22:30:00Z'));
      expect(quickStartTrip()).toMatchObject({ startDate: '2030-06-01', endDate: '2030-06-07' });
    } finally { vi.useRealTimers(); }
  });

  it('fills a seven-day trip with explicit sample details across month and year boundaries', () => {
    const sample = quickStartTrip('2026-12-28');
    expect(sample).toMatchObject({
      title: 'Sample Belgium trip', ownerName: 'Demo traveler',
      startDate: '2026-12-28', endDate: '2027-01-03',
    });
    expect(sample.cities.map(city => city.name)).toEqual(['Brussels', 'Ghent', 'Bruges']);
    expect(new Set(sample.cities.map(city => city.id)).size).toBe(3);
    expect(quickStartTrip('2026-12-28').cities[0].id).not.toBe(sample.cities[0].id);
  });

  it('renders editable sample values and the shared calendar, without saving', () => {
    const html = renderToStaticMarkup(<TripDetailsForm initial={quickStartTrip('2026-12-28')}
      busy={false} error="" onSave={async () => { throw new Error('Rendering must not save'); }} onCancel={() => {}} />);
    expect(html).toContain('These are sample details.');
    expect(html).toContain('value="Sample Belgium trip"');
    expect(html).toContain('value="Demo traveler"');
    expect(html).toContain('28 Dec 2026 to 3 Jan 2027');
    expect(html).toContain('role="grid"');
    expect(html).not.toContain('type="date"');
    expect(html).toContain('Save trip details');
  });
});
