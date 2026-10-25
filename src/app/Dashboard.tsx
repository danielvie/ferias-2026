import type { ReactNode } from 'react';
import { checklistStrategies } from '../../shared/checklists';
import type { Page, TripSnapshot } from '../../shared/model';
import { brusselsTime, brusselsToday, displayDate } from './dates';
import { Icon } from '../components/Icon';

interface Props {
  snapshot: TripSnapshot | null;
  onNavigate: (page: Page) => void;
  onDetails: () => void;
  detailsPanel?: ReactNode;
}

export function Dashboard({ snapshot, onNavigate, onDetails, detailsPanel }: Props) {
  const trip = snapshot?.data.trip;
  const { events = [], notes = [], transfers = [], packing = [] } = snapshot?.data ?? {};
  const family = snapshot?.session.role === 'family';
  const canEdit = !snapshot || ['owner', 'editor'].includes(snapshot.session.role);
  const today = brusselsToday();
  const now = brusselsTime();
  const greeting = now < '12:00' ? 'Good morning' : now < '18:00' ? 'Good afternoon' : 'Good evening';
  const upcoming = [...events].sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
  const remaining = upcoming.filter((event) => event.date > today || (event.date === today && event.endTime > now));
  const next = remaining[0];
  const move = [...transfers].filter((transfer) => transfer.date > today || (transfer.date === today && transfer.time >= now)).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0];
  const packed = packing.filter((item) => item.status === 'done').length;
  const cityName = (id: string) => trip?.cities.find((city) => city.id === id)?.name || '';
  const sharedNote = [...notes].filter((note) => note.visibility === 'trip').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const members = snapshot?.members.filter((member) => member.role !== 'family').map((member) => member.name) ?? [];
  return <div className="dashboard stack">
    <header className="home-heading">
      <div>
        <h1>{family ? 'Trip overview' : snapshot ? `${greeting}, ${snapshot.session.name}.` : 'Today'}</h1>
        <p className="muted">{family ? 'Shared trip summary, selected plans and places.' : snapshot ? `Trip members: ${members.join(', ')}` : 'Your plans, notes and travel checks in one place.'}</p>
        {trip && <p className="trip-summary">{trip.title} · {displayDate(trip.startDate)} to {displayDate(trip.endDate, { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
      </div>
      {canEdit && <button id="trip-details-button" className="button secondary" onClick={onDetails}>{trip ? 'Edit trip details' : 'Add trip details'}</button>}
    </header>
    {detailsPanel}
    <div className={`home-primary ${family ? 'family-primary' : ''}`}>
      <section className="panel home-next" aria-labelledby="next-plan-heading">
        <h2 id="next-plan-heading">Up next</h2>
        {next ? <>
          <p className="plan-time">{displayDate(next.date)} · {next.startTime} to {next.endTime}</p>
          <h3>{next.title}</h3><p className="muted">{cityName(next.cityId)} · {next.status}</p>
        </> : <><h3>{upcoming.length ? 'No upcoming plans' : 'No plans yet'}</h3><p className="muted">{trip ? 'Add an activity to your calendar or choose a saved place.' : 'Add trip details here, then start planning your days.'}</p></>}
        <div className="actions">
          <button className="button secondary" onClick={() => onNavigate('calendar')}>{next ? 'Open plan' : canEdit ? 'Plan a day' : 'View calendar'}</button>
          {!family && canEdit && <button className="button ghost" onClick={() => onNavigate('notes')}>+ Quick note</button>}
        </div>
      </section>
      {!family && <section className="panel home-departure" aria-labelledby="departure-heading">
        <h2 id="departure-heading">Before the next move</h2>
        {move ? <>
          <h3>{cityName(move.fromCityId)} → {cityName(move.toCityId)}</h3>
          <p>{displayDate(move.date)} at {move.time}</p>
          <p className="muted">{move.items.filter((item) => item.status !== 'pending').length} of {move.items.length} checks resolved{checklistStrategies.departure.isReady(move.items) ? ' · Ready to go' : ''}</p>
        </> : <><h3>No move planned</h3><p className="muted">Create a departure for each move between cities.</p>{packing.length > 0 && <p>{packed} of {packing.length} packing items ready</p>}</>}
        <div className="actions"><button className="button secondary" onClick={() => onNavigate('checklists')}>{move ? 'Open departure checklist' : 'Open checklists'}</button></div>
      </section>}
    </div>
    <section className="home-route" aria-labelledby="route-heading">
      <div className="panel-header"><h2 id="route-heading">Your route</h2><span className="muted">Cities in trip order</span></div>
      {trip ? <ol className="city-route">{trip.cities.map((city, index) => {
        const count = events.filter((event) => event.cityId === city.id).length;
        return <li key={city.id}>
          <button className="route-stop" onClick={() => onNavigate('places')} aria-label={`Explore places in ${city.name}`}><strong>{city.name}</strong><span>{count} {count === 1 ? 'plan' : 'plans'}</span></button>
          {index < trip.cities.length - 1 && <Icon name="arrow" />}
        </li>;
      })}</ol> : <div className="route-placeholder"><p>No cities added yet.</p><button className="button ghost" onClick={onDetails}>Add cities in trip details</button></div>}
    </section>
    {!family && <section className="home-note" aria-labelledby="shared-note-heading">
      <div className="shared-note-line"><h2 id="shared-note-heading">Latest shared note</h2>{sharedNote ? <p><strong>{sharedNote.authorName}:</strong> {sharedNote.title} <span className="muted">· {sharedNote.body}</span></p> : <p className="muted">No shared notes yet.</p>}<button className="button ghost" onClick={() => onNavigate('notes')}>All notes</button></div>
      {canEdit && <div className="quick-add"><span>Quick add:</span><button className="button ghost" onClick={() => onNavigate('places')}>Place</button><button className="button ghost" onClick={() => onNavigate('notes')}>Note</button><button className="button ghost" onClick={() => onNavigate('calendar')}>Event</button><button className="button ghost" onClick={() => onNavigate('checklists')}>Checklist item</button></div>}
    </section>}
  </div>;
}
