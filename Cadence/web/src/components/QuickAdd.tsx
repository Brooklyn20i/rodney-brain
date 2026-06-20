import { useState, useRef } from 'react';
import { useCadence } from '../lib/store';
import type { ItemType, Priority, WorkItem } from '../lib/types';
import { localDateStr, fmtDM } from '../lib/util';
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

const PRIORITY_CYCLE: Priority[] = ['low', 'medium', 'high'];
const TYPE_ORDER: ItemType[] = ['task', 'followUp', 'waitingFor', 'decision', 'risk', 'action'];
const nextType = (t: ItemType): ItemType => TYPE_ORDER[(TYPE_ORDER.indexOf(t) + 1) % TYPE_ORDER.length];

// `undefined` on an override means "follow the parser"; an explicit value
// (including null) means the user took manual control of that field.
interface Overrides {
  person?: string | null;
  project?: string | null;
  due?: string | null;
  priority?: Priority;
  type?: ItemType;
}

export function QuickAdd({ onClose }: { onClose: () => void }) {
  const { data, insert, logActivity } = useCadence();
  const [text, setText] = useState('');
  const [openFull, setOpenFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ov, setOv] = useState<Overrides>({});
  const [picker, setPicker] = useState<null | 'person' | 'project'>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const people = data.people.filter((p) => !p.type || p.type === 'person');
  const parsed = parseInput(text, people, data.projects);

  // Effective values = manual override if set, otherwise the parser's guess.
  const eff = {
    type: ov.type ?? parsed.type,
    priority: ov.priority ?? parsed.priority,
    due: ov.due !== undefined ? ov.due : parsed.due_date,
    personId: ov.person !== undefined ? ov.person : parsed.person_id,
    projectId: ov.project !== undefined ? ov.project : parsed.project_id,
  };
  const personName = people.find((p) => p.id === eff.personId)?.name;
  const projectName = data.projects.find((p) => p.id === eff.projectId)?.name;
  const filed = !!(eff.personId || eff.projectId || eff.due);

  const add = async () => {
    const title = parsed.title;
    if (!title) return;
    setBusy(true);
    try {
      await insert('work_items', {
        title, type: eff.type, priority: eff.priority,
        due_date: eff.due || null,
        person_id: eff.personId || null,
        project_id: eff.projectId || null,
        notes: '',
        // Fully-specified captures skip triage; bare notes wait in the Inbox.
        inboxed: !filed,
        source: 'you',
      } as Partial<WorkItem>);
      logActivity('add_item', title);
      onClose();
    } finally { setBusy(false); }
  };

  // "More options" — hand effective values straight into ItemModal
  if (openFull) {
    return (
      <ItemModal
        defaults={{
          title: parsed.title || undefined,
          type: eff.type, priority: eff.priority, due_date: eff.due,
          person_id: eff.personId, project_id: eff.projectId,
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
            if (e.key === 'Enter' && text.trim()) add();
            if (e.key === 'Escape') onClose();
          }}
        />

        {/* Tap-to-set chips — pre-filled by the parser, overridable in one tap. */}
        <div className="qa-chip-row">
          <button className={`qa-chip ${eff.type !== 'task' ? 'set' : ''}`}
            onClick={() => setOv((o) => ({ ...o, type: nextType(eff.type) }))} title="Cycle type">
            {TYPE_LABELS[eff.type]}
          </button>

          <button className={`qa-chip pri-${eff.priority} ${eff.priority !== 'medium' ? 'set' : ''}`}
            onClick={() => setOv((o) => ({ ...o, priority: PRIORITY_CYCLE[(PRIORITY_CYCLE.indexOf(eff.priority) + 1) % 3] }))}
            title="Cycle priority">
            {eff.priority === 'high' ? '⬆ High' : eff.priority === 'low' ? '⬇ Low' : '• Medium'}
          </button>

          <label className={`qa-chip ${eff.due ? 'set' : ''}`} title="Due date">
            📅 {eff.due ? fmtDM(eff.due) : 'Date'}
            <input type="date" value={eff.due || ''} className="qa-chip-date"
              onChange={(e) => setOv((o) => ({ ...o, due: e.target.value || null }))} />
          </label>

          <div style={{ position: 'relative' }}>
            <button className={`qa-chip ${eff.personId ? 'set' : ''}`}
              onClick={() => setPicker((p) => (p === 'person' ? null : 'person'))}>
              👤 {personName ? personName.split(' ')[0] : 'Person'}
            </button>
            {picker === 'person' && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setPicker(null)} />
                <div className="action-send-picker action-send-picker--left">
                  {eff.personId && <button className="send-picker-option" onClick={() => { setOv((o) => ({ ...o, person: null })); setPicker(null); }}>✕ Clear</button>}
                  {people.map((p) => (
                    <button key={p.id} className="send-picker-option"
                      onClick={() => { setOv((o) => ({ ...o, person: p.id })); setPicker(null); }}>
                      <span className="avatar" style={{ background: p.color || '#3A7CA5', width: 22, height: 22, fontSize: 9, flexShrink: 0 }}>
                        {p.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}
                      </span>
                      {p.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div style={{ position: 'relative' }}>
            <button className={`qa-chip ${eff.projectId ? 'set' : ''}`}
              onClick={() => setPicker((p) => (p === 'project' ? null : 'project'))}>
              ▤ {projectName || 'Project'}
            </button>
            {picker === 'project' && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setPicker(null)} />
                <div className="action-send-picker action-send-picker--left">
                  {eff.projectId && <button className="send-picker-option" onClick={() => { setOv((o) => ({ ...o, project: null })); setPicker(null); }}>✕ Clear</button>}
                  {data.projects.filter((p) => !p.deleted_at).map((p) => (
                    <button key={p.id} className="send-picker-option"
                      onClick={() => { setOv((o) => ({ ...o, project: p.id })); setPicker(null); }}>
                      <span style={{ color: p.color || 'var(--accent)', fontSize: 12 }}>▤</span>
                      {p.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="quick-add-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setOpenFull(true)} disabled={!text.trim()}>
            More options
          </button>
          <button className="btn btn-primary" onClick={add} disabled={!text.trim() || busy}>
            {busy ? 'Adding…' : filed ? 'Add Task →' : 'Add to Inbox →'}
          </button>
        </div>

        <p className="quick-add-hint">
          {filed
            ? 'Has a person, project or date — files straight into Tasks.'
            : 'Tip: set a person, project or date to file it; otherwise it waits in your Inbox.'}
        </p>
      </div>
    </div>
  );
}
