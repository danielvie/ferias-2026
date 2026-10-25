import { useState } from 'react';
import { useTrip } from '../../app/TripContext';
import { AddItemForm } from './AddItemForm';
import { ChecklistItemRow } from './ChecklistItemRow';
import { DepartureChecklist } from './DepartureChecklist';
import { TransferForm } from './TransferForm';
import './checklists.css';

export function ChecklistsPage() {
  const { snapshot, canEdit, busy } = useTrip();
  const { packing, transfers, trip } = snapshot.data;
  const [selectedId, setSelectedId] = useState('');
  const [creating, setCreating] = useState(false);
  const selected = transfers.find((transfer) => transfer.id === selectedId) ?? transfers[0];
  const done = packing.filter((item) => item.status === 'done').length;
  const cityName = (id: string) => trip.cities.find((city) => city.id === id)?.name ?? 'Removed city';

  return (
    <div className="stack checklists-page">
      <header className="page-heading">
        <div><p className="eyebrow">Pack once, check every departure</p><h1>Checklists</h1><p className="muted">Packing stays with the trip. Departure checks belong to one journey.</p></div>
      </header>
      {!canEdit && <p className="muted">Read-only access. Only the owner and editors can change checklists.</p>}
      <section className="panel stack" aria-labelledby="packing-heading">
        <h2 id="packing-heading">Packing</h2>
        <p role="status">{done} of {packing.length} packed · {packing.length - done} pending</p>
        <progress value={done} max={packing.length || 1} aria-label="Packing progress" />
        {packing.length === 0 && <p className="empty-state">Your packing list is empty.</p>}
        <ul className="checklist-items">
          {packing.map((item) => <ChecklistItemRow key={item.id} item={item} />)}
        </ul>
        {canEdit && <AddItemForm />}
      </section>
      <section className="stack" aria-labelledby="departures-heading">
        <div className="panel-header">
          <h2 id="departures-heading">Departures</h2>
          {canEdit && <button type="button" className="button secondary" disabled={busy} onClick={() => setCreating(!creating)}>{creating ? 'Close new departure' : 'New departure'}</button>}
        </div>
        {canEdit && creating && <TransferForm onCreated={() => setCreating(false)} />}
        {transfers.length === 0 ? <div className="empty-state">No departures yet. Create one for each city-to-city journey.</div> : <>
          <label className="field">Choose departure
            <select value={selected?.id ?? ''} disabled={busy} onChange={(e) => setSelectedId(e.target.value)}>
              {transfers.map((transfer) => <option key={transfer.id} value={transfer.id}>
                {transfer.date} {transfer.time} · {cityName(transfer.fromCityId)} to {cityName(transfer.toCityId)}
              </option>)}
            </select>
          </label>
          {selected && <DepartureChecklist key={selected.id} transfer={selected} />}
        </>}
      </section>
    </div>
  );
}
