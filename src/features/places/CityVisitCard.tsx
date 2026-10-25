import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { City } from '../../../shared/model';
import { visitLabel } from '../../../shared/route';
import { useTrip } from '../../app/TripContext';
import type { RouteActions } from './RouteBoard';

export function CityVisitCard({ city, index, activityCount, selected, disabled, conflict, actions, onSelect }: {
  city: City; index: number; activityCount: number; selected: boolean; disabled: boolean;
  conflict: boolean; actions: RouteActions; onSelect: (id: string) => void;
}) {
  const { snapshot, canEdit } = useTrip();
  const cities = snapshot.data.trip.cities;
  const label = visitLabel(cities, city.id);
  const checkpointLabel = `${index + 1}: ${city.name}`;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: `visit:${city.id}`, data: { kind: 'visit', id: city.id }, disabled: disabled || !canEdit,
  });

  return <li ref={setNodeRef} className={`route-visit-item${isDragging ? ' is-dragging' : ''}`}
    style={{ transform: CSS.Transform.toString(transform), transition }} data-visit-id={city.id}>
    <div className={`route-visit${selected ? ' is-selected' : ''}`}>
      {canEdit && <button ref={setActivatorNodeRef} className="route-drag-handle" type="button" disabled={disabled}
        {...attributes} {...listeners} id={`visit-handle-${city.id}`} aria-label={`Drag checkpoint ${checkpointLabel}`}>⠿</button>}
      <button type="button" className="checkpoint-open" id={`checkpoint-${city.id}`} disabled={disabled}
        aria-label={`Checkpoint ${checkpointLabel}, ${activityCount} ${activityCount === 1 ? 'activity' : 'activities'}`} aria-expanded={selected}
        aria-controls={selected && !disabled ? 'checkpoint-details' : undefined} onClick={() => onSelect(city.id)}>
        <span className="checkpoint-name"><span className="checkpoint-number">{index + 1}</span>{' '}{city.name}</span>
        <span className="checkpoint-count">{activityCount} {activityCount === 1 ? 'activity' : 'activities'}</span>
        {conflict && <span className="checkpoint-date-warning">Review dates</span>}
      </button>
      {canEdit && <details className="route-menu">
        <summary aria-label={`Actions for checkpoint ${checkpointLabel}`}>···</summary>
        <div className="route-menu-content">
          <button type="button" className="button ghost" disabled={disabled || index === 0}
            onClick={event => {
              event.currentTarget.closest('details')?.removeAttribute('open');
              actions.moveVisit(city.id, cities[index - 1].id);
            }}>Move earlier</button>
          <button type="button" className="button ghost" disabled={disabled || index === cities.length - 1}
            onClick={event => {
              event.currentTarget.closest('details')?.removeAttribute('open');
              actions.moveVisit(city.id, cities[index + 2]?.id ?? null);
            }}>Move later</button>
        </div>
      </details>}
    </div>
    {index < cities.length - 1 && <>
      <svg className="checkpoint-connector" aria-hidden="true" focusable="false">
        <line x1={index % 2 ? '75%' : '25%'} y1="0" x2={index % 2 ? '25%' : '75%'} y2="100%" />
      </svg>
      {canEdit && <button type="button" className="route-insert" disabled={disabled || cities.length >= 30}
        aria-label={`Insert checkpoint after ${label}`}
        onClick={event => actions.insert(cities[index + 1].id, event.currentTarget)}>+</button>}
    </>}
  </li>;
}
