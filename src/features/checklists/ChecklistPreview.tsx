import { useLayoutEffect, useRef, useState } from 'react';
import type { Checklist } from '../../../shared/model';

export function ChecklistPreview({ list, anchor, id, onDismiss }: {
  list: Checklist;
  anchor: HTMLButtonElement;
  id: string;
  onDismiss: () => void;
}) {
  const card = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);

  // Measure the actual wrapped title before painting, rather than guessing its height.
  // https://react.dev/reference/react/useLayoutEffect#measuring-layout-before-the-browser-repaints-the-screen
  useLayoutEffect(() => {
    const rail = anchor.closest<HTMLElement>('.checklist-dial');
    const nav = anchor.parentElement;
    if (!rail || !nav || !card.current) return;
    const place = () => {
      const marker = anchor.getBoundingClientRect();
      const visible = nav.getBoundingClientRect();
      if (!anchor.isConnected || marker.bottom <= visible.top || marker.top >= visible.bottom) {
        onDismiss();
        return;
      }
      const railTop = rail.getBoundingClientRect().top;
      const bottomLimit = Math.max(16, window.innerHeight - card.current!.offsetHeight - 16);
      const topLimit = Math.min(railTop, bottomLimit);
      setTop(Math.max(topLimit, Math.min(marker.top - 12, bottomLimit)) - railTop);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(card.current);
    observer.observe(rail);
    nav.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      nav.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
    };
  }, [anchor, list.title, list.items.length, onDismiss]);

  return <div ref={card} id={id} role="tooltip" className="checklist-preview" style={{ top }}>
    <div className="checklist-preview-card">
      <strong>{list.title}</strong>
      <p>{list.items.length} {list.items.length === 1 ? 'item' : 'items'}</p>
    </div>
  </div>;
}
