import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Place } from '../../../shared/model';
import { visitLabel } from '../../../shared/route';
import { useTrip } from '../../app/TripContext';
import type { RouteActions } from './RouteBoard';

export function ActivityCard({ place, disabled, reorderingDisabled, actions }: {
  place: Place; disabled: boolean; reorderingDisabled: boolean; actions: RouteActions;
}) {
  const { snapshot, canEdit } = useTrip();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: `activity:${place.id}`, data: { kind: 'activity', id: place.id, cityId: place.cityId }, disabled: reorderingDisabled || !canEdit,
  });
  const siblings = snapshot.data.places.filter(item => item.cityId === place.cityId);
  const index = siblings.findIndex(item => item.id === place.id);
  const dates = snapshot.data.events.filter(event => event.placeId === place.id);
  const status = { idea: 'Idea', planned: 'Planned', visited: 'Visited' }[place.status];

  return <article ref={setNodeRef} className={`route-activity${isDragging ? ' is-dragging' : ''}`}
    style={{ transform: CSS.Transform.toString(transform), transition }} data-activity-id={place.id}>
    <div className="route-activity-heading">
      {canEdit && <button ref={setActivatorNodeRef} className="route-drag-handle" type="button" disabled={reorderingDisabled}
        {...attributes} {...listeners} id={`activity-handle-${place.id}`} aria-label={`Drag activity ${place.title}`}>⠿</button>}
      <h3><button type="button" className="activity-title" disabled={disabled}
        onClick={event => actions.details(place, event.currentTarget)}>{place.title}</button></h3>
      {canEdit && <details className="route-menu">
        <summary aria-label={`Actions for ${place.title}`}>···</summary>
        <div className="route-menu-content">
          <button className="button ghost" disabled={disabled} type="button"
            onClick={event => actions.edit(place, event.currentTarget)}>Edit activity</button>
          <button className="button ghost" disabled={reorderingDisabled || index === 0} type="button"
            onClick={() => actions.moveActivity(place.id, place.cityId, siblings[index - 1].id)}>Move earlier</button>
          <button className="button ghost" disabled={reorderingDisabled || index === siblings.length - 1} type="button"
            onClick={() => actions.moveActivity(place.id, place.cityId, siblings[index + 2]?.id ?? null)}>Move later</button>
          <label htmlFor={`move-${place.id}`}>Move to visit</label>
          <select id={`move-${place.id}`} value={place.cityId} disabled={reorderingDisabled}
            onChange={event => actions.moveActivity(place.id, event.target.value, null)}>
            {snapshot.data.trip.cities.map(city => <option key={city.id} value={city.id}>
              {visitLabel(snapshot.data.trip.cities, city.id)}
            </option>)}
          </select>
        </div>
      </details>}
    </div>
    <p className="activity-meta">{status} <span aria-hidden="true">/</span> {place.durationMinutes} min</p>
    {dates.length > 0 && <p className="activity-calendar">{dates.length} scheduled {dates.length === 1 ? 'plan' : 'plans'}</p>}
    {canEdit && <button className="activity-schedule" type="button" disabled={disabled}
      onClick={event => actions.schedule(place, event.currentTarget)}>
      {dates.length ? 'Schedule another visit' : 'Add to calendar'}
    </button>}
  </article>;
}
