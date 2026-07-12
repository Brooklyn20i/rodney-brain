import { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import { useMeetingDates, getNextMeeting } from '../lib/meetings';
import { isFiledTask, isLinkedToPerson, isLinkedToProject } from '../lib/tasks';
import { isOverdue, autoColor, initials, fmtWeekDM, todayStr, addDaysStr } from '../lib/util';
import {
  getHotThisWeek, getProjectTopActions, inferHealthReason, groupProjectsByPortfolio,
  getStaleTasks, getStaleProjects, STALE_DAYS,
} from '../lib/selectors';
import { ScreenHeader } from '../components/bits';
import { StatTile } from '../components/StatTile';
import { HEALTH_LABEL } from '../lib/health';
import { readStrategy, kpiList } from '../lib/strategy';
import { useWinState } from './projectScreens/hooks';

const fmtNext = (iso: string) => {
  if (iso === todayStr()) return 'Today';
  if (iso === addDaysStr(1)) return 'Tomorrow';
  return fmtWeekDM(iso);
};

// ── Person card ───────────────────────────────────────────────────────────────
function PersonCard({ person, openCount, overdueCount, hotCount, nextMeeting, onClick }: {
  person: { id: string; name: string; role?: string; color?: string };
  openCount: number; overdueCount: number; hotCount: number;
  nextMeeting: string | null;
  onClick: () => void;
}) {
  const health = overdueCount > 0 ? 'red' : hotCount > 0 ? 'amber' : 'green';
  const avatarBg = person.color || autoColor(person.id || person.name);

  return (
    <button className={`dash-card dash-card-${health}`} onClick={onClick}>
      <div className="dash-card-hdr">
        <span className="avatar" style={{ background: avatarBg }}>
          {initials(person.name)}
        </span>
        <div className="dash-card-identity">
          <div className="dash-card-name">{person.name}</div>
          {person.role && <div className="dash-card-role">{person.role}</div>}
        </div>
      </div>

      <div className="dash-next-meeting">
        {nextMeeting
          ? <><span>📅</span> {fmtNext(nextMeeting)}</>
          : <span className="dash-no-meeting">No upcoming 1:1</span>}
      </div>

      <div className="dash-stats">
        {openCount > 0 && (
          <div className="dash-stat">
            <span className="dash-stat-num">{openCount}</span>
            <span className="dash-stat-lbl">Open</span>
          </div>
        )}
        {overdueCount > 0 && (
          <div className="dash-stat">
            <span className="dash-stat-num red">{overdueCount}</span>
            <span className="dash-stat-lbl">Overdue</span>
          </div>
        )}
        {hotCount > 0 && overdueCount === 0 && (
          <div className="dash-stat">
            <span className="dash-stat-num amber">{hotCount}</span>
            <span className="dash-stat-lbl">This week</span>
          </div>
        )}
        {openCount === 0 && (
          <div className="dash-stat">
            <span className="dash-stat-num green">✓</span>
            <span className="dash-stat-lbl">All clear</span>
          </div>
        )}
      </div>
    </button>
  );
}

// ── Project card ──────────────────────────────────────────────────────────────
function ProjectCard({ project, openCount, overdueCount, topActions, healthReason, onClick }: {
  project: { id: string; name: string; health: string; color?: string; target_date?: string | null; owner?: string };
  openCount: number; overdueCount: number;
  topActions: { title: string }[];
  healthReason: string;
  onClick: () => void;
}) {
  const stripe = project.color || 'var(--accent)';
  const health = project.health as 'red' | 'amber' | 'green';
  // Only tint red and amber — green stays white to avoid noise
  const tintClass = health === 'green' ? '' : ` dash-card-${health}`;

  return (
    <button className={`dash-card dash-proj-card${tintClass}`} onClick={onClick}>
      <span className="dash-proj-stripe" style={{ background: stripe }} />
      <div className="dash-proj-body">
        <div className="dash-proj-hdr">
          <span className="dash-card-name">{project.name}</span>
          <span className={`dash-health-badge ${health}`}>{HEALTH_LABEL[health] ?? health}</span>
        </div>

        {healthReason && health !== 'green' && (
          <div className="dash-health-reason">{healthReason}</div>
        )}

        <div className="dash-stats">
          {openCount > 0 && (
            <div className="dash-stat">
              <span className="dash-stat-num">{openCount}</span>
              <span className="dash-stat-lbl">Open</span>
            </div>
          )}
          {overdueCount > 0 && (
            <div className="dash-stat">
              <span className="dash-stat-num red">{overdueCount}</span>
              <span className="dash-stat-lbl">Overdue</span>
            </div>
          )}
          {openCount === 0 && (
            <div className="dash-stat">
              <span className="dash-stat-num green">✓</span>
              <span className="dash-stat-lbl">All clear</span>
            </div>
          )}
          {project.target_date && (
            <div className="dash-stat">
              <span className={`dash-stat-num${isOverdue(project.target_date) ? ' red' : ''}`} style={{ fontSize: 13 }}>
                {fmtWeekDM(project.target_date)}
              </span>
              <span className="dash-stat-lbl">Due</span>
            </div>
          )}
        </div>

        {topActions.length > 0 && (
          <div className="dash-actions-list">
            {topActions.map((a, i) => (
              <div key={i} className="dash-action-item">● {a.title}</div>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

// ── KPI strip: the scoreboard's headline numbers, at the briefing home ───────
function KpiStrip() {
  const { data } = useCadence();
  const strategy = useMemo(() => readStrategy(data.notes), [data.notes]);
  const { state: winState } = useWinState();
  const kpis = kpiList(strategy);
  if (!kpis.length) return null;

  return (
    <div className="dash-kpi-strip" aria-label="KPI scoreboard">
      {kpis.map((k) => {
        const readings = winState.readings[k.id] || [];
        const latest = readings.length ? readings[readings.length - 1] : null;
        const met = !!(k.target && latest && latest.value >= k.target);
        return (
          <StatTile key={k.id}
            num={latest ? `${latest.value}${k.unit || ''}` : '—'}
            label={k.targetLabel ? `${k.name} / ${k.targetLabel}` : k.name}
            tone={met ? 'green' : 'default'} />
        );
      })}
    </div>
  );
}

// ── Needs attention: deterministic stale-work flags (no LLM) ─────────────────
function NeedsAttention({ onNavigate }: { onNavigate: (screen: string, entityId?: string) => void }) {
  const { data } = useCadence();
  const staleTasks = useMemo(() => getStaleTasks(data.work_items), [data.work_items]);
  const staleProjects = useMemo(() => getStaleProjects(data.projects, data.project_updates), [data.projects, data.project_updates]);
  if (!staleTasks.length && !staleProjects.length) return null;

  return (
    <div className="needs-attention">
      <div className="needs-attention-hdr">⚑ Needs attention <span className="needs-attention-sub">untouched for {STALE_DAYS}+ days</span></div>
      <div className="needs-attention-body">
        {staleTasks.length > 0 && (
          <button className="needs-attention-row" onClick={() => onNavigate('home')}>
            <span className="needs-attention-count">{staleTasks.length}</span>
            stale task{staleTasks.length === 1 ? '' : 's'} — oldest: “{staleTasks[0].title.slice(0, 60)}”
          </button>
        )}
        {staleProjects.slice(0, 3).map((p) => (
          <button key={p.id} className="needs-attention-row" onClick={() => onNavigate('projects', p.id)}>
            <span className="needs-attention-count">▤</span>
            {p.name} — no movement since {fmtWeekDM(p.updated_at.slice(0, 10))}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main Dashboard screen ─────────────────────────────────────────────────────
export function Dashboard({ onMenu, onNavigate }: {
  onMenu?: () => void;
  onNavigate: (screen: string, entityId?: string) => void;
}) {
  const { data } = useCadence();
  const { dates } = useMeetingDates();
  const [tab, setTab] = useState<'people' | 'projects'>('people');

  const people = useMemo(
    () => data.people.filter((p) => !p.type || p.type === 'person'),
    [data.people],
  );

  const personCards = useMemo(() => {
    return people.map((p) => {
      const personItems = data.work_items.filter((w) => isLinkedToPerson(w, p.id));
      const userItems = personItems.filter(isFiledTask);
      const overdueCount = userItems.filter((w) => isOverdue(w.due_date)).length;
      const hotCount = getHotThisWeek(personItems).length;
      const nextMeeting = getNextMeeting(p.id, data.notes, dates);
      return { person: p, openCount: userItems.length, overdueCount, hotCount, nextMeeting };
    }).sort((a, b) => {
      if (a.overdueCount !== b.overdueCount) return b.overdueCount - a.overdueCount;
      if (a.hotCount !== b.hotCount) return b.hotCount - a.hotCount;
      return (a.nextMeeting || '9999').localeCompare(b.nextMeeting || '9999');
    });
  }, [people, data.work_items, data.notes, dates]);

  const projectGroups = useMemo(() => {
    const groups = groupProjectsByPortfolio(data.projects);
    return groups.map((g) => ({
      label: g.label,
      projects: g.projects.map((p) => {
        const openItems = data.work_items.filter((w) => isLinkedToProject(w, p.id) && !w.done);
        const overdueCount = openItems.filter((w) => isOverdue(w.due_date)).length;
        const topActions = getProjectTopActions(p.id, data.work_items, 2);
        const healthReason = inferHealthReason(p, data.project_updates, data.work_items);
        return { project: p, openCount: openItems.length, overdueCount, topActions, healthReason };
      }),
    }));
  }, [data.projects, data.work_items, data.project_updates]);

  return (
    <>
      <ScreenHeader title="Dashboard" onMenu={onMenu} />
      <div className="screen-content" style={{ paddingTop: 0 }}>
        <KpiStrip />
        <NeedsAttention onNavigate={onNavigate} />
        <div className="dash-tabs">
          <button className={`dash-tab${tab === 'people' ? ' active' : ''}`} onClick={() => setTab('people')}>
            ✦ People{personCards.length > 0 ? ` (${personCards.length})` : ''}
          </button>
          <button className={`dash-tab${tab === 'projects' ? ' active' : ''}`} onClick={() => setTab('projects')}>
            ▤ Projects
          </button>
        </div>

        {tab === 'people' && (
          <div className="dash-section">
            {personCards.length === 0
              ? <p style={{ color: 'var(--text3)', padding: 16 }}>No people yet — add them in the People screen.</p>
              : <div className="dash-grid">
                  {personCards.map(({ person, openCount, overdueCount, hotCount, nextMeeting }) => (
                    <PersonCard
                      key={person.id}
                      person={person}
                      openCount={openCount}
                      overdueCount={overdueCount}
                      hotCount={hotCount}
                      nextMeeting={nextMeeting}
                      onClick={() => onNavigate('people', person.id)}
                    />
                  ))}
                </div>
            }
          </div>
        )}

        {tab === 'projects' && (
          <div className="dash-section">
            {projectGroups.length === 0
              ? <p style={{ color: 'var(--text3)', padding: 16 }}>No active projects.</p>
              : projectGroups.map((g) => (
                  <div key={g.label}>
                    <div className="dash-group-hdr">{g.label}</div>
                    <div className="dash-grid">
                      {g.projects.map(({ project, openCount, overdueCount, topActions, healthReason }) => (
                        <ProjectCard
                          key={project.id}
                          project={project}
                          openCount={openCount}
                          overdueCount={overdueCount}
                          topActions={topActions}
                          healthReason={healthReason}
                          onClick={() => onNavigate('projects', project.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))
            }
          </div>
        )}
      </div>
    </>
  );
}
