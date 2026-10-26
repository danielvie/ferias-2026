import { useState, type FormEvent } from 'react';
import type { City, CreateTripInput, Trip } from '../../shared/model';
import { DateRangePicker } from '../components/DateRangePicker';
import type { DateRange } from '../components/date-range';

export type TripDetailsInput = Omit<CreateTripInput, 'cities'> & { cities: City[] };

interface Props {
  trip?: Trip;
  initial?: TripDetailsInput;
  busy: boolean;
  error: string;
  onSave: (details: TripDetailsInput) => Promise<void>;
  onCancel: () => void;
}

export function TripDetailsForm({ trip, initial, busy, error, onSave, onCancel }: Props) {
  const [validationError, setValidationError] = useState('');
  const defaults = trip ?? initial;
  const [dates, setDates] = useState<DateRange>(() => ({ startDate: defaults?.startDate ?? '', endDate: defaults?.endDate ?? '' }));
  const [cities, setCities] = useState<City[]>(() => defaults?.cities.map((city) => ({ ...city })) ??
    ['Brussels', 'Ghent', 'Bruges'].map((name) => ({ id: crypto.randomUUID(), name })));
  function moveCity(index: number, direction: -1 | 1) {
    setCities((current) => {
      const next = [...current];
      [next[index], next[index + direction]] = [next[index + direction], next[index]];
      return next;
    });
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const details: TripDetailsInput = {
      title: String(form.get('title')).trim(),
      ownerName: String(form.get('name') ?? '').trim(),
      ...dates,
      cities: cities.map((city) => ({ ...city, name: city.name.trim() })),
    };
    if (!details.startDate || !details.endDate) {
      setValidationError('Choose a start and end date for your trip.');
      return;
    }
    if (details.endDate < details.startDate) {
      setValidationError('The end date must not be before the start date.');
      return;
    }
    if (!details.cities.length || details.cities.some((city) => !city.name)) {
      setValidationError('Enter a name for each city visit.');
      return;
    }
    setValidationError('');
    void onSave(details);
  }
  return <section className="details-panel">
    <p className="muted">{trip ? 'Change the details without leaving your itinerary.' : initial ?
      'These are sample details. Change anything, then save to create your trip. No activities or bookings are added.' :
      'Saving creates your shared trip. You can change these details later.'}</p>
    <form className="stack" onSubmit={save}>
      <fieldset className="details-fields form-grid" disabled={busy}>
        <legend className="visually-hidden">Trip details</legend>
        <div className="field"><label htmlFor="trip-title">Trip name</label><input id="trip-title" name="title" defaultValue={defaults?.title ?? ''} placeholder="Our Belgium trip" autoFocus required maxLength={120} /></div>
        {!trip && <div className="field"><label htmlFor="owner-name">Your name</label><input id="owner-name" name="name" defaultValue={initial?.ownerName ?? ''} autoComplete="given-name" placeholder="Your name" required maxLength={80} /></div>}
        <DateRangePicker value={dates} onChange={(range) => { setDates(range); setValidationError(''); }} />
        <div className="field details-cities">
          <h3>Cities, in trip order</h3>
          <ol className="settings-cities">
            {cities.map((city, index) => <li key={city.id}>
              <div className="field"><label htmlFor={`city-${city.id}`}>City {index + 1}</label>
                <input id={`city-${city.id}`} value={city.name} required maxLength={100}
                  onChange={(event) => setCities((current) => current.map((item) => item.id === city.id ? { ...item, name: event.target.value } : item))} />
              </div>
              <div className="actions city-actions">
                <button className="button ghost" type="button" aria-label={`Move ${city.name || 'city'} up`} disabled={index === 0}
                  onClick={() => moveCity(index, -1)}>↑</button>
                <button className="button ghost" type="button" aria-label={`Move ${city.name || 'city'} down`} disabled={index === cities.length - 1}
                  onClick={() => moveCity(index, 1)}>↓</button>
                <button className="button ghost" type="button" aria-label={`Remove ${city.name || 'city'}`} disabled={cities.length === 1}
                  onClick={() => setCities((current) => current.filter((item) => item.id !== city.id))}>Remove</button>
              </div>
            </li>)}
          </ol>
          <button className="button ghost add-city" type="button" disabled={cities.length >= 30} onClick={() => {
            const id = crypto.randomUUID();
            setCities((current) => [...current, { id, name: '' }]);
            requestAnimationFrame(() => document.getElementById(`city-${id}`)?.focus());
          }}>+ Add city</button>
        </div>
      </fieldset>
      <p className="fine-print">Times in Europe/Brussels.</p>
      {trip && <p className="fine-print">Move or remove linked plans before removing a city or shortening the trip dates. Renaming and reordering cities keeps their plans.</p>}
      <div className="settings-savebar">
        {(validationError || error) && <p className="inline-error" role="alert">{validationError || error}</p>}
        <div className="actions"><button className="button" disabled={busy}>{busy ? 'Saving…' : 'Save trip details'}</button><button className="button secondary" type="button" disabled={busy} onClick={onCancel}>Cancel</button></div>
      </div>
    </form>
  </section>;
}
