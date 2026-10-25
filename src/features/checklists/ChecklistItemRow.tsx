import { useId, useState, type FormEvent } from 'react';
import type { ChecklistItem, CheckStatus } from '../../../shared/model';
import { useTrip } from '../../app/TripContext';
import { useNavigationGuard } from '../../app/useNavigationGuard';

export function ChecklistItemRow({ item, transferId }: { item: ChecklistItem; transferId?: string }) {
  const { snapshot, busy, canEdit, command } = useTrip();
  const [ownerDraft, setOwnerDraft] = useState<string | null>(null);
  const assignee = ownerDraft ?? item.assignee;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const namesId = useId();
  useNavigationGuard(ownerDraft !== null && ownerDraft.trim() !== item.assignee, 'Leave this owner assignment? Unsaved changes will be lost.');

  async function update(status: CheckStatus, owner: string) {
    if (busy) return false;
    return command(transferId
      ? { type: 'transfer.item.update', transferId, id: item.id, status, assignee: owner }
      : { type: 'packing.update', id: item.id, status, assignee: owner });
  }

  async function saveOwner(event: FormEvent) {
    event.preventDefault();
    if (await update(item.status, assignee.trim())) setOwnerDraft(null);
  }

  return (
    <li className="checklist-row stack">
      <div className="checklist-item-heading">
        {canEdit && !transferId
          ? <label className="checklist-check">
            <input type="checkbox" checked={item.status === 'done'} disabled={busy}
              onChange={(e) => void update(e.target.checked ? 'done' : 'pending', item.assignee)} />
            <span className={item.status === 'done' ? 'checklist-done' : ''}>{item.title}</span>
          </label>
          : <strong>{item.title}</strong>}
        <span className="badge">{item.status === 'done' ? 'Done' : item.status === 'skipped' ? 'Skipped' : 'Pending'}</span>
      </div>
      {canEdit ? <div className="checklist-controls">
        {transferId && <label className="field">Status for {item.title}
          <select value={item.status} disabled={busy} onChange={(e) => void update(e.target.value as CheckStatus, item.assignee)}>
            <option value="pending">Pending</option><option value="done">Done</option><option value="skipped">Skipped</option>
          </select>
        </label>}
        <details className="checklist-item-details">
          <summary aria-label={`Edit owner for ${item.title}`}>Owner: {item.assignee || 'Shared'}</summary>
          <form className="checklist-owner" onSubmit={(event) => void saveOwner(event)}>
            <label className="field">Owner for {item.title}
              <input list={namesId} value={assignee} placeholder="Shared" disabled={busy} onChange={(e) => setOwnerDraft(e.target.value)} />
            </label>
            <datalist id={namesId}>
              <option value="Shared" />
              {Array.from(new Set(snapshot.members.map((member) => member.name))).map((name) => <option key={name} value={name} />)}
            </datalist>
            <button type="submit" className="button secondary" disabled={busy || assignee.trim() === item.assignee}>Save owner</button>
          </form>
          {!transferId && <button type="button" className="button ghost" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete item</button>}
        </details>
      </div> : <p className="muted">Owner: {item.assignee || 'Shared'}</p>}
      {canEdit && !transferId && confirmDelete && <div role="group" aria-label={`Delete ${item.title}`}>
        <p>Delete "{item.title}" from packing?</p>
        <div className="actions">
          <button type="button" className="button danger" disabled={busy} onClick={() => {
            if (!busy) void command({ type: 'packing.delete', id: item.id });
          }}>Confirm delete item</button>
          <button type="button" className="button secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>Keep item</button>
        </div>
      </div>}
    </li>
  );
}
