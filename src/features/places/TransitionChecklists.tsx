import { useCallback, useState, type FormEvent } from 'react';
import type { Checklist, City } from '../../../shared/model';
import { tripChecklists } from '../../../shared/checklists';
import { visitLabel } from '../../../shared/route';
import { useTrip } from '../../app/TripContext';
import { Icon } from '../../components/Icon';
import { ChecklistEditor } from '../checklists/ChecklistEditor';
import '../checklists/checklists.css';

function progress(list: Checklist) {
  if (list.items.length === 0) return 'No checks yet';
  const remaining = list.items.filter(item => item.status !== 'done').length;
  return remaining === 0 ? 'All checks complete' : `${remaining} ${remaining === 1 ? 'check' : 'checks'} left`;
}

export function TransitionChecklists({ from, to, disabled }: { from: City; to: City; disabled: boolean }) {
  const { snapshot, canEdit, busy, command } = useTrip();
  const lists = tripChecklists(snapshot.data);
  const attached = lists.filter(list => list.transition?.fromCityId === from.id && list.transition.toCityId === to.id);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [sourceId, setSourceId] = useState('');
  const [title, setTitle] = useState('');
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [failed, setFailed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const label = `${visitLabel(snapshot.data.trip.cities, from.id)} to ${visitLabel(snapshot.data.trip.cities, to.id)}`;
  const rememberDirty = useCallback((_id: string, value: boolean) => setDirty(value), []);
  const ignore = useCallback(() => {}, []);

  function close(id: string) {
    setOpenId(null);
    requestAnimationFrame(() => document.getElementById(`transition-icon-${id}`)?.focus({ preventScroll: true }));
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (busy || !title.trim()) return;
    const saved = await command({
      type: 'checklist.addTransition', id: draftId, title: title.trim(),
      fromCityId: from.id, toCityId: to.id, sourceId: sourceId || null,
    });
    setFailed(!saved);
    if (saved) {
      setTitle('');
      setSourceId('');
      setAdding(false);
      setOpenId(draftId);
      setDraftId(crypto.randomUUID());
    }
  }

  return <div className="transition-connector" aria-label={`Checklists from ${label}`}>
    <div className="transition-checklists">
      {attached.map(list => openId === list.id
        ? <div className="transition-card" key={list.id}>
          <div className="transition-card-heading">
            <Icon name="checklists" />
            <span>{progress(list)}</span>
            <button type="button" className="button ghost" disabled={busy || dirty} onClick={() => close(list.id)}
              aria-label={`Close ${list.title}`}>Close</button>
          </div>
          <ChecklistEditor list={list} focusNewItem={false} removed={false}
            onDeleted={() => setOpenId(null)} onActivate={ignore} onDirtyChange={rememberDirty} onDiscard={ignore} />
        </div>
        : <button key={list.id} id={`transition-icon-${list.id}`} type="button" className="transition-icon"
          disabled={disabled || busy || dirty} aria-label={`Open ${list.title}, ${label}`}
          aria-expanded={false} title={list.title} onClick={() => { setAdding(false); setOpenId(list.id); }}>
          <Icon name="checklists" />
        </button>)}
      {canEdit && <button type="button" className="transition-add" disabled={disabled || busy || dirty}
        onClick={() => { setOpenId(null); setAdding(!adding); }} aria-expanded={adding}
        aria-label={`Add checklist from ${label}`}>+ <span>Add checklist</span></button>}
      {adding && canEdit && <form className="transition-add-form" onSubmit={event => void add(event)}>
        <h3>Add checklist</h3>
        <label className="field">Start with
          <select value={sourceId} disabled={busy} onChange={event => {
            const id = event.target.value;
            setSourceId(id);
            setTitle(id ? lists.find(list => list.id === id)?.title ?? '' : '');
            setFailed(false);
          }}>
            <option value="">A new checklist</option>
            {lists.map(list => <option key={list.id} value={list.id}>{list.title}{list.transition
              ? ` (${visitLabel(snapshot.data.trip.cities, list.transition.fromCityId)} to ${visitLabel(snapshot.data.trip.cities, list.transition.toCityId)})`
              : ''}</option>)}
          </select>
        </label>
        <label className="field">Checklist title
          <input required maxLength={200} value={title} disabled={busy} onChange={event => {
            setTitle(event.target.value); setFailed(false);
          }} />
        </label>
        {sourceId && <p className="muted">A new copy starts with every item unchecked.</p>}
        {failed && <p className="inline-error" role="alert">Couldn't save. Your checklist is still here; try again.</p>}
        <div className="actions">
          <button className="button" type="submit" disabled={busy || !title.trim()}>Add checklist</button>
          <button className="button ghost" type="button" disabled={busy} onClick={() => {
            setAdding(false); setDraftId(crypto.randomUUID()); setTitle(''); setSourceId(''); setFailed(false);
          }}>Cancel</button>
        </div>
      </form>}
    </div>
  </div>;
}
