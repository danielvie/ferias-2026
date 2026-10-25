import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Place, TripCommand } from '../../../shared/model';
import { routeDateConflicts, visitLabel } from '../../../shared/route';
import { useTrip } from '../../app/TripContext';
import { ModalPane } from '../../components/ModalPane';
import { PlaceCard } from './PlaceCard';
import { PlaceForm } from './PlaceForm';
import { CheckpointDetails } from './CheckpointDetails';
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
  const [checkpointId, setCheckpointId] = useState<string | null>(null);
  const [form, setForm] = useState<ActiveForm | null>(null);
  const [notice, setNotice] = useState<{ text: string; undo?: TripCommand; revision?: number } | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const formArea = useRef<HTMLDivElement>(null);
  const moving = useRef(false);
  const disabled = busy || !!form;
  const checkpointIndex = trip.cities.findIndex(city => city.id === checkpointId);
  const checkpoint = trip.cities[checkpointIndex];
  const selected = form && 'placeId' in form ? places.find(place => place.id === form.placeId) : undefined;
  const dateConflicts = routeDateConflicts(trip.cities, snapshot.data.events);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (form && form.kind !== 'move') {
        formArea.current?.querySelector<HTMLElement>('input, select, button')?.focus();
      } else if (!form && trigger.current) {
        const button = trigger.current.isConnected ? trigger.current : document.getElementById(trigger.current.id);
        (button ?? document.querySelector<HTMLElement>('.checkpoint-open[aria-expanded="true"]') ??
          document.querySelector<HTMLElement>('.places-page h1'))?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [form]);

  function openForm(next: ActiveForm, button: HTMLButtonElement) {
    trigger.current = button;
    setForm(next);
  }
  function closeForm() {
    setForm(null);
  }
  function closeCheckpoint() {
    setCheckpointId(null);
    requestAnimationFrame(() => document.getElementById(`checkpoint-${checkpointId}`)?.focus({ preventScroll: true }));
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
      if (await command(notice.undo)) {
        if (notice.undo.type === 'place.move') setCheckpointId(notice.undo.cityId);
        setNotice({ text: 'Move undone. Scheduled dates are unchanged.' });
      }
    } finally { moving.current = false; }
  }

  return (
    <div className="stack places-page">
      <header className="page-heading">
        <div className="checkpoint-page-title"><h1 tabIndex={-1}>Places</h1>
          <p className="muted">{trip.cities.length} checkpoints / {places.length} activities</p></div>
        {canEdit && <button className="button secondary" type="button" disabled={busy || !!form || trip.cities.length >= 30}
          onClick={event => actions.insert(null, event.currentTarget)}>+ Add checkpoint</button>}
      </header>
      {!canEdit && <p className="muted">Read-only route. A trip owner or editor can change checkpoints and activities.</p>}
      {notice && <div className="route-notice" role="status"><span>{notice.text}</span>
        {notice.undo && notice.revision === snapshot.revision &&
          <button className="button ghost" type="button" disabled={busy || !!form} onClick={() => void undoMove()}>Undo move</button>}</div>}
      {form && <div ref={formArea} className="stack checkpoint-form-area">
        {canEdit && form.kind === 'visit' && <VisitForm beforeId={form.beforeId} onClose={closeForm}
          onSaved={(name, id) => { closeForm(); setCheckpointId(id); setNotice({ text: `${name} added as a separate checkpoint.` }); }} />}
        {canEdit && form.kind === 'edit' && <PlaceForm key={form.place.id} initial={form.place}
          editing={form.editing} onClose={closeForm} />}
        {form.kind === 'details' && selected && <div className="stack">
          <div><button className="button secondary" type="button" onClick={closeForm}>Close activity details</button></div>
          <PlaceCard place={selected} formOpen={false} onEdit={button => actions.edit(selected, button)}
            onSchedule={button => actions.schedule(selected, button)} />
        </div>}
        {canEdit && form.kind === 'schedule' && selected &&
          <SchedulePlaceForm key={selected.id} place={selected} onClose={closeForm} />}
        {canEdit && form.kind === 'move' && selected && <ModalPane title="Move activity" onClose={closeForm} busy={busy}>
          <MoveActivityForm place={selected} onClose={closeForm} onMoved={({ undo, revision, destinationId }) => {
            closeForm();
            setCheckpointId(destinationId);
            setNotice({ text: `${selected.title} moved to ${visitLabel(trip.cities, destinationId)}. Scheduled dates are unchanged.`, undo, revision });
          }} />
        </ModalPane>}
        {'placeId' in form && !selected &&
          <div className="panel"><p>This activity is no longer available.</p><button className="button secondary" onClick={closeForm}>Close</button></div>}
      </div>}
      {dateConflicts.length > 0 && <div className="places-warning">
        Some scheduled dates run against your route order. No bookings were moved.{' '}
        <button className="button ghost" type="button" onClick={() => navigate('calendar')}>Review calendar</button>
      </div>}
      <section className="route-workspace" aria-label="Your route">
        <p className="route-instructions">Click a checkpoint to plan activities.{canEdit && ' Drag its handle to reorder.'}</p>
        <div className="checkpoint-layout" style={{ '--selected-row': Math.max(0, checkpointIndex) } as CSSProperties}>
          <RouteBoard places={places} selectedId={checkpoint?.id ?? null} disabled={disabled} actions={actions}
            onSelect={id => id === checkpointId ? closeCheckpoint() : setCheckpointId(id)} />
          {checkpoint && <div className="checkpoint-details-slot">
            <CheckpointDetails key={checkpoint.id} city={checkpoint} index={checkpointIndex}
              places={places.filter(place => place.cityId === checkpoint.id)} disabled={!!form}
              notice={notice?.text} onUndo={notice?.undo && notice.revision === snapshot.revision ? () => void undoMove() : undefined}
              conflict={dateConflicts.includes(checkpoint.id)} actions={actions} onClose={closeCheckpoint} />
          </div>}
        </div>
        <p className="route-footnote">Same city, separate checkpoints. Reordering never changes scheduled dates or times.</p>
      </section>
    </div>
  );
}
