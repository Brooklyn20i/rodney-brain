import { useState } from 'react';
import { useCadence } from '../lib/store';
import type { WorkItem, ItemType, Priority } from '../lib/types';
import { TypeTag, PriTag, ScreenHeader } from '../components/bits';

interface Extracted { title: string; type: ItemType; priority: Priority; checked: boolean; }

// Heuristic classifier — mirrors the original PWA. Runs entirely on-device.
function classify(line: string): { type: ItemType; priority: Priority } {
  const t = line.toLowerCase();
  let type: ItemType = 'task';
  if (/\b(decide|decision|choose|approve)\b/.test(t)) type = 'decision';
  else if (/\b(waiting|blocked by|pending from|need .* from)\b/.test(t)) type = 'waitingFor';
  else if (/\b(follow up|chase|circle back|check in)\b/.test(t)) type = 'followUp';
  else if (/\b(risk|concern|issue|blocker)\b/.test(t)) type = 'risk';
  else if (/\b(action|todo|to-do|send|prepare|review)\b/.test(t)) type = 'action';
  let priority: Priority = 'medium';
  if (/\b(urgent|asap|critical|today|high)\b/.test(t)) priority = 'high';
  else if (/\b(later|someday|low|whenever)\b/.test(t)) priority = 'low';
  return { type, priority };
}

interface QueueItem { id: string; name: string; text: string; results: Extracted[]; }

export function Capture({ onMenu }: { onMenu?: () => void }) {
  const { insert, logActivity } = useCadence();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const item = queue.find((q) => q.id === selected) || null;

  const addCapture = () => {
    const id = Math.random().toString(36).slice(2);
    const q: QueueItem = { id, name: `Capture ${queue.length + 1}`, text: '', results: [] };
    setQueue((cur) => [...cur, q]); setSelected(id);
  };
  const setText = (text: string) => setQueue((cur) => cur.map((q) => q.id === selected ? { ...q, text } : q));
  const extract = () => {
    if (!item) return;
    const lines = item.text.split('\n').map((l) => l.trim()).filter((l) => l.length > 2);
    const results: Extracted[] = lines.map((l) => ({ title: l, ...classify(l), checked: true }));
    setQueue((cur) => cur.map((q) => q.id === selected ? { ...q, results } : q));
  };
  const toggle = (i: number) => setQueue((cur) => cur.map((q) => q.id === selected ? { ...q, results: q.results.map((r, idx) => idx === i ? { ...r, checked: !r.checked } : r) } : q));
  const addChecked = async () => {
    if (!item || adding) return;
    const checkedIdx = item.results.map((r, i) => (r.checked ? i : -1)).filter((i) => i >= 0);
    if (checkedIdx.length === 0) return;
    setAdding(true);
    // Indices that successfully saved — used to avoid re-inserting on retry.
    const savedOk = new Set<number>();
    try {
      for (const i of checkedIdx) {
        const r = item.results[i];
        await insert('work_items', { title: r.title, type: r.type, priority: r.priority, due_date: null, project_id: null, person_id: null, notes: '', inboxed: true, source: 'capture' } as Partial<WorkItem>);
        savedOk.add(i);
      }
      logActivity('capture_extract', `${checkedIdx.length} items`);
      setQueue((cur) => cur.filter((q) => q.id !== selected));
      setSelected(null);
    } catch {
      // Keep only the results that did NOT save, so a retry inserts the rest.
      setQueue((cur) => cur.map((q) => q.id === selected
        ? { ...q, results: q.results.filter((_, i) => !savedOk.has(i)) }
        : q));
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <ScreenHeader title="Capture" onMenu={onMenu} />
      <div className="split-view">
        <div className="split-left">
          <div className="split-panel-header"><h3>Screenshot Queue</h3><button className="btn btn-primary btn-sm" onClick={addCapture}>+ Add</button></div>
          <div className="split-panel-body">
            {queue.length ? queue.map((q) => (
              <button className={`capture-queue-item ${selected === q.id ? 'selected' : ''}`} key={q.id} onClick={() => setSelected(q.id)}>
                <span className="cq-thumb">📋</span>
                <div className="cq-info"><div className="cq-name">{q.name}</div><div className="cq-status">{q.results.length ? `${q.results.length} items extracted` : 'Not yet processed'}</div></div>
                <span className={`status-dot ${q.results.length ? 'done' : 'pending'}`} />
              </button>
            )) : <small style={{ color: 'var(--text3)' }}>No screenshots yet. Tap "+ Add" to import.</small>}
          </div>
        </div>
        {item ? (
          <div className="split-right">
            <div className="split-panel-header"><h3>{item.name}</h3></div>
            <div className="split-panel-body">
              <div className="capture-drop-zone"><div className="drop-icon">📷</div>
                <p>Paste the text from a screenshot below</p>
                <small>Text is extracted locally — nothing leaves your device</small>
              </div>
              <div className="form-group"><label>Extracted / Typed Text</label>
                <textarea value={item.text} placeholder="Paste or type the text from this screenshot…" style={{ minHeight: 120 }} onChange={(e) => setText(e.target.value)} /></div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button className="btn btn-primary" onClick={extract}>🔍 Extract Work Items</button>
              </div>
              {item.results.length > 0 && <>
                <div className="settings-section-title">Extracted Items</div>
                {item.results.map((r, i) => (
                  <div className="result-item" key={i}>
                    <input type="checkbox" checked={r.checked} onChange={() => toggle(i)} />
                    <div className="result-item-content"><div className="ri-title">{r.title}</div>
                      <div className="ri-tags"><TypeTag type={r.type} /><PriTag priority={r.priority} /></div></div>
                  </div>
                ))}
                <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={addChecked} disabled={adding}>{adding ? 'Adding…' : 'Add Checked to Inbox'}</button>
              </>}
            </div>
          </div>
        ) : (
          <div className="split-right">
            <div className="split-panel-header"><h3>Select a screenshot</h3></div>
            <div className="split-panel-body">
              <div className="capture-drop-zone"><div className="drop-icon">📋</div>
                <p>Paste text or notes, then extract work items</p>
                <small>Tap "+ Add" to create a new capture session</small>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
