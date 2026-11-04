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

export function PlaceForm({ initial, editing, onClose, onSaved }: {
  initial: Place; editing: boolean; onClose: () => void; onSaved?: () => void;
}) {
  const { snapshot, canEdit, busy, command } = useTrip();
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useNavigationGuard(busy || saving);
  const submitting = useRef(false);
  const id = useId();
  const patch = (change: Partial<Place>) => setDraft(current => ({ ...current, ...change }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || submitting.current || !canEdit) return;
    if (!draft.title.trim() || !isWebUrl(draft.url) ||
      !Number.isInteger(draft.durationMinutes) || draft.durationMinutes < 1) {
      setError('Informe um título, duração de pelo menos um minuto e um site http:// ou https://, se houver.');
      return;
    }
    submitting.current = true;
    setSaving(true);
    try {
      if (await command({
        type: 'place.save', place: { ...draft, title: draft.title.trim(), url: draft.url.trim() },
      })) {
        onSaved?.();
        onClose();
      }
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="panel" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>{editing ? 'Editar ideia' : 'Adicionar ideia'}</h2>
      <form onSubmit={submit}>
        <fieldset className="places-form-fields stack" disabled={busy || saving || !canEdit}>
          <legend className="visually-hidden">Detalhes da ideia</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor={`${id}-title`}>Título</label>
              <input id={`${id}-title`} name="title" autoFocus required maxLength={200} value={draft.title}
                onChange={event => patch({ title: event.target.value })} />
            </div>
            <div className="field">
              <label htmlFor={`${id}-city`}>Parada</label>
              <select id={`${id}-city`} name="cityId" required value={draft.cityId}
                onChange={event => patch({ cityId: event.target.value })}>
                {snapshot.data.trip.cities.map(city => <option key={city.id} value={city.id}>{visitLabel(snapshot.data.trip.cities, city.id)}</option>)}
              </select>
              <small>Mudar de parada preserva datas e horários agendados. Confira o endereço antes de mover para outra cidade.</small>
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor={`${id}-category`}>Categoria</label>
              <select id={`${id}-category`} name="category" value={draft.category}
                onChange={event => patch({ category: event.target.value as Place['category'] })}>
                <option value="walk">Caminhada</option><option value="museum">Museu</option>
                <option value="food">Comida</option><option value="sight">Atração</option><option value="other">Outra</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${id}-status`}>Situação</label>
              <select id={`${id}-status`} name="status" value={draft.status}
                onChange={event => patch({ status: event.target.value as Place['status'] })}>
                <option value="idea">Ideia</option><option value="planned">Planejada</option><option value="visited">Visitada</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor={`${id}-description`}>Descrição e observações de reserva, opcional</label>
            <textarea id={`${id}-description`} name="description" rows={3} value={draft.description}
              onChange={event => patch({ description: event.target.value })} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-address`}>Endereço, opcional</label>
            <input id={`${id}-address`} name="address" value={draft.address}
              onChange={event => patch({ address: event.target.value })} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-url`}>Site, opcional</label>
            <input id={`${id}-url`} name="url" type="url" placeholder="https://" value={draft.url}
              onChange={event => patch({ url: event.target.value })} />
            <small className="muted">Use um link http:// ou https://.</small>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor={`${id}-duration`}>Duração em minutos</label>
              <input id={`${id}-duration`} name="durationMinutes" type="number" min={1} max={1440} step={1}
                required value={draft.durationMinutes || ''} onChange={event => patch({ durationMinutes: Number(event.target.value) })} />
            </div>
            <div className="field">
              <label htmlFor={`${id}-cost`}>Custo estimado, opcional</label>
              <input id={`${id}-cost`} name="cost" placeholder="Ex.: €15 por pessoa" value={draft.cost}
                onChange={event => patch({ cost: event.target.value })} />
            </div>
          </div>
          {error && <p className="inline-error" role="alert">{error}</p>}
          <div className="actions">
            <button className="button" type="submit">{saving ? 'Salvando…' : 'Salvar ideia'}</button>
            <button className="button secondary" type="button" onClick={onClose}>Cancelar</button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
