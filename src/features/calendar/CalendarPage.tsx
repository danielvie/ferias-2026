import { useEffect, useRef, useState } from 'react';
import type { TripEvent } from '../../../shared/model';
import { useTrip } from '../../app/TripContext';
import { EventForm } from './EventForm';
import { emptyEvent, formatTripDate, overlappingEvents, shiftTripDate, sortEvents } from './itinerary';
import './calendar.css';

export function CalendarPage() {
  const { snapshot, canEdit, busy, command, navigate } = useTrip();
  const { trip, events, places } = snapshot.data;
  const [selectedDate, setSelectedDate] = useState(trip.startDate);
  const [view, setView] = useState<'day' | 'agenda'>('day');
  const [form, setForm] = useState<{ event: TripEvent; editing: boolean } | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const deleting = useRef(false);
  const date = selectedDate < trip.startDate ? trip.startDate :
    selectedDate > trip.endDate ? trip.endDate : selectedDate;
  const visible = sortEvents(events.filter(event => view === 'agenda' || event.date === date));
  const dates = [...new Set(visible.map(event => event.date))];

  useEffect(() => {
    if (!form) trigger.current?.focus();
  }, [form]);

  function openForm(event: TripEvent, editing: boolean, button: HTMLButtonElement) {
    trigger.current = button;
    setForm({ event, editing });
  }
  function closeForm() {
    setForm(null);
  }
  async function deleteEvent(event: TripEvent) {
    if (busy || deleting.current || !canEdit || !window.confirm(`Delete "${event.title}" from the calendar?`)) return;
    deleting.current = true;
    try {
      if (await command({ type: 'event.delete', id: event.id })) {
        if (form?.event.id === event.id) closeForm();
      }
    } finally {
      deleting.current = false;
    }
  }

  return (
    <div className="stack calendar-page">
      <header className="page-heading">
        <div><p className="eyebrow">Your itinerary</p><h1>Make room for Belgium</h1>
          <p className="muted">Plan the day, leave room to wander. All times use Europe/Brussels.</p></div>
        {canEdit && <button className="button" disabled={busy || !!form} type="button"
          onClick={event => openForm(emptyEvent(trip.cities[0]?.id ?? '', date), false, event.currentTarget)}>
          Add event
        </button>}
      </header>
      {!canEdit && <p className="muted">Read-only itinerary. A trip owner or editor can change these plans.</p>}
      {canEdit && form && <EventForm key={form.event.id} initial={form.event}
        editing={form.editing} onClose={closeForm} />}
      <section className="panel stack" aria-label="Trip calendar">
        <div className="toolbar calendar-controls">
          <div className="actions" aria-label="Calendar view">
            <button className={`button ${view === 'day' ? '' : 'secondary'}`} type="button"
              aria-pressed={view === 'day'} onClick={() => setView('day')}>Day</button>
            <button className={`button ${view === 'agenda' ? '' : 'secondary'}`} type="button"
              aria-pressed={view === 'agenda'} onClick={() => setView('agenda')}>Agenda</button>
          </div>
          {view === 'day' && <div className="calendar-day-navigation">
            <button className="button ghost" type="button" disabled={date <= trip.startDate}
              aria-label="Previous trip day" onClick={() => setSelectedDate(shiftTripDate(date, -1))}>←</button>
            <div className="field">
              <label htmlFor="calendar-selected-date">Trip day</label>
              <input id="calendar-selected-date" type="date" value={date} min={trip.startDate} max={trip.endDate}
                onChange={event => {
                  if (event.target.value >= trip.startDate && event.target.value <= trip.endDate) {
                    setSelectedDate(event.target.value);
                  }
                }} />
            </div>
            <button className="button ghost" type="button" disabled={date >= trip.endDate}
              aria-label="Next trip day" onClick={() => setSelectedDate(shiftTripDate(date, 1))}>→</button>
          </div>}
        </div>
        <p className="muted">{formatTripDate(trip.startDate)} to {formatTripDate(trip.endDate)}</p>
        {visible.length === 0 ? <div className="empty-state">
          <h2>{view === 'day' ? 'This day is still open' : 'Your itinerary starts here'}</h2>
          <p>{canEdit ? 'Add an event or find an idea in your saved places.' : 'No events have been shared here yet.'}</p>
          <div className="actions">
            {canEdit && <button className="button" type="button" disabled={busy || !!form}
              onClick={event => openForm(emptyEvent(trip.cities[0]?.id ?? '', date), false, event.currentTarget)}>
              Add an event
            </button>}
            <button className="button secondary" type="button" onClick={() => navigate('places')}>Browse saved places</button>
          </div>
        </div> : dates.map(day => <section className="calendar-day stack" key={day} aria-labelledby={`day-${day}`}>
          <h2 id={`day-${day}`}>{formatTripDate(day)}</h2>
          <ol className="calendar-events">
            {visible.filter(event => event.date === day).map(event => {
              const city = trip.cities.find(item => item.id === event.cityId);
              const place = places.find(item => item.id === event.placeId);
              return <li key={event.id} className="calendar-event">
                <div className="calendar-event-time"><time dateTime={`${day}T${event.startTime}`}>{event.startTime}</time>
                  <span> to </span><time dateTime={`${day}T${event.endTime}`}>{event.endTime}</time></div>
                <div className="stack calendar-event-content">
                  <div><p className="eyebrow">{city?.name ?? 'City unavailable'} · {event.kind}</p><h3>{event.title}</h3></div>
                  <div className="actions"><span className="badge">{event.status === 'planned' ? 'Planned' : 'Tentative'}</span>
                    {overlappingEvents(event, events).length > 0 && <span className="badge">Time overlap</span>}</div>
                  {event.description && <p className="calendar-description">{event.description}</p>}
                  {place && <p className="muted">Saved place: {place.title}</p>}
                  <div className="actions">
                    {place && <button className="button ghost" type="button" onClick={() => navigate('places')}>View saved places</button>}
                    {event.kind === 'transport' && snapshot.session.role !== 'family' &&
                      <button className="button ghost" type="button" onClick={() => navigate('checklists')}>Departure checklists</button>}
                    {canEdit && <>
                      <button className="button secondary" type="button" disabled={busy || !!form}
                        aria-label={`Edit ${event.title}`} onClick={click => openForm(event, true, click.currentTarget)}>Edit</button>
                      <button className="button ghost" type="button" disabled={busy}
                        aria-label={`Delete ${event.title}`} onClick={() => void deleteEvent(event)}>Delete</button>
                    </>}
                  </div>
                </div>
              </li>;
            })}
          </ol>
        </section>)}
      </section>
      <p className="muted">Check transport times and opening hours before booking.</p>
    </div>
  );
}
