import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import { autoColor, initials, fmtHeaderDate, fmtWeekDM, todayStr, addDaysStr } from '../lib/util';
import type { WorkItem } from '../lib/types';
import { TaskRow, ScreenHeader } from '../components/bits';
import { ItemModal } from '../components/ItemModal';
import { QuickAdd } from '../components/QuickAdd';
import { useMeetingDates, getNextMeeting } from '../lib/meetings';
import { isFiledTask, isLinkedToPerson } from '../lib/tasks';
import { getTodoGroups, getWaitingOnOthers, getKobeHandling, getLoadSummary, getDecideItems } from '../lib/selectors';
import { AceBriefingCard } from '../components/AceBriefingCard';
import { useAceUi } from '../lib/aceUi';
import { meetingPrepPrompt } from '../lib/acePrompts';

const fmtMtgDay = (iso: string) => {
  if (iso === todayStr()) return 'Today';
  if (iso === addDaysStr(1)) return 'Tomorrow';
  return fmtWeekDM(iso);
};

const TONE: Record<string, string> = {
  red: 'var(--red)', orange: 'var(--orange)', blue: 'var(--accent)', muted: 'var(--text3)',
};

// ── Simple section wrapper ─────────────────────────────────────────────────────
function Section({ label, count, accent, empty, children }: {
  label: string; count: number; accent: string; empty: string; children: React.ReactNode;
}) {
  return (
    <div className="cockpit-section">
      <div className="cockpit-section-hdr">
        <span className="cockpit-section-label">{label}</span>
        {count > 0 && <span className="cockpit-section-count" style={{ background: accent }}>{count}</span>}
      </div>
      {count === 0
        ? <div className="cockpit-empty">{empty}</div>
        : <div className="cockpit-section-body">{children}</div>}
    </div>
  );
}

// ── At-a-glance summary line ────────────────────────────────────────────────────
function LoadStrip({ load }: { load: ReturnType<typeof getLoadSummary> }) {
  if (load.active === 0 && load.waiting === 0 && load.kobe === 0) return null;
  return (
    <div className={`control-load${load.overCap ? ' warning' : ''}`}>
      <div className="control-load-stats">
        <div className="control-load-stat">
          <span className={`control-load-num${load.overdue > 0 ? ' red' : ''}`}>{load.active}</span>
          <span className="control-load-lbl">To do{load.overdue > 0 ? ` · ${load.overdue} overdue` : ''}</span>
        </div>
        <div className="control-load-stat">
          <span className="control-load-num">{load.waiting}</span>
          <span className="control-load-lbl">Waiting on others</span>
        </div>
        <div className="control-load-stat">
          <span className="control-load-num">{load.kobe}</span>
          <span className="control-load-lbl">With Kobe</span>
        </div>
      </div>
      {load.overCap && (
        <div className="control-load-nudge">
          You're holding {load.active} open items — a few could move to Waiting or to Kobe.
        </div>
      )}
    </div>
  );
}

// ── Control screen ──────────────────────────────────────────────────────────────
export function Today({ onMenu }: { onMenu?: () => void }) {
  const { data } = useCadence();
  const { dates } = useMeetingDates();
  const { openAce } = useAceUi();
  const [editing, setEditing] = useState<WorkItem | null>(null);
  const [adding, setAdding] = useState(false);

  const people = useMemo(
    () => data.people.filter((p) => !p.type || p.type === 'person'),
    [data.people],
  );

  const view = useMemo(() => {
    const items = data.work_items;
    const today = todayStr();
    const next7 = addDaysStr(7);

    const todoGroups = getTodoGroups(items);
    const todoCount = todoGroups.reduce((n, g) => n + g.items.length, 0);
    const decisions = getDecideItems(items, data.decisions);
    const waiting = getWaitingOnOthers(items);
    const kobe = getKobeHandling(items);
    const load = getLoadSummary(items);

    const oneOnOnes = people
      .map((p) => ({ p, mtg: getNextMeeting(p.id, data.notes, dates) }))
      .filter(({ mtg }) => mtg && mtg >= today && mtg <= next7)
      .map(({ p, mtg }) => ({
        person: p,
        meeting: mtg as string,
        openTopics: items.filter((w) => isFiledTask(w) && isLinkedToPerson(w, p.id)).length,
        isToday: mtg === today,
      }))
      .sort((a, b) => a.meeting.localeCompare(b.meeting));

    return { todoGroups, todoCount, decisions, waiting, kobe, load, oneOnOnes };
  }, [data, dates, people]);

  return (
    <>
      <ScreenHeader title="Today" subtitle={`${fmtHeaderDate(todayStr())} · Do now · Decide · Waiting · With Kobe`} onMenu={onMenu}>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Quick Add</button>
      </ScreenHeader>

      <div className="screen-content">

        <LoadStrip load={view.load} />

        {/* Ace's daily briefing — collapsed echo; the full card lives on Dashboard */}
        <AceBriefingCard compact />

        {/* Do now — the one ranked list, by when it's due */}
        <Section label="Needs Rodney / Do now" count={view.todoCount} accent="var(--accent)"
          empty="Nothing on your plate — clear deck.">
          {view.todoGroups.map((g) => (
            <div key={g.key} className="todo-group">
              <div className="todo-group-hdr" style={{ color: TONE[g.tone] }}>{g.label} · {g.items.length}</div>
              {g.items.map((w) => <TaskRow key={w.id} w={w} onEdit={setEditing} />)}
            </div>
          ))}
        </Section>

        {/* Decide — explicit decisions from existing work_items/decisions data */}
        <Section label="Decide" count={view.decisions.length} accent="var(--orange)"
          empty="No explicit decisions waiting.">
          {view.decisions.map((d) => d.workItem ? (
            <TaskRow key={d.id} w={d.workItem} onEdit={setEditing} />
          ) : (
            <div key={d.id} className="task-row decision-row">
              <div className="task-main">
                <div className="task-title">{d.title}</div>
                <div className="task-meta">Decision{d.due_date ? ` · due ${d.due_date}` : ''}</div>
              </div>
            </div>
          ))}
        </Section>

        {/* 1:1s This Week — time-sensitive */}
        {view.oneOnOnes.length > 0 && (
          <Section label="1:1s This Week" count={view.oneOnOnes.length} accent="var(--green)" empty="">
            <div className="cockpit-1on1s">
              {view.oneOnOnes.map(({ person, meeting, openTopics, isToday }) => (
                <div key={person.id} className="cockpit-1on1-card">
                  <span className="avatar avatar-md" style={{ background: autoColor(person.id || person.name) }}>
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
                  <button className="btn btn-ghost btn-sm ace-action-btn" title={`Ask Ace to prep the 1:1 with ${person.name}`}
                    onClick={() => openAce({ prompt: meetingPrepPrompt(person), contextLabel: person.name })}>
                    ◆ Prep
                  </button>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Waiting on others — owed by others, not yours to own */}
        <Section label="Waiting / owed by others" count={view.waiting.length} accent="var(--blue)"
          empty="Not waiting on anyone.">
          {view.waiting.map((w) => <TaskRow key={w.id} w={w} onEdit={setEditing} />)}
        </Section>

        {/* With Kobe — delegated */}
        <Section label="With Kobe" count={view.kobe.length} accent="var(--purple)"
          empty="Nothing delegated to Kobe.">
          {view.kobe.map((w) => <TaskRow key={w.id} w={w} onEdit={setEditing} />)}
        </Section>

        <div className="cockpit-footnote">Later / parked work is held inside Do now under “Later” until lane-level parking exists in the data model.</div>

      </div>

      {adding && <QuickAdd onClose={() => setAdding(false)} />}
      {editing && <ItemModal existing={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
