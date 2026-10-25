import type { Place } from '../../../shared/model';
import { useTrip } from '../../app/TripContext';
import type { RouteActions } from './RouteBoard';

export function ActivityCard({ place, disabled, actions }: {
  place: Place; disabled: boolean; actions: RouteActions;
}) {
  const { snapshot, canEdit } = useTrip();
  const dates = snapshot.data.events.filter(event => event.placeId === place.id);
  const status = { idea: 'Idea', planned: 'Planned', visited: 'Visited' }[place.status];

  return <article className="route-activity" data-activity-id={place.id}>
    <div className="route-activity-heading">
      <h3><button type="button" className="activity-title" disabled={disabled}
        id={`activity-details-${place.id}`}
        onClick={event => actions.details(place, event.currentTarget)}>{place.title}</button></h3>
    </div>
    <p className="activity-meta">{status} <span aria-hidden="true">/</span> {place.durationMinutes} min</p>
    {dates.length > 0 && <p className="activity-calendar">{dates.length} scheduled {dates.length === 1 ? 'plan' : 'plans'}</p>}
    {canEdit && <div className="actions">
      <button className="button ghost activity-move" type="button" disabled={disabled}
        id={`activity-move-${place.id}`}
        onClick={event => actions.moveActivity(place, event.currentTarget)}>Move</button>
      <button className="activity-schedule" type="button" disabled={disabled}
        id={`activity-schedule-${place.id}`}
        onClick={event => actions.schedule(place, event.currentTarget)}>
        {dates.length ? 'Schedule another visit' : 'Add to calendar'}
      </button>
    </div>}
  </article>;
}
