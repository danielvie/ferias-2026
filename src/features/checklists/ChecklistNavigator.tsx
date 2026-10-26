import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import type { Checklist } from '../../../shared/model';
import { ModalPane } from '../../components/ModalPane';
import { markerEmphasis } from '../../components/rail-emphasis';
import { ChecklistPreview } from './ChecklistPreview';
import '../../components/rail.css';

export function ChecklistNavigator({ lists, activeId, onSelect }: {
  lists: Checklist[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const [picker, setPicker] = useState(false);
  const [preview, setPreview] = useState<{ id: string; anchor: HTMLButtonElement } | null>(null);
  const dial = useRef<HTMLElement>(null);
  const tooltipId = useId();
  const previewList = lists.find(list => list.id === preview?.id);
  const emphasized = previewList ? lists.indexOf(previewList) : null;
  const dismissPreview = useCallback(() => setPreview(null), []);
  useEffect(() => {
    if (!previewList) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') dismissPreview(); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [previewList, dismissPreview]);

  return <>
    {lists.length > 0 && <aside className="checklist-dial" aria-label="Checklist dial" onPointerLeave={dismissPreview}>
      <span className="checklist-dial-label" onPointerEnter={dismissPreview}>Lists</span>
      <nav ref={dial} aria-label="Checklist markers"
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) dismissPreview(); }}>
        {lists.map((list, index) => {
          const emphasis = markerEmphasis(index, emphasized);
          return <button key={list.id} type="button"
          aria-label={`Go to checklist ${index + 1}: ${list.title}`}
          aria-current={activeId === list.id ? 'true' : undefined}
          aria-describedby={previewList?.id === list.id ? tooltipId : undefined}
          style={{ '--tick-growth': emphasis.width, '--tick-tint': emphasis.color } as CSSProperties}
          onPointerEnter={event => {
            if (event.pointerType === 'mouse') setPreview({ id: list.id, anchor: event.currentTarget });
          }}
          onPointerDown={event => { if (event.pointerType === 'touch') dismissPreview(); }}
          onFocus={event => {
            if (event.currentTarget.matches(':focus-visible')) setPreview({ id: list.id, anchor: event.currentTarget });
          }}
          onKeyDown={event => {
            const next = event.key === 'ArrowDown' ? index + 1 : event.key === 'ArrowUp' ? index - 1 :
              event.key === 'Home' ? 0 : event.key === 'End' ? lists.length - 1 : null;
            if (next === null) return;
            event.preventDefault();
            dial.current?.querySelectorAll('button')[Math.max(0, Math.min(next, lists.length - 1))]?.focus();
          }}
          onClick={() => { dismissPreview(); onSelect(list.id); }}>
          <span aria-hidden="true">{index + 1}</span><i className="rail-tick" aria-hidden="true" />
        </button>;
        })}
      </nav>
      <button className="checklist-dial-all" type="button" onPointerEnter={dismissPreview} onClick={() => {
        dismissPreview(); setPicker(true);
      }}>All</button>
      {previewList && preview && <ChecklistPreview list={previewList} anchor={preview.anchor}
        id={tooltipId} onDismiss={dismissPreview} />}
    </aside>}
    {picker && <ModalPane title="Choose a checklist" variant="sheet" onClose={() => setPicker(false)}>
      <nav className="checklist-picker" aria-label="All checklists">
        {lists.map((list, index) => <button key={list.id} className="button secondary" type="button"
          aria-current={activeId === list.id ? 'true' : undefined}
          onClick={() => { setPicker(false); onSelect(list.id); }}>
          <span>{index + 1}</span><span>{list.title}</span>
        </button>)}
      </nav>
    </ModalPane>}
  </>;
}
