import type { Page } from '../../shared/model';

const paths: Record<Page | 'arrow' | 'brand' | 'ordered' | 'grip', string> = {
  today: 'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  calendar: 'M4 5h16v16H4ZM8 2v6M16 2v6M4 10h16M8 14h2M14 14h2M8 18h2',
  ordered: 'M10 7h11M10 17h11M3 4h1v6M3 10h3M3 16c0-2 3-2 3 0 0 1.5-3 2-3 4h3',
  grip: 'M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01',
  places: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  notes: 'M5 3h14v18H5ZM8 8h8M8 12h8M8 16h5',
  checklists: 'M9 5h12M9 12h12M9 19h12M2 5l2 2 3-4M2 12l2 2 3-4M2 19l2 2 3-4',
  sharing: 'M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM17 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 21v-6a6 6 0 0 1 12 0v6M14 15a5 5 0 0 1 8 4v2',
  arrow: 'M4 12h16M14 6l6 6-6 6',
  brand: 'M3 21V10l5-5 5 5v11M13 21V6l4-4 4 4v15M6 13h4M6 17h4M16 9h2M16 13h2M1 21h22',
};

export function Icon({ name }: { name: keyof typeof paths }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
