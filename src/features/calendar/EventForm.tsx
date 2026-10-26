import { useId, useRef, useState, type FormEvent } from 'react';
import type { TripEvent } from '../../../shared/model';
import { visitLabel } from '../../../shared/route';
import { useTrip } from '../../app/TripContext';
import { useNavigationGuard } from '../../app/useNavigationGuard';
import { DateTimeFields } from './DateTimeFields';
import { overlappingEvents, validateEventTime } from './itinerary';

export function EventForm({ initial, editing, onClose }: {
  initial: TripEvent;
  editing: boolean;
  onClose: () => void;
}) {
  const { snapshot, command, busy, canEdit } = useTrip();
  const { trip, places, events } = snapshot.data;
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useNavigationGuard(busy || saving);
  const submitting = useRef(false);
  const id = useId();
  const overlaps = overlappingEvents(draft, events);
  const patch = (change: Partial<TripEvent>) => setDraft(current => ({ ...current, ...change }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || busy || !canEdit) return;
    const validation = validateEventTime(draft, trip);
    if (validation || !draft.title.trim()) {
      setError(validation || 'Enter an event title.');
      return;
    }
    submitting.current = true;
    setSaving(true);
    try {
      if (await command({ type: 'event.save', event: { ...draft, title: draft.title.trim() } })) onClose();
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  function linkPlace(placeId: string) {
    const place = places.find(item => item.id === placeId);
    patch(place ? { placeId, title: place.title, cityId: place.cityId } : { placeId: '' });
  }

  return (
    <section className="panel" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>{editing ? 'Edit event' : 'Add event'}</h2>
      <form onSubmit={submit}>
        <fieldset className="calendar-form-fields stack" disabled={busy || saving || !canEdit}>
          <legend className="visually-hidden">Event details</legend>
          <div className="field">
            <label htmlFor={`${id}-place`}>Saved place, optional</label>
            <select id={`${id}-place`} name="placeId" value={draft.placeId}
              onChange={event => linkPlace(event.target.value)}>
              <option value="">No linked place</option>
              {places.map(place => <option key={place.id} value={place.id}>{place.title}</option>)}
            </select>
            <small className="muted">Choosing a place fills in its title and city.</small>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor={`${id}-title`}>Title</label>
              <input id={`${id}-title`} name="title" required autoFocus maxLength={200}
                value={draft.title} onChange={event => patch({ title: event.target.value })} />
            </div>
            <div className="field">
              <label htmlFor={`${id}-city`}>City</label>
              <select id={`${id}-city`} name="cityId" required value={draft.cityId}
                onChange={event => patch({ cityId: event.target.value, placeId: '' })}>
                {trip.cities.map(city => <option key={city.id} value={city.id}>{visitLabel(trip.cities, city.id)}</option>)}
              </select>
            </div>
          </div>
          <DateTimeFields value={draft} trip={trip} onChange={patch} />
          <p className="muted">All times use Europe/Brussels. Events start and end on the same day.</p>
          <div className="form-grid">
            <div className="field">
              <label htmlFor={`${id}-kind`}>Kind</label>
              <select id={`${id}-kind`} name="kind" value={draft.kind}
                onChange={event => patch({ kind: event.target.value as TripEvent['kind'] })}>
                <option value="activity">Activity</option><option value="transport">Transport</option>
                <option value="stay">Stay</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${id}-status`}>Status</label>
              <select id={`${id}-status`} name="status" value={draft.status}
                onChange={event => patch({ status: event.target.value as TripEvent['status'] })}>
                <option value="planned">Planned</option><option value="tentative">Tentative</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor={`${id}-description`}>Description, optional</label>
            <textarea id={`${id}-description`} name="description" rows={3} value={draft.description}
              onChange={event => patch({ description: event.target.value })} />
          </div>
          <div aria-live="polite">
            {overlaps.length > 0 && <p className="calendar-overlap">
              Time overlap with {overlaps.map(item => item.title).join(', ')}. You can still save this event.
            </p>}
          </div>
          {error && <p className="inline-error" role="alert">{error}</p>}
          <div className="actions">
            <button className="button" type="submit">{saving ? 'Saving…' : 'Save event'}</button>
            <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
