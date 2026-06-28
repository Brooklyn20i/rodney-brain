import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import { autoColor, fmtHeaderDate, fmtWeekDM, todayStr, addDaysStr, fmtDM } from '../lib/util';
import type { WorkItem, Project, Activity } from '../lib/types';
import { PriTag, Due, ScreenHeader } from '../components/bits';
import { ItemModal } from '../components/ItemModal';
import { QuickAdd } from '../components/QuickAdd';
import { useMeetingDates, getNextMeeting } from '../lib/meetings';
import { isUserTask } from '../lib/tasks';
import {
  getNeedsRodney, getHotThisWeek, getBlockedRisky,
  getKobeHandling, getRecentlyChanged, controlWhy,
} from '../lib/selectors';
import type { ControlBucket } from '../lib/selectors';

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');

const fmtMtgDay = (iso: string) => {
  if (iso === todayStr()) return 'Today';
  if (iso === addDaysStr(1)) return 'Tomorrow';
  return fmtWeekDM(iso);
};

// ── Cockpit section wrapper ───────────────────────────────────────────────────
function CockpitSection({ label, count, accent, empty, children }: {
  label: string; count: number; accent: string; empty: string; children: React.ReactNode;
}) {
  return (
    <div className="cockpit-section">
      <div className="cockpit-section-hdr">
        <span className="cockpit-section-label">{label}</span>
        <span className="cockpit-section-count" style={{ background: accent }}>{count}</span>
      </div>
      {count === 0
        ? <div className="cockpit-empty">{empty}</div>
        : <div className="cockpit-section-body">{children}</div>}
    </div>
  );
}

// ── Compact work item row for the cockpit ─────────────────────────────────────
function CockpitRow({ w, bucket, people, projects, onEdit }: {
  w: WorkItem; bucket: ControlBucket; people: { id: string; name: string }[];
  projects: Project[]; onEdit: (w: WorkItem) => void;
}) {
  const proj = projects.find((p) => p.id === w.project_id);
  const person = people.find((p) => p.id === w.person_id);
  const why = controlWhy(w, bucket, person?.name);
  return (
    <button className="cockpit-row" onClick={() => onEdit(w)}>
      <PriTag priority={w.priority} />
      <div className="cockpit-row-main">
        <div className="cockpit-row-title">{w.title}</div>
        {why && <div className="cockpit-row-why">{why}</div>}
        <div className="cockpit-row-meta">
          {proj && <span className="cockpit-meta-chip cockpit-chip-proj">▤ {proj.name}</span>}
          {person && <span className="cockpit-meta-chip cockpit-chip-person">👤 {person.name.split(' ')[0]}</span>}
          <Due date={w.due_date} />
        </div>
      </div>
    </button>
  );
}

// ── Blocked / risky project chip ──────────────────────────────────────────────
function RiskyProjectChip({ project, onClick }: { project: Project; onClick?: () => void }) {
  const healthColour: Record<string, string> = { green: 'var(--green)', amber: 'var(--orange)', red: 'var(--red)' };
  return (
    <div className="cockpit-risky-proj" onClick={onClick}>
      <span className="cockpit-health-dot" style={{ background: healthColour[project.health] || 'var(--text3)' }} />
      <span className="cockpit-risky-name">{project.name}</span>
      {project.next_action && <span className="cockpit-risky-next">→ {project.next_action}</span>}
    </div>
  );
}

// ── Activity row ──────────────────────────────────────────────────────────────
const ACTION_LABEL: Record<string, string> = {
  add_item: 'Added task', edit_item: 'Edited task', push_meeting_tasks: 'Pushed tasks',
  project_update: 'Project update', capture_extract: 'Captured items',
  add_item_kobe: 'Kobe added task', meeting_note: 'Meeting note',
};

function ActivityRow({ a }: { a: Activity }) {
  const label = ACTION_LABEL[a.action] || a.action.replace(/_/g, ' ');
  const time = a.created_at
    ? new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  const day = a.created_at ? a.created_at.slice(0, 10) : '';
  const isToday = day === todayStr();
  return (
    <div className="cockpit-activity-row">
      <span className="cockpit-activity-time">{isToday ? time : fmtDM(day)}</span>
      <span className="cockpit-activity-label">{label}</span>
      {a.detail && <span className="cockpit-activity-detail">{a.detail.slice(0, 60)}{a.detail.length > 60 ? '…' : ''}</span>}
    </div>
  );
}

// ── Project pulse (compact amber/red summary) ─────────────────────────────────
function ProjectPulse({ projects }: { projects: Project[] }) {
  const active = projects.filter((p) => p.status === 'active' && !p.deleted_at);
  const red = active.filter((p) => p.health === 'red');
  const amber = active.filter((p) => p.health === 'amber');
  const green = active.filter((p) => p.health === 'green');
  if (!active.length) return null;

  return (
    <div className="cockpit-pulse">
      <span className="cockpit-pulse-label">Portfolio</span>
      {red.length > 0 && <span className="cockpit-pulse-chip" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>🔴 {red.length} off track</span>}
      {amber.length > 0 && <span className="cockpit-pulse-chip" style={{ background: 'var(--orange-bg)', color: 'var(--orange)' }}>🟠 {amber.length} at risk</span>}
      {green.length > 0 && <span className="cockpit-pulse-chip" style={{ background: 'var(--green-bg)', color: 'var(--green)' }}>🟢 {green.length} on track</span>}
    </div>
  );
}

// ── Main Control screen ───────────────────────────────────────────────────────
export function Today({ onMenu }: { onMenu?: () => void }) {
  const { data } = useCadence();
  const { dates } = useMeetingDates();
  const [editing, setEditing] = useState<WorkItem | null>(null);
  const [adding, setAdding] = useState(false);

  const people = useMemo(() =>
    data.people.filter((p) => !p.type || p.type === 'person'),
    [data.people]
  );

  const view = useMemo(() => {
    const items = data.work_items;
    const today = todayStr();
    const next7 = addDaysStr(7);

    const needsRodney = getNeedsRodney(items);
    const hotThisWeek = getHotThisWeek(items);
    const blockedItems = getBlockedRisky(items);
    const blockedProjects = data.projects.filter(
      (p) => p.status === 'active' && !p.deleted_at && (p.health === 'amber' || p.health === 'red')
    );
    const kobeHandling = getKobeHandling(items);
    const recentActivity = getRecentlyChanged(data.activity);

    const oneOnOnes = people
      .map((p) => ({ p, mtg: getNextMeeting(p.id, data.notes, dates) }))
      .filter(({ mtg }) => mtg && mtg >= today && mtg <= next7)
      .map(({ p, mtg }) => ({
        person: p,
        meeting: mtg as string,
        openTopics: items.filter((w) => isUserTask(w) && w.person_id === p.id).length,
        isToday: mtg === today,
      }))
      .sort((a, b) => a.meeting.localeCompare(b.meeting));

    return { needsRodney, hotThisWeek, blockedItems, blockedProjects, kobeHandling, recentActivity, oneOnOnes };
  }, [data, dates, people]);

  return (
    <>
      <ScreenHeader title="Control" subtitle={fmtHeaderDate(todayStr())} onMenu={onMenu}>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Quick Add</button>
      </ScreenHeader>

      <div className="screen-content">

        {/* Portfolio pulse bar */}
        <ProjectPulse projects={data.projects} />

        {/* 1:1s This Week — time-sensitive, show first */}
        {view.oneOnOnes.length > 0 && (
          <CockpitSection
            label="1:1s This Week" count={view.oneOnOnes.length}
            accent="var(--green)" empty="">
            <div className="cockpit-1on1s">
              {view.oneOnOnes.map(({ person, meeting, openTopics, isToday }) => (
                <div key={person.id} className="cockpit-1on1-card">
                  <span className="avatar" style={{ background: autoColor(person.id || person.name), width: 32, height: 32, fontSize: 12, flexShrink: 0, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700 }}>
                    {initials(person.name)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="cockpit-1on1-name">
                      {person.name}
                      {person.role && <span className="cockpit-1on1-role">{person.role}</span>}
                    </div>
                    <div className="cockpit-1on1-meta">
                      <span className={`cockpit-meta-chip ${isToday ? 'cockpit-chip-today' : 'cockpit-chip-plain'}`}>
                        📅 {fmtMtgDay(meeting)}
                      </span>
                      {openTopics > 0 && (
                        <span className="cockpit-meta-chip cockpit-chip-plain">
                          {openTopics} open action{openTopics !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CockpitSection>
        )}

        {/* Needs Rodney */}
        <CockpitSection
          label="Needs Rodney" count={view.needsRodney.length}
          accent="var(--orange)" empty="No decisions or approvals pending">
          {view.needsRodney.map((w) => (
            <CockpitRow key={w.id} w={w} bucket="needsRodney" people={people} projects={data.projects} onEdit={setEditing} />
          ))}
        </CockpitSection>

        {/* Hot This Week */}
        <CockpitSection
          label="Hot This Week" count={view.hotThisWeek.length}
          accent="var(--accent)" empty="Nothing due in the next 7 days">
          {view.hotThisWeek.map((w) => (
            <CockpitRow key={w.id} w={w} bucket="hotThisWeek" people={people} projects={data.projects} onEdit={setEditing} />
          ))}
        </CockpitSection>

        {/* Blocked / Risky */}
        <CockpitSection
          label="Blocked / Risky"
          count={view.blockedItems.length + view.blockedProjects.length}
          accent="var(--red)" empty="Nothing blocked or at risk">
          {view.blockedProjects.map((p) => (
            <RiskyProjectChip key={p.id} project={p} />
          ))}
          {view.blockedItems.map((w) => (
            <CockpitRow key={w.id} w={w} bucket="blockedRisky" people={people} projects={data.projects} onEdit={setEditing} />
          ))}
        </CockpitSection>

        {/* Kobe Handling */}
        <CockpitSection
          label="Kobe Handling" count={view.kobeHandling.length}
          accent="var(--purple)" empty="Nothing delegated to Kobe">
          {view.kobeHandling.map((w) => (
            <CockpitRow key={w.id} w={w} bucket="kobeHandling" people={people} projects={data.projects} onEdit={setEditing} />
          ))}
        </CockpitSection>

        {/* Recently Changed */}
        <CockpitSection
          label="Recently Changed" count={view.recentActivity.length}
          accent="var(--text3)" empty="No recent activity">
          {view.recentActivity.map((a) => (
            <ActivityRow key={a.id} a={a} />
          ))}
        </CockpitSection>

      </div>

      {adding && <QuickAdd onClose={() => setAdding(false)} />}
      {editing && <ItemModal existing={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
