import { useCallback, useEffect, useRef, useState } from 'react';
import { RichEditor } from './RichEditor';
import { toEditorHtml, htmlIsEmpty } from '../lib/richText';

// The task's writing surface — a real rich editor (bold, bullets, headings)
// with room to grow, replacing the old three-line textarea. This is where 1:1
// content lives: what was said, decided, and why. Expand for a full-height
// writing session.
//
// Two modes:
//  - onAutosave (Home detail panel): debounced + blur saves, dirty-guarded so
//    an untouched editor never writes.
//  - onDraftChange (Item modal): parent holds the draft and persists on Save.
export function TaskNotesEditor({ initial, onAutosave, onDraftChange, compact }: {
  initial: string;
  onAutosave?: (html: string) => void;
  onDraftChange?: (html: string) => void;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const htmlRef = useRef(toEditorHtml(initial));
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (!dirtyRef.current || !onAutosave) return;
    dirtyRef.current = false;
    onAutosave(htmlIsEmpty(htmlRef.current) ? '' : htmlRef.current);
  }, [onAutosave]);

  const handleChange = (html: string) => {
    htmlRef.current = html;
    if (onDraftChange) onDraftChange(htmlIsEmpty(html) ? '' : html);
    if (onAutosave) {
      dirtyRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, 800);
    }
  };

  // Never lose typed notes when the panel unmounts mid-debounce.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { flush(); }, []);

  return (
    <div className={`task-notes${expanded ? ' expanded' : ''}${compact ? ' compact' : ''}`}>
      <div className="task-notes-hdr">
        <label>Notes</label>
        <button type="button" className="task-notes-expand" onClick={() => setExpanded((e) => !e)}>
          {expanded ? '⤡ Collapse' : '⤢ Expand'}
        </button>
      </div>
      <div className="task-notes-editor">
        <RichEditor
          content={htmlRef.current}
          onChange={handleChange}
          onBlur={() => flush()}
          placeholder="Get the content down — context, what was said, decisions, links…"
        />
      </div>
    </div>
  );
}
