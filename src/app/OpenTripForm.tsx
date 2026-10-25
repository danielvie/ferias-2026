import { useState, type FormEvent } from 'react';

interface Props {
  busy: boolean;
  error: string;
  onJoin: (token: string, kind: 'access' | 'join') => Promise<void>;
  onCancel: () => void;
}

export function OpenTripForm({ busy, error, onJoin, onCancel }: Props) {
  const [access, setAccess] = useState('');
  const [validationError, setValidationError] = useState('');
  function join(event: FormEvent) {
    event.preventDefault();
    let token = access.trim();
    let kind: 'access' | 'join' = 'access';
    try {
      const url = new URL(token);
      const fragment = new URLSearchParams(url.hash.slice(1));
      kind = fragment.has('access') ? 'access' : 'join';
      token = fragment.get(kind) || '';
    } catch { /* A raw token is also accepted. */ }
    if (!token) {
      setValidationError('Enter a trip invitation or owner recovery link.');
      return;
    }
    setValidationError('');
    void onJoin(token, kind);
  }
  return <section className="panel details-panel" aria-labelledby="open-trip-heading">
    <h2 id="open-trip-heading">Open an existing trip</h2>
    <form className="stack" onSubmit={join}>
      <div className="field"><label htmlFor="access-link">Invitation or owner recovery link</label><input id="access-link" value={access} onChange={(event) => setAccess(event.target.value)} required autoFocus autoComplete="off" disabled={busy} /></div>
      {(validationError || error) && <p className="inline-error" role="alert">{validationError || error}</p>}
      <div className="actions"><button className="button" disabled={busy}>Open trip</button><button className="button secondary" type="button" disabled={busy} onClick={onCancel}>Cancel</button></div>
    </form>
  </section>;
}
