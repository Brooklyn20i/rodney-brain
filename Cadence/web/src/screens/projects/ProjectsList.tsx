import React, { useMemo } from 'react';
import { useCadence } from '../../lib/store';
import type { Project, Health } from '../../lib/types';
import { fmtDate, isOverdue } from '../../lib/util';
import { HEALTH_COLOR } from '../../lib/health';
import { getProjectTopActions, inferHealthReason } from '../../lib/selectors';
import { isLinkedToProject } from '../../lib/tasks';

export interface ProjectListGroup { key: string; label: string; items: Project[]; }

function HealthRoll({ items }: { items: Project[] }) {
  const mix = { green: 0, amber: 0, red: 0 } as Record<Health, number>;
  items.filter((p) => p.status !== 'completed').forEach((p) => mix[p.health]++);
  if (!mix.green && !mix.amber && !mix.red) return null;
  return (
    <span className="proj-roll">
      {mix.green > 0 && <span className="win-pill on">{mix.green} on track</span>}
      {mix.amber > 0 && <span className="win-pill risk">{mix.amber} at risk</span>}
      {mix.red > 0 && <span className="win-pill stall">{mix.red} off track</span>}
    </span>
  );
}

// Compact master-list row: health dot, name, next action, open count, target.
function ProjectRow({ project, selected, onSelect }: {
  project: Project; selected: boolean; onSelect: (id: string) => void;
}) {
  const { data } = useCadence();
  const openCount = useMemo(
    () => data.work_items.filter((w) => isLinkedToProject(w, project.id) && !w.done && !w.inboxed).length,
    [data.work_items, project.id],
  );
  const overdueCount = useMemo(
    () => data.work_items.filter((w) => isLinkedToProject(w, project.id) && !w.done && !w.inboxed && isOverdue(w.due_date)).length,
    [data.work_items, project.id],
  );
  const healthReason = useMemo(
    () => inferHealthReason(project, data.project_updates, data.work_items),
    [project, data.project_updates, data.work_items],
  );
  const topAction = useMemo(
    () => project.next_action || getProjectTopActions(project.id, data.work_items, 1)[0]?.title || '',
    [project.next_action, project.id, data.work_items],
  );

  return (
    <button className={`proj-list-row${selected ? ' selected' : ''}`} onClick={() => onSelect(project.id)}>
      <span className="proj-list-dot" style={{ background: HEALTH_COLOR[project.health] }} />
      <span className="proj-list-main">
        <span className="proj-list-name">{project.name}</span>
        {topAction && <span className="proj-list-next">→ {topAction}</span>}
        {project.health !== 'green' && healthReason && (
          <span className="proj-list-reason">{healthReason}</span>
        )}
      </span>
      <span className="proj-list-meta">
        {overdueCount > 0
          ? <span className="proj-list-count red">{overdueCount} overdue</span>
          : openCount > 0 && <span className="proj-list-count">{openCount} open</span>}
        {project.target_date && (
          <span className={`proj-list-date${isOverdue(project.target_date) ? ' red' : ''}`}>{fmtDate(project.target_date)}</span>
        )}
      </span>
    </button>
  );
}

export function ProjectsList({ groups, selectedId, onSelect }: {
  groups: ProjectListGroup[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {groups.map((g) => (
        <React.Fragment key={g.key}>
          <div className="proj-group-hdr">
            <span className="proj-group-name">{g.label}</span>
            <span className="proj-group-count">{g.items.length}</span>
            <HealthRoll items={g.items} />
          </div>
          {g.items.map((p) => (
            <ProjectRow key={p.id} project={p} selected={selectedId === p.id} onSelect={onSelect} />
          ))}
        </React.Fragment>
      ))}
    </>
  );
}
