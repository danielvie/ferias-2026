import { useState, type FormEvent } from 'react';
import type { InviteInput } from '../../../shared/model';
import { useTrip } from '../../app/TripContext';
import { useNavigationGuard } from '../../app/useNavigationGuard';
import { FamilyPreview } from './FamilyPreview';

export function InvitationForm({ disabled, onCreate }: {
  disabled: boolean; onCreate: (input: InviteInput) => Promise<boolean>;
}) {
  const { snapshot } = useTrip();
  const [name, setName] = useState('');
  const [role, setRole] = useState<InviteInput['role']>('viewer');
  const [eventIds, setEventIds] = useState<string[]>([]);
  const [placeIds, setPlaceIds] = useState<string[]>([]);
  const eligibleEvents = snapshot.data.events.filter((event) => event.kind !== 'stay');
  const safeEventIds = eventIds.filter((id) => eligibleEvents.some((event) => event.id === id));
  const safePlaceIds = placeIds.filter((id) => snapshot.data.places.some((place) => place.id === id));
  useNavigationGuard(
    name.trim().length > 0 || role !== 'viewer' || eventIds.length > 0 || placeIds.length > 0,
    'Leave this invitation draft? Unsaved changes will be lost.',
  );

  async function create(event: FormEvent) {
    event.preventDefault();
    if (disabled || !name.trim()) return;
    if (await onCreate({ name: name.trim(), role, eventIds: role === 'family' ? safeEventIds : [], placeIds: role === 'family' ? safePlaceIds : [] })) {
      setName(''); setRole('viewer'); setEventIds([]); setPlaceIds([]);
    }
  }

  function toggle(ids: string[], id: string, checked: boolean) {
    return checked ? [...ids, id] : ids.filter((value) => value !== id);
  }

  return (
    <form className="panel stack" onSubmit={create}>
      <h2>Create an invitation</h2>
      <fieldset className="sharing-fields stack" disabled={disabled}>
        <div className="form-grid">
          <label className="field">Recipient name
            <input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </label>
          <label className="field">Access role
            <select value={role} onChange={(e) => setRole(e.target.value as InviteInput['role'])}>
              <option value="viewer">Viewer, read trip content</option>
              <option value="editor">Editor, change trip plans</option>
              <option value="family">Family mode, trip summary and selected details</option>
            </select>
          </label>
        </div>
        <p className="muted">{role === 'editor'
          ? 'Editors can change plans, manage checklists and write notes. They cannot manage invitations or read another person’s private notes.'
          : role === 'viewer'
            ? 'Viewers can read trip content and shared notes, but cannot edit or comment. They cannot read another person’s private notes.'
            : 'Family mode shows exactly the selected events and places, plus an always-shared trip summary with the trip title, full dates and all city names. The trip summary remains visible even with no selections.'}</p>
        {role === 'family' && <>
          <fieldset className="sharing-selection stack">
            <legend>Events to include</legend>
            {eligibleEvents.length === 0 && <p className="muted">No eligible events. Stay events cannot be shared in family mode.</p>}
            {eligibleEvents.map((event) => <label className="sharing-check" key={event.id}>
              <input type="checkbox" checked={safeEventIds.includes(event.id)}
                onChange={(e) => setEventIds(toggle(eventIds, event.id, e.target.checked))} />
              <span>{event.title} · {event.date} · {event.startTime}</span>
            </label>)}
          </fieldset>
          <fieldset className="sharing-selection stack">
            <legend>Places to include</legend>
            {snapshot.data.places.length === 0 && <p className="muted">No saved places yet.</p>}
            {snapshot.data.places.map((place) => <label className="sharing-check" key={place.id}>
              <input type="checkbox" checked={safePlaceIds.includes(place.id)}
                onChange={(e) => setPlaceIds(toggle(placeIds, place.id, e.target.checked))} />
              <span>{place.title} · {place.category}</span>
            </label>)}
          </fieldset>
          <FamilyPreview eventIds={safeEventIds} placeIds={safePlaceIds} />
        </>}
        <div className="actions"><button type="submit" className="button" disabled={disabled || !name.trim()}>Create invitation link</button></div>
      </fieldset>
    </form>
  );
}
