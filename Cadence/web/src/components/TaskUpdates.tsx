import { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import type { Comment } from '../lib/types';
import { fmtDMY } from '../lib/util';

// A running log on a single task: type an update, and it's timestamped and
// kept forever. System entries (direction swaps, completion) are written into
// the same thread by the task editor, so this doubles as the task's history.
// Backed by the existing `comments` table — no schema change.
export function TaskUpdates({ workItemId, createdAt }: { workItemId: string; createdAt?: string }) {
  const { data, insert, remove } = useCadence();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const updates = useMemo(
    () => data.comments
      .filter((c) => c.work_item_id === workItemId && !c.deleted_at)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
    [data.comments, workItemId],
  );

  const add = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await insert('comments', { work_item_id: workItemId, text: t } as Partial<Comment>);
      setText('');
    } finally { setBusy(false); }
  };

  const when = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${fmtDMY(iso)} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="task-updates">
      <label className="task-updates-label">Updates &amp; history</label>
      <div className="task-updates-compose">
        <textarea
          className="task-updates-input"
          value={text}
          rows={2}
          placeholder="Log an update — what changed, what was said…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void add(); } }}
        />
        <button className="btn btn-primary btn-sm" disabled={!text.trim() || busy} onClick={() => void add()}>
          Add update
        </button>
      </div>

      <div className="task-updates-list">
        {updates.map((u) => (
          <div key={u.id} className={`task-update${u.author === 'system' ? ' task-update-system' : ''}`}>
            <div className="task-update-head">
              <span className="task-update-author">{u.author === 'system' ? '↔ System' : u.author === 'you' ? 'You' : u.author}</span>
              <span className="task-update-when">{when(u.created_at)}</span>
              <button className="task-update-del" title="Delete update" onClick={() => remove('comments', u.id)}>✕</button>
            </div>
            <div className="task-update-text">{u.text}</div>
          </div>
        ))}
        {createdAt && (
          <div className="task-update task-update-origin">
            <span className="task-update-when">Created {fmtDMY(createdAt)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
