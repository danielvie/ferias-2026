import { useState, type FormEvent } from 'react';
import type { CreateTripInput, Trip } from '../../shared/model';

interface Props {
  trip?: Trip;
  busy: boolean;
  error: string;
  onSave: (details: CreateTripInput) => Promise<void>;
  onCancel: () => void;
}

export function TripDetailsForm({ trip, busy, error, onSave, onCancel }: Props) {
  const [validationError, setValidationError] = useState('');
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const details: CreateTripInput = {
      title: String(form.get('title')).trim(),
      ownerName: String(form.get('name') ?? '').trim(),
      startDate: String(form.get('startDate')),
      endDate: String(form.get('endDate')),
      cities: String(form.get('cities')).split(',').map((city) => city.trim()).filter(Boolean),
    };
    if (details.endDate < details.startDate) {
      setValidationError('The end date must not be before the start date.');
      return;
    }
    setValidationError('');
    void onSave(details);
  }
  return <section className="panel details-panel" aria-labelledby="trip-details-heading">
    <h2 id="trip-details-heading">Trip details</h2>
    <p className="muted">{trip ? 'Update your trip without leaving the dashboard.' : 'Add the details here when you are ready. Saving creates your shared trip.'}</p>
    <form className="stack" onSubmit={save}>
      <fieldset className="details-fields form-grid" disabled={busy}>
        <legend className="visually-hidden">Trip details</legend>
        <div className="field"><label htmlFor="trip-title">Trip name</label><input id="trip-title" name="title" defaultValue={trip?.title ?? ''} placeholder="Our Belgium trip" autoFocus required maxLength={120} /></div>
        {!trip && <div className="field"><label htmlFor="owner-name">Your name</label><input id="owner-name" name="name" autoComplete="given-name" placeholder="Your name" required maxLength={80} /></div>}
        <div className="field"><label htmlFor="start-date">Start date</label><input id="start-date" name="startDate" type="date" defaultValue={trip?.startDate ?? ''} required /></div>
        <div className="field"><label htmlFor="end-date">End date</label><input id="end-date" name="endDate" type="date" defaultValue={trip?.endDate ?? ''} required /></div>
        <div className="field details-cities"><label htmlFor="trip-cities">Cities, separated by commas</label><input id="trip-cities" name="cities" defaultValue={trip?.cities.map((city) => city.name).join(', ') ?? 'Brussels, Ghent, Bruges'} required maxLength={500} /></div>
      </fieldset>
      {trip && <p className="fine-print">Move or remove linked plans before removing a city or shortening the trip dates. Reordering existing city names keeps their plans.</p>}
      {(validationError || error) && <p className="inline-error" role="alert">{validationError || error}</p>}
      <div className="actions"><button className="button" disabled={busy}>{busy ? 'Saving…' : 'Save trip details'}</button><button className="button secondary" type="button" disabled={busy} onClick={onCancel}>Cancel</button></div>
    </form>
  </section>;
}
