import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { City } from '../../../shared/model';
import { useTrip } from '../../app/TripContext';

export function CityDates({ city, disabled }: { city: City; disabled: boolean }) {
  const { snapshot, canEdit, busy, command } = useTrip();
  const [open, setOpen] = useState(false);
  const [arrival, setArrival] = useState(city.arrivalDate ?? '');
  const [departure, setDeparture] = useState(city.departureDate ?? '');
  const [error, setError] = useState('');
  const toggle = useRef<HTMLButtonElement>(null);
  const arrivalInput = useRef<HTMLInputElement>(null);
  const { trip } = snapshot.data;

  useEffect(() => { if (open) arrivalInput.current?.focus(); }, [open]);

  if (!canEdit) return null;
  function begin() {
    setArrival(city.arrivalDate ?? '');
    setDeparture(city.departureDate ?? '');
    setError('');
    setOpen(true);
  }
  function close() {
    setOpen(false);
    requestAnimationFrame(() => toggle.current?.focus());
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (arrival && departure && departure < arrival) {
      setError('Departure must not be before arrival.');
      return;
    }
    setError('');
    const saved = await command({ type: 'visit.dates', id: city.id, arrivalDate: arrival, departureDate: departure });
    if (saved) close();
    else setError('Could not save city dates. Check the trip dates and try again.');
  }
  return <div className="city-dates-editor">
    {!open ? <button ref={toggle} type="button" className="button ghost city-dates-toggle" disabled={disabled || busy}
      aria-expanded={false} onClick={begin}>Edit city dates</button> :
      <form className="city-dates-form" onSubmit={event => void save(event)}>
        <div className="field"><label htmlFor={`arrival-${city.id}`}>Arrival</label>
          <input ref={arrivalInput} id={`arrival-${city.id}`} type="date" min={trip.startDate} max={trip.endDate}
            value={arrival} disabled={disabled || busy} onChange={event => setArrival(event.target.value)} /></div>
        <div className="field"><label htmlFor={`departure-${city.id}`}>Departure</label>
          <input id={`departure-${city.id}`} type="date" min={trip.startDate} max={trip.endDate}
            value={departure} disabled={disabled || busy} onChange={event => setDeparture(event.target.value)} /></div>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <div className="actions">
          <button className="button" type="submit" disabled={disabled || busy}>Save dates</button>
          <button className="button ghost" type="button" disabled={disabled || busy}
            onClick={() => { setArrival(''); setDeparture(''); setError(''); }}>Clear dates</button>
          <button className="button ghost" type="button" disabled={disabled || busy} onClick={close}>Cancel</button>
        </div>
      </form>}
  </div>;
}
