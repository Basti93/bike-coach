import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Full screen on the phone: title, × top right, the body, and a sticky bottom area for the primary button.
 * The page behind does not scroll. Escape, ×, and the browser's Back all call `onClose`. Focus goes to the sheet and returns afterwards.
 * Render it only while it is open: `{open && <Sheet …/>}`.
 */
/** Open sheets, the newest last: Escape and Back only close the top one, so a sheet may open another (a picker inside a form). */
const stack: string[] = [];

export function Sheet({ title, onClose, children, actions }: { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!box.current?.contains(document.activeElement)) box.current?.focus(); // an autoFocus field inside keeps the focus
    // Back closes the sheet: it takes one history entry while open, and gives it back when closed by other means.
    stack.push(id);
    const mark = { sheet: id };
    let popped = false;
    try { history.pushState(mark, ''); } catch { /* no history: Escape and × still work */ }
    const onPop = () => { if ((history.state as { sheet?: string } | null)?.sheet === id) return; popped = true; close.current(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && stack[stack.length - 1] === id) { e.stopPropagation(); close.current(); } };
    window.addEventListener('popstate', onPop);
    document.addEventListener('keydown', onKey);
    return () => {
      stack.splice(stack.indexOf(id), 1);
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (!popped && (history.state as { sheet?: string } | null)?.sheet === id) history.back();
      before?.focus();
    };
  }, [id]);

  return createPortal(
    <div className="tk-screen tk-sheet" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} tabIndex={-1} ref={box}>
      <header className="tk-sheet-head">
        <h2 id={`${id}-t`}>{title}</h2>
        <button type="button" className="link tk-sheet-x" aria-label="Schließen" onClick={onClose}>×</button>
      </header>
      <div className="tk-sheet-body">{children}</div>
      {actions && <footer className="tk-sheet-actions">{actions}</footer>}
    </div>,
    document.body,
  );
}
