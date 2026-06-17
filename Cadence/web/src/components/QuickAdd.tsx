import React, { useState, useRef } from 'react';
import { useCadence } from '../lib/store';
import type { ItemType, Priority, WorkItem } from '../lib/types';
import { localDateStr } from '../lib/util';
import { ItemModal } from './ItemModal';

// ── Parser ────────────────────────────────────────────────────────────────────

interface Parsed {
  title: string;
  type: ItemType;
  priority: Priority;
  due_date: string | null;
  person_id: string | null;
  project_id: string | null;
  personName?: string;
  projectName?: string;
  dateLabel?: string;
}

const TYPE_LABELS: Record<ItemType, string> = {
  task: 'Task', decision: 'Decision', followUp: 'Follow Up',
  waitingFor: 'Waiting For', risk: 'Risk', action: 'Action',
};

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const DAY_SHORT = ['sun','mon','tue','wed','thu','fri','sat'];


function parseInput(
  raw: string,
  people: { id: string; name: string }[],
  projects: { id: string; name: string; status: string }[],
): Parsed {
  const low = raw.toLowerCase();
  let type: ItemType = 'task';
  let priority: Priority = 'medium';
  let due_date: string | null = null;
  let person_id: string | null = null;
  let project_id: string | null = null;
  let personName: string | undefined;
  let projectName: string | undefined;
  let dateLabel: string | undefined;

  // Type detection (order matters — more specific first)
  if (/\b(decide|decision)\b/.test(low))                   type = 'decision';
  else if (/\b(waiting for|waiting on|chasing)\b/.test(low)) type = 'waitingFor';
  else if (/\b(follow.?up|check in with)\b/.test(low))    type = 'followUp';
  else if (/\brisk\b/.test(low))                            type = 'risk';
  else if (/\b(action item|meeting action)\b/.test(low))   type = 'action';

  // Priority
  if (/\b(urgent|asap|!!|high priority|high pri)\b/.test(low)) priority = 'high';
  else if (/\b(low priority|low pri)\b/.test(low))              priority = 'low';

  // Date
  const today = new Date();
  if (/\btoday\b/.test(low)) {
    due_date = localDateStr(today); dateLabel = 'Today';
  } else if (/\btomorrow\b/.test(low)) {
    const d = new Date(today); d.setDate(d.getDate() + 1);
    due_date = localDateStr(d); dateLabel = 'Tomorrow';
  } else if (/\bend of (the )?week\b/.test(low)) {
    const d = new Date(today);
    const toFri = (5 - d.getDay() + 7) % 7 || 5;
    d.setDate(d.getDate() + toFri);
    due_date = localDateStr(d); dateLabel = 'End of week';
  } else if (/\bnext week\b/.test(low)) {
    const d = new Date(today); d.setDate(d.getDate() + 7);
    due_date = localDateStr(d); dateLabel = 'Next week';
  } else {
    const dm = low.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/);
    if (dm) {
      const name = dm[1];
      let idx = DAY_NAMES.indexOf(name);
      if (idx === -1) idx = DAY_SHORT.indexOf(name);
      if (idx !== -1) {
        const d = new Date(today);
        let diff = idx - d.getDay();
        if (diff <= 0) diff += 7;
        d.setDate(d.getDate() + diff);
        due_date = localDateStr(d);
        dateLabel = name.charAt(0).toUpperCase() + name.slice(1);
      }
    }
  }

  // Person — match by first name
  for (const p of people) {
    const first = p.name.split(' ')[0];
    if (first.length >= 3 && new RegExp(`\\b${first}\\b`, 'i').test(raw)) {
      person_id = p.id; personName = p.name; break;
    }
  }

  // Project — word match on active projects
  for (const p of projects.filter((p) => p.status === 'active')) {
    const words = p.name.split(/\s+/).filter((w) => w.length >= 4);
    if (words.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(raw))) {
      project_id = p.id; projectName = p.name; break;
    }
  }

  return { title: raw.trim(), type, priority, due_date, person_id, project_id, personName, projectName, dateLabel };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function QuickAdd({ onClose }: { onClose: () => void }) {
  const { data, insert, logActivity } = useCadence();
  const [text, setText] = useState('');
  const [openFull, setOpenFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = parseInput(text, data.people.filter((p) => !p.type || p.type === 'person'), data.projects);

  const chips: { label: string; cls: string }[] = [];
  if (parsed.type !== 'task')       chips.push({ label: TYPE_LABELS[parsed.type], cls: `tag tag-${parsed.type}` });
  if (parsed.personName)            chips.push({ label: parsed.personName, cls: 'tag tag-info' });
  if (parsed.dateLabel)             chips.push({ label: parsed.dateLabel, cls: 'tag tag-followUp' });
  if (parsed.priority === 'high')   chips.push({ label: 'High priority', cls: 'tag pri-high' });
  if (parsed.priority === 'low')    chips.push({ label: 'Low priority', cls: 'tag pri-low' });
  if (parsed.projectName)           chips.push({ label: parsed.projectName, cls: 'tag tag-task' });

  const addToInbox = async () => {
    if (!parsed.title) return;
    setBusy(true);
    try {
      await insert('work_items', {
        title: parsed.title,
        type: parsed.type,
        priority: parsed.priority,
        due_date: parsed.due_date,
        person_id: parsed.person_id,
        project_id: parsed.project_id,
        notes: '',
        inboxed: true,
        source: 'you',
      } as Partial<WorkItem>);
      logActivity('add_item', parsed.title);
      onClose();
    } finally { setBusy(false); }
  };

  // "Edit Details" — hand parsed values straight into ItemModal
  if (openFull) {
    return (
      <ItemModal
        defaults={{
          title: parsed.title || undefined,
          type: parsed.type,
          priority: parsed.priority,
          due_date: parsed.due_date,
          person_id: parsed.person_id,
          project_id: parsed.project_id,
        } as Partial<WorkItem>}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="quick-add-overlay">
      <div className="quick-add-backdrop" onClick={onClose} />
      <div className="quick-add-sheet">
        <div className="quick-add-header">
          <span className="quick-add-title">⚡ Quick Add</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <input
          ref={inputRef}
          autoFocus
          className="quick-add-input"
          placeholder='Try "Follow up with Amy on Friday" or "Decision about budget high priority"'
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim()) addToInbox();
            if (e.key === 'Escape') onClose();
          }}
        />

        <div className="quick-add-chips" style={{ minHeight: 28 }}>
          {text && chips.length === 0 && <span className="tag tag-task">Task</span>}
          {chips.map((c, i) => <span key={i} className={c.cls}>{c.label}</span>)}
        </div>

        <div className="quick-add-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setOpenFull(true)} disabled={!text.trim()}>
            Edit details
          </button>
          <button className="btn btn-primary" onClick={addToInbox} disabled={!text.trim() || busy}>
            {busy ? 'Adding…' : 'Add to Inbox →'}
          </button>
        </div>

        <p className="quick-add-hint">
          Tip: mention a name, "today / tomorrow / Friday", or "high priority" and Cadence auto-detects them
        </p>
      </div>
    </div>
  );
}
