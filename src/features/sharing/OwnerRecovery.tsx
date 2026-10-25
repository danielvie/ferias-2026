import { useState } from 'react';
import { api } from '../../app/api';
import { useTrip } from '../../app/TripContext';
import { useNavigationGuard } from '../../app/useNavigationGuard';
import { SecretLink } from './SecretLink';

export function OwnerRecovery() {
  const { snapshot, busy, refresh, onOwnerLinkReplaced } = useTrip();
  const [token, setToken] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  useNavigationGuard(working, 'Wait for the owner link replacement to finish.', true);
  useNavigationGuard(Boolean(token), 'Save your replacement owner link before leaving. Leave anyway?');

  async function replace() {
    if (working || busy || token || !window.confirm('Replace your private owner link? The old link and other sessions opened with it will stop working.')) return;
    setWorking(true); setError('');
    try {
      const result = await api.rotate(snapshot.session.id);
      setToken(result.token);
      onOwnerLinkReplaced?.();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not replace the owner link.');
    } finally { setWorking(false); }
  }

  return <section className="panel stack" aria-labelledby="owner-recovery-heading">
    <h3 id="owner-recovery-heading">Private owner recovery</h3>
    <p>For opening this trip as its owner on another browser. Use Share to invite travelers instead.</p>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {token ? <SecretLink token={token} owner onDismiss={() => setToken('')} /> :
      <div className="actions"><button type="button" className="button secondary" disabled={busy || working} onClick={() => void replace()}>Replace owner link</button></div>}
  </section>;
}
