import { useEffect, useState } from 'react';
import { useTrip } from '../../app/TripContext';

export function NewChecklistForm({ id, onCreated, onCancel }: {
  id: string;
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const { command, busy, snapshot } = useTrip();
  const [title, setTitle] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    // A response can be lost after committing. A later conflict refresh confirms
    // this exact client-generated ID without creating a duplicate list.
    if (snapshot.data.checklists?.some(list => list.id === id && list.title === title.trim())) onCreated(id);
  }, [snapshot.data.checklists, id, title, onCreated]);
  return <form className="new-checklist-form" aria-label="New checklist" onSubmit={async event => {
    event.preventDefault();
    if (busy || !title.trim()) return;
    const saved = await command({ type: 'checklist.add', id, title: title.trim() });
    setFailed(!saved);
    if (saved) onCreated(id);
  }}>
    <label className="field">Checklist title
      <input autoFocus required maxLength={200} value={title} readOnly={busy} placeholder="Untitled checklist"
        onChange={event => { setTitle(event.target.value); setFailed(false); }} />
    </label>
    <div className="actions">
      <button className="button" type="submit" disabled={busy || !title.trim()}>{failed ? 'Retry creating checklist' : 'Create checklist'}</button>
      <button className="button ghost" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
    {failed && <p role="status" className="checklist-save-error">Couldn't save. Your title is still here.</p>}
  </form>;
}
