import { useTrip } from '../../app/TripContext';

export function FamilyPreview({ eventIds, placeIds }: { eventIds: string[]; placeIds: string[] }) {
  const { snapshot } = useTrip();
  const { events, places, trip } = snapshot.data;
  const selectedEvents = events.filter((event) => event.kind !== 'stay' && eventIds.includes(event.id));
  const selectedPlaces = places.filter((place) => placeIds.includes(place.id));
  return (
    <section className="sharing-preview stack" aria-label="Family content preview">
      <h3>Family view preview</h3>
      <p className="muted">The trip title, full trip dates and all city names are always shared in family mode, even when no events or places are selected. Selected event and place details are shared in addition to this trip summary.</p>
      <div className="stack">
        <h4>Always-shared trip summary</h4>
        <strong>{trip.title}</strong>
        <p><time dateTime={trip.startDate}>{trip.startDate}</time> to <time dateTime={trip.endDate}>{trip.endDate}</time></p>
        <p>All cities: {trip.cities.map((city) => city.name).join(', ') || 'No cities added yet.'}</p>
      </div>
      <p className="muted">Notes, checklists and exact stays are excluded. Event descriptions and place addresses are not included.</p>
      {selectedEvents.length === 0 && selectedPlaces.length === 0 && <p className="empty-state">No events or places selected. The family link will still show the trip summary above.</p>}
      {selectedEvents.length > 0 && <ul className="sharing-preview-list">
        {selectedEvents.map((event) => <li key={event.id}>
          <strong>{event.title}</strong>
          <p>{event.date} · {event.startTime}{event.endTime ? ` to ${event.endTime}` : ''} · {trip.cities.find((city) => city.id === event.cityId)?.name ?? 'City unavailable'}</p>
        </li>)}
      </ul>}
      {selectedPlaces.length > 0 && <ul className="sharing-preview-list">
        {selectedPlaces.map((place) => <li key={place.id}><strong>{place.title}</strong> · {place.category}</li>)}
      </ul>}
    </section>
  );
}
