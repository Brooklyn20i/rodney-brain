import { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import type { WorkItem } from '../lib/types';
import { PriTag, Due, ScreenHeader } from '../components/bits';
import { ItemModal } from '../components/ItemModal';
import { isUserTask } from '../lib/tasks';
import { autoColor, priorityScore } from '../lib/util';

type Mode = 'people' | 'projects';

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');

const UNASSIGNED = '_none';

interface Column { key: string; label: string; color: string; items: WorkItem[]; }

// ── A target option in the move picker ─────────────────────────────────────────
interface MoveTarget { id: string | null; label: string; color: string; }

function BoardCard({ w, mode, targets, onEdit, onMove }: {
  w: WorkItem; mode: Mode; targets: MoveTarget[];
  onEdit: (w: WorkItem) => void;
  onMove: (w: WorkItem, targetId: string | null) => void;
}) {
  const [picking, setPicking] = useState(false);
  return (
    <div className="board-card">
      <button className="board-card-main" onClick={() => onEdit(w)}>
        <div className="board-card-title">{w.title}</div>
        <div className="board-card-meta">
          <PriTag priority={w.priority} />
          <Due date={w.due_date} />
        </div>
      </button>
      <div className="board-card-move-wrap">
        <button className="board-card-move" title={`Move to another ${mode === 'people' ? 'person' : 'project'}`}
          onClick={() => setPicking((p) => !p)}>⇄</button>
        {picking && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setPicking(false)} />
            <div className="action-send-picker">
              <div className="send-picker-section">Move to {mode === 'people' ? 'person' : 'project'}</div>
              {targets.map((t) => (
                <button key={t.id ?? UNASSIGNED} className="send-picker-option"
                  onClick={() => { onMove(w, t.id); setPicking(false); }}>
                  {mode === 'people'
                    ? (t.id
                        ? <span className="avatar" style={{ background: t.color, width: 22, height: 22, fontSize: 9, flexShrink: 0 }}>{initials(t.label)}</span>
                        : <span style={{ color: 'var(--text3)', fontSize: 12 }}>○</span>)
                    : <span style={{ color: t.color, fontSize: 12 }}>▤</span>}
                  {t.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function Board({ onMenu }: { onMenu?: () => void }) {
  const { data, update } = useCadence();
  const [mode, setMode] = useState<Mode>('people');
  const [editing, setEditing] = useState<WorkItem | null>(null);

  const people = useMemo(
    () => data.people.filter((p) => !p.type || p.type === 'person'),
    [data.people],
  );
  // All non-deleted projects can host a column — a task on an on-hold/completed
  // project must still appear under it, never vanish. Empty columns are hidden.
  const projects = useMemo(
    () => data.projects.filter((p) => !p.deleted_at),
    [data.projects],
  );

  const openTasks = useMemo(() => data.work_items.filter(isUserTask), [data.work_items]);

  // Build the columns for the active mode. Only entities with ≥1 open task get a
  // column, plus a catch-all (Unassigned / No project) when there are loose tasks.
  const columns = useMemo<Column[]>(() => {
    const source = mode === 'people' ? people : projects;
    const known = new Set(source.map((e) => e.id));
    // Group every open task. An owner id that isn't a known column (deleted/
    // non-person, or a project no longer present) folds into the catch-all so
    // nothing ever disappears — visible cards always reconcile with the count.
    const byKey = new Map<string, WorkItem[]>();
    for (const w of openTasks) {
      const owner = mode === 'people' ? w.person_id : w.project_id;
      const key = owner && known.has(owner) ? owner : UNASSIGNED;
      const arr = byKey.get(key) || [];
      arr.push(w);
      byKey.set(key, arr);
    }
    const sortItems = (items: WorkItem[]) => items.sort((a, b) => priorityScore(b) - priorityScore(a));
    const cols: Column[] = [];
    // Columns follow the source order (people groups / project order).
    for (const e of source) {
      const items = byKey.get(e.id);
      if (!items || items.length === 0) continue;
      cols.push({
        key: e.id,
        label: e.name,
        color: mode === 'people' ? ((e as any).color || autoColor(e.id || e.name)) : ((e as any).color || 'var(--accent)'),
        items: sortItems(items),
      });
    }
    const loose = byKey.get(UNASSIGNED);
    if (loose && loose.length) {
      cols.push({
        key: UNASSIGNED,
        label: mode === 'people' ? 'Unassigned' : 'No project',
        color: 'var(--text3)',
        items: sortItems(loose),
      });
    }
    return cols;
  }, [openTasks, mode, people, projects]);

  // Targets for a card's move picker = every column target except its current one.
  const targetsFor = (currentKey: string): MoveTarget[] => {
    const base: MoveTarget[] = (mode === 'people' ? people : projects).map((e) => ({
      id: e.id, label: e.name,
      color: mode === 'people' ? ((e as any).color || autoColor(e.id || e.name)) : ((e as any).color || 'var(--accent)'),
    }));
    base.push({ id: null, label: mode === 'people' ? 'Unassigned' : 'No project', color: 'var(--text3)' });
    return base.filter((t) => (t.id ?? UNASSIGNED) !== currentKey);
  };

  const onMove = (w: WorkItem, targetId: string | null) => {
    const patch = mode === 'people' ? { person_id: targetId } : { project_id: targetId };
    update('work_items', w.id, patch as Partial<WorkItem>);
  };

  const subtitle = `${openTasks.length} open · drag-free reassign by tapping ⇄`;

  return (
    <>
      <ScreenHeader title="Board" subtitle={subtitle} onMenu={onMenu} />
      <div className="screen-content" style={{ paddingTop: 0 }}>
        <div className="board-tabs">
          <button className={`dash-tab${mode === 'people' ? ' active' : ''}`} onClick={() => setMode('people')}>✦ By person</button>
          <button className={`dash-tab${mode === 'projects' ? ' active' : ''}`} onClick={() => setMode('projects')}>▤ By project</button>
        </div>

        {columns.length === 0 ? (
          <p style={{ color: 'var(--text3)', padding: 16 }}>
            No open tasks to arrange. Add tasks and assign them to {mode === 'people' ? 'people' : 'projects'} to see the board.
          </p>
        ) : (
          <div className="board-cols">
            {columns.map((col) => (
              <div key={col.key} className="board-col">
                <div className="board-col-hdr">
                  {mode === 'people' && col.key !== UNASSIGNED && (
                    <span className="avatar" style={{ background: col.color, width: 24, height: 24, fontSize: 10, flexShrink: 0, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700 }}>
                      {initials(col.label)}
                    </span>
                  )}
                  {mode === 'projects' && col.key !== UNASSIGNED && (
                    <span style={{ color: col.color, fontSize: 13 }}>▤</span>
                  )}
                  <span className="board-col-name">{col.label}</span>
                  <span className="board-col-count">{col.items.length}</span>
                </div>
                <div className="board-col-body">
                  {col.items.map((w) => (
                    <BoardCard key={w.id} w={w} mode={mode}
                      targets={targetsFor(col.key)}
                      onEdit={setEditing} onMove={onMove} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && <ItemModal existing={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
