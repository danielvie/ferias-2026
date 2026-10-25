import type { City, Place } from '../../../shared/model';

interface Suggestion {
  title: string;
  cities: string[];
  category: Place['category'];
  description: string;
  durationMinutes: number;
}

export const suggestions: Suggestion[] = [
  {
    title: 'Grand Place', cities: ['brussels', 'bruxelles', 'brussel'], category: 'sight',
    description: 'An idea for a walk around the central square. Check local access and events before visiting.',
    durationMinutes: 60,
  },
  {
    title: 'Gravensteen', cities: ['ghent', 'gent', 'gand'], category: 'sight',
    description: 'A castle visit in Ghent. Check official opening hours, tickets and availability.',
    durationMinutes: 120,
  },
  {
    title: 'Bruges canal walk', cities: ['bruges', 'brugge'], category: 'walk',
    description: 'A walk along the canals. Choose a route and check accessibility before going.',
    durationMinutes: 90,
  },
];

export function suggestionCity(suggestion: Suggestion, cities: City[]): City | undefined {
  return cities.find(city => suggestion.cities.includes(city.name.trim().toLowerCase()));
}

export function newPlace(cityId: string): Place {
  return {
    id: crypto.randomUUID(), title: '', cityId, category: 'sight', status: 'idea',
    description: '', address: '', url: '', durationMinutes: 60, cost: '',
  };
}
