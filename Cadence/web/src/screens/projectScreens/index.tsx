import { useEffect, useMemo, useState } from 'react';
import { useCadence } from '../../lib/store';
import type { Project } from '../../lib/types';
import { ScreenHeader } from '../../components/bits';
import { isOverdue, todayStr } from '../../lib/util';
import { STATUS_LABEL, STATUS_ORDER } from '../../lib/health';
import { groupProjectsByPortfolio } from '../../lib/selectors';
import { priorityList } from '../../lib/strategy';
import { PortfolioTimeline } from '../../components/Gantt';
import { useStrategy, useWinState } from './hooks';
import { ProjectsList } from './ProjectsList';
import type { ProjectListGroup } from './ProjectsList';
import { ProjectDetail } from './ProjectDetail';
import { ProjectModal } from './ProjectModal';
import { ScoreboardView, StrategyModal } from './Scoreboard';

type View = 'list' | 'timeline' | 'scoreboard';
type GroupBy = 'portfolio' | 'priority' | 'status';

// Projects, rebuilt on the split master-detail pattern the People screen
// established: scannable grouped list on the left, a three-tab control centre
// (Overview / Plan / Governance) on the right. Timeline and Scoreboard remain
// as full-width alternate views.
export function Projects({ onMenu, initialSelectedId }: { onMenu?: () => void; initialSelectedId?: string | null }) {
  const { data } = useCadence();
  const { strategy, save } = useStrategy();
  const { state: winState, save: saveWinState } = useWinState();
  const priorities = useMemo(() => priorityList(strategy), [strategy]);

  const [view, setView] = useState<View>('list');
  const [groupBy, setGroupBy] = useState<GroupBy>('portfolio');
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [editStrategy, setEditStrategy] = useState(false);

  useEffect(() => {
    if (initialSelectedId) { setSelectedId(initialSelectedId); setView('list'); }
  }, [initialSelectedId]);

  useEffect(() => {
    if (groupBy === 'priority' && !priorities.length) setGroupBy('portfolio');
  }, [priorities.length, groupBy]);

  const selected = selectedId ? (data.projects.find((p) => p.id === selectedId) || null) : null;
  const byName = (a: Project, b: Project) => a.name.localeCompare(b.name);

  const groups = useMemo((): ProjectListGroup[] => {
    if (groupBy === 'portfolio') {
      return groupProjectsByPortfolio(data.projects).map((g) => ({
        key: g.label, label: g.label, items: [...g.projects].sort(byName),
      }));
    }
    if (groupBy === 'priority' && priorities.length) {
      const all = data.projects.filter((p) => !p.deleted_at);
      const out: ProjectListGroup[] = priorities.map((pr) => ({
        key: pr.id, label: pr.name, items: all.filter((p) => p.pillar_id === pr.id).sort(byName),
      }));
      const unassigned = all.filter((p) => !p.pillar_id || !priorities.some((pr) => pr.id === p.pillar_id)).sort(byName);
      if (unassigned.length) out.push({ key: '__none__', label: 'No priority', items: unassigned });
      return out.filter((g) => g.items.length);
    }
    return STATUS_ORDER.map((s) => ({
      key: s, label: STATUS_LABEL[s], items: data.projects.filter((p) => !p.deleted_at && p.status === s).sort(byName),
    })).filter((g) => g.items.length);
  }, [data.projects, groupBy, priorities]);

  // Summary strip over active projects.
  const stats = useMemo(() => {
    const active = data.projects.filter((p) => !p.deleted_at && p.status === 'active');
    const monthEnd = todayStr().slice(0, 7);
    return {
      active: active.length,
      atRisk: active.filter((p) => p.health !== 'green').length,
      dueSoon: active.filter((p) => p.target_date && (p.target_date.slice(0, 7) === monthEnd || isOverdue(p.target_date))).length,
    };
  }, [data.projects]);

  const openDetail = (id: string) => { setSelectedId(id); setView('list'); };

  return (
    <>
      <ScreenHeader title="Projects" subtitle={`${stats.active} active · ${stats.atRisk} at risk · ${stats.dueSoon} due this month`} onMenu={onMenu}>
        <button className="btn btn-ghost btn-sm" onClick={() => setEditStrategy(true)}>Strategy</button>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>+ New</button>
      </ScreenHeader>

      <div className="hub-toolbar">
        <div className="hub-seg-group">
          <span className="hub-seg-label">View</span>
          <button className={`hub-seg ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>Projects</button>
          <button className={`hub-seg ${view === 'timeline' ? 'active' : ''}`} onClick={() => setView('timeline')}>Timeline</button>
          <button className={`hub-seg ${view === 'scoreboard' ? 'active' : ''}`} onClick={() => setView('scoreboard')}>Scoreboard</button>
        </div>
        {view === 'list' && (
          <div className="hub-seg-group">
            <span className="hub-seg-label">Group</span>
            <button className={`hub-seg ${groupBy === 'portfolio' ? 'active' : ''}`} onClick={() => setGroupBy('portfolio')}>Portfolio</button>
            {priorities.length > 0 && <button className={`hub-seg ${groupBy === 'priority' ? 'active' : ''}`} onClick={() => setGroupBy('priority')}>Priority</button>}
            <button className={`hub-seg ${groupBy === 'status' ? 'active' : ''}`} onClick={() => setGroupBy('status')}>Status</button>
          </div>
        )}
      </div>

      {view === 'scoreboard' ? (
        <div className="proj-fullwidth">
          <ScoreboardView strategy={strategy} winState={winState} saveWinState={saveWinState} />
        </div>
      ) : view === 'timeline' ? (
        <div className="proj-fullwidth">
          <PortfolioTimeline
            projects={data.projects}
            milestones={data.milestones}
            onSelect={openDetail}
          />
        </div>
      ) : (
        <div className="split-view proj-hub">
          <div className="split-left proj-hub-left">
            <div className="split-panel-body">
              {data.projects.filter((p) => !p.deleted_at).length === 0 ? (
                <div className="proj-empty"><div className="icon">▤</div><p>No projects yet</p></div>
              ) : (
                <ProjectsList groups={groups} selectedId={selectedId} onSelect={openDetail} />
              )}
            </div>
          </div>
          {selected
            ? <ProjectDetail project={selected} strategy={strategy}
                onEdit={() => setEditing(selected)} onClose={() => setSelectedId(null)} />
            : (
              <div className="split-right proj-hub-empty">
                <div className="empty-state" style={{ margin: 'auto' }}>
                  <div className="icon">▤</div>
                  <p>Select a project</p>
                  <small style={{ color: 'var(--text3)' }}>Overview, plan and governance — side by side with the list.</small>
                </div>
              </div>
            )}
        </div>
      )}

      {creating && <ProjectModal strategy={strategy} onClose={() => setCreating(false)} />}
      {editing && <ProjectModal existing={editing} strategy={strategy} onClose={() => setEditing(null)} />}
      {editStrategy && <StrategyModal strategy={strategy} save={save} onClose={() => setEditStrategy(false)} />}
    </>
  );
}
