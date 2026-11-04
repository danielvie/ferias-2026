import type { Place } from '../../../shared/model';
import { activityOutsideCityDates } from '../../../shared/route';
import { useTrip } from '../../app/TripContext';
import type { RouteActions } from './RouteBoard';

export function ActivityCard({ place, disabled, actions }: {
  place: Place; disabled: boolean; actions: RouteActions;
}) {
  const { snapshot, canEdit } = useTrip();
  const dates = snapshot.data.events.filter(event => event.placeId === place.id);
  const city = snapshot.data.trip.cities.find(item => item.id === place.cityId);
  const outsideCityDates = city && activityOutsideCityDates(city, place, dates);
  const status = { idea: 'Ideia', planned: 'Planejada', visited: 'Visitada' }[place.status];

  return <article className={`route-activity${outsideCityDates ? ' has-date-warning' : ''}`} data-activity-id={place.id}>
    <div className="route-activity-heading">
      <h3><button type="button" className="activity-title" disabled={disabled}
        id={`activity-details-${place.id}`} aria-label={place.title} aria-describedby={`activity-meta-${place.id}`}
        onClick={event => actions.details(place, event.currentTarget)}>
        <span>{place.title}</span>
        <span className="activity-meta" id={`activity-meta-${place.id}`}>{status} <span aria-hidden="true">/</span> {place.durationMinutes} min</span>
      </button></h3>
    </div>
    {dates.length > 0 && <p className="activity-calendar">{dates.length} {dates.length === 1 ? 'agendamento' : 'agendamentos'}</p>}
    {outsideCityDates && <p className="activity-date-warning">Agendada fora das datas da parada</p>}
    {canEdit && <div className="actions">
      <button className="button ghost activity-move" type="button" disabled={disabled}
        id={`activity-move-${place.id}`}
        onClick={event => actions.moveActivity(place, event.currentTarget)}>Mover</button>
      <button className="activity-schedule" type="button" disabled={disabled}
        id={`activity-schedule-${place.id}`}
        onClick={event => actions.schedule(place, event.currentTarget)}>
        {dates.length ? 'Agendar outra visita' : 'Agendar'}
      </button>
    </div>}
  </article>;
}
