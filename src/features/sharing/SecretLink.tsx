import { useEffect, useRef, useState } from 'react';
import { tripLink } from '../../app/api';

export function SecretLink({ token, owner = false, onDismiss }: { token: string; owner?: boolean; onDismiss: () => void }) {
  const link = tripLink(token);
  const inputRef = useRef<HTMLInputElement>(null);
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(link);
      setCopyStatus('Link copied.');
    } catch {
      inputRef.current?.focus();
      inputRef.current?.select();
      setCopyStatus('Automatic copying is unavailable. The link is selected. Copy it using your browser or keyboard.');
    }
  }
  return (
    <section className="panel stack sharing-secret" aria-labelledby="invitation-link-heading">
      <h2 id="invitation-link-heading">{owner ? 'Save your replacement owner link now' : 'Save this invitation link now'}</h2>
      <p>{owner ? 'This link gives full owner access. Keep it private. The previous owner link and its sessions no longer work.' : 'This secret link is shown only once. Anyone with the link obtains its role, even if their name is different from the invitation name. Share it only with the intended recipient.'}</p>
      <label className="field">{owner ? 'Private owner link' : 'Invitation link'}
        <input ref={inputRef} readOnly value={link} onFocus={(e) => e.target.select()} autoComplete="off" spellCheck={false} />
      </label>
      <div className="actions">
        <button type="button" className="button" onClick={() => void copy()}>{owner ? 'Copy owner link' : 'Copy invitation link'}</button>
        <button type="button" className="button secondary" onClick={onDismiss}>I've saved this link</button>
      </div>
      <p className="muted" role="status">{copyStatus || 'The link stays on this page until you dismiss it or leave. It is not saved in browser storage.'}</p>
    </section>
  );
}
