import { useState, type FormEvent } from 'react';
import { visitLabel } from '../../../shared/route';
import { useTrip } from '../../app/TripContext';

export function TransferForm({ onCreated }: { onCreated: () => void }) {
  const { snapshot, busy, command } = useTrip();
  const { trip } = snapshot.data;
  const [fromCityId, setFrom] = useState(trip.cities[0]?.id ?? '');
  const [toCityId, setTo] = useState(trip.cities[1]?.id ?? '');
  const [date, setDate] = useState(trip.startDate);
  const [time, setTime] = useState('09:00');
  const [error, setError] = useState('');

  async function add(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!fromCityId || !toCityId || fromCityId === toCityId) {
      setError('Choose two different cities.');
      return;
    }
    if (!date || date < trip.startDate || date > trip.endDate) {
      setError('Choose a departure date within the trip dates.');
      return;
    }
    if (!time) { setError('Choose a departure time.'); return; }
    setError('');
    if (await command({ type: 'transfer.add', fromCityId, toCityId, date, time })) onCreated();
  }
  return (
    <form className="panel stack" onSubmit={add}>
      <h3>New departure</h3>
      <p className="muted">Every departure gets a fresh checklist. Earlier departures and your packing list stay unchanged.</p>
      <fieldset disabled={busy} className="checklist-fields form-grid">
        <label className="field">From city
          <select required value={fromCityId} onChange={(e) => setFrom(e.target.value)}>
            <option value="">Choose a city</option>
            {trip.cities.map((city) => <option key={city.id} value={city.id}>{visitLabel(trip.cities, city.id)}</option>)}
          </select>
        </label>
        <label className="field">To city
          <select required value={toCityId} onChange={(e) => setTo(e.target.value)}>
            <option value="">Choose a city</option>
            {trip.cities.map((city) => <option key={city.id} value={city.id}>{visitLabel(trip.cities, city.id)}</option>)}
          </select>
        </label>
        <label className="field">Departure date
          <input required type="date" min={trip.startDate} max={trip.endDate} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">Departure time, Brussels
          <input required type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </fieldset>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="actions"><button type="submit" className="button" disabled={busy || trip.cities.length < 2}>Create departure</button></div>
      {trip.cities.length < 2 && <p className="muted">Add at least two cities to the trip before creating a departure.</p>}
    </form>
  );
}
