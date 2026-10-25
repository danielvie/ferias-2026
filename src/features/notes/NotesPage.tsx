import { useState } from 'react';
import type { Note } from '../../../shared/model';
import { visitLabel } from '../../../shared/route';
import { useTrip } from '../../app/TripContext';
import { NoteCard } from './NoteCard';
import { NoteForm } from './NoteForm';
import './notes.css';

export function NotesPage() {
  const { snapshot, canEdit, busy } = useTrip();
  const { notes, trip, places } = snapshot.data;
  const [query, setQuery] = useState('');
  const [visibility, setVisibility] = useState('all');
  const [linkType, setLinkType] = useState('all');
  const [editing, setEditing] = useState<Note | 'new' | null>(null);
  const eligible = notes.filter((note) => snapshot.session.role !== 'family'
    && (note.visibility === 'trip' || note.authorId === snapshot.session.id));
  const matches = eligible.filter((note) => (visibility === 'all' || note.visibility === visibility)
    && (linkType === 'all' || note.linkType === linkType)
    && `${note.title} ${note.body} ${note.authorName}`.toLowerCase().includes(query.trim().toLowerCase()));

  function linkLabel(note: Note) {
    if (note.linkType === 'city') return `City: ${visitLabel(trip.cities, note.linkId)}`;
    if (note.linkType === 'place') return `Place: ${places.find((place) => place.id === note.linkId)?.title ?? 'Removed place'}`;
    if (note.linkType === 'day') return `Day: ${note.linkId}`;
    return trip.title;
  }

  return (
    <div className="stack notes-page">
      <header className="page-heading">
        <div><p className="eyebrow">Trip notebook</p><h1>Notes</h1><p className="muted">Keep details for yourself or share them with the trip.</p></div>
        {canEdit && <button type="button" className="button" disabled={busy || editing !== null} onClick={() => setEditing('new')}>New note</button>}
      </header>
      {!canEdit && <p className="muted">Read-only access. You can read the notes available to your role.</p>}
      {canEdit && editing !== null && <NoteForm key={editing === 'new' ? 'new' : editing.id}
        note={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      <div className="toolbar">
        <label className="field">Search notes
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Title, text or author" />
        </label>
        <label className="field">Visibility filter
          <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            <option value="all">All visible notes</option><option value="private">My private notes</option><option value="trip">Trip notes</option>
          </select>
        </label>
        <label className="field">Linked to
          <select value={linkType} onChange={(e) => setLinkType(e.target.value)}>
            <option value="all">Anywhere</option><option value="trip">Trip</option><option value="city">City</option>
            <option value="place">Place</option><option value="day">Day</option>
          </select>
        </label>
      </div>
      <p className="muted" role="status">{matches.length} {matches.length === 1 ? 'note' : 'notes'}</p>
      {matches.length === 0 && <div className="empty-state">{eligible.length ? 'No notes match these filters.' : 'No notes available yet.'}</div>}
      {matches.map((note) => <NoteCard key={note.id} note={note} linkLabel={linkLabel(note)}
        writable={canEdit && (note.visibility === 'trip' || note.authorId === snapshot.session.id)}
        editingDisabled={editing !== null}
        onEdit={() => setEditing(note)} />)}
    </div>
  );
}
