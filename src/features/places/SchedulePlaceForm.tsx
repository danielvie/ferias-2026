import { useId, useRef, useState, type FormEvent } from 'react';
import type { Place } from '../../../shared/model';
import { useTrip } from '../../app/TripContext';
import { useNavigationGuard } from '../../app/useNavigationGuard';
import { DateTimeFields } from '../calendar/DateTimeFields';
import { emptyEvent, overlappingEvents, validateEventTime } from '../calendar/itinerary';

export function SchedulePlaceForm({ place, onClose, initialDate }: { place: Place; initialDate?: string; onClose: () => void }) {
  const { snapshot, canEdit, busy, command } = useTrip();
  const { trip, events } = snapshot.data;
  const [draft, setDraft] = useState(() => ({
    ...emptyEvent(place.cityId, initialDate ?? trip.startDate), placeId: place.id, title: place.title,
  }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useNavigationGuard(busy || saving);
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
      setError(validation || (draft.startTime
        ? 'Esta atividade já está na agenda neste dia e horário.'
        : 'Esta atividade já está na agenda sem horário neste dia.'));
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
      <h2 id={`${id}-heading`}>Agendar {place.title}</h2>
      <form onSubmit={submit}>
        <fieldset className="places-form-fields stack" disabled={busy || saving || !canEdit}>
          <legend className="visually-hidden">Data e horário</legend>
          <DateTimeFields value={draft} trip={trip} autoFocus
            onChange={change => setDraft(current => ({ ...current, ...change }))} />
          <div aria-live="polite">
            {overlaps.length > 0 && <p className="places-warning">
              Horário coincide com {overlaps.map(item => item.title).join(', ')}. Você ainda pode salvar.
            </p>}
          </div>
          {error && <p className="inline-error" role="alert">{error}</p>}
          <div className="actions">
            <button className="button" type="submit">{saving ? 'Agendando…' : 'Agendar'}</button>
            <button className="button secondary" type="button" onClick={onClose}>Cancelar</button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
