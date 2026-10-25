import { useId, useState, type FormEvent } from 'react';
import { useTrip } from '../../app/TripContext';
import { useNavigationGuard } from '../../app/useNavigationGuard';

export function AddItemForm({ transferId }: { transferId?: string }) {
  const { snapshot, busy, command } = useTrip();
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const namesId = useId();
  useNavigationGuard(
    title.trim().length > 0 || assignee.trim().length > 0,
    'Leave this checklist item draft? Unsaved changes will be lost.',
  );

  async function add(event: FormEvent) {
    event.preventDefault();
    if (busy || !title.trim()) return;
    const added = await command(transferId
      ? { type: 'transfer.item.add', transferId, title: title.trim(), assignee: assignee.trim() }
      : { type: 'packing.add', title: title.trim(), assignee: assignee.trim() });
    if (added) { setTitle(''); setAssignee(''); }
  }
  return (
    <form className="stack" onSubmit={add}>
      <fieldset className="checklist-fields form-grid" disabled={busy}>
        <legend>Add {transferId ? 'departure' : 'packing'} item</legend>
        <label className="field">Item
          <input required value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">Owner, member name or shared label
          <input list={namesId} value={assignee} placeholder="Shared" onChange={(e) => setAssignee(e.target.value)} />
        </label>
        <datalist id={namesId}>
          <option value="Shared" />
          {Array.from(new Set(snapshot.members.map((member) => member.name))).map((name) => <option key={name} value={name} />)}
        </datalist>
      </fieldset>
      <div className="actions"><button type="submit" className="button" disabled={busy || !title.trim()}>Add item</button></div>
    </form>
  );
}
