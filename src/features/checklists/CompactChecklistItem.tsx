import { useEffect, useId, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ChecklistItem } from '../../../shared/model';
import { useTrip } from '../../app/TripContext';
import { Icon } from '../../components/Icon';
import { InlineChecklistText } from './InlineChecklistText';
import { useChecklistOptions } from './useChecklistOptions';

export function CompactChecklistItem({ checklistId, item, sortingDisabled, first, last, onMove, onDirtyChange, directDelete }: {
  checklistId: string;
  item: ChecklistItem;
  sortingDisabled: boolean;
  first: boolean;
  last: boolean;
  onMove: (direction: 'up' | 'down') => void;
  onDirtyChange: (id: string, dirty: boolean) => void;
  directDelete: boolean;
}) {
  const { snapshot, command, busy, canEdit } = useTrip();
  const [textDirty, setTextDirty] = useState(false);
  const [ownerDraft, setOwnerDraft] = useState<string | null>(null);
  const [ownerFailed, setOwnerFailed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const [completion, setCompletion] = useState<boolean | null>(null);
  const namesId = useId();
  const options = useChecklistOptions();
  const owner = ownerDraft ?? item.assignee;
  const ownerDirty = ownerDraft !== null && ownerDraft !== item.assignee;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id, disabled: sortingDisabled || !canEdit,
  });
  useEffect(() => {
    onDirtyChange(item.id, textDirty || ownerDirty);
    return () => onDirtyChange(item.id, false);
  }, [item.id, textDirty, ownerDirty, onDirtyChange]);
  const update = (status: 'pending' | 'done', assignee = item.assignee) =>
    command({ type: 'checklist.item.update', checklistId, id: item.id, status, assignee });
  return <li ref={setNodeRef} className={`compact-checklist-item${isDragging ? ' is-dragging' : ''}`}
    style={{ transform: CSS.Transform.toString(transform), transition }}
    data-checklist-item-id={item.id} data-reorderable={canEdit || undefined} data-done={item.status === 'done' || undefined}>
    <div className="compact-item-line">
      {canEdit && <button ref={setActivatorNodeRef} type="button" className="checklist-drag-handle"
        id={`checklist-handle-${checklistId}-${item.id}`} disabled={sortingDisabled}
        {...attributes} {...listeners} aria-label={`Drag ${item.title}`}
        title="Drag to reorder. Keyboard: Space, arrows, Space to drop.">
        <Icon name="grip" />
      </button>}
      {canEdit ? <label className="compact-check">
        <input type="checkbox" checked={completion ?? item.status === 'done'} disabled={busy || completion !== null || textDirty || ownerDirty}
          aria-label={item.title} title={textDirty || ownerDirty ? 'Save or cancel edits before changing completion' : undefined}
          onChange={async event => {
            const done = event.target.checked;
            setCompletion(done);
            if (await update(done ? 'done' : 'pending')) {
              // Grouping changes after completion. Keep focus in this list without scrolling.
              requestAnimationFrame(() => {
                document.getElementById(`${done ? 'completed' : 'add-item'}-${checklistId}`)?.focus({ preventScroll: true });
              });
            }
            setCompletion(null);
          }} />
      </label> : <span className="readonly-check" aria-label={item.status === 'done' ? 'Completed' : 'Pending'}>{item.status === 'done' ? '☑' : '☐'}</span>}
      <InlineChecklistText value={item.title} label={`Item text: ${item.title}`} onDirtyChange={setTextDirty}
        onSave={title => command({ type: 'checklist.item.rename', checklistId, id: item.id, title })} />
      {canEdit && directDelete ? <button type="button" className="transition-item-delete"
        disabled={busy || textDirty || ownerDirty} aria-label={`Delete item ${item.title}`} title="Delete"
        onClick={async () => {
          setDeleteFailed(false);
          if (await command({ type: 'checklist.item.delete', checklistId, id: item.id })) {
            document.getElementById(`add-item-${checklistId}`)?.focus({ preventScroll: true });
          } else {
            setDeleteFailed(true);
          }
        }}><Icon name="close" /></button> : canEdit ? <details className="compact-item-options" {...options}>
        <summary aria-label={`Options for ${item.title}`}>···</summary>
        <div className="compact-options-content">
          <p className="fine-print">Owner: {item.assignee || 'Shared'}</p>
          <form className="stack" onSubmit={async event => {
            event.preventDefault();
            if (busy) return;
            const saved = await update(item.status === 'done' ? 'done' : 'pending', owner.trim());
            setOwnerFailed(!saved);
            if (saved) {
              setOwnerDraft(null);
              if (options.ref.current) {
                options.ref.current.open = false;
                options.ref.current.querySelector('summary')?.focus({ preventScroll: true });
              }
            }
          }}>
            <label className="field">Owner for {item.title}
              <input list={namesId} maxLength={100} value={owner} placeholder="Shared" readOnly={busy}
                onChange={event => { setOwnerDraft(event.target.value); setOwnerFailed(false); }} />
            </label>
            <datalist id={namesId}>
              {Array.from(new Set(snapshot.members.map(member => member.name))).map(name => <option key={name} value={name} />)}
            </datalist>
            <button className="button secondary" type="submit" disabled={busy || !ownerDirty}>Save owner</button>
            {ownerDirty && <button className="button ghost" type="button" disabled={busy}
              onClick={() => { setOwnerDraft(null); setOwnerFailed(false); }}>Cancel owner edit</button>}
            {ownerFailed && <p role="status" className="checklist-save-error">Couldn't save. Your assignment is still here.</p>}
          </form>
          <div className="actions checklist-order-actions">
            <button className="button ghost" type="button" disabled={sortingDisabled || first}
              onClick={() => { if (options.ref.current) options.ref.current.open = false; onMove('up'); }}>Move earlier</button>
            <button className="button ghost" type="button" disabled={sortingDisabled || last}
              onClick={() => { if (options.ref.current) options.ref.current.open = false; onMove('down'); }}>Move later</button>
          </div>
          <button className="button ghost" type="button" disabled={busy} onClick={() => setDeleting(true)}>Delete item</button>
          {deleting && <div role="group" aria-label={`Delete ${item.title}`}>
            <p>Delete this item and its unsaved edits?</p>
            <div className="actions">
              <button className="button danger" type="button" disabled={busy} onClick={async () => {
                if (busy) return;
                if (await command({ type: 'checklist.item.delete', checklistId, id: item.id })) {
                  document.getElementById(`add-item-${checklistId}`)?.focus({ preventScroll: true });
                }
              }}>Confirm delete item</button>
              <button className="button ghost" type="button" disabled={busy} onClick={() => setDeleting(false)}>Keep item</button>
            </div>
          </div>}
        </div>
      </details> : item.assignee && <span className="compact-assignee">{item.assignee}</span>}
    </div>
    {deleteFailed && <p role="status" className="checklist-save-error">Couldn't delete this item. Try again.</p>}
    {(textDirty || ownerDirty) && <small className="checklist-edit-hint">Save or cancel edits before changing completion.</small>}
  </li>;
}
