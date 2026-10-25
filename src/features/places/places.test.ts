import { describe, expect, it } from 'vitest';
import { isWebUrl } from './PlaceForm';
import { newPlace, suggestionCity, suggestions } from './suggestions';

describe('saved place input', () => {
  it('allows empty websites and http/https only', () => {
    for (const url of ['', ' ', 'https://example.com/path?q=trip', 'http://example.com']) {
      expect(isWebUrl(url)).toBe(true);
    }
    for (const url of ['javascript:alert(1)', 'data:text/html,test', 'ftp://example.com', '/relative', 'not a url']) {
      expect(isWebUrl(url)).toBe(false);
    }
  });

  it('only offers suggestions in a matching trip city, including local names', () => {
    const cities = [{ id: 'one', name: ' Gent ' }, { id: 'two', name: 'Brugge' }];
    expect(suggestionCity(suggestions[0], cities)).toBeUndefined();
    expect(suggestionCity(suggestions[1], cities)?.id).toBe('one');
    expect(suggestionCity(suggestions[2], cities)?.id).toBe('two');
  });

  it('starts each user-created place as a distinct unscheduled idea', () => {
    const place = newPlace('brussels');
    expect(place.status).toBe('idea');
    expect(place.title).toBe('');
    expect(place.cityId).toBe('brussels');
    expect(newPlace('brussels').id).not.toBe(place.id);
  });
});
