import { useEffect, useRef } from 'react';

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/* Modal behaviour shared by the confirm dialogs: focus moves in, Tab stays inside, Escape cancels (unless busy),
   and focus returns to the element that opened it. onCancel/busy live in refs so an inline arrow never re-runs the effect. */
export function useDialog({ onCancel, busy = false, initialFocus = '.btn-primary, .sp-button-primary' }) {
  const ref = useRef(null);
  const cancelRef = useRef(onCancel);
  const busyRef = useRef(busy);
  cancelRef.current = onCancel;
  busyRef.current = busy;
  useEffect(() => {
    const opener = document.activeElement;
    const root = ref.current;
    (root?.querySelector(initialFocus) || root?.querySelector(FOCUSABLE))?.focus();
    const onKey = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!busyRef.current) cancelRef.current?.();
        return;
      }
      if (event.key !== 'Tab' || !root) return;
      const items = [...root.querySelectorAll(FOCUSABLE)];
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0]; const last = items[items.length - 1];
      if (!root.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); if (opener instanceof HTMLElement && opener.isConnected) opener.focus(); };
  }, []);
  return ref;
}
