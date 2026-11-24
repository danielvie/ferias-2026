import { useRef, useState } from 'react';
import type { Place } from '../../../shared/model';
import { useTrip } from '../../app/TripContext';
import { formatTripDate, sortEvents } from '../calendar/itinerary';
import { isWebUrl } from './PlaceForm';

export function PlaceCard({ place, formOpen, onEdit, onSchedule }: {
  place: Place;
  formOpen: boolean;
  onEdit: (button: HTMLButtonElement) => void;
  onSchedule: (button: HTMLButtonElement) => void;
}) {
  const { snapshot, canEdit, busy, command, navigate } = useTrip();
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const city = snapshot.data.trip.cities.find(item => item.id === place.cityId);
  const visits = sortEvents(snapshot.data.events.filter(event => event.placeId === place.id));
  const destination = [place.address || place.title, city?.name].filter(Boolean).join(', ');
  const status = { idea: 'Ideia', planned: 'Planejada', visited: 'Visitada' }[place.status];
  const disabled = busy || saving || formOpen;

  async function update(action: 'visit' | 'delete') {
    if (disabled || submitting.current || !canEdit) return;
    if (action === 'delete' && !window.confirm(`Excluir "${place.title}" das atividades salvas?`)) return;
    submitting.current = true;
    setSaving(true);
    try {
      await command(action === 'delete' ? { type: 'place.delete', id: place.id } :
        { type: 'place.save', place: { ...place, status: 'visited' } });
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <article className="panel stack place-card">
      <div className="panel-header">
        <div><p className="eyebrow">{city?.name ?? 'Parada indisponível'} · {place.category}</p><h2>{place.title}</h2></div>
        <span className="badge">{status}</span>
      </div>
      {place.description && <p className="place-description">{place.description}</p>}
      <dl className="place-facts">
        <div><dt>Duração</dt><dd>{place.durationMinutes} minutos</dd></div>
        <div><dt>Custo estimado</dt><dd>{place.cost || 'Não informado'}</dd></div>
        {place.address && <div><dt>Endereço</dt><dd>{place.address}</dd></div>}
      </dl>
      <div className="actions">
        <a className="button secondary" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`}
          target="_blank" rel="noopener noreferrer">Como chegar<span className="visually-hidden">, opens in a new tab</span></a>
        {place.url && isWebUrl(place.url) && <a className="button ghost" href={place.url} target="_blank" rel="noopener noreferrer">
          Site<span className="visually-hidden">, opens in a new tab</span>
        </a>}
      </div>
      {visits.length > 0 && <div className="place-visits">
        <h3>Na sua agenda</h3>
        <ul>{visits.map(visit => <li key={visit.id}>{formatTripDate(visit.date)} · {visit.startTime
          ? `${visit.startTime} a ${visit.endTime}` : 'Sem horário'}</li>)}</ul>
        <button className="button ghost" type="button" onClick={() => navigate('calendar')}>Ver agenda</button>
      </div>}
      {canEdit && <div className="actions">
        <button className="button" type="button" disabled={disabled} onClick={event => onSchedule(event.currentTarget)}>
          {visits.length ? 'Agendar outra visita' : 'Agendar'}
        </button>
        {place.status !== 'visited' && <button className="button secondary" type="button" disabled={disabled}
          onClick={() => void update('visit')}>Marcar como visitada</button>}
        <button className="button ghost" type="button" disabled={disabled}
          aria-label={`Editar ${place.title}`} onClick={event => onEdit(event.currentTarget)}>Editar</button>
        <button className="button ghost" type="button" disabled={disabled}
          aria-label={`Excluir ${place.title}`} onClick={() => void update('delete')}>Excluir</button>
      </div>}
    </article>
  );
}
