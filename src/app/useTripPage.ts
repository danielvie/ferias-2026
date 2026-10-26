import { useState } from 'react';
import type { Page, TripSnapshot } from '../../shared/model';
import { rememberedTrips } from './api';
import { tripIdentity } from './remembered-trips';

export function useTripPage(snapshot: TripSnapshot | null): [Page, (page: Page) => void] {
  const id = snapshot ? tripIdentity(snapshot) : null;
  const [selection, setSelection] = useState<{ id: string | null; page: Page }>({ id: null, page: 'today' });

  // Restore only after the session identifies the trip. Never persist the
  // loading screen's default page over the saved selection.
  // Reset before children render: https://react.dev/reference/react/useState#storing-information-from-previous-renders
  if (selection.id !== id) {
    setSelection({ id, page: id ? rememberedTrips.getPage(id) : 'today' });
  }

  function setPage(page: Page) {
    const next = page === 'calendar' ? 'today' : page;
    setSelection({ id, page: next });
    if (id) rememberedTrips.setPage(id, next);
  }

  return [selection.page, setPage];
}
