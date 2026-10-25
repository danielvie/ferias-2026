import { useEffect, useRef, useState } from 'react';
import { useTrip } from '../../app/TripContext';
import { api, tripLink } from '../../app/api';
import './sharing.css';

export function SharingPage() {
  const { snapshot } = useTrip();
  const canShare = snapshot.session.role === 'owner' || snapshot.session.role === 'editor';
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [attempt, setAttempt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const link = token ? tripLink(token, 'join') : '';
  // Ignore responses after switching trips or leaving Share.
  // https://react.dev/reference/react/useEffect#fetching-data-with-effects
  useEffect(() => {
    if (!canShare) return;
    let ignore = false;
    setToken(''); setError(''); setCopyStatus('');
    api.share().then(result => {
      if (!ignore) setToken(result.token);
    }).catch((cause: unknown) => {
      if (!ignore) setError(cause instanceof Error ? cause.message : 'Could not load the trip link.');
    });
    return () => { ignore = true; };
  }, [snapshot.data.trip.id, canShare, attempt]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopyStatus('Link copied. Send it to anyone joining your trip.');
    } catch {
      input.current?.focus();
      input.current?.select();
      setCopyStatus('The link is selected. Copy it using your browser or keyboard.');
    }
  }

  return (
    <div className="stack sharing-page">
      <header className="page-heading">
        <div><p className="eyebrow">{snapshot.data.trip.title}</p><h1>Share your trip</h1></div>
      </header>
      {canShare ? <section className="panel stack" aria-labelledby="trip-link-heading">
        <h2 id="trip-link-heading">Invite people with this link</h2>
        <p>Send the same link to everyone. They enter their name and join the trip, ready to edit plans, write notes and use checklists.</p>
        {link ? <>
          <label className="field">Trip invitation link
            <input ref={input} readOnly value={link} onFocus={event => event.target.select()} autoComplete="off" spellCheck={false} />
          </label>
          <div className="actions"><button type="button" className="button" onClick={() => void copy()}>Copy link</button></div>
          <p className="muted" role="status">{copyStatus || 'This link does not expire. You can copy it here again any time.'}</p>
        </> : error ? <div className="stack">
          <p className="inline-error" role="alert">{error}</p>
          <div className="actions"><button type="button" className="button secondary" onClick={() => setAttempt(value => value + 1)}>Retry loading link</button></div>
        </div> : <p role="status">Loading your trip link…</p>}
        <p className="muted">Anyone with this link can join and edit. Each person gets their own identity; private notes stay with their author.</p>
        {typeof location !== 'undefined' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) &&
          <p className="places-warning">This is a localhost link. It only works on this computer, not on someone else's device.</p>}
      </section> : <p>This access is read-only. Ask a trip owner or editor for the invitation link to join as a participant.</p>}
    </div>
  );
}
