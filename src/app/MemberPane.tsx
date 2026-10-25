import { useState } from 'react';
import type { Member } from '../../shared/model';
import { useNavigationGuard } from './useNavigationGuard';
import { HistoryList } from './HistoryList';

export function MemberPane({ member, revision, busy, error, onSave, onCancel, onExpired }: {
  member: Member;
  revision: number;
  busy: boolean;
  error: string;
  onSave: (name: string) => Promise<boolean>;
  onCancel: () => void;
  onExpired: () => Promise<void>;
}) {
  const [name, setName] = useState(member.name);
  const [notice, setNotice] = useState('');
  const dirty = name !== member.name;
  useNavigationGuard(dirty, 'Leave your profile? Your unsaved name will be lost.');
  async function save(event: React.SubmitEvent) {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setNotice('');
    if (await onSave(name.trim())) {
      setName(name.trim());
      setNotice('Your name is saved. Earlier history keeps your name as it was at the time.');
    }
  }
  return <div className="member-pane">
    <form onSubmit={(event) => void save(event)}>
      <p className="fine-print">Your role is <strong className="member-role">{member.role}</strong>. Changing your name does not change your access.</p>
      <label className="field">Your name
        <input name="name" required maxLength={100} value={name} onChange={(event) => { setName(event.target.value); setNotice(''); }}
          autoComplete="name" disabled={busy} />
      </label>
      <p className="fine-print">The trip invitation lets each person join under their own name. Names are display labels, not verified accounts.</p>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {notice && <p className="fine-print" role="status">{notice}</p>}
      <div className="actions">
        <button className="button" type="submit" disabled={busy || !name.trim() || !dirty}>{busy ? 'Saving…' : 'Save name'}</button>
        <button className="button secondary" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </form>
    {member.role !== 'family' && <HistoryList key={revision} onExpired={onExpired} />}
  </div>;
}
