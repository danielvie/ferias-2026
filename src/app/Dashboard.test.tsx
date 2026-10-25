import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Dashboard } from './Dashboard';

describe('empty itinerary', () => {
  it('shows the main page without inventing a trip or requiring a form', () => {
    const html = renderToStaticMarkup(<Dashboard onDetails={() => {}} />);
    expect(html).toContain('<h1>Itinerary</h1>');
    expect(html).toContain('Add trip details');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('2030-06');
    expect(html).not.toContain('Brussels');
    expect(html).not.toContain('Up next');
  });
});
