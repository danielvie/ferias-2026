import { useState, type FormEvent } from 'react';
import type { Note } from '../../../shared/model';
import { visitLabel } from '../../../shared/route';
import { useTrip } from '../../app/TripContext';

type NoteDraft = Pick<Note, 'id' | 'title' | 'body' | 'visibility' | 'linkType' | 'linkId'>;

export function NoteForm({ note, onClose }: { note?: Note; onClose: () => void }) {
  const { snapshot, busy, command } = useTrip();
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
      setError('Informe título, texto e destino da nota.');
      return;
    }
    if (draft.linkType === 'day' && (draft.linkId < trip.startDate || draft.linkId > trip.endDate)) {
      setError('Escolha um dia dentro do período da viagem.');
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
      <h2>{note ? 'Editar nota' : 'Nova nota'}</h2>
      <fieldset className="notes-fields stack" disabled={busy}>
        <label className="field">Título
          <input required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </label>
        <label className="field">Texto da nota
          <textarea required rows={6} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
        </label>
        <div className="form-grid">
          <label className="field">Visibilidade
            <select value={draft.visibility} onChange={(e) => setDraft({ ...draft, visibility: e.target.value as Note['visibility'] })}>
              <option value="private" disabled={note !== undefined && note.authorId !== snapshot.session.id}>Privada, só eu</option>
              <option value="trip">Grupo da viagem</option>
            </select>
          </label>
          <label className="field">Vincular a
            <select value={draft.linkType} onChange={(e) => changeLink(e.target.value as Note['linkType'])}>
              <option value="trip">Viagem inteira</option>
              <option value="city">Parada</option>
              <option value="place">Atividade</option>
              <option value="day">Dia</option>
            </select>
          </label>
          {draft.linkType === 'city' && <label className="field">Parada
            <select required value={draft.linkId} onChange={(e) => setDraft({ ...draft, linkId: e.target.value })}>
              <option value="">Escolha uma parada</option>
              {trip.cities.map((city) => <option key={city.id} value={city.id}>{visitLabel(trip.cities, city.id)}</option>)}
            </select>
          </label>}
          {draft.linkType === 'place' && <label className="field">Atividade
            <select required value={draft.linkId} onChange={(e) => setDraft({ ...draft, linkId: e.target.value })}>
              <option value="">Escolha uma atividade</option>
              {places.map((place) => <option key={place.id} value={place.id}>{place.title}</option>)}
            </select>
          </label>}
          {draft.linkType === 'day' && <label className="field">Dia
            <input required type="date" min={trip.startDate} max={trip.endDate} value={draft.linkId}
              onChange={(e) => setDraft({ ...draft, linkId: e.target.value })} />
          </label>}
        </div>
        {missingLink && <p className="inline-error" role="status">O destino original não está mais nesta viagem. Sua nota privada foi preservada. Escolha outro destino ou vincule à viagem inteira antes de salvar.</p>}
        <p className="muted">Notas privadas pertencem à sua identidade, lembrada neste navegador. Outros participantes não podem lê-las pelo próprio acesso. O organizador e o administrador do servidor continuam sendo pessoas de confiança. Notas do grupo não aparecem nos links de família.</p>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <div className="actions">
          <button type="submit" className="button" disabled={busy}>Salvar nota</button>
          <button type="button" className="button secondary" onClick={onClose}>Cancelar</button>
        </div>
      </fieldset>
    </form>
  );
}
