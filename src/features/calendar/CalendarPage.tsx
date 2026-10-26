import { useEffect, useMemo, useRef, useState } from 'react';
import type { TripEvent } from '../../../shared/model';
import { routeDateConflicts, visitLabel } from '../../../shared/route';
import { useTrip } from '../../app/TripContext';
import { displayDate } from '../../app/dates';
import { EventForm } from './EventForm';
import { ItineraryEvent } from './ItineraryEvent';
import { DayRail } from './DayRail';
import { emptyEvent, sortEvents, tripDates } from './itinerary';
import './calendar.css';

export function CalendarPage() {
  const { snapshot, canEdit, busy, command, navigate } = useTrip();
  const { trip, events, transfers } = snapshot.data;
  const dates = useMemo(() => tripDates(trip), [trip.startDate, trip.endDate]);
  const days = useMemo(() => {
    const sorted = sortEvents(events);
    return dates.map((date) => ({ date, events: sorted.filter((event) => event.date === date) }));
  }, [dates, events]);
  const [form, setForm] = useState<{ event: TripEvent; editing: boolean } | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const deleting = useRef(false);
  const family = snapshot.session.role === 'family';
  const conflicts = routeDateConflicts(trip.cities, events);

  useEffect(() => {
    if (!form) trigger.current?.focus({ preventScroll: true });
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

  function jumpToDay(date: string) {
    if (busy) return false;
    trigger.current = null;
    setForm(null);
    requestAnimationFrame(() => {
      const heading = document.getElementById(`day-${date}`);
      if (!heading) return;
      heading?.focus({ preventScroll: true });
      const edge = (document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 100) + 24;
      window.scrollTo({ top: window.scrollY + heading.getBoundingClientRect().top - edge,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    });
    return true;
  }

  return <div className="calendar-page">
    <header className="itinerary-heading">
      <p className="muted">{family ? 'Shared itinerary' : 'Your itinerary'}</p>
      <h1>{trip.title}</h1>
      <p className="muted">{displayDate(trip.startDate)} to {displayDate(trip.endDate, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
      <p className="itinerary-cities">{trip.cities.map((city) => visitLabel(trip.cities, city.id)).join(' / ')}</p>
      {!canEdit && <p className="fine-print">{family ? 'Selected activities and places, shared by the owner.' : 'Read-only. An owner or editor can change the plans.'}</p>}
      {conflicts.length > 0 && <p className="calendar-overlap">
        Scheduled dates do not follow your route order. Review these plans; dates and bookings have not been moved.
      </p>}
    </header>
    <div className="itinerary-days">
      {days.map(({ date, events: dayEvents }) => {
        const cityNames = [...new Set(dayEvents.map((event) => visitLabel(trip.cities, event.cityId)))];
        const moves = family ? [] : transfers.filter((move) => move.date === date);
        return <section className="itinerary-day" data-trip-day={date} key={date} aria-labelledby={`day-${date}`}>
          <header className="day-heading">
            <div><h2 id={`day-${date}`} tabIndex={-1}>{displayDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
              <p className="muted">{cityNames.join(' / ')}{cityNames.length > 0 && ' · '}{dayEvents.length} {dayEvents.length === 1 ? 'activity' : 'activities'}</p></div>
            {canEdit && <button className="button ghost" disabled={busy || !!form} aria-label={`Add activity on ${date}`}
              onClick={(click) => openForm(emptyEvent(dayEvents[0]?.cityId ?? trip.cities[0].id, date), false, click.currentTarget)}>+ Add activity</button>}
          </header>
          {canEdit && form && (dates.includes(form.event.date) ? form.event.date : dates[0]) === date &&
            <EventForm key={form.event.id} initial={form.event} editing={form.editing} onClose={closeForm} />}
          {dayEvents.length ? <ol className="calendar-events">
            {dayEvents.map((event) => <ItineraryEvent key={event.id} event={event} editing={Boolean(form)}
              onEdit={(button) => openForm(event, true, button)} onDelete={() => void deleteEvent(event)} />)}
          </ol> : <p className="day-empty">{family ? 'No activities shared for this day.' : 'Nothing planned yet. Leave it open, or add an activity.'}</p>}
          {moves.map((move) => <button className="departure-link" key={move.id} onClick={() => navigate('checklists')}>
            {move.time} · {visitLabel(trip.cities, move.fromCityId)} → {visitLabel(trip.cities, move.toCityId)}
            <span>Open departure checklist</span>
          </button>)}
        </section>;
      })}
    </div>
    <DayRail days={days} cities={trip.cities} onJump={jumpToDay} />
    <p className="fine-print">Times in Europe/Brussels. Check transport times and opening hours before booking.</p>
  </div>;
}
