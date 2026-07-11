import { useEffect, useState } from 'react';
import { useCadence } from '../lib/store';
import { QuickAdd } from './QuickAdd';

// Global Capture — the one always-available way to throw a follow-up into
// Cadence Work from any screen. A floating button (plus the `c` shortcut on a
// keyboard) opens the existing Quick Add sheet: title is the only required
// field and the item lands as an untriaged Quick Capture in the Inbox and the
// Today triage tray. Rendered once at the app shell, Work domain only.
export function GlobalCapture() {
  const { canEdit } = useCadence();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'c' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      // Never steal the key while typing.
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canEdit]);

  if (!canEdit) return null;
  return (
    <>
      {!open && (
        <button className="capture-fab" title="Capture (c) — lands in the Inbox to triage later"
          aria-label="Capture" onClick={() => setOpen(true)}>
          <span className="capture-fab-plus">＋</span>
          <span className="capture-fab-label">Capture</span>
        </button>
      )}
      {open && <QuickAdd onClose={() => setOpen(false)} />}
    </>
  );
}
