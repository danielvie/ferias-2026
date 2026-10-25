import { useId, useRef, useState, type FormEvent } from 'react';
import type { Place } from '../../../shared/model';
import { visitLabel } from '../../../shared/route';
import { useTrip } from '../../app/TripContext';
import { useNavigationGuard } from '../../app/useNavigationGuard';

export function isWebUrl(value: string): boolean {
  if (!value.trim()) return true;
  try {
    return ['https:', 'http:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function PlaceForm({ initial, editing, onClose }: {
  initial: Place; editing: boolean; onClose: () => void;
}) {
  const { snapshot, canEdit, busy, command } = useTrip();
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useNavigationGuard(true, 'Leave this place form? Unsaved changes will be lost.', busy || saving);
  const submitting = useRef(false);
  const id = useId();
  const patch = (change: Partial<Place>) => setDraft(current => ({ ...current, ...change }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || submitting.current || !canEdit) return;
    if (!draft.title.trim() || !isWebUrl(draft.url) ||
      !Number.isInteger(draft.durationMinutes) || draft.durationMinutes < 1) {
      setError('Enter a title, a duration of at least one minute, and an http:// or https:// website if provided.');
      return;
    }
    submitting.current = true;
    setSaving(true);
    try {
      if (await command({
        type: 'place.save', place: { ...draft, title: draft.title.trim(), url: draft.url.trim() },
      })) onClose();
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="panel" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>{editing ? 'Edit activity' : 'Add activity'}</h2>
      <form onSubmit={submit}>
        <fieldset className="places-form-fields stack" disabled={busy || saving || !canEdit}>
          <legend className="visually-hidden">Place details</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor={`${id}-title`}>Title</label>
              <input id={`${id}-title`} name="title" autoFocus required maxLength={200} value={draft.title}
                onChange={event => patch({ title: event.target.value })} />
            </div>
            <div className="field">
              <label htmlFor={`${id}-city`}>City visit</label>
              <select id={`${id}-city`} name="cityId" required value={draft.cityId}
                onChange={event => patch({ cityId: event.target.value })}>
                {snapshot.data.trip.cities.map(city => <option key={city.id} value={city.id}>{visitLabel(snapshot.data.trip.cities, city.id)}</option>)}
              </select>
              <small>Changing visits keeps scheduled dates and times. Check the activity's address before moving it to another city.</small>
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor={`${id}-category`}>Category</label>
              <select id={`${id}-category`} name="category" value={draft.category}
                onChange={event => patch({ category: event.target.value as Place['category'] })}>
                <option value="walk">Walk</option><option value="museum">Museum</option>
                <option value="food">Food</option><option value="sight">Sight</option><option value="other">Other</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${id}-status`}>Status</label>
              <select id={`${id}-status`} name="status" value={draft.status}
                onChange={event => patch({ status: event.target.value as Place['status'] })}>
                <option value="idea">Idea</option><option value="planned">Planned</option><option value="visited">Visited</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor={`${id}-description`}>Description and booking notes, optional</label>
            <textarea id={`${id}-description`} name="description" rows={3} value={draft.description}
              onChange={event => patch({ description: event.target.value })} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-address`}>Address, optional</label>
            <input id={`${id}-address`} name="address" value={draft.address}
              onChange={event => patch({ address: event.target.value })} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-url`}>Website, optional</label>
            <input id={`${id}-url`} name="url" type="url" placeholder="https://" value={draft.url}
              onChange={event => patch({ url: event.target.value })} />
            <small className="muted">Use an http:// or https:// link.</small>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor={`${id}-duration`}>Visit duration in minutes</label>
              <input id={`${id}-duration`} name="durationMinutes" type="number" min={1} max={1440} step={1}
                required value={draft.durationMinutes || ''} onChange={event => patch({ durationMinutes: Number(event.target.value) })} />
            </div>
            <div className="field">
              <label htmlFor={`${id}-cost`}>Expected cost, optional</label>
              <input id={`${id}-cost`} name="cost" placeholder="e.g. €15 per person" value={draft.cost}
                onChange={event => patch({ cost: event.target.value })} />
            </div>
          </div>
          {error && <p className="inline-error" role="alert">{error}</p>}
          <div className="actions">
            <button className="button" type="submit">{saving ? 'Saving…' : 'Save activity'}</button>
            <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
