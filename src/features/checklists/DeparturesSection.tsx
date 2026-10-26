import { useState } from 'react';
import { visitLabel } from '../../../shared/route';
import { useTrip } from '../../app/TripContext';
import { DepartureChecklist } from './DepartureChecklist';
import { TransferForm } from './TransferForm';

/** Keep the existing transfer workflow separate until city interactions are designed. */
export function DeparturesSection() {
  const { snapshot, canEdit, busy } = useTrip();
  const { transfers, trip } = snapshot.data;
  const [selectedId, setSelectedId] = useState('');
  const [creating, setCreating] = useState(false);
  const selected = transfers.find(transfer => transfer.id === selectedId) ?? transfers[0];
  return <details className="checklist-departures">
    <summary>Departures</summary>
    <div className="stack">
      <div className="panel-header">
        <p className="muted">These checks belong to individual journeys.</p>
        {canEdit && <button type="button" className="button secondary" disabled={busy}
          onClick={() => setCreating(!creating)}>{creating ? 'Close new departure' : 'New departure'}</button>}
      </div>
      {canEdit && creating && <TransferForm onCreated={() => setCreating(false)} />}
      {transfers.length === 0 ? <p className="muted">No departures yet. Create one for each city-to-city journey.</p> : <>
        <label className="field">Choose departure
          <select value={selected?.id ?? ''} disabled={busy} onChange={event => setSelectedId(event.target.value)}>
            {transfers.map(transfer => <option key={transfer.id} value={transfer.id}>
              {transfer.date} {transfer.time} · {visitLabel(trip.cities, transfer.fromCityId)} to {visitLabel(trip.cities, transfer.toCityId)}
            </option>)}
          </select>
        </label>
        {selected && <DepartureChecklist key={selected.id} transfer={selected} />}
      </>}
    </div>
  </details>;
}
