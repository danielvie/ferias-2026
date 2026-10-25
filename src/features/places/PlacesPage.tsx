import { useEffect, useRef, useState } from 'react';
import type { Place } from '../../../shared/model';
import { useTrip } from '../../app/TripContext';
import { PlaceCard } from './PlaceCard';
import { PlaceForm } from './PlaceForm';
import { PlaceSuggestions } from './PlaceSuggestions';
import { SchedulePlaceForm } from './SchedulePlaceForm';
import { newPlace } from './suggestions';
import './places.css';

type ActiveForm = { kind: 'edit'; place: Place; editing: boolean } | { kind: 'schedule'; placeId: string };

export function PlacesPage() {
  const { snapshot, canEdit, busy } = useTrip();
  const { places, trip } = snapshot.data;
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [form, setForm] = useState<ActiveForm | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const visible = places.filter(place => {
    const cityName = trip.cities.find(item => item.id === place.cityId)?.name ?? '';
    const text = `${place.title} ${place.description} ${place.address} ${cityName}`.toLowerCase();
    return text.includes(search.trim().toLowerCase()) && (!city || city === place.cityId) &&
      (!category || category === place.category) && (!status || status === place.status);
  }).sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  const scheduledPlace = form?.kind === 'schedule' ? places.find(place => place.id === form.placeId) : undefined;

  useEffect(() => {
    if (!form) trigger.current?.focus();
  }, [form]);

  function openForm(next: ActiveForm, button: HTMLButtonElement) {
    trigger.current = button;
    setForm(next);
  }
  function closeForm() {
    setForm(null);
  }
  function clearFilters() {
    setSearch(''); setCity(''); setCategory(''); setStatus('');
  }

  return (
    <div className="stack places-page">
      <header className="page-heading">
        <div><p className="eyebrow">The places notebook</p><h1>Save now, schedule later</h1>
          <p className="muted">Keep the ideas you like, then find a day for them.</p></div>
        {canEdit && <button className="button" type="button" disabled={busy || !!form}
          onClick={event => openForm({
            kind: 'edit', place: newPlace(trip.cities[0]?.id ?? ''), editing: false,
          }, event.currentTarget)}>Add a place</button>}
      </header>
      {!canEdit && <p className="muted">Read-only saved places. A trip owner or editor can add and schedule places.</p>}
      {canEdit && form?.kind === 'edit' && <PlaceForm key={form.place.id} initial={form.place}
        editing={form.editing} onClose={closeForm} />}
      {canEdit && form?.kind === 'schedule' && (scheduledPlace ?
        <SchedulePlaceForm key={scheduledPlace.id} place={scheduledPlace} onClose={closeForm} /> :
        <div className="panel"><p>This place is no longer available.</p>
          <button className="button secondary" type="button" onClick={closeForm}>Close</button></div>)}
      <section className="panel stack" aria-labelledby="saved-places-heading">
        <h2 id="saved-places-heading">Saved places</h2>
        <div className="places-filters">
          <div className="field">
            <label htmlFor="places-search">Search saved places</label>
            <input id="places-search" type="search" value={search} placeholder="Name, address or notes"
              onChange={event => setSearch(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="places-city">City</label>
            <select id="places-city" value={city} onChange={event => setCity(event.target.value)}>
              <option value="">All cities</option>
              {trip.cities.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="places-category">Category</label>
            <select id="places-category" value={category} onChange={event => setCategory(event.target.value)}>
              <option value="">All categories</option><option value="walk">Walk</option><option value="museum">Museum</option>
              <option value="food">Food</option><option value="sight">Sight</option><option value="other">Other</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="places-status">Status</label>
            <select id="places-status" value={status} onChange={event => setStatus(event.target.value)}>
              <option value="">All statuses</option><option value="idea">Idea</option>
              <option value="planned">Planned</option><option value="visited">Visited</option>
            </select>
          </div>
        </div>
        <p className="muted" role="status">{visible.length} of {places.length} saved places</p>
        {(search || city || category || status) &&
          <button className="button ghost" type="button" onClick={clearFilters}>Clear filters</button>}
      </section>
      {visible.length === 0 && <section className="panel empty-state">
        <h2>{places.length ? 'No places match these filters' : 'Your saved places start here'}</h2>
        <p>{places.length ? 'Try another search or clear your filters.' :
          canEdit ? 'Save a walk, a museum or somewhere to eat. Nothing is booked by saving an idea.' :
            'No saved places have been shared here yet.'}</p>
        {places.length ? <button className="button secondary" type="button" onClick={clearFilters}>Show all places</button> :
          canEdit && <button className="button" type="button" disabled={busy || !!form}
            onClick={event => openForm({
              kind: 'edit', place: newPlace(trip.cities[0]?.id ?? ''), editing: false,
            }, event.currentTarget)}>Save your first place</button>}
      </section>}
      <div className="places-list">
        {visible.map(place => <PlaceCard key={place.id} place={place} formOpen={!!form}
          onEdit={button => openForm({ kind: 'edit', place, editing: true }, button)}
          onSchedule={button => openForm({ kind: 'schedule', placeId: place.id }, button)} />)}
      </div>
      <PlaceSuggestions formOpen={!!form} />
    </div>
  );
}
