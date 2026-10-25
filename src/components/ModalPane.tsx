import { useEffect, useId, useRef, type ReactNode } from 'react';

/** Native modal semantics keep the background inert and keyboard focus inside.
 * https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal
 */
export function ModalPane({ title, children, onClose, busy = false, variant = 'pane' }: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  variant?: 'pane' | 'sheet';
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    element.showModal();
    // React's autoFocus runs while the dialog is still closed.
    element.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, select')?.focus({ preventScroll: true });
    document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialog} className={`modal-${variant}`} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="modal-heading">
      <h2 id={titleId}>{title}</h2>
      <button className="button ghost" type="button" disabled={busy} onClick={onClose} aria-label={`Close ${title}`}>Close</button>
    </header>
    <div className="modal-content">{children}</div>
  </dialog>;
}
