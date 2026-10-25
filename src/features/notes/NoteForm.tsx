import { useState, type FormEvent } from 'react';
import type { Note } from '../../../shared/model';
import { visitLabel } from '../../../shared/route';
import { useTrip } from '../../app/TripContext';
import { useNavigationGuard } from '../../app/useNavigationGuard';

type NoteDraft = Pick<Note, 'id' | 'title' | 'body' | 'visibility' | 'linkType' | 'linkId'>;

export function NoteForm({ note, onClose }: { note?: Note; onClose: () => void }) {
  const { snapshot, busy, command } = useTrip();
  useNavigationGuard(true, 'Leave this note form? Unsaved changes will be lost.');
  const { trip, places } = snapshot.data;
  const [draft, setDraft] = useState<NoteDraft>(() => note
    ? { id: note.id, title: note.title, body: note.body, visibility: note.visibility, linkType: note.linkType, linkId: note.linkType === 'trip' ? trip.id : note.linkId }
    : { id: crypto.randomUUID(), title: '', body: '', visibility: 'private', linkType: 'trip', linkId: trip.id });
  const [error, setError] = useState('');
  const missingLink = draft.linkType === 'place' ? !places.some((place) => place.id === draft.linkId)
    : draft.linkType === 'city' ? !trip.cities.some((city) => city.id === draft.linkId)
    : draft.linkType === 'day' && (draft.linkId < trip.startDate || draft.linkId > trip.endDate);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!draft.title.trim() || !draft.body.trim() || !draft.linkId) {
      setError('Enter a title, note text and a linked destination.');
      return;
    }
    if (draft.linkType === 'day' && (draft.linkId < trip.startDate || draft.linkId > trip.endDate)) {
      setError('Choose a day within the trip dates.');
      return;
    }
    setError('');
    if (await command({ type: 'note.save', note: { ...draft, title: draft.title.trim(), body: draft.body.trim() } })) onClose();
  }

  function changeLink(linkType: Note['linkType']) {
    const linkId = linkType === 'trip' ? trip.id
      : linkType === 'city' ? trip.cities[0]?.id ?? ''
      : linkType === 'place' ? places[0]?.id ?? '' : trip.startDate;
    setDraft({ ...draft, linkType, linkId });
  }

  return (
    <form className="panel stack" onSubmit={save}>
      <h2>{note ? 'Edit note' : 'New note'}</h2>
      <fieldset className="notes-fields stack" disabled={busy}>
        <label className="field">Title
          <input required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </label>
        <label className="field">Note text
          <textarea required rows={6} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
        </label>
        <div className="form-grid">
          <label className="field">Visibility
            <select value={draft.visibility} onChange={(e) => setDraft({ ...draft, visibility: e.target.value as Note['visibility'] })}>
              <option value="private" disabled={note !== undefined && note.authorId !== snapshot.session.id}>Private, only me</option>
              <option value="trip">Trip members</option>
            </select>
          </label>
          <label className="field">Link to
            <select value={draft.linkType} onChange={(e) => changeLink(e.target.value as Note['linkType'])}>
              <option value="trip">Whole trip</option>
              <option value="city">City</option>
              <option value="place">Place</option>
              <option value="day">Day</option>
            </select>
          </label>
          {draft.linkType === 'city' && <label className="field">City
            <select required value={draft.linkId} onChange={(e) => setDraft({ ...draft, linkId: e.target.value })}>
              <option value="">Choose a city</option>
              {trip.cities.map((city) => <option key={city.id} value={city.id}>{visitLabel(trip.cities, city.id)}</option>)}
            </select>
          </label>}
          {draft.linkType === 'place' && <label className="field">Place
            <select required value={draft.linkId} onChange={(e) => setDraft({ ...draft, linkId: e.target.value })}>
              <option value="">Choose a place</option>
              {places.map((place) => <option key={place.id} value={place.id}>{place.title}</option>)}
            </select>
          </label>}
          {draft.linkType === 'day' && <label className="field">Day
            <input required type="date" min={trip.startDate} max={trip.endDate} value={draft.linkId}
              onChange={(e) => setDraft({ ...draft, linkId: e.target.value })} />
          </label>}
        </div>
        {missingLink && <p className="inline-error" role="status">The original destination is no longer in this trip. Your private note was kept unchanged. Choose a new destination or link it to the whole trip before saving.</p>}
        <p className="muted">Private notes belong to this member link. Other member links cannot read them, but anyone holding this link acts as you. The owner creates and can replace member links, so trust the link issuer with personal notes. Trip notes are shared with trip members, not family links.</p>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <div className="actions">
          <button type="submit" className="button" disabled={busy}>Save note</button>
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
        </div>
      </fieldset>
    </form>
  );
}
