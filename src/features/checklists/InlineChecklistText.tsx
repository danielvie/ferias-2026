import { useEffect, useRef, useState } from 'react';
import { useTrip } from '../../app/TripContext';

/** Keep drafts local across refreshed props. Only a confirmed save clears them. */
export function InlineChecklistText({ value, label, title = false, onSave, onDirtyChange }: {
  value: string;
  label: string;
  title?: boolean;
  onSave: (text: string) => Promise<boolean>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { busy, canEdit } = useTrip();
  const [draft, setDraft] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const text = draft ?? value;
  const dirty = draft !== null && draft !== value;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    const element = input.current;
    if (!element) return;
    const resize = () => {
      element.style.height = 'auto';
      element.style.height = `${Math.max(44, element.scrollHeight)}px`;
    };
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth !== width) { width = element.clientWidth; resize(); }
    });
    resize();
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, canEdit]);

  async function save() {
    if (busy || !dirty || !text.trim()) return;
    const saved = await onSave(text.trim());
    setFailed(!saved);
    if (saved) setDraft(null);
  }
  if (!canEdit) return <span className={title ? 'compact-list-title' : 'compact-item-text'}>{value}</span>;
  return <form className={`inline-checklist-text${title ? ' inline-list-title' : ''}`} onSubmit={event => {
    event.preventDefault(); void save();
  }}>
    <textarea ref={input} rows={1} aria-label={label} value={text} required maxLength={200} readOnly={busy}
      onChange={event => { setDraft(event.target.value); setFailed(false); }}
      onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault(); void save();
        } else if (event.key === 'Escape') {
          event.preventDefault(); setDraft(null); setFailed(false);
        }
      }} />
    {dirty && <div className="inline-text-actions">
      <button className="button ghost" type="submit" disabled={busy || !text.trim()}>{failed ? 'Retry' : 'Save'}</button>
      <button className="button ghost" type="button" disabled={busy} onClick={() => { setDraft(null); setFailed(false); }}>Cancel</button>
    </div>}
    {failed && <p role="status" className="checklist-save-error">Couldn't save. Your draft is still here.</p>}
  </form>;
}
