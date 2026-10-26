import type { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { City } from '../../../shared/model';
import { useTrip } from '../../app/TripContext';
import { Icon } from '../../components/Icon';
import type { RouteActions } from './RouteBoard';

export function CityVisitCard({ city, index, activityCount, selected, disabled, conflict, actions, onSelect, children }: {
  city: City; index: number; activityCount: number; selected: boolean; disabled: boolean;
  conflict: boolean; actions: RouteActions; onSelect: (id: string) => void; children?: ReactNode;
}) {
  const { canEdit, snapshot } = useTrip();
  const cities = snapshot.data.trip.cities;
  const checkpointLabel = `${index + 1}: ${city.name}`;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: `visit:${city.id}`, data: { kind: 'visit', id: city.id }, disabled: disabled || !canEdit,
  });

  return <li ref={setNodeRef} className={`route-visit-item${isDragging ? ' is-dragging' : ''}`}
    style={{ transform: CSS.Transform.toString(transform), transition }} data-visit-id={city.id}>
    <div className={`route-visit${selected ? ' is-selected' : ''}`}>
      {canEdit ? <button ref={setActivatorNodeRef} className="route-drag-handle" type="button" disabled={disabled}
        {...attributes} {...listeners} id={`visit-handle-${city.id}`} aria-label={`Drag checkpoint ${checkpointLabel}`}
        title="Drag to reorder. Keyboard: Space, arrows, Space to drop.">
        <Icon name="grip" />
        <span className="checkpoint-number" aria-hidden="true">{index + 1}</span>
      </button> : <span className="checkpoint-marker" aria-hidden="true"><span className="checkpoint-number">{index + 1}</span></span>}
      <h2 className="checkpoint-heading"><button type="button" className="checkpoint-open" id={`checkpoint-${city.id}`} disabled={disabled}
        aria-label={`Checkpoint ${checkpointLabel}, ${activityCount} ${activityCount === 1 ? 'activity' : 'activities'}`} aria-expanded={selected}
        aria-controls={selected ? 'checkpoint-details' : undefined} onClick={() => onSelect(city.id)}>
        <span className="checkpoint-copy">
          <span className="checkpoint-name">{city.name}</span>
          <span className="checkpoint-count">{activityCount} {activityCount === 1 ? 'activity' : 'activities'}</span>
          {conflict && <span className="checkpoint-date-warning">Review dates</span>}
        </span>
        <svg className="checkpoint-chevron" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d={selected ? 'm4 6 4 4 4-4' : 'm6 4 4 4-4 4'} fill="none" stroke="currentColor" strokeWidth={selected ? 2.5 : 1.5} />
        </svg>
      </button></h2>
      {selected && canEdit && <details className="route-menu">
        <summary aria-label={`Actions for checkpoint ${checkpointLabel}`} aria-disabled={disabled}
          onClick={event => { if (disabled) event.preventDefault(); }}>···</summary>
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
          <button type="button" className="button ghost" disabled={disabled || cities.length >= 30}
            onClick={event => actions.insert(city.id, event.currentTarget)}>Insert checkpoint before</button>
          <button type="button" className="button ghost" disabled={disabled || cities.length >= 30}
            onClick={event => actions.insert(cities[index + 1]?.id ?? null, event.currentTarget)}>Insert checkpoint after</button>
        </div>
      </details>}
    </div>
    {children}
  </li>;
}
