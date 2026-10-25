import { useEffect, useRef, useState } from 'react';
import type { Place, TripCommand } from '../../../shared/model';
import { routeDateConflicts, visitLabel } from '../../../shared/route';
import { useTrip } from '../../app/TripContext';
import { ModalPane } from '../../components/ModalPane';
import { PlaceCard } from './PlaceCard';
import { PlaceForm } from './PlaceForm';
import { PlaceSuggestions } from './PlaceSuggestions';
import { SchedulePlaceForm } from './SchedulePlaceForm';
import { RouteBoard, type RouteActions } from './RouteBoard';
import { VisitForm } from './VisitForm';
import { MoveActivityForm } from './MoveActivityForm';
import { newPlace } from './suggestions';
import './places.css';

type ActiveForm = { kind: 'edit'; place: Place; editing: boolean } |
  { kind: 'schedule' | 'details' | 'move'; placeId: string } | { kind: 'visit'; beforeId: string | null };

export function PlacesPage() {
  const { snapshot, canEdit, busy, command, navigate } = useTrip();
  const { places, trip } = snapshot.data;
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [compact, setCompact] = useState(false);
  const [form, setForm] = useState<ActiveForm | null>(null);
  const [notice, setNotice] = useState<{ text: string; undo?: TripCommand; revision?: number } | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const moving = useRef(false);
  const filtering = !!(search.trim() || city || category || status);
  const disabled = busy || !!form || filtering;
  const visible = places.filter(place => {
    const cityName = trip.cities.find(item => item.id === place.cityId)?.name ?? '';
    const text = `${place.title} ${place.description} ${place.address} ${cityName}`.toLowerCase();
    return text.includes(search.trim().toLowerCase()) && (!city || city === place.cityId) &&
      (!category || category === place.category) && (!status || status === place.status);
  });
  const selected = form && 'placeId' in form ? places.find(place => place.id === form.placeId) : undefined;
  const dateConflicts = routeDateConflicts(trip.cities, snapshot.data.events);

  useEffect(() => {
    if (!form && trigger.current) {
      if (trigger.current.isConnected) trigger.current.focus();
      else document.querySelector<HTMLElement>('.places-page h1')?.focus();
    }
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

  async function move(next: TripCommand, undo: TripCommand, text: string, focusId: string) {
    if (disabled || moving.current || !canEdit) return;
    moving.current = true;
    try {
      if (await command(next)) {
        setNotice({ text, undo, revision: snapshot.revision + 1 });
        requestAnimationFrame(() => document.getElementById(focusId)?.focus());
      }
    } finally { moving.current = false; }
  }

  const actions: RouteActions = {
    insert: (beforeId, button) => openForm({ kind: 'visit', beforeId }, button),
    addActivity: (cityId, button) => openForm({ kind: 'edit', place: newPlace(cityId), editing: false }, button),
    details: (place, button) => openForm({ kind: 'details', placeId: place.id }, button),
    edit: (place, button) => openForm({ kind: 'edit', place, editing: true }, button),
    schedule: (place, button) => openForm({ kind: 'schedule', placeId: place.id }, button),
    moveVisit: (id, beforeId) => {
      const index = trip.cities.findIndex(item => item.id === id);
      const oldNext = trip.cities[index + 1]?.id ?? null;
      if (index < 0 || beforeId === oldNext || beforeId === id) return;
      void move({ type: 'visit.move', id, beforeId }, { type: 'visit.move', id, beforeId: oldNext },
        'Route and itinerary order updated. Scheduled dates are unchanged.', `visit-handle-${id}`);
    },
    moveActivity: (place, button) => openForm({ kind: 'move', placeId: place.id }, button),
  };

  async function undoMove() {
    if (busy || form || moving.current || !notice?.undo || notice.revision !== snapshot.revision) return;
    moving.current = true;
    try {
      if (await command(notice.undo)) setNotice({ text: 'Move undone. Scheduled dates are unchanged.' });
    } finally { moving.current = false; }
  }

  return (
    <div className="stack places-page">
      <header className="page-heading">
        <div><h1 tabIndex={-1}>Places</h1><p className="muted">Shape your route. Make room for what you want to do.</p></div>
        {canEdit && <button className="button secondary" type="button" disabled={busy || !!form || trip.cities.length >= 30}
          onClick={event => actions.insert(null, event.currentTarget)}>+ Add city visit</button>}
      </header>
      {!canEdit && <p className="muted">Read-only route. A trip owner or editor can change visits and activities.</p>}
      {notice && <div className="route-notice" role="status"><span>{notice.text}</span>
        {notice.undo && notice.revision === snapshot.revision &&
          <button className="button ghost" type="button" disabled={busy || !!form} onClick={() => void undoMove()}>Undo move</button>}</div>}
      {canEdit && form?.kind === 'visit' && <VisitForm beforeId={form.beforeId} onClose={closeForm}
        onSaved={name => { closeForm(); setNotice({ text: `${name} added as a separate visit.` }); }} />}
      {canEdit && form?.kind === 'edit' && <PlaceForm key={form.place.id} initial={form.place}
        editing={form.editing} onClose={closeForm} />}
      {form?.kind === 'details' && selected && <div className="stack">
        <div><button className="button secondary" type="button" onClick={closeForm}>Close activity details</button></div>
        <PlaceCard place={selected} formOpen={false} onEdit={button => actions.edit(selected, button)}
          onSchedule={button => actions.schedule(selected, button)} />
      </div>}
      {canEdit && form?.kind === 'schedule' && selected &&
        <SchedulePlaceForm key={selected.id} place={selected} onClose={closeForm} />}
      {canEdit && form?.kind === 'move' && selected && <ModalPane title="Move activity" onClose={closeForm} busy={busy}>
        <MoveActivityForm place={selected} onClose={closeForm} onMoved={({ undo, revision, destinationId }) => {
          closeForm();
          setNotice({ text: `${selected.title} moved to ${visitLabel(trip.cities, destinationId)}. Scheduled dates are unchanged.`, undo, revision });
        }} />
      </ModalPane>}
      {form && 'placeId' in form && !selected &&
        <div className="panel"><p>This activity is no longer available.</p><button className="button secondary" onClick={closeForm}>Close</button></div>}
      {dateConflicts.length > 0 && <div className="places-warning">
        Some scheduled dates run against your route order. No bookings were moved.{' '}
        <button className="button ghost" type="button" onClick={() => navigate('calendar')}>Review calendar</button>
      </div>}
      <section className="route-workspace" aria-label="Your route">
        <div className="route-workspace-heading">
          <div className="actions route-view-controls" role="group" aria-label="City card view">
            <button className="button secondary" type="button" aria-pressed={!compact} aria-controls="places-route"
              disabled={busy || !!form} onClick={() => setCompact(false)}>Details</button>
            <button className="button secondary" type="button" aria-pressed={compact} aria-controls="places-route"
              disabled={busy || !!form} onClick={() => { clearFilters(); setCompact(true); }}>Compact</button>
          </div>
          <span>{trip.cities.length} visits / {places.length} activities</span></div>
        <p className="route-instructions">{!canEdit ? 'Each stop is a separate visit, even when the city name repeats.' :
          compact ? 'Drag city visits to reorder your route. Switch to Details to plan activities.' :
            'Drag city visits to reorder your route. Use Move on an activity to choose its visit and position.'}</p>
        {filtering && <p className="muted">Clear filters to reorder city visits.</p>}
        <RouteBoard places={visible} compact={compact} disabled={busy || !!form} reorderingDisabled={disabled} actions={actions} />
        <p className="route-footnote">Same city, separate visits. Reordering never changes scheduled dates or times.</p>
      </section>
      {!compact && <details className="panel activity-filters">
        <summary>Find an activity</summary>
        <div className="places-filters">
          <div className="field"><label htmlFor="places-search">Search activities</label>
            <input id="places-search" type="search" value={search} placeholder="Name, address or notes" onChange={event => setSearch(event.target.value)} /></div>
          <div className="field"><label htmlFor="places-city">City visit</label>
            <select id="places-city" value={city} onChange={event => setCity(event.target.value)}>
              <option value="">All visits</option>{trip.cities.map(item => <option key={item.id} value={item.id}>{visitLabel(trip.cities, item.id)}</option>)}
            </select></div>
          <div className="field"><label htmlFor="places-category">Category</label>
            <select id="places-category" value={category} onChange={event => setCategory(event.target.value)}>
              <option value="">All categories</option><option value="walk">Walk</option><option value="museum">Museum</option>
              <option value="food">Food</option><option value="sight">Sight</option><option value="other">Other</option>
            </select></div>
          <div className="field"><label htmlFor="places-status">Status</label>
            <select id="places-status" value={status} onChange={event => setStatus(event.target.value)}>
              <option value="">All statuses</option><option value="idea">Idea</option><option value="planned">Planned</option><option value="visited">Visited</option>
            </select></div>
        </div>
        <p className="muted" role="status">{visible.length} of {places.length} activities{filtering && !visible.length ? '. No matches.' : ''}</p>
        {filtering && <button className="button ghost" type="button" onClick={clearFilters}>Clear filters</button>}
      </details>}
      {!compact && <PlaceSuggestions formOpen={!!form} />}
    </div>
  );
}
