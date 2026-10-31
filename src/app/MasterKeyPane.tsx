import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { MasterTrip } from '../../shared/model';
import { api, ApiError } from './api';
import { ModalPane } from '../components/ModalPane';

export function MasterKeyPane({ busy, error, onOpen, onClose }: {
  busy: boolean;
  error: string;
  onOpen: (key: string, tripId: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [key, setKey] = useState('');
  const [trips, setTrips] = useState<MasterTrip[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState('');
  const [openingId, setOpeningId] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const locked = useRef(false);
  const pending = loading || busy || Boolean(openingId);
  useEffect(() => { if (trips !== null) heading.current?.focus(); }, [trips]);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (locked.current || pending) return;
    locked.current = true;
    setLoading(true);
    setFailure('');
    try { setTrips(await api.masterTrips(key.trim())); }
    catch (cause) {
      setFailure(cause instanceof Error ? cause.message : 'Could not load trips. Try again.');
      if (cause instanceof ApiError && cause.status === 401) setKey('');
    } finally { locked.current = false; setLoading(false); }
  }
  async function open(tripId: string) {
    if (locked.current || pending) return;
    locked.current = true;
    setOpeningId(tripId);
    setFailure('');
    try {
      if (await onOpen(key.trim(), tripId)) {
        setKey('');
        onClose();
      }
    } finally { locked.current = false; setOpeningId(''); }
  }
  return <ModalPane title="Open with master key" busy={pending} onClose={onClose}>
    <div className="stack" aria-busy={pending}>
      <p>Open any trip in this database as its existing owner. Other members’ private notes stay hidden.</p>
      {trips === null ? <form className="stack" onSubmit={event => void unlock(event)}>
        <div className="field">
          <label htmlFor="master-key">Master key</label>
          <input id="master-key" type="password" value={key} autoComplete="off" autoCapitalize="none"
            spellCheck={false} required disabled={pending} autoFocus
            onChange={event => setKey(event.target.value)} aria-describedby="master-key-help" />
        </div>
        <p id="master-key-help" className="fine-print">The key is not saved in this browser. Opening a trip remembers only that trip’s owner session.</p>
        <div className="actions">
          <button className="button" disabled={pending}>{loading ? 'Loading trips…' : 'Show trips'}</button>
          <button className="button secondary" type="button" disabled={pending} onClick={onClose}>Cancel</button>
        </div>
      </form> : <>
        <h3 ref={heading} tabIndex={-1}>Trips in this database</h3>
        {trips.length ? <ul className="remembered-trips" aria-label="Database trips">
          {trips.map(trip => <li key={trip.id}>
            <div className="remembered-trip-copy">
              <strong>{trip.title}</strong>
              <p>{trip.startDate} to {trip.endDate}</p>
              <p>{trip.ownerName} · owner · {trip.id.slice(0, 8)}</p>
            </div>
            <button className="button secondary" type="button" disabled={pending}
              aria-label={`${openingId === trip.id ? 'Opening…' : 'Open trip'} ${trip.title} as ${trip.ownerName}, owner, ${trip.id.slice(0, 8)}`}
              onClick={() => void open(trip.id)}>{openingId === trip.id ? 'Opening…' : 'Open trip'}</button>
          </li>)}
        </ul> : <p role="status">No trips in this database yet.</p>}
        <button className="button secondary" type="button" disabled={pending}
          onClick={() => { setKey(''); setTrips(null); setFailure(''); }}>Use another key</button>
      </>}
      {(failure || error) && <p className="inline-error" role="alert">{failure || error}</p>}
    </div>
  </ModalPane>;
}
