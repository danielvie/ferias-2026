import { useEffect, useState, type FormEvent } from 'react';
import type { JoinTripInfo } from '../../shared/model';
import { ModalPane } from '../components/ModalPane';

export function JoinTripPane({ trip, busy, error, onJoin, onRetry, onCancel }: {
  trip: JoinTripInfo | null;
  busy: boolean;
  error: string;
  onJoin: (name: string) => Promise<void>;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [validationError, setValidationError] = useState('');
  useEffect(() => {
    if (!name && !busy) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [name, busy]);

  function cancel() {
    if (busy || (name && !window.confirm('Leave without joining? Your entered name will be lost.'))) return;
    onCancel();
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!name.trim()) { setValidationError('Enter your name to join the trip.'); return; }
    setValidationError('');
    void onJoin(name.trim());
  }
  return <ModalPane title="Join trip" busy={busy} onClose={cancel}>
    <div className="stack">
      {trip ? <form className="stack" onSubmit={submit}>
        <p>Join <strong>{trip.title}</strong>. Enter your name to edit plans, write notes and use checklists with the group.</p>
        <label className="field">Your name
          <input value={name} onChange={event => setName(event.target.value)} required maxLength={100}
            autoComplete="given-name" disabled={busy} autoFocus />
        </label>
        {(validationError || error) && <p className="inline-error" role="alert">{validationError || error}</p>}
        <div className="actions">
          <button className="button" disabled={busy}>{busy ? 'Joining…' : 'Join trip'}</button>
          <button type="button" className="button secondary" disabled={busy} onClick={cancel}>Cancel</button>
        </div>
        <p className="muted">No account needed. This browser will remember your access.</p>
      </form> : <>
        {error ? <p className="inline-error" role="alert">{error}</p> : <p role="status">Opening the invitation…</p>}
        <div className="actions">
          {error && <button type="button" className="button" disabled={busy} onClick={onRetry}>Retry opening link</button>}
          <button type="button" className="button secondary" disabled={busy} onClick={cancel}>Cancel</button>
        </div>
      </>}
    </div>
  </ModalPane>;
}
