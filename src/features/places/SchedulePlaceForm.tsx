import { useId, useRef, useState, type FormEvent } from 'react';
import type { Place } from '../../../shared/model';
import { useTrip } from '../../app/TripContext';
import { useNavigationGuard } from '../../app/useNavigationGuard';
import { DateTimeFields } from '../calendar/DateTimeFields';
import { emptyEvent, overlappingEvents, validateEventTime } from '../calendar/itinerary';

export function SchedulePlaceForm({ place, onClose }: { place: Place; onClose: () => void }) {
  const { snapshot, canEdit, busy, command } = useTrip();
  const { trip, events } = snapshot.data;
  const [draft, setDraft] = useState(() => {
    const endMinutes = Math.min(23 * 60 + 59, 10 * 60 + place.durationMinutes);
    return {
      ...emptyEvent(place.cityId, trip.startDate), placeId: place.id, title: place.title,
      endTime: `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`,
    };
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useNavigationGuard(true, 'Leave this scheduling form? Unsaved changes will be lost.', busy || saving);
  const submitting = useRef(false);
  const id = useId();
  const overlaps = overlappingEvents(draft, events);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || submitting.current || !canEdit) return;
    const validation = validateEventTime(draft, trip);
    const duplicate = events.some(item => item.placeId === place.id && item.date === draft.date &&
      item.startTime === draft.startTime && item.endTime === draft.endTime);
    if (validation || duplicate) {
      setError(validation || 'This place is already scheduled at that date and time. Edit its event in the calendar instead.');
      return;
    }
    submitting.current = true;
    setSaving(true);
    try {
      if (await command({
        type: 'event.save',
        event: { ...draft, title: place.title, cityId: place.cityId, placeId: place.id },
      })) onClose();
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="panel stack" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>Schedule {place.title}</h2>
      <p className="muted">All times use Europe/Brussels. Saving adds an activity to your calendar and marks the place planned.</p>
      <form onSubmit={submit}>
        <fieldset className="places-form-fields stack" disabled={busy || saving || !canEdit}>
          <legend className="visually-hidden">Visit date and time</legend>
          <DateTimeFields value={draft} trip={trip} autoFocus
            onChange={change => setDraft(current => ({ ...current, ...change }))} />
          <div aria-live="polite">
            {overlaps.length > 0 && <p className="places-warning">
              Time overlap with {overlaps.map(item => item.title).join(', ')}. You can still save this visit.
            </p>}
          </div>
          {error && <p className="inline-error" role="alert">{error}</p>}
          <div className="actions">
            <button className="button" type="submit">{saving ? 'Scheduling…' : 'Add to calendar'}</button>
            <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
