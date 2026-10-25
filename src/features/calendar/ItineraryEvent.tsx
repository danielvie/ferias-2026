import type { TripEvent } from '../../../shared/model';
import { visitLabel } from '../../../shared/route';
import { useTrip } from '../../app/TripContext';
import { overlappingEvents } from './itinerary';

export function ItineraryEvent({ event, editing, onEdit, onDelete }: {
  event: TripEvent;
  editing: boolean;
  onEdit: (button: HTMLButtonElement) => void;
  onDelete: () => void;
}) {
  const { snapshot, canEdit, busy, navigate } = useTrip();
  const { trip, places, events } = snapshot.data;
  const place = places.find((item) => item.id === event.placeId);
  return <li className="calendar-event">
    <div className="calendar-event-time">
      <time dateTime={`${event.date}T${event.startTime}`}>{event.startTime}</time>
      <span>–{event.endTime}</span>
    </div>
    <div className="calendar-event-content">
      <h3>{event.title}</h3>
      <p className="event-meta">{visitLabel(trip.cities, event.cityId)} <span> / </span>
        {event.kind} <span> / </span>{event.status === 'planned' ? 'Planned' : 'Tentative'}</p>
      {overlappingEvents(event, events).length > 0 && <p className="calendar-overlap">Time overlap with another activity</p>}
      {event.description && <p className="calendar-description">{event.description}</p>}
      {place && <p className="muted">Saved place: {place.title}</p>}
      <div className="actions event-actions">
        {place && <button className="button ghost" type="button" onClick={() => navigate('places')}>View saved places</button>}
        {event.kind === 'transport' && snapshot.session.role !== 'family' &&
          <button className="button ghost" type="button" onClick={() => navigate('checklists')}>Departure checklists</button>}
        {canEdit && <>
          <button className="button ghost" type="button" disabled={busy || editing}
            aria-label={`Edit ${event.title}`} onClick={(click) => onEdit(click.currentTarget)}>Edit</button>
          <button className="button ghost" type="button" disabled={busy || editing}
            aria-label={`Delete ${event.title}`} onClick={onDelete}>Delete</button>
        </>}
      </div>
    </div>
  </li>;
}
