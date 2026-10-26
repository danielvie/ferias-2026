import { useCallback, useEffect, useRef, useState } from 'react';
import type { Checklist, ChecklistItem } from '../../../shared/model';
import { useTrip } from '../../app/TripContext';
import { ChecklistItems } from './ChecklistItems';
import { InlineChecklistText } from './InlineChecklistText';
import { useChecklistOptions } from './useChecklistOptions';

export function ChecklistEditor({ list, focusNewItem, removed, onDeleted, onActivate, onDirtyChange, onDiscard }: {
  list: Checklist;
  focusNewItem: boolean;
  removed: boolean;
  onDeleted: (id: string) => void;
  onActivate: (id: string) => void;
  onDirtyChange: (id: string, dirty: boolean) => void;
  onDiscard: (id: string) => void;
}) {
  const { command, busy, canEdit } = useTrip();
  const [newItem, setNewItem] = useState('');
  const [failed, setFailed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [titleDirty, setTitleDirty] = useState(false);
  const [dirtyItems, setDirtyItems] = useState(new Map<string, ChecklistItem>());
  const currentItems = useRef(list.items);
  currentItems.current = list.items;
  const itemDirty = useCallback((id: string, dirty: boolean) => {
    setDirtyItems(previous => {
      if (previous.has(id) === dirty) return previous;
      const next = new Map(previous);
      const item = currentItems.current.find(item => item.id === id);
      if (dirty && item) next.set(id, item); else next.delete(id);
      return next;
    });
  }, []);
  const input = useRef<HTMLInputElement>(null);
  const options = useChecklistOptions();
  // A remote completion/deletion must not reparent an editor and lose its draft.
  const items = [...list.items, ...[...dirtyItems.values()].filter(draft => !list.items.some(item => item.id === draft.id))];
  const isDone = (item: ChecklistItem) => (dirtyItems.get(item.id) ?? item).status === 'done';
  const pending = items.filter(item => !isDone(item));
  const completed = items.filter(isDone);
  const dirty = Boolean(titleDirty || dirtyItems.size || newItem.trim());
  useEffect(() => {
    onDirtyChange(list.id, dirty);
    return () => onDirtyChange(list.id, false);
  }, [list.id, dirty, onDirtyChange]);
  useEffect(() => {
    if (focusNewItem) input.current?.focus();
  }, [focusNewItem]);
  return <article className="checklist-editor" data-checklist-id={list.id} id={`checklist-${list.id}`}
    tabIndex={-1} aria-labelledby={`checklist-title-${list.id}`} onFocusCapture={() => onActivate(list.id)}>
    <h2 className="visually-hidden" id={`checklist-title-${list.id}`}>{list.title}</h2>
    {removed && <div className="inline-error">
      <p>This checklist was removed elsewhere. Your unsaved edits are kept here so you can copy them.</p>
      <button className="button secondary" type="button" onClick={() => onDiscard(list.id)}>Discard retained drafts</button>
    </div>}
    <header className="compact-list-header">
      <InlineChecklistText value={list.title} label={`Checklist title: ${list.title}`} title
        onDirtyChange={setTitleDirty}
        onSave={title => command({ type: 'checklist.rename', id: list.id, title })} />
      {canEdit && <details className="compact-list-options" {...options}>
        <summary aria-label={`Checklist actions for ${list.title}`}>···</summary>
        <button className="button ghost" type="button" disabled={busy} onClick={() => setDeleting(true)}>Delete checklist</button>
      </details>}
    </header>
    {list.items.length === 0 && <p className="compact-list-empty">{canEdit ? 'Add your first item below.' : 'No items yet.'}</p>}
    <ChecklistItems checklistId={list.id} items={pending} label={`Pending items in ${list.title}`}
      disabled={busy || removed || dirtyItems.size > 0} onDirtyChange={itemDirty} />
    {canEdit && <form className="compact-add-item" aria-label={`Add item to ${list.title}`} onSubmit={async event => {
      event.preventDefault();
      if (busy || !newItem.trim()) return;
      const saved = await command({ type: 'checklist.item.add', checklistId: list.id, title: newItem.trim() });
      setFailed(!saved);
      if (saved) {
        setNewItem('');
        if (input.current?.checkVisibility()) input.current.focus({ preventScroll: true });
      }
    }}>
      <span aria-hidden="true">+</span>
      <input id={`add-item-${list.id}`} ref={input} aria-label={`New item for ${list.title}`} placeholder="List item"
        required maxLength={200} readOnly={busy} value={newItem} onChange={event => { setNewItem(event.target.value); setFailed(false); }} />
      {newItem.trim() && <button className="button ghost" type="submit" disabled={busy}>{failed ? 'Retry' : 'Add item'}</button>}
      {failed && <p role="status" className="checklist-save-error">Couldn't save. Your item is still here.</p>}
    </form>}
    {completed.length > 0 && <details className="completed-checklist-items">
      <summary id={`completed-${list.id}`}>{completed.length} completed {completed.length === 1 ? 'item' : 'items'}</summary>
      <ChecklistItems checklistId={list.id} items={completed} label={`Completed items in ${list.title}`}
        disabled={busy || removed || dirtyItems.size > 0} onDirtyChange={itemDirty} />
    </details>}
    <p role="status" className="checklist-save-status">{busy ? 'Saving…' :
      titleDirty || dirtyItems.size || newItem ? 'Unsaved changes' : canEdit ? 'Saved' : 'Read only'}</p>
    {deleting && <div className="checklist-delete-confirm" role="group" aria-label={`Delete checklist ${list.title}`}>
      <p>Delete "{list.title}", all its items and any unsaved edits? Other checklists will not change.</p>
      <div className="actions">
        <button className="button danger" type="button" disabled={busy} onClick={async () => {
          if (!busy && await command({ type: 'checklist.delete', id: list.id })) onDeleted(list.id);
        }}>Confirm delete checklist</button>
        <button className="button secondary" type="button" disabled={busy} onClick={() => setDeleting(false)}>Keep checklist</button>
      </div>
    </div>}
  </article>;
}
