import { useMemo, useState, type ReactNode } from 'react';
import { useCadence } from '../../../lib/store';
import type { Project, WorkItem } from '../../../lib/types';
import { ItemModal } from '../../../components/ItemModal';
import { healthIcon, fmtDate, fmtDMY, isOverdue } from '../../../lib/util';
import { HEALTH_LABEL, HEALTH_PILL_CLASS } from '../../../lib/health';
import { getHealthEvidence } from '../../../lib/selectors';
import { isLinkedToProject } from '../../../lib/tasks';
import { getPillar } from '../../../lib/strategy';
import type { StrategyContent } from '../../../lib/strategy';
import { NextActionEditor } from '../NextActionEditor';

const RAID_CONTROL_LABEL: Record<string, string> = {
  risk: 'Risk', assumption: 'Assumption', issue: 'Issue', dependency: 'Dependency',
};

// Analytical "prove it": the raw numbers behind a project's health, revealed
// on demand so a status is never taken on trust.
function HealthEvidence({ project }: { project: Project }) {
  const { data } = useCadence();
  const [open, setOpen] = useState(false);
  const ev = useMemo(
    () => getHealthEvidence(project, data.project_updates, data.work_items),
    [project, data.project_updates, data.work_items],
  );
  return (
    <div className="health-evidence">
      <button className="health-evidence-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide evidence' : 'Why?'}
      </button>
      {open && (
        <div className="health-evidence-body">
          <div className="health-evidence-stats">
            <span className={ev.overdue > 0 ? 'he-stat he-red' : 'he-stat'}>{ev.overdue} overdue</span>
            <span className="he-stat">{ev.highOpen} high-priority</span>
            <span className="he-stat">{ev.openTotal} open total</span>
            {ev.targetOverdue && <span className="he-stat he-red">past target date</span>}
          </div>
          {ev.latestUpdate
            ? <div className="health-evidence-update">“{ev.latestUpdate.slice(0, 200)}{ev.latestUpdate.length > 200 ? '…' : ''}”</div>
            : <div className="health-evidence-update he-muted">No project updates logged yet.</div>}
        </div>
      )}
    </div>
  );
}

function ControlSheetWorkItem({ w, onEdit }: { w: WorkItem; onEdit: (w: WorkItem) => void }) {
  const { update } = useCadence();
  return (
    <div className="proj-control-item">
      <input type="checkbox" checked={w.done} onChange={() => update('work_items', w.id, { done: !w.done, completed_at: !w.done ? new Date().toISOString() : null } as Partial<WorkItem>)} />
      <button className="proj-control-item-main" onClick={() => onEdit(w)}>
        <span className="proj-control-item-title">{w.title}</span>
        <span className="proj-control-item-meta">
          {w.type !== 'task' && <span>{w.type === 'waitingFor' ? 'Waiting' : w.type}</span>}
          <span className={`pri-${w.priority}`}>{w.priority}</span>
          {w.due_date && <span className={isOverdue(w.due_date) ? 'tl-overdue' : ''}>{fmtDate(w.due_date)}</span>}
        </span>
      </button>
    </div>
  );
}

function ControlSection({ title, count, empty, children, accent }: { title: string; count: number; empty: string; children: ReactNode; accent?: string }) {
  return (
    <section className="proj-control-section" style={accent ? { ['--section-accent' as string]: accent } : undefined}>
      <div className="proj-control-section-head">
        <h2>{title}</h2>
        <span>{count}</span>
      </div>
      {count > 0 ? children : <p className="proj-control-empty">{empty}</p>}
    </section>
  );
}

export function OverviewTab({ project, strategy }: { project: Project; strategy: StrategyContent }) {
  const { data } = useCadence();
  const [editingItem, setEditingItem] = useState<WorkItem | null>(null);
  const [addingItem, setAddingItem] = useState(false);

  const projectItems = useMemo(() => data.work_items.filter((w) => isLinkedToProject(w, project.id) && !w.done && !w.inboxed), [data.work_items, project.id]);
  const actions = useMemo(() => projectItems.filter((w) => w.type !== 'waitingFor' && w.type !== 'decision'), [projectItems]);
  const waiting = useMemo(() => projectItems.filter((w) => w.type === 'waitingFor'), [projectItems]);
  const decisions = useMemo(() => projectItems.filter((w) => w.type === 'decision'), [projectItems]);
  const raid = useMemo(() => data.raid_items.filter((r) => r.project_id === project.id && r.status === 'open'), [data.raid_items, project.id]);
  const blockers = useMemo(() => raid.filter((r) => r.kind === 'issue' || r.kind === 'dependency' || r.severity === 'high'), [raid]);
  const latestUpdate = useMemo(() => data.project_updates.filter((u) => u.project_id === project.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0], [data.project_updates, project.id]);
  const pillar = project.pillar_id ? getPillar(strategy, project.pillar_id) : undefined;

  return (
    <div className="proj-control-sheet">
      <div className="proj-control-hero">
        <div>
          <div className="proj-control-kicker">Outcome / goal</div>
          <p>{project.goal || 'No outcome captured yet — define what done looks like.'}</p>
        </div>
        <div className="proj-control-facts" aria-label="Project facts">
          <span className={`health-pill ${HEALTH_PILL_CLASS[project.health]}`}>{healthIcon(project.health)} {HEALTH_LABEL[project.health]}</span>
          <span>Owner: <b>{project.owner || 'Unassigned'}</b></span>
          <span>Target: <b>{project.target_date ? fmtDate(project.target_date) : 'No date'}</b></span>
          {pillar && <span className="tag tag-decision">◎ {pillar.name}</span>}
        </div>
      </div>

      <div className="proj-control-latest">
        <div className="proj-control-latest-copy">
          <span className="proj-control-kicker">Latest update / evidence</span>
          {latestUpdate
            ? <p>“{latestUpdate.text.slice(0, 220)}{latestUpdate.text.length > 220 ? '…' : ''}” <small>{fmtDMY(latestUpdate.created_at)}{latestUpdate.health ? ` · ${healthIcon(latestUpdate.health)}` : ''}</small></p>
            : <p className="proj-control-muted">No project update logged yet.</p>}
        </div>
        <HealthEvidence project={project} />
      </div>

      <NextActionEditor project={project} />

      <div className="proj-control-grid">
        <ControlSection title="Blockers / waiting" count={blockers.length + waiting.length} empty="Nothing blocking or waiting." accent="var(--red)">
          {blockers.map((r) => (
            <div key={r.id} className="proj-control-raid">
              <span className={`sev-dot sev-${r.severity}`} />
              <span>{RAID_CONTROL_LABEL[r.kind]}: {r.text}</span>
            </div>
          ))}
          {waiting.map((w) => <ControlSheetWorkItem key={w.id} w={w} onEdit={setEditingItem} />)}
        </ControlSection>

        <ControlSection title="Open decisions" count={decisions.length} empty="No explicit decision waiting." accent="var(--orange)">
          {decisions.map((w) => <ControlSheetWorkItem key={w.id} w={w} onEdit={setEditingItem} />)}
        </ControlSection>

        <ControlSection title="Open tasks / actions" count={actions.length} empty="No open actions filed to this project." accent="var(--accent)">
          {actions.map((w) => <ControlSheetWorkItem key={w.id} w={w} onEdit={setEditingItem} />)}
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => setAddingItem(true)}>+ Add item</button>
        </ControlSection>
      </div>
      {addingItem && <ItemModal defaults={{ project_id: project.id }} onClose={() => setAddingItem(false)} />}
      {editingItem && <ItemModal existing={editingItem} onClose={() => setEditingItem(null)} />}
    </div>
  );
}
