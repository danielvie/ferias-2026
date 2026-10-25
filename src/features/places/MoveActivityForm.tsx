import { useId, useRef, useState, type FormEvent } from 'react';
import type { Place, TripCommand } from '../../../shared/model';
import { visitLabel } from '../../../shared/route';
import { useTrip } from '../../app/TripContext';
import { useNavigationGuard } from '../../app/useNavigationGuard';

export function MoveActivityForm({ place, onClose, onMoved }: {
  place: Place; onClose: () => void;
  onMoved: (result: { undo: TripCommand; revision: number; destinationId: string }) => void;
}) {
  const { snapshot, command, canEdit, busy } = useTrip();
  const { trip, places, events } = snapshot.data;
  const current = places.find(item => item.id === place.id);
  const siblings = places.filter(item => item.cityId === current?.cityId);
  const nextId = siblings[siblings.findIndex(item => item.id === place.id) + 1]?.id ?? null;
  const [cityId, setCityId] = useState(place.cityId);
  const [beforeId, setBeforeId] = useState<string | null>(nextId);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const id = useId();
  useNavigationGuard(true, 'Leave this activity move? Your choices will be lost.', busy || saving);
  const destination = trip.cities.find(city => city.id === cityId);
  const destinationActivities = places.filter(item => item.cityId === cityId && item.id !== place.id);
  const missingPosition = beforeId !== null && !destinationActivities.some(item => item.id === beforeId);
  const unchanged = current?.cityId === cityId && nextId === beforeId;
  const fromCity = trip.cities.find(city => city.id === current?.cityId);
  const differentCity = destination && fromCity && destination.name.toLowerCase() !== fromCity.name.toLowerCase();
  const scheduled = events.filter(event => event.placeId === place.id).length;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || submitting.current || !canEdit || !current || !destination || missingPosition || unchanged) return;
    submitting.current = true;
    setSaving(true);
    setError('');
    const undo: TripCommand = { type: 'place.move', id: place.id, cityId: current.cityId, beforeId: nextId };
    try {
      if (await command({ type: 'place.move', id: place.id, cityId, beforeId })) {
        onMoved({ undo, revision: snapshot.revision + 1, destinationId: cityId });
      } else {
        setError('The move was not confirmed. Your choices are kept. Review the latest route and try again.');
      }
    } finally { submitting.current = false; setSaving(false); }
  }

  return <form className="stack activity-move-form" onSubmit={submit}>
    <div><h3>{place.title}</h3>
      <p className="muted">From {visitLabel(trip.cities, current?.cityId ?? place.cityId)}</p></div>
    <fieldset className="places-form-fields stack" disabled={busy || saving || !canEdit}>
      <legend className="visually-hidden">Activity destination</legend>
      <div className="field">
        <label htmlFor={`${id}-visit`}>Destination checkpoint</label>
        <select id={`${id}-visit`} value={cityId} required autoFocus onChange={event => {
          setCityId(event.target.value); setBeforeId(null);
        }}>
          {!destination && <option value={cityId} disabled>Checkpoint no longer available</option>}
          {trip.cities.map((city, index) => <option key={city.id} value={city.id}>
            {index + 1}. {city.name}{city.id === current?.cityId ? ' / current checkpoint' : ''}
          </option>)}
        </select>
        <small>{destinationActivities.length} {destinationActivities.length === 1 ? 'other activity' : 'other activities'} in this checkpoint.</small>
      </div>
      <div className="field">
        <label htmlFor={`${id}-position`}>Position</label>
        <select id={`${id}-position`} value={beforeId ?? ''} aria-invalid={missingPosition || undefined}
          onChange={event => setBeforeId(event.target.value || null)}>
          <option value="">At the end</option>
          {missingPosition && <option value={beforeId!} disabled>Activity no longer available</option>}
          {destinationActivities.map((activity, index) => <option key={activity.id} value={activity.id}>
            Before {index + 1}. {activity.title}
          </option>)}
        </select>
        {missingPosition && <small>Choose a new position in this checkpoint.</small>}
      </div>
      {differentCity && <div className="places-warning">
        This is a different city. Check the activity's address and bookings before moving it.
        {place.address && <p>Address stays: {place.address}</p>}
      </div>}
      <p className="muted">{scheduled ? `${scheduled} calendar ${scheduled === 1 ? 'plan follows' : 'plans follow'} this activity to the destination checkpoint. ` : ''}
        Scheduled dates and times stay unchanged. Details, notes and links stay attached.</p>
      {unchanged && <p className="fine-print">Choose another checkpoint or a different position to move this activity.</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="actions">
        <button className="button" type="submit" disabled={!current || !destination || missingPosition || unchanged}>
          {saving ? 'Moving…' : 'Move activity'}
        </button>
        <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
      </div>
    </fieldset>
  </form>;
}
