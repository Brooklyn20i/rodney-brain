import React, { useState } from 'react';
import { useCadence } from '../lib/store';
import type { WorkItem, Note } from '../lib/types';
import { ScreenHeader } from '../components/bits';

type Mode = 'task' | 'note';

export function Capture({ onMenu }: { onMenu?: () => void }) {
  const { insert, logActivity } = useCadence();
  const [mode, setMode] = useState<Mode>('task');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      if (mode === 'task') {
        await insert('work_items', {
          title: text.trim().split('\n')[0].slice(0, 200), type: 'task', priority: 'medium',
          due_date: null, project_id: null, notes: text.trim(), inboxed: true, source: 'capture',
        } as Partial<WorkItem>);
        logActivity('capture_task', text.trim().split('\n')[0]);
      } else {
        const lines = text.trim().split('\n');
        await insert('notes', { title: lines[0].slice(0, 120), body: lines.slice(1).join('\n') } as Partial<Note>);
        logActivity('capture_note', lines[0]);
      }
      setText(''); setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setBusy(false); }
  };

  return (
    <>
      <ScreenHeader title="Capture" subtitle="Get it out of your head" onMenu={onMenu} />
      <div className="screen-content">
        <div className="seg">
          <button className={`seg-btn ${mode === 'task' ? 'active' : ''}`} onClick={() => setMode('task')}>→ Inbox task</button>
          <button className={`seg-btn ${mode === 'note' ? 'active' : ''}`} onClick={() => setMode('note')}>→ Note</button>
        </div>
        <div className="form-group" style={{ marginTop: 14 }}>
          <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)}
            placeholder={mode === 'task' ? 'What needs doing? (first line becomes the title)' : 'First line is the title, the rest is the body…'}
            style={{ minHeight: 220 }}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(); }} />
        </div>
        <button className="btn btn-primary" onClick={save} disabled={busy || !text.trim()}
          style={{ width: '100%', justifyContent: 'center' }}>
          {busy ? 'Saving…' : saved ? 'Saved ✓' : mode === 'task' ? 'Add to Inbox' : 'Save note'}
        </button>
        <p className="card-meta" style={{ marginTop: 12, textAlign: 'center', color: 'var(--text3)' }}>
          Tip: ⌘/Ctrl + Enter to save fast.
        </p>
      </div>
    </>
  );
}
