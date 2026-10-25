import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Note, TripSnapshot } from '../../../shared/model';
import { TripContext, type TripContextValue } from '../../app/TripContext';
import { NotesPage } from './NotesPage';

const note = (id: string, authorId: string, visibility: Note['visibility']): Note => ({
  id, authorId, visibility, title: `Title ${id}`, body: '<script>plain text only</script>',
  authorName: 'A traveler', updatedAt: '2026-08-01T10:00:00Z', linkType: 'trip', linkId: 'trip', comments: [],
});

function render(role: TripSnapshot['session']['role']) {
  const snapshot: TripSnapshot = {
    revision: 1, session: { id: 'me', name: 'Me', role }, members: [],
    data: {
      trip: { id: 'trip', title: 'Belgium', startDate: '2026-08-01', endDate: '2026-08-07', timezone: 'Europe/Brussels', cities: [] },
      places: [], events: [], packing: [], transfers: [], activity: [],
      notes: [note('shared', 'other', 'trip'), note('mine', 'me', 'private'), note('hidden', 'other', 'private')],
    },
  };
  const value: TripContextValue = {
    snapshot, canEdit: role === 'owner' || role === 'editor', busy: false,
    command: async () => true, refresh: async () => {}, navigate: () => {},
  };
  return renderToStaticMarkup(<TripContext.Provider value={value}><NotesPage /></TripContext.Provider>);
}

describe('NotesPage', () => {
  it('renders only shared and own private notes as escaped text', () => {
    const html = render('editor');
    expect(html).toContain('Title shared');
    expect(html).toContain('Title mine');
    expect(html).not.toContain('Title hidden');
    expect(html).toContain('&lt;script&gt;plain text only&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('offers no write or comment controls to viewers', () => {
    const html = render('viewer');
    expect(html).toContain('Title shared');
    expect(html).not.toContain('New note');
    expect(html).not.toContain('Edit note');
    expect(html).not.toContain('Delete note');
    expect(html).not.toContain('Post comment');
  });

  it('does not render notes in family mode', () => {
    expect(render('family')).not.toContain('Title shared');
    expect(render('family')).not.toContain('Title mine');
  });
});
