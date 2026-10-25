import { useState } from 'react';
import type { Transfer } from '../../../shared/model';
import { checklistStrategies } from '../../../shared/checklists';
import { useTrip } from '../../app/TripContext';
import { AddItemForm } from './AddItemForm';
import { ChecklistItemRow } from './ChecklistItemRow';

export function DepartureChecklist({ transfer }: { transfer: Transfer }) {
  const { canEdit, busy, command, snapshot } = useTrip();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cityName = (id: string) => snapshot.data.trip.cities.find((city) => city.id === id)?.name ?? 'Removed city';
  const done = transfer.items.filter((item) => item.status === 'done').length;
  const skipped = transfer.items.filter((item) => item.status === 'skipped').length;
  const ready = checklistStrategies.departure.isReady(transfer.items);
  return (
    <article className="panel stack">
      <h3>{cityName(transfer.fromCityId)} to {cityName(transfer.toCityId)}</h3>
      <p className="muted">{transfer.date} · {transfer.time} Brussels time</p>
      <p role="status"><strong>{ready ? 'Ready to go' : 'Departure checks pending'}</strong> · {done} done · {skipped} skipped · {transfer.items.length - done - skipped} pending</p>
      <progress value={done + skipped} max={transfer.items.length || 1} aria-label="Departure checks resolved" />
      {transfer.items.length === 0 && <p className="empty-state">No departure items. Add a check before you go.</p>}
      <ul className="checklist-items">
        {transfer.items.map((item) => <ChecklistItemRow key={item.id} item={item} transferId={transfer.id} />)}
      </ul>
      {canEdit && <>
        <AddItemForm transferId={transfer.id} />
        <div className="actions"><button type="button" className="button ghost" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete departure</button></div>
        {confirmDelete && <div role="group" aria-label="Delete departure">
          <p>Delete this departure and all its checks? Other departures will not change.</p>
          <div className="actions">
            <button type="button" className="button danger" disabled={busy} onClick={() => {
              if (!busy) void command({ type: 'transfer.delete', id: transfer.id });
            }}>Confirm delete departure</button>
            <button type="button" className="button secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>Keep departure</button>
          </div>
        </div>}
      </>}
    </article>
  );
}
