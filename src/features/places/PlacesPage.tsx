import { useEffect, useRef, useState } from 'react';
import type { Place, TripCommand } from '../../../shared/model';
import { visitLabel } from '../../../shared/route';
import { useTrip } from '../../app/TripContext';
import { ModalPane } from '../../components/ModalPane';
import { PlaceCard } from './PlaceCard';
import { PlaceForm } from './PlaceForm';
import { CheckpointDetails } from './CheckpointDetails';
import { SchedulePlaceForm } from './SchedulePlaceForm';
import { RouteBoard, type RouteActions } from './RouteBoard';
import { VisitForm } from './VisitForm';
import { MoveActivityForm } from './MoveActivityForm';
import './places.css';

type ActiveForm = { kind: 'edit'; place: Place; editing: boolean; onSaved?: () => void } |
  { kind: 'schedule' | 'details' | 'move'; placeId: string } | { kind: 'visit'; beforeId: string | null };

export function PlacesPage({ embedded = false, cityId, selectedDate, onSelectCity, onFormChange }: {
  embedded?: boolean; cityId?: string; selectedDate?: string; onSelectCity?: (id: string) => void; onFormChange?: (open: boolean) => void;
} = {}) {
  const { snapshot, canEdit, busy, command } = useTrip();
  const { places, trip } = snapshot.data;
  const [localId, setLocalId] = useState<string | null>(null);
  const checkpointId = cityId ?? localId;
  function setCheckpointId(id: string | null) {
    if (onSelectCity && id) onSelectCity(id);
    else setLocalId(id);
  }
  const [form, setForm] = useState<ActiveForm | null>(null);
  const [notice, setNotice] = useState<{ text: string; undo?: TripCommand; revision?: number } | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const formArea = useRef<HTMLDivElement>(null);
  const moving = useRef(false);
  const disabled = busy || !!form;
  const checkpointIndex = trip.cities.findIndex(city => city.id === checkpointId);
  const checkpoint = trip.cities[checkpointIndex];
  const selected = form && 'placeId' in form ? places.find(place => place.id === form.placeId) : undefined;

  useEffect(() => {
    onFormChange?.(Boolean(form));
    return () => onFormChange?.(false);
  }, [Boolean(form), onFormChange]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (form && form.kind !== 'move') {
        formArea.current?.querySelector<HTMLElement>('input, select, button')?.focus();
      } else if (!form && trigger.current) {
        // Do not steal focus if the user moved on before this frame ran.
        if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body &&
          document.activeElement !== document.documentElement && document.activeElement.isConnected) return;
        const button = trigger.current.isConnected ? trigger.current : document.getElementById(trigger.current.id);
        (button ?? document.querySelector<HTMLElement>('.checkpoint-open[aria-expanded="true"]') ??
          document.querySelector<HTMLElement>('.places-page h1'))?.focus();
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
    addActivity: (place, button, onSaved) => openForm({ kind: 'edit', place, editing: false, onSaved }, button),
    details: (place, button) => openForm({ kind: 'details', placeId: place.id }, button),
    edit: (place, button) => openForm({ kind: 'edit', place, editing: true }, button),
    schedule: (place, button) => openForm({ kind: 'schedule', placeId: place.id }, button),
    moveVisit: (id, beforeId) => {
      const index = trip.cities.findIndex(item => item.id === id);
      const oldNext = trip.cities[index + 1]?.id ?? null;
      if (index < 0 || beforeId === oldNext || beforeId === id) return;
      void move({ type: 'visit.move', id, beforeId }, { type: 'visit.move', id, beforeId: oldNext },
        'Ordem da rota atualizada. Datas agendadas não foram alteradas.', `visit-handle-${id}`);
    },
    moveActivity: (place, button) => openForm({ kind: 'move', placeId: place.id }, button),
  };

  async function undoMove() {
    if (busy || form || moving.current || !notice?.undo || notice.revision !== snapshot.revision) return;
    moving.current = true;
    try {
      if (await command(notice.undo)) {
        if (notice.undo.type === 'place.move') setCheckpointId(notice.undo.cityId);
        setNotice({ text: 'Movimentação desfeita. Datas agendadas não foram alteradas.' });
      }
    } finally { moving.current = false; }
  }

  return (
    <div className="stack places-page">
      {!embedded && <header className="page-heading">
        <div className="checkpoint-page-title"><h1 tabIndex={-1}>Organizar rota</h1>
          <p className="muted">{trip.cities.length} paradas / {places.length} atividades</p></div>
        {canEdit && <button className="button secondary" type="button" aria-label="Adicionar parada"
          disabled={busy || !!form || trip.cities.length >= 30}
          onClick={event => actions.insert(null, event.currentTarget)}>+ Adicionar<span className="checkpoint-add-label"> parada</span></button>}
      </header>}
      {!canEdit && <p className="muted">Rota em modo de leitura. Organizadores e participantes podem alterar os planos.</p>}
      {notice && <div className="route-notice" role="status"><span>{notice.text}</span>
        {notice.undo && notice.revision === snapshot.revision &&
          <button className="button ghost" type="button" disabled={busy || !!form} onClick={() => void undoMove()}>Desfazer</button>}</div>}
      {form && <div ref={formArea} className="stack checkpoint-form-area">
        {canEdit && form.kind === 'visit' && <VisitForm beforeId={form.beforeId} onClose={closeForm}
          onSaved={(name, id) => { closeForm(); setCheckpointId(id); setNotice({ text: `${name} adicionada como uma parada independente.` }); }} />}
        {canEdit && form.kind === 'edit' && <PlaceForm key={form.place.id} initial={form.place}
          editing={form.editing} onClose={closeForm} onSaved={form.onSaved} />}
        {form.kind === 'details' && selected && <div className="stack">
          <div><button className="button secondary" type="button" onClick={closeForm}>Fechar detalhes</button></div>
          <PlaceCard place={selected} formOpen={false} onEdit={button => actions.edit(selected, button)}
            onSchedule={button => actions.schedule(selected, button)} />
        </div>}
        {canEdit && form.kind === 'schedule' && selected &&
          <SchedulePlaceForm key={selected.id} place={selected} initialDate={selectedDate} onClose={closeForm} />}
        {canEdit && form.kind === 'move' && selected && <ModalPane title="Mover atividade" onClose={closeForm} busy={busy}>
          <MoveActivityForm place={selected} onClose={closeForm} onMoved={({ undo, revision, destinationId }) => {
            closeForm();
            setCheckpointId(destinationId);
            setNotice({ text: `${selected.title} movida para ${visitLabel(trip.cities, destinationId)}. Datas e horários preservados.`, undo, revision });
          }} />
        </ModalPane>}
        {'placeId' in form && !selected &&
          <div className="panel"><p>Esta atividade não está mais disponível.</p><button className="button secondary" onClick={closeForm}>Fechar</button></div>}
      </div>}
      <section className="route-workspace" aria-label="Sua rota">
        {embedded ? checkpoint ? <CheckpointDetails key={checkpoint.id} city={checkpoint}
          places={places.filter(place => place.cityId === checkpoint.id)} disabled={!!form} actions={actions} unscheduledFirst />
          : <p className="muted">Escolha uma parada para ver suas ideias.</p>
          : <><RouteBoard places={places} selectedId={checkpoint?.id ?? null} disabled={disabled} actions={actions}
          onSelect={id => setCheckpointId(id === checkpointId ? null : id)}>
          {checkpoint && <CheckpointDetails key={checkpoint.id} city={checkpoint}
            places={places.filter(place => place.cityId === checkpoint.id)} disabled={!!form}
            actions={actions} />}
        </RouteBoard>
        <p className="route-footnote">Toque em uma parada para ver suas atividades.{canEdit && ' Arraste a alça ao lado do número para reordenar.'}{' '}
          Passagens pela mesma cidade continuam independentes. Reordenar não altera datas ou horários.</p></>}
      </section>
    </div>
  );
}
