import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { City, Place } from '../../../shared/model';
import { visitLabel } from '../../../shared/route';
import { useTrip } from '../../app/TripContext';
import { formatTripDate, sortEvents } from '../calendar/itinerary';
import { ActivityCard } from './ActivityCard';
import type { RouteActions } from './RouteBoard';

export function CityVisitCard({ city, index, places, compact, disabled, reorderingDisabled, conflict, actions }: {
  city: City; index: number; places: Place[]; compact: boolean; disabled: boolean; reorderingDisabled: boolean; conflict: boolean; actions: RouteActions;
}) {
  const { snapshot, canEdit } = useTrip();
  const cities = snapshot.data.trip.cities;
  const label = visitLabel(cities, city.id);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: `visit:${city.id}`, data: { kind: 'visit', id: city.id }, disabled: reorderingDisabled || !canEdit,
  });
  const events = sortEvents(snapshot.data.events.filter(event => event.cityId === city.id));
  const previousSame = cities.slice(0, index).some(item => item.name.toLowerCase() === city.name.toLowerCase());

  return <li ref={setNodeRef} className={`route-visit-item${isDragging ? ' is-dragging' : ''}`}
    style={{ transform: CSS.Transform.toString(transform), transition }} data-visit-id={city.id}>
    <div className="route-track">
      <span className="route-number" aria-label={`Stop ${index + 1}`}>{index + 1}</span>
      {canEdit && index < cities.length - 1 && <button type="button" className="route-insert" disabled={disabled || cities.length >= 30}
        aria-label={`Insert visit after ${label}`}
        onClick={event => actions.insert(cities[index + 1].id, event.currentTarget)}>+</button>}
    </div>
    <section className="route-visit" aria-label={label}>
      <header className="route-visit-heading">
        {canEdit && <button ref={setActivatorNodeRef} className="route-drag-handle" type="button" disabled={reorderingDisabled}
          {...attributes} {...listeners} id={`visit-handle-${city.id}`} aria-label={`Drag visit ${label}`}>⠿</button>}
        <div><h2>{city.name}</h2>{!compact && <p className="visit-caption">{previousSame ? 'Return visit' : `Visit ${index + 1}`}</p>}</div>
        {canEdit && <details className="route-menu">
          <summary aria-label={`Actions for visit ${label}`}>···</summary>
          <div className="route-menu-content">
            <button type="button" className="button ghost" disabled={reorderingDisabled || index === 0}
              onClick={() => actions.moveVisit(city.id, cities[index - 1].id)}>Move earlier</button>
            <button type="button" className="button ghost" disabled={reorderingDisabled || index === cities.length - 1}
              onClick={() => actions.moveVisit(city.id, cities[index + 2]?.id ?? null)}>Move later</button>
          </div>
        </details>}
      </header>
      {!compact && <>
        <p className="visit-dates">{events.length ? formatTripDate(events[0].date) : 'Dates not set'}</p>
        {conflict && <span className="route-date-warning">Review dates</span>}
        <div className="visit-activities">
          {places.map(place => <ActivityCard key={place.id} place={place} disabled={disabled} actions={actions} />)}
          {!places.length && <p className="muted">{canEdit ? 'No activities yet.' : 'No activities shared for this visit.'}</p>}
        </div>
        {canEdit && <button type="button" className="button ghost visit-add-activity" disabled={disabled}
          onClick={event => actions.addActivity(city.id, event.currentTarget)}>+ Add activity</button>}
      </>}
    </section>
  </li>;
}
