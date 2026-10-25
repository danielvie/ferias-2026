import type { ChecklistItem } from './model.ts';

interface ChecklistStrategy {
  create: (id: () => string) => ChecklistItem[];
  isReady: (items: ChecklistItem[]) => boolean;
}

const items = (titles: string[], id: () => string): ChecklistItem[] =>
  titles.map((title) => ({ id: id(), title, assignee: '', status: 'pending' }));

export const checklistStrategies: Record<'packing' | 'departure', ChecklistStrategy> = {
  packing: {
    create: (id) => items(['Passport / ID', 'Phone charger', 'Rain jacket', 'Medication', 'Comfortable shoes'], id),
    isReady: (list) => list.length > 0 && list.every((item) => item.status === 'done'),
  },
  departure: {
    create: (id) => items(['Passport + wallet with me', 'Bags counted', 'Bathroom / drawers checked', 'Tickets ready', 'Chargers unplugged', 'Keys returned'], id),
    isReady: (list) => list.length > 0 && list.every((item) => item.status !== 'pending'),
  },
};
