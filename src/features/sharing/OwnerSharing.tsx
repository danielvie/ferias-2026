import { useEffect, useState } from 'react';
import type { InviteInfo, InviteInput } from '../../../shared/model';
import { useTrip } from '../../app/TripContext';
import { api, isOnlineBackend } from '../../app/api';
import { useNavigationGuard } from '../../app/useNavigationGuard';
import { FamilyPreview } from './FamilyPreview';
import { InvitationForm } from './InvitationForm';
import { SecretLink } from './SecretLink';

export function OwnerSharing() {
  const { busy, refresh, snapshot, onOwnerLinkReplaced } = useTrip();
  const [invitations, setInvitations] = useState<InviteInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [secret, setSecret] = useState<{ id: string; token: string; owner?: boolean } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const disabled = busy || loading || working;
  useNavigationGuard(working, 'Wait for the invitation request to finish before leaving.', true);
  useNavigationGuard(Boolean(secret), 'Save the one-time private link before leaving. Leave anyway?');

  // This fetch is tied to the mounted owner/trip, not changing snapshot revisions.
  // React's cleanup pattern prevents stale initial responses after unmount.
  // https://react.dev/reference/react/useEffect#fetching-data-with-effects
  useEffect(() => {
    let ignore = false;
    api.invites().then((result) => {
      if (!ignore) setInvitations(result);
    }).catch((cause: unknown) => {
      if (!ignore) setError(cause instanceof Error ? cause.message : 'Could not load invitations.');
    }).finally(() => {
      if (!ignore) setLoading(false);
    });
    return () => { ignore = true; };
  }, []);

  async function reload() {
    if (disabled) return;
    setWorking(true); setError('');
    try { setInvitations(await api.invites()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load invitations.'); }
    finally { setWorking(false); }
  }

  async function reloadAfterMutation() {
    try {
      await Promise.all([
        api.invites().then(setInvitations),
        refresh(),
      ]);
    } catch {
      setError('The access change succeeded, but refreshing the list or trip failed. Refresh invitations and reload the trip before making further changes.');
    }
  }

  async function create(input: InviteInput) {
    if (disabled || secret) return false;
    setWorking(true); setError(''); setNotice('');
    try {
      const result = await api.invite(input);
      setSecret(result);
      setNotice(`Invitation created for ${input.name}. Save the secret link before leaving this page.`);
      await reloadAfterMutation();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create invitation.');
      return false;
    } finally { setWorking(false); }
  }

  async function revoke(invitation: InviteInfo) {
    if (disabled) return;
    setWorking(true); setError(''); setNotice('');
    try {
      await api.revoke(invitation.id);
      if (secret?.id === invitation.id) setSecret(null);
      setConfirmId(null);
      setNotice(`Access revoked for ${invitation.name}.`);
      await reloadAfterMutation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not revoke invitation.');
    } finally { setWorking(false); }
  }

  async function replaceLink(id: string) {
    if (disabled || secret) return;
    if (!window.confirm('Replace this private link? The old link and every session opened with it will stop working.')) return;
    setWorking(true); setError(''); setNotice('');
    try {
      const result = await api.rotate(id);
      setSecret(result);
      if (result.owner) onOwnerLinkReplaced?.();
      setNotice('Link replaced. Save the new link before leaving this page.');
      await reloadAfterMutation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not replace the link.');
    } finally { setWorking(false); }
  }

  return (
    <div className="stack">
      {error && <p className="inline-error" role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {secret && <SecretLink key={secret.token} token={secret.token} owner={secret.owner} onDismiss={() => setSecret(null)} />}
      {secret && <p className="muted">Save and dismiss the link above before creating another invitation.</p>}
      <InvitationForm disabled={disabled || secret !== null} onCreate={create} />
      {isOnlineBackend && <section className="panel stack">
        <h2>Owner recovery link</h2>
        <p>Replace a lost or exposed owner link while keeping your identity and private notes. Save the replacement immediately.</p>
        <button type="button" className="button secondary" disabled={disabled || Boolean(secret)} onClick={() => void replaceLink(snapshot.session.id)}>Replace owner link</button>
      </section>}
      <section className="panel stack" aria-labelledby="active-invitations-heading">
        <div className="panel-header">
          <h2 id="active-invitations-heading">Active invitations</h2>
          <button type="button" className="button secondary" disabled={disabled} onClick={() => void reload()}>Refresh invitations</button>
        </div>
        {loading && <p role="status">Loading invitations…</p>}
        {!loading && invitations.length === 0 && <p className="empty-state">No active invitations to show. Secret links cannot be retrieved after creation.</p>}
        {invitations.map((invitation) => <article className="sharing-invitation stack" key={invitation.id}>
          <div className="panel-header">
            <h3>{invitation.name}</h3>
            <span className="badge">{invitation.role === 'family' ? 'Family mode' : invitation.role === 'editor' ? 'Editor' : 'Viewer'}</span>
          </div>
          <p className="muted">Created <time dateTime={invitation.createdAt}>{new Date(invitation.createdAt).toLocaleString()}</time></p>
          {invitation.role === 'family' && <details>
            <summary>Preview selected family content</summary>
            <FamilyPreview eventIds={invitation.eventIds} placeIds={invitation.placeIds} />
          </details>}
          <div className="actions">
            {isOnlineBackend && <button type="button" className="button secondary" disabled={disabled || Boolean(secret)} onClick={() => void replaceLink(invitation.id)}>Replace link</button>}
            <button type="button" className="button ghost" disabled={disabled} onClick={() => setConfirmId(invitation.id)}>Revoke access</button>
          </div>
          {confirmId === invitation.id && <div role="group" aria-label={`Revoke access for ${invitation.name}`}>
            <p>Revoke this invitation and its active sessions? The recipient will lose access through this link.</p>
            <div className="actions">
              <button type="button" className="button danger" disabled={disabled} onClick={() => void revoke(invitation)}>Confirm revoke</button>
              <button type="button" className="button secondary" disabled={disabled} onClick={() => setConfirmId(null)}>Keep access</button>
            </div>
          </div>}
        </article>)}
      </section>
    </div>
  );
}
