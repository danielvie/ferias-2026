import { createContext, useContext } from 'react';
import type { Page, TripCommand, TripSnapshot } from '../../shared/model';

export interface NavigationGuard { message: string; blocking?: boolean }

export interface TripContextValue {
  snapshot: TripSnapshot;
  canEdit: boolean;
  busy: boolean;
  command: (command: TripCommand) => Promise<boolean>;
  refresh: () => Promise<void>;
  navigate: (page: Page) => void;
  registerNavigationGuard?: (id: string, guard: NavigationGuard | null) => void;
  onOwnerLinkReplaced?: () => void;
}

export const TripContext = createContext<TripContextValue | null>(null);

export function useTrip(): TripContextValue {
  const value = useContext(TripContext);
  if (!value) throw new Error('Trip features require TripContext');
  return value;
}
