import { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import { useMeetingDates, getNextMeeting } from '../lib/meetings';
import { isUserTask } from '../lib/tasks';
import { isOverdue, autoColor, fmtWeekDM, todayStr, addDaysStr } from '../lib/util';
import {
  getHotThisWeek, getProjectTopActions, inferHealthReason, groupProjectsByPortfolio,
} from '../lib/selectors';
import { ScreenHeader } from '../components/bits';

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');

const fmtNext = (iso: string) => {
  const t = todayStr();
  if (iso === t) return 'Today';
  if (iso === addDaysStr(1)) return 'Tomorrow';
  return fmtWeekDM(iso);
};

const HEALTH_COLOR: Record<string, string> = {
  green: 'var(--green)', amber: 'var(--orange)', red: 'var(--red)',
};

// ── People tab ────────────────────────────────────────────────────────────────
function PersonCard({ person, openCount, overdueCount, hotCount, nextMeeting, onClick }: {
  person: { id: string; name: string; role?: string; color?: string };
  openCount: number; overdueCount: number; hotCount: number;
  nextMeeting: string | null;
  onClick: () => void;
}) {
  const health = overdueCount > 0 ? 'red' : hotCount > 0 ? 'amber' : 'green';
  const avatarBg = person.color || autoColor(person.id || person.name);

  return (
    <button className="dash-card" onClick={onClick}>
      <div className="dash-card-hdr">
        <span className="dash-health-dot" style={{ background: HEALTH_COLOR[health] }} />
        <span className="avatar" style={{ background: avatarBg, width: 36, height: 36, fontSize: 13, flexShrink: 0, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700 }}>
          {initials(person.name)}
        </span>
        <div className="dash-card-identity">
          <div className="dash-card-name">{person.name}</div>
          {person.role && <div className="dash-card-role">{person.role}</div>}
        </div>
      </div>

      <div className="dash-next-meeting">
        {nextMeeting
          ? <><span className="dash-meeting-icon">📅</span> {fmtNext(nextMeeting)}</>
          : <span className="dash-no-meeting">No upcoming 1:1</span>}
      </div>

      <div className="dash-card-stats">
        {openCount > 0 && (
          <span className="dash-stat-chip">{openCount} open</span>
        )}
        {overdueCount > 0 && (
          <span className="dash-stat-chip dash-chip-red">{overdueCount} overdue</span>
        )}
        {hotCount > 0 && overdueCount === 0 && (
          <span className="dash-stat-chip dash-chip-amber">{hotCount} this week</span>
        )}
        {openCount === 0 && <span className="dash-stat-chip dash-chip-green">All clear</span>}
      </div>
    </button>
  );
}

// ── Projects tab ──────────────────────────────────────────────────────────────
function ProjectCard({ project, openCount, overdueCount, topActions, healthReason, onClick }: {
  project: { id: string; name: string; health: string; color?: string; target_date?: string | null; owner?: string };
  openCount: number; overdueCount: number;
  topActions: { title: string }[];
  healthReason: string;
  onClick: () => void;
}) {
  const stripe = project.color || 'var(--accent)';
  const healthColor = HEALTH_COLOR[project.health] || 'var(--text3)';

  return (
    <button className="dash-card dash-proj-card" onClick={onClick} style={{ borderLeft: `4px solid ${stripe}` }}>
      <div className="dash-proj-hdr">
        <span className="dash-card-name" style={{ flex: 1 }}>{project.name}</span>
        <span className="dash-health-pill" style={{ background: `${healthColor}22`, color: healthColor }}>
          {project.health === 'green' ? '🟢' : project.health === 'red' ? '🔴' : '🟠'}
        </span>
      </div>
      <div className="dash-health-reason">{healthReason}</div>

      <div className="dash-card-stats">
        {openCount > 0 && <span className="dash-stat-chip">{openCount} open</span>}
        {overdueCount > 0 && <span className="dash-stat-chip dash-chip-red">{overdueCount} overdue</span>}
        {openCount === 0 && <span className="dash-stat-chip dash-chip-green">All clear</span>}
        {project.target_date && (
          <span className="dash-stat-chip" style={{ color: isOverdue(project.target_date) ? 'var(--red)' : 'var(--text2)' }}>
            Due {fmtWeekDM(project.target_date)}
          </span>
        )}
      </div>

      {topActions.length > 0 && (
        <div className="dash-actions-list">
          {topActions.map((a, i) => (
            <div key={i} className="dash-action-item">● {a.title}</div>
          ))}
        </div>
      )}
    </button>
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
      const personItems = data.work_items.filter((w) => w.person_id === p.id);
      const userItems = personItems.filter(isUserTask);
      const overdueCount = userItems.filter((w) => isOverdue(w.due_date)).length;
      const hotCount = getHotThisWeek(personItems).length;
      const nextMeeting = getNextMeeting(p.id, data.notes, dates);
      return { person: p, openCount: userItems.length, overdueCount, hotCount, nextMeeting };
    }).sort((a, b) => {
      // Sort: people with overdue first, then hot, then by next meeting date
      if (a.overdueCount !== b.overdueCount) return b.overdueCount - a.overdueCount;
      if (a.hotCount !== b.hotCount) return b.hotCount - a.hotCount;
      const am = a.nextMeeting || '9999';
      const bm = b.nextMeeting || '9999';
      return am.localeCompare(bm);
    });
  }, [people, data.work_items, data.notes, dates]);

  const projectGroups = useMemo(() => {
    const groups = groupProjectsByPortfolio(data.projects);
    return groups.map((g) => ({
      label: g.label,
      projects: g.projects.map((p) => {
        const openItems = data.work_items.filter((w) => w.project_id === p.id && !w.done);
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
        {/* Tab bar */}
        <div className="dash-tabs">
          <button className={`dash-tab${tab === 'people' ? ' active' : ''}`} onClick={() => setTab('people')}>
            ✦ People{personCards.length > 0 ? ` (${personCards.length})` : ''}
          </button>
          <button className={`dash-tab${tab === 'projects' ? ' active' : ''}`} onClick={() => setTab('projects')}>
            ▤ Projects
          </button>
        </div>

        {/* People tab */}
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

        {/* Projects tab */}
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
