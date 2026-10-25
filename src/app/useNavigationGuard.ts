import { useEffect, useId } from 'react';
import { useTrip } from './TripContext';

/** Page-local drafts register with the app shell, which owns navigation and session exit. */
export function useNavigationGuard(active: boolean, message: string, blocking = false) {
  const id = useId();
  const { registerNavigationGuard } = useTrip();
  useEffect(() => {
    if (!active || !registerNavigationGuard) return;
    registerNavigationGuard(id, { message, blocking });
    return () => registerNavigationGuard(id, null);
  }, [active, message, blocking, id, registerNavigationGuard]);
}
