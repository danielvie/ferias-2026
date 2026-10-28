import { useState } from 'react';
import type { City, Place } from '../../../shared/model';
import { useTrip } from '../../app/TripContext';
import { formatTripDate, sortEvents } from '../calendar/itinerary';
import { ActivityCard } from './ActivityCard';
import { CityDates } from './CityDates';
import { PlaceSuggestions } from './PlaceSuggestions';
import { QuickAddActivity } from './QuickAddActivity';
import type { RouteActions } from './RouteBoard';

export function CheckpointDetails({ city, places, disabled, actions }: {
  city: City; places: Place[]; disabled: boolean;
  actions: RouteActions;
}) {
  const { snapshot, canEdit, busy } = useTrip();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const events = sortEvents(snapshot.data.events.filter(event => event.cityId === city.id));
  const filtering = !!(search.trim() || category || status);
  const visible = places.filter(place =>
    `${place.title} ${place.description} ${place.address}`.toLowerCase().includes(search.trim().toLowerCase()) &&
    (!category || place.category === category) && (!status || place.status === status));
  // The panel stays beside its controlling heading in the same list item.
  // https://www.w3.org/WAI/ARIA/apg/patterns/accordion/
  return <section id="checkpoint-details" className="checkpoint-details" data-checkpoint-id={city.id}
    aria-labelledby={`checkpoint-${city.id}`}>
    <CityDates city={city} disabled={disabled} />
    {events.length > 0 && <div className="checkpoint-facts">
      <span>{formatTripDate(events[0].date)}</span>
    </div>}
    {places.length > 0 && <details className="checkpoint-filters">
      <summary>Find an activity</summary>
      <div className="checkpoint-filter-fields">
        <div className="field"><label htmlFor="checkpoint-search">Search activities</label>
          <input id="checkpoint-search" type="search" value={search} placeholder="Name, address or notes"
            onChange={event => setSearch(event.target.value)} /></div>
        <div className="field"><label htmlFor="checkpoint-category">Category</label>
          <select id="checkpoint-category" value={category} onChange={event => setCategory(event.target.value)}>
            <option value="">All categories</option><option value="walk">Walk</option><option value="museum">Museum</option>
            <option value="food">Food</option><option value="sight">Sight</option><option value="other">Other</option>
          </select></div>
        <div className="field"><label htmlFor="checkpoint-status">Status</label>
          <select id="checkpoint-status" value={status} onChange={event => setStatus(event.target.value)}>
            <option value="">All statuses</option><option value="idea">Idea</option>
            <option value="planned">Planned</option><option value="visited">Visited</option>
          </select></div>
      </div>
      {filtering && <div className="actions">
        <span className="muted" role="status">{visible.length} of {places.length} activities</span>
        <button className="button ghost" type="button" onClick={() => {
          setSearch(''); setCategory(''); setStatus('');
        }}>Clear filters</button>
      </div>}
    </details>}
    <div className="visit-activities">
      {visible.map(place => <ActivityCard key={place.id} place={place} disabled={disabled || busy} actions={actions} />)}
      {!visible.length && (filtering || !canEdit) && <p className="checkpoint-empty">{filtering ?
        'No matching activities in this checkpoint.' : 'No activities shared for this checkpoint.'}</p>}
    </div>
    {canEdit && <QuickAddActivity city={city} disabled={disabled} onFullForm={actions.addActivity} />}
    {canEdit && <PlaceSuggestions cityId={city.id} formOpen={disabled} />}
  </section>;
}
