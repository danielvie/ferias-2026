import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { tripChecklists } from '../../../shared/checklists';
import type { Checklist } from '../../../shared/model';
import { useTrip } from '../../app/TripContext';
import { ChecklistEditor } from './ChecklistEditor';
import { ChecklistNavigator } from './ChecklistNavigator';
import { DeparturesSection } from './DeparturesSection';
import { NewChecklistForm } from './NewChecklistForm';
import './checklists.css';

function scrollToChecklist(id: string, focus = true, behavior?: ScrollBehavior) {
  const element = document.getElementById(`checklist-${id}`);
  if (!element) return;
  const header = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;
  const top = element.getBoundingClientRect().top + window.scrollY - header - 16;
  window.scrollTo({ top, behavior: behavior ?? (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth') });
  if (focus) element.focus({ preventScroll: true });
}

export function ChecklistsPage() {
  const { snapshot, canEdit, busy } = useTrip();
  const currentLists = useMemo(() => tripChecklists(snapshot.data), [snapshot.data]);
  const source = useRef(currentLists);
  source.current = currentLists;
  const [draftLists, setDraftLists] = useState(new Map<string, Checklist>());
  const rememberDraft = useCallback((id: string, dirty: boolean) => {
    setDraftLists(previous => {
      if (previous.has(id) === dirty) return previous;
      const next = new Map(previous);
      const list = source.current.find(list => list.id === id);
      if (dirty && list) next.set(id, list); else next.delete(id);
      return next;
    });
  }, []);
  const lists = useMemo(() => [...currentLists, ...[...draftLists.values()]
    .filter(draft => !currentLists.some(list => list.id === draft.id))], [currentLists, draftLists]);
  const [selectedId, setSelectedId] = useState(lists[0]?.id ?? '');
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [focusItemId, setFocusItemId] = useState<string | null>(null);
  const page = useRef<HTMLDivElement>(null);
  const activeId = lists.some(list => list.id === selectedId) ? selectedId : lists[0]?.id ?? '';
  const current = useRef(activeId);
  current.current = activeId;
  const listIds = lists.map(list => list.id).join(',');

  useEffect(() => {
    const header = document.querySelector('.topbar');
    if (!header) return;
    const measure = () => page.current?.style.setProperty('--checklist-header-height', `${header.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    measure();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const ids = listIds ? listIds.split(',') : [];
    let frame = 0;
    let width = window.innerWidth;
    let resizeTarget: string | null = null;
    function update() {
      frame = 0;
      if (resizeTarget) {
        const id = resizeTarget;
        resizeTarget = null;
        scrollToChecklist(id, false, 'instant');
        setSelectedId(id);
        return;
      }
      const edge = (document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0) + 32;
      let active = ids[0];
      for (const id of ids) {
        const element = document.getElementById(`checklist-${id}`);
        if (element && element.getBoundingClientRect().top <= edge) active = id;
        else break;
      }
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
        // Short trailing lists cannot always reach the header. Keep the chosen
        // list while its heading is visible instead of selecting its neighbor.
        const top = document.getElementById(`checklist-${current.current}`)?.getBoundingClientRect().top;
        active = top !== undefined && top > edge && top < window.innerHeight ? current.current : ids.at(-1) ?? active;
      }
      if (active) setSelectedId(active);
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const resize = () => {
      // Reflow keeps the same list without replacing its editor or focus.
      // Height-only changes, including the software keyboard, must not jump.
      if (window.innerWidth !== width) {
        width = window.innerWidth;
        resizeTarget = current.current;
      }
      schedule();
    };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', resize);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', resize);
    };
  }, [listIds]);

  function select(id: string) {
    setSelectedId(id);
    setFocusItemId(null);
    requestAnimationFrame(() => scrollToChecklist(id));
  }

  return (
    <div className="checklists-page" ref={page}>
      <header className="page-heading checklist-page-heading">
        <h1>Checklists</h1>
        {canEdit && <button className="button secondary" type="button" aria-label="New checklist" disabled={busy || Boolean(creatingId) || lists.length >= 100}
          onClick={() => {
            setCreatingId(crypto.randomUUID());
            requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.new-checklist-form input')?.focus());
          }}>+ <span className="checklist-new-full">New checklist</span><span className="checklist-new-short" aria-hidden="true">New</span></button>}
      </header>
      {!canEdit && <p className="muted">Read-only access. Only the owner and editors can change checklists.</p>}
      <div className="checklist-workspace">
        <ChecklistNavigator lists={lists} activeId={activeId} onSelect={select} />
        <div className="checklist-editors">
          {lists.length === 0 && !creatingId && <p className="muted">No checklists yet.{canEdit ? ' Create one to start adding items.' : ''}</p>}
          {lists.map(list => <ChecklistEditor key={list.id} list={list}
            removed={!currentLists.some(current => current.id === list.id)} onDirtyChange={rememberDraft}
            onDiscard={id => rememberDraft(id, false)}
            focusNewItem={focusItemId === list.id} onActivate={setSelectedId} onDeleted={id => {
              rememberDraft(id, false);
              const next = lists.find(list => list.id !== id);
              setFocusItemId(null);
              if (next) select(next.id);
              else requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.checklist-page-heading button')?.focus());
            }} />)}
          {canEdit && creatingId && <NewChecklistForm key={creatingId} id={creatingId}
            onCancel={() => setCreatingId(null)} onCreated={id => {
              setCreatingId(null); setSelectedId(id); setFocusItemId(id);
              requestAnimationFrame(() => scrollToChecklist(id, false));
            }} />}
          <DeparturesSection />
        </div>
      </div>
    </div>
  );
}
