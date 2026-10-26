import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

/** Dismissing options hides controls without clearing their local drafts. */
export function useChecklistOptions() {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target) && ref.current) ref.current.open = false;
    };
    window.addEventListener('pointerdown', dismiss);
    return () => window.removeEventListener('pointerdown', dismiss);
  }, [open]);
  return {
    ref,
    onToggle: () => setOpen(Boolean(ref.current?.open)),
    onKeyDown: (event: KeyboardEvent<HTMLDetailsElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.currentTarget.open = false;
        event.currentTarget.querySelector('summary')?.focus();
      }
    },
  };
}
