import { useState } from 'react';
import type { City, Place } from '../../../shared/model';
import { useTrip } from '../../app/TripContext';
import { formatTripDate, sortEvents } from '../calendar/itinerary';
import { ActivityCard } from './ActivityCard';
import { PlaceSuggestions } from './PlaceSuggestions';
import { QuickAddActivity } from './QuickAddActivity';
import type { RouteActions } from './RouteBoard';

export function CheckpointDetails({ city, places, disabled, actions, unscheduledFirst = false }: {
  city: City; places: Place[]; disabled: boolean;
  actions: RouteActions;
  unscheduledFirst?: boolean;
}) {
  const { snapshot, canEdit, busy } = useTrip();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [onlyUnscheduled, setOnlyUnscheduled] = useState(unscheduledFirst);
  const events = sortEvents(snapshot.data.events.filter(event => event.cityId === city.id));
  const filtering = !!(search.trim() || category || status || onlyUnscheduled);
  const visible = places.filter(place => (!onlyUnscheduled || !snapshot.data.events.some(event => event.placeId === place.id)) &&
    `${place.title} ${place.description} ${place.address}`.toLowerCase().includes(search.trim().toLowerCase()) &&
    (!category || place.category === category) && (!status || place.status === status));
  // The panel stays beside its controlling heading in the same list item.
  // https://www.w3.org/WAI/ARIA/apg/patterns/accordion/
  return <section id="checkpoint-details" className="checkpoint-details" data-checkpoint-id={city.id}
    aria-labelledby={`checkpoint-${city.id}`}>
    {unscheduledFirst && <label className="roteiro-unscheduled-filter"><input type="checkbox" checked={!onlyUnscheduled}
      onChange={event => setOnlyUnscheduled(!event.target.checked)} /> Mostrar também atividades agendadas</label>}
    {events.length > 0 && !unscheduledFirst && <div className="checkpoint-facts">
      <span>{formatTripDate(events[0].date)}</span>
    </div>}
    {places.length > 0 && <details className="checkpoint-filters">
      <summary>Buscar atividade</summary>
      <div className="checkpoint-filter-fields">
        <div className="field"><label htmlFor="checkpoint-search">Buscar atividades</label>
          <input id="checkpoint-search" type="search" value={search} placeholder="Nome, endereço ou observações"
            onChange={event => setSearch(event.target.value)} /></div>
        <div className="field"><label htmlFor="checkpoint-category">Categoria</label>
          <select id="checkpoint-category" value={category} onChange={event => setCategory(event.target.value)}>
            <option value="">Todas as categorias</option><option value="walk">Caminhada</option><option value="museum">Museu</option>
            <option value="food">Comida</option><option value="sight">Atração</option><option value="other">Outra</option>
          </select></div>
        <div className="field"><label htmlFor="checkpoint-status">Situação</label>
          <select id="checkpoint-status" value={status} onChange={event => setStatus(event.target.value)}>
            <option value="">Todas</option><option value="idea">Ideia</option>
            <option value="planned">Planejada</option><option value="visited">Visitada</option>
          </select></div>
      </div>
      {filtering && <div className="actions">
        <span className="muted" role="status">{visible.length} de {places.length} atividades</span>
        <button className="button ghost" type="button" onClick={() => {
          setSearch(''); setCategory(''); setStatus(''); setOnlyUnscheduled(false);
        }}>Limpar filtros</button>
      </div>}
    </details>}
    <div className="visit-activities">
      {visible.map(place => <ActivityCard key={place.id} place={place} disabled={disabled || busy} actions={actions} />)}
      {!visible.length && (filtering || !canEdit) && <p className="checkpoint-empty">{filtering ?
        'Nenhuma atividade corresponde aos filtros desta parada.' : 'Nenhuma atividade compartilhada nesta parada.'}</p>}
    </div>
    {canEdit && <QuickAddActivity city={city} disabled={disabled} onFullForm={actions.addActivity} />}
    {canEdit && <PlaceSuggestions cityId={city.id} formOpen={disabled} />}
  </section>;
}
