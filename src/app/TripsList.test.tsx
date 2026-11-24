import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import type { RememberedTrip } from './remembered-trips';
import { TripsList } from './TripsList';

test('identifies trips with identical names by trip ID, not member ID or credential', () => {
  const entry: RememberedTrip = {
    id: '12345678-trip:member-private-id', title: 'Belgium 2026',
    startDate: '2026-12-02', endDate: '2026-12-15', memberName: 'Daniel',
    role: 'owner', credential: 'private-credential', lastUsed: 0,
  };
  const other = { ...entry, id: 'abcdefgh-trip:member-private-id' };
  const html = renderToStaticMarkup(<TripsList entries={[entry, other]} currentId={entry.id} busy={false}
    onOpen={() => {}} onForget={() => {}} onOpenLink={() => {}} onCreate={() => {}} />);

  expect(html).toContain('Daniel · owner · 12345678');
  expect(html).toContain('Daniel · owner · abcdefgh');
  expect(html).toContain('aria-label="Abrir Belgium 2026 como Daniel, abcdefgh"');
  expect(html).not.toContain('member-private-id');
  expect(html).not.toContain('private-credential');
});
