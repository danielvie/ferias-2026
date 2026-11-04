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
  useNavigationGuard(busy || saving);
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
        setError('A movimentação não foi confirmada. Suas escolhas foram mantidas. Revise a rota e tente novamente.');
      }
    } finally { submitting.current = false; setSaving(false); }
  }

  return <form className="stack activity-move-form" onSubmit={submit}>
    <div><h3>{place.title}</h3>
      <p className="muted">De {visitLabel(trip.cities, current?.cityId ?? place.cityId)}</p></div>
    <fieldset className="places-form-fields stack" disabled={busy || saving || !canEdit}>
      <legend className="visually-hidden">Destino da atividade</legend>
      <div className="field">
        <label htmlFor={`${id}-visit`}>Parada de destino</label>
        <select id={`${id}-visit`} value={cityId} required autoFocus onChange={event => {
          setCityId(event.target.value); setBeforeId(null);
        }}>
          {!destination && <option value={cityId} disabled>Parada indisponível</option>}
          {trip.cities.map((city, index) => <option key={city.id} value={city.id}>
            {index + 1}. {city.name}{city.id === current?.cityId ? ' / parada atual' : ''}
          </option>)}
        </select>
        <small>{destinationActivities.length} {destinationActivities.length === 1 ? 'outra atividade' : 'outras atividades'} nesta parada.</small>
      </div>
      <div className="field">
        <label htmlFor={`${id}-position`}>Posição</label>
        <select id={`${id}-position`} value={beforeId ?? ''} aria-invalid={missingPosition || undefined}
          onChange={event => setBeforeId(event.target.value || null)}>
          <option value="">No final</option>
          {missingPosition && <option value={beforeId!} disabled>Atividade indisponível</option>}
          {destinationActivities.map((activity, index) => <option key={activity.id} value={activity.id}>
            Antes de {index + 1}. {activity.title}
          </option>)}
        </select>
        {missingPosition && <small>Escolha outra posição nesta parada.</small>}
      </div>
      {differentCity && <div className="places-warning">
        Esta é outra cidade. Confira o endereço e as reservas antes de mover.
        {place.address && <p>Endereço mantido: {place.address}</p>}
      </div>}
      <p className="muted">{scheduled ? `${scheduled} ${scheduled === 1 ? 'agendamento acompanha' : 'agendamentos acompanham'} a atividade até a parada de destino. ` : ''}
        Datas e horários não mudam. Detalhes, notas e links continuam vinculados.</p>
      {unchanged && <p className="fine-print">Escolha outra parada ou posição para mover a atividade.</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="actions">
        <button className="button" type="submit" disabled={!current || !destination || missingPosition || unchanged}>
          {saving ? 'Movendo…' : 'Mover atividade'}
        </button>
        <button className="button secondary" type="button" onClick={onClose}>Cancelar</button>
      </div>
    </fieldset>
  </form>;
}
