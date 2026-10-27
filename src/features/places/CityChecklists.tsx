import { useCallback, useEffect, useRef, useState } from 'react';
import type { Checklist, City, CityChecklistPosition } from '../../../shared/model';
import { checklistPosition, checklistPositionLabel, tripChecklists } from '../../../shared/checklists';
import { useTrip } from '../../app/TripContext';
import { Icon } from '../../components/Icon';
import { ChecklistEditor } from '../checklists/ChecklistEditor';
import '../checklists/checklists.css';

function progress(list: Checklist) {
  if (list.items.length === 0) return 'No checks yet';
  const remaining = list.items.filter(item => item.status !== 'done').length;
  return remaining === 0 ? 'All checks complete' : `${remaining} ${remaining === 1 ? 'check' : 'checks'} left`;
}

export function CityChecklists({ city, phase, disabled }: { city: City; phase: CityChecklistPosition['phase']; disabled: boolean }) {
  const { snapshot, canEdit, busy, command } = useTrip();
  const lists = tripChecklists(snapshot.data);
  const attached = lists.filter(list => {
    const position = checklistPosition(list);
    return position?.cityId === city.id && position.phase === phase;
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState<{ id: string; title: string; sourceId: string | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [focusTitleId, setFocusTitleId] = useState<string | null>(null);
  const creating = useRef(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const label = checklistPositionLabel(snapshot.data.trip.cities, { cityId: city.id, phase });
  const rememberDirty = useCallback((_id: string, value: boolean) => setDirty(value), []);
  const ignore = useCallback(() => {}, []);

  useEffect(() => {
    if (!focusTitleId || !attached.some(list => list.id === focusTitleId)) return;
    const frame = requestAnimationFrame(() => {
      const input = document.getElementById(`checklist-${focusTitleId}`)?.querySelector<HTMLTextAreaElement>('.inline-list-title textarea');
      input?.focus({ preventScroll: true });
      input?.select();
      setFocusTitleId(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusTitleId, snapshot.data.checklists]);

  useEffect(() => {
    // A retry after a lost response can reveal the already-created list.
    if (!failed || !pending || !snapshot.data.checklists?.some(list => list.id === pending.id)) return;
    setAdding(false);
    setOpenId(pending.id);
    if (!pending.sourceId) setFocusTitleId(pending.id);
    setPending(null);
    setFailed(false);
  }, [failed, pending, snapshot.data.checklists]);

  function close(id: string) {
    setOpenId(null);
    requestAnimationFrame(() => document.getElementById(`transition-icon-${id}`)?.focus({ preventScroll: true }));
  }

  async function add(draft: { id: string; title: string; sourceId: string | null }) {
    if (busy || creating.current) return;
    creating.current = true;
    setPending(draft);
    setFailed(false);
    try {
      const saved = await command({
        type: 'checklist.addCity', ...draft, cityId: city.id, phase,
      });
      setFailed(!saved);
      if (saved) {
        setAdding(false);
        setOpenId(draft.id);
        if (!draft.sourceId) setFocusTitleId(draft.id);
        setPending(null);
      }
    } finally {
      creating.current = false;
    }
  }

  if (!canEdit && attached.length === 0) return null;
  return <div className={`transition-connector city-checklist-${phase}`} aria-label={`Checklists ${label}`}>
    <div className={`transition-checklists${openId || adding ? ' is-expanded' : ''}`}>
      {attached.map(list => openId === list.id
        ? <div className="transition-card" key={list.id}>
          <ChecklistEditor list={list} focusNewItem={false} removed={false}
            transitionHeading={{ progress: `${label} · ${progress(list)}`, onClose: () => close(list.id), closeDisabled: busy || dirty }}
            onDeleted={() => { setOpenId(null); requestAnimationFrame(() => addButton.current?.focus({ preventScroll: true })); }}
            onActivate={ignore} onDirtyChange={rememberDirty} onDiscard={ignore} />
        </div>
        : <button key={list.id} id={`transition-icon-${list.id}`} type="button" className="transition-icon"
          disabled={disabled || busy || dirty} aria-label={`Open ${list.title}, ${label}`}
          aria-expanded={false} title={list.title} onClick={() => { setAdding(false); setOpenId(list.id); }}>
          <Icon name="checklists" />
        </button>)}
      {canEdit && <div className={`transition-picker-anchor${adding ? ' is-open' : ''}`} onKeyDown={event => {
        if (event.key === 'Escape' && adding && !busy) {
          event.preventDefault();
          setAdding(false);
          addButton.current?.focus();
        }
      }}>
        <button ref={addButton} type="button" className="transition-add" disabled={disabled || busy || dirty}
          onClick={() => { setOpenId(null); setAdding(!adding); }} aria-expanded={adding}
          aria-label={`Add checklist ${label}`} title={`Add checklist: ${label}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        {adding && <div className="transition-picker" role="group" aria-label={`Choose a checklist for ${label}`}>
          <p className="transition-picker-label">{label}</p>
          {lists.map(list => <button key={list.id} type="button" disabled={busy || failed}
            onClick={() => void add({ id: crypto.randomUUID(), title: list.title, sourceId: list.id })}>
            <span>{list.title}</span>
            <small>{checklistPosition(list)
              ? checklistPositionLabel(snapshot.data.trip.cities, checklistPosition(list)!)
              : 'Trip checklist'}</small>
          </button>)}
          <button type="button" className="transition-picker-new" disabled={busy || failed}
            onClick={() => void add({ id: crypto.randomUUID(), title: 'Untitled checklist', sourceId: null })}>+ Add new</button>
          {failed && pending && <div role="alert" className="transition-picker-error">
            Couldn't add the checklist. <button type="button" disabled={busy} onClick={() => void add(pending)}>Retry</button>
            <button type="button" disabled={busy} onClick={() => { setPending(null); setFailed(false); }}>Choose another</button>
          </div>}
        </div>}
      </div>}
    </div>
  </div>;
}
