import { useEffect, useRef, useState } from 'react';
import type { City, Place } from '../../../shared/model';
import { useTrip } from '../../app/TripContext';
import { ModalPane } from '../../components/ModalPane';
import { formatTripDate, sortEvents } from '../calendar/itinerary';
import { ActivityCard } from './ActivityCard';
import { PlaceSuggestions } from './PlaceSuggestions';
import type { RouteActions } from './RouteBoard';

export function CheckpointDetails({ city, index, places, conflict, disabled, actions, onClose, notice, onUndo }: {
  city: City; index: number; places: Place[]; conflict: boolean; disabled: boolean;
  actions: RouteActions; onClose: () => void; notice?: string; onUndo?: () => void;
}) {
  const { snapshot, canEdit, busy } = useTrip();
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 1000px)').matches);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const events = sortEvents(snapshot.data.events.filter(event => event.cityId === city.id));
  const filtering = !!(search.trim() || category || status);
  const visible = places.filter(place =>
    `${place.title} ${place.description} ${place.address}`.toLowerCase().includes(search.trim().toLowerCase()) &&
    (!category || place.category === category) && (!status || place.status === status));
  const title = `${index + 1}. ${city.name}`;

  // Keep the JS sheet/panel switch in step with CSS, including live resizing.
  // https://developer.mozilla.org/en-US/docs/Web/API/MediaQueryList/change_event
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1000px)');
    const update = () => setDesktop(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (desktop) heading.current?.focus({ preventScroll: true });
  }, [city.id, desktop]);

  // Inline edit/scheduling forms and the Move dialog temporarily replace the
  // phone sheet, rather than leaving those forms behind an inert backdrop.
  if (!desktop && disabled) return null;

  const content = <div id="checkpoint-details" className="checkpoint-details-content" data-checkpoint-id={city.id}>
    {!desktop && notice && <div className="route-notice checkpoint-sheet-notice" role="status">
      <span>{notice}</span>
      {onUndo && <button className="button ghost" type="button" disabled={busy} onClick={onUndo}>Undo move</button>}
    </div>}
    <div className="checkpoint-facts">
      <span>{places.length} {places.length === 1 ? 'activity' : 'activities'}</span>
      {events.length > 0 && <span>{formatTripDate(events[0].date)}</span>}
      {conflict && <span className="route-date-warning">Review dates</span>}
    </div>
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
      {!visible.length && <p className="checkpoint-empty">{filtering ? 'No matching activities in this checkpoint.' :
        canEdit ? 'No activities yet.' : 'No activities shared for this checkpoint.'}</p>}
    </div>
    {canEdit && <button type="button" className="button secondary visit-add-activity" disabled={disabled || busy}
      id={`checkpoint-add-${city.id}`} onClick={event => actions.addActivity(city.id, event.currentTarget)}>+ Add activity</button>}
    {canEdit && <details className="checkpoint-ideas">
      <summary>Activity ideas</summary>
      <PlaceSuggestions cityId={city.id} formOpen={disabled} />
    </details>}
  </div>;

  if (!desktop) return <ModalPane title={title} variant="sheet" onClose={onClose} busy={busy}>{content}</ModalPane>;
  return <section className="checkpoint-details" aria-labelledby="checkpoint-details-heading">
    <header className="checkpoint-details-heading">
      <h2 ref={heading} id="checkpoint-details-heading" tabIndex={-1}>{title}</h2>
      <button className="button ghost" type="button" disabled={busy} onClick={onClose}
        aria-label="Close checkpoint details">Close</button>
    </header>
    {content}
  </section>;
}
