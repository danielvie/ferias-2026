import { useId, useRef, useState, type FormEvent } from 'react';
import { visitLabel } from '../../../shared/route';
import { useTrip } from '../../app/TripContext';
import { useNavigationGuard } from '../../app/useNavigationGuard';

export function VisitForm({ beforeId, onClose, onSaved }: {
  beforeId: string | null; onClose: () => void; onSaved: (name: string) => void;
}) {
  const { snapshot, command, busy, canEdit } = useTrip();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const visitId = useRef(crypto.randomUUID());
  const submitting = useRef(false);
  const id = useId();
  useNavigationGuard(true, 'Leave this city visit form? Unsaved changes will be lost.', busy || saving);
  const cities = snapshot.data.trip.cities;
  const repeated = cities.some(city => city.name.toLowerCase() === name.trim().toLowerCase());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || busy || submitting.current || !canEdit) return;
    submitting.current = true;
    setSaving(true);
    try {
      if (await command({ type: 'visit.add', visit: { id: visitId.current, name: name.trim() }, beforeId })) {
        onSaved(name.trim());
      }
    } finally { submitting.current = false; setSaving(false); }
  }

  return <section className="panel stack" aria-labelledby={`${id}-heading`}>
    <div><h2 id={`${id}-heading`}>Add city visit</h2>
      <p className="muted">{beforeId ? `Insert before ${visitLabel(cities, beforeId)}.` : 'Add to the end of your route.'} A new visit starts with no activities.</p></div>
    <form onSubmit={submit}>
      <fieldset className="places-form-fields stack" disabled={busy || saving || !canEdit}>
        <legend className="visually-hidden">City visit details</legend>
        <div className="field"><label htmlFor={`${id}-city`}>City name</label>
          <input id={`${id}-city`} autoFocus required maxLength={100} value={name} placeholder="e.g. Brussels"
            onChange={event => setName(event.target.value)} />
          <small>{repeated ? 'This city is already on your route. This creates a separate visit, not a duplicate of its activities.' :
            'Returning to a city? You can use the same name again.'}</small></div>
        <div className="actions">
          <button className="button" type="submit">{saving ? 'Adding…' : 'Add visit'}</button>
          <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
        </div>
      </fieldset>
    </form>
  </section>;
}
