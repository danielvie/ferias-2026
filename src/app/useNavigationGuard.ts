import { useEffect, useId } from 'react';
import { useTrip } from './TripContext';

/** Only pending saves block in-app navigation. Unsaved drafts never prompt. */
export function useNavigationGuard(active: boolean) {
  const id = useId();
  const { registerNavigationGuard } = useTrip();
  useEffect(() => {
    if (!active || !registerNavigationGuard) return;
    registerNavigationGuard(id, true);
    return () => registerNavigationGuard(id, false);
  }, [active, id, registerNavigationGuard]);
}
