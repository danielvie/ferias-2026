import { useId, useRef, useState, type FormEvent } from 'react';
import type { Place } from '../../../shared/model';
import { useTrip } from '../../app/TripContext';
import { useNavigationGuard } from '../../app/useNavigationGuard';
import { DateTimeFields } from '../calendar/DateTimeFields';
import { emptyEvent, overlappingEvents, validateEventTime } from '../calendar/itinerary';

export function SchedulePlaceForm({ place, onClose, initialDate }: { place: Place; initialDate?: string; onClose: () => void }) {
  const { snapshot, canEdit, busy, command } = useTrip();
  const { trip, events } = snapshot.data;
  const [draft, setDraft] = useState(() => {
    const endMinutes = Math.min(23 * 60 + 59, 10 * 60 + place.durationMinutes);
    return {
      ...emptyEvent(place.cityId, initialDate ?? trip.startDate), placeId: place.id, title: place.title,
      endTime: `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`,
    };
  });
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
      setError(validation || 'Esta atividade já está agendada nesta data e horário. Edite o agendamento na agenda.');
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
      <p className="muted">Horários locais da viagem, em Europe/Brussels. Salvar adiciona a atividade à agenda e a marca como planejada.</p>
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
