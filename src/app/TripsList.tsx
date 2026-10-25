import type { RememberedTrip } from './remembered-trips';

export function TripsList({ entries, currentId, busy, onOpen, onForget, onOpenLink, onCreate }: {
  entries: RememberedTrip[]; currentId: string | null; busy: boolean;
  onOpen: (id: string) => void; onForget: (id: string) => void;
  onOpenLink: () => void; onCreate: () => void;
}) {
  return <div className="stack trips-list">
    <p className="muted">Remembered on this browser. Use only on devices you trust.</p>
    {entries.length ? <ul className="remembered-trips" aria-label="Remembered trips">
      {entries.map(entry => <li key={entry.id}>
        <div className="remembered-trip-copy">
          <strong>{entry.title}</strong>
          <p>{entry.startDate} to {entry.endDate}</p>
          <p>{entry.memberName} · {entry.role}</p>
          {!entry.credential && <p className="remembered-trip-invalid">Access is no longer valid. Open a current trip link.</p>}
        </div>
        <div className="actions remembered-trip-actions">
          {entry.id === currentId ? <span className="badge">Current trip</span> :
            <button className="button secondary" type="button" disabled={busy || !entry.credential}
              aria-label={`Open ${entry.title} as ${entry.memberName}, ${entry.role}`}
              onClick={() => onOpen(entry.id)}>Open trip</button>}
          <button className="button ghost" type="button" disabled={busy}
            aria-label={`Forget ${entry.title} as ${entry.memberName}, ${entry.role}`}
            onClick={() => onForget(entry.id)}>Forget this trip</button>
        </div>
      </li>)}
    </ul> : <p className="muted">No trips remembered yet. Open a trip link or create a trip to get started.</p>}
    <div className="actions">
      <button className="button secondary" type="button" disabled={busy} onClick={onOpenLink}>Open trip link</button>
      <button className="button" type="button" disabled={busy} onClick={onCreate}>Create trip</button>
    </div>
    <p className="fine-print">Forgetting removes saved access from this browser. It does not delete the trip.</p>
  </div>;
}
