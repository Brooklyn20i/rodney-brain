import { useEffect, useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import type { Note, Person, WorkItem } from '../lib/types';
import { ScreenHeader, Modal, Due, TypeTag, PriTag } from '../components/bits';
import { ItemModal } from '../components/ItemModal';
import { MeetingNoteModal } from '../components/MeetingNoteModal';
import { autoColor, AVATAR_COLORS, initials, fmtDM, fmtDMY, fmtWeekDM, todayStr, addDaysStr } from '../lib/util';
import { useMeetingDates, getNextMeeting } from '../lib/meetings';
import { isAgentTask } from '../lib/tasks';
import { getPersonLedger } from '../lib/selectors';

// A work item belongs to a person if it's their primary person or links to them
// via related_entities. Used identically by the list rail and the detail panel
// so their "action items" counts always agree.
const isPersonLinked = (w: WorkItem, id: string) =>
  w.person_id === id || (w.related_entities || []).some((re) => re.type === 'person' && re.id === id);

const stripHtml = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const colorOf = (p: Person) => p.color || autoColor(p.id || p.name);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
const mtgFolder = (personId: string) => `__mtg__${personId}`;
const fmtNextMtg = (iso: string) =>
  iso === todayStr() ? 'Today' : iso === addDaysStr(1) ? 'Tomorrow' : fmtWeekDM(iso);

const GROUPS = ['Favourites', 'Direct Reports', 'Leaders', 'Support Partners'];

// ── Person create/edit modal ───────────────────────────────────────────────────
function PersonModal({ existing, onClose, onDelete, groups }: { existing?: Person; onClose: () => void; onDelete?: () => void; groups?: string[] }) {
  const { data, insert, update, remove, logActivity } = useCadence();
  const { dates, setMeetingDate } = useMeetingDates();
  const [name, setName] = useState(existing?.name || '');
  const [role, setRole] = useState(existing?.role || '');
  const [email, setEmail] = useState(existing?.email || '');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [color, setColor] = useState(existing?.color || '');
  const [group, setGroup] = useState(existing?.group_name || 'Direct Reports');
  const [nextMeeting, setNextMeeting] = useState(
    existing ? (getNextMeeting(existing.id, data.notes, dates) || '') : ''
  );
  const [busy, setBusy] = useState(false);

  const effective = color || autoColor(name || existing?.name || 'person');

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const patch = { name: name.trim(), role: role.trim(), email: email.trim(), notes, color: effective, group_name: group } as Partial<Person>;
      let personId = existing?.id;
      if (existing) await update('people', existing.id, patch);
      else { const created = await insert('people', patch); personId = (created as any)?.id; }

      if (personId) {
        try {
          const folder = mtgFolder(personId);
          const today = todayStr();
          const upcomingNote = data.notes
            .filter((n) => { const d = dates[n.id]; return n.folder === folder && !!d && d >= today; })
            .sort((a, b) => (dates[a.id] || '').localeCompare(dates[b.id] || ''))[0];

          if (nextMeeting) {
            if (upcomingNote) {
              await setMeetingDate(upcomingNote.id, nextMeeting);
            } else {
              const noteTitle = `1:1 · ${name.trim()} · ${fmtDMY(nextMeeting)}`;
              const n = await insert('notes', { title: noteTitle, body: '', folder } as Partial<Note>);
              await setMeetingDate(n.id, nextMeeting);
            }
          } else if (upcomingNote) {
            await setMeetingDate(upcomingNote.id, null);
          }
        } catch {
          // The person saved fine; only the 1:1 date didn't. Tell the user so it
          // isn't silently dropped, but don't block the rest of the save.
          alert('Saved, but the next 1:1 date could not be set — please try again from the meeting.');
        }
      }

      logActivity(existing ? 'edit_person' : 'add_person', name.trim());
      onClose();
    } finally { setBusy(false); }
  };

  const del = async () => {
    if (!existing) return;
    if (!confirm(`Delete ${existing.name}? This cannot be undone.`)) return;
    // Clean up orphans so deleted people leave nothing dangling behind.
    const folder = mtgFolder(existing.id);
    const mtgNotes = data.notes.filter((n) => n.folder === folder);
    for (const n of mtgNotes) {
      try { await setMeetingDate(n.id, null); } catch { /* best-effort */ }
      await remove('notes', n.id);
    }
    for (const tp of data.talking_points.filter((t) => t.person_id === existing.id)) {
      await remove('talking_points', tp.id);
    }
    // Unassign (don't delete) any work items linked to this person — preserve the task.
    for (const w of data.work_items.filter((w) => w.person_id === existing.id)) {
      await update('work_items', w.id, { person_id: null } as Partial<WorkItem>);
    }
    await remove('people', existing.id);
    logActivity('delete_person', existing.name);
    onDelete?.();
  };

  return (
    <Modal title={existing ? 'Edit Person' : 'Add Person'} onClose={onClose}
      footer={<>
        {existing && <button className="btn btn-danger btn-sm" style={{ marginRight: 'auto' }} onClick={del}>Delete</button>}
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <span className="avatar" style={{ background: effective, width: 48, height: 48, fontSize: 17 }}>{initials(name || '?')}</span>
        <div className="color-swatches">
          {AVATAR_COLORS.map((c) => (
            <button key={c} type="button" className={`color-swatch ${effective === c ? 'active' : ''}`}
              style={{ background: c }} onClick={() => setColor(c)} aria-label={`Colour ${c}`} />
          ))}
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Name</label>
          <input type="text" autoFocus value={name} placeholder="Full name" onChange={(e) => setName(e.target.value)} /></div>
        <div className="form-group"><label>Role</label>
          <input type="text" value={role} placeholder="e.g. CFO, Lead Dev" onChange={(e) => setRole(e.target.value)} /></div>
      </div>
      <div className="form-group"><label>Email</label>
        <input type="email" value={email} placeholder="email@company.com" onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="form-group"><label>Notes</label>
        <textarea value={notes} placeholder="Context about this person…" onChange={(e) => setNotes(e.target.value)} /></div>
      <div className="form-group"><label>Next 1:1 <span style={{ color: 'var(--text3)', fontWeight: 400 }}>— appears in Today</span></label>
        <input type="date" value={nextMeeting} onChange={(e) => setNextMeeting(e.target.value)} /></div>
      <div className="form-group">
        <label>Group</label>
        <div className="person-group-picker">
          {(groups || ['Direct Reports', 'Leaders', 'Support Partners']).map(g => (
            <button key={g} type="button"
              className={`person-group-opt${group === g ? ' active' : ''}`}
              onClick={() => setGroup(g)}>{g}</button>
          ))}
        </div>
      </div>
    </Modal>
  );
}


// ── Meeting notes list ─────────────────────────────────────────────────────────
function MeetingNotes({ person }: { person: Person }) {
  const { data, insert } = useCadence();
  const { dates, setMeetingDate } = useMeetingDates();
  const [openId, setOpenId] = useState<string | null>(null);

  const folder = mtgFolder(person.id);
  const today = todayStr();

  const meetings = useMemo(() => {
    const dateOf = (n: Note) => (dates[n.id] || n.created_at).slice(0, 10);
    return data.notes.filter((n) => n.folder === folder)
      .sort((a, b) => {
        const da = dateOf(a), db = dateOf(b);
        const af = da >= today, bf = db >= today;
        if (af && !bf) return -1;   // upcoming before past
        if (!af && bf) return 1;
        if (af && bf) return da.localeCompare(db);  // nearest upcoming first
        return db.localeCompare(da); // most recent past first
      });
  }, [data.notes, folder, dates]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open the nearest upcoming 1:1 when this person is first shown.
  useEffect(() => {
    if (openId) return;
    const upcoming = meetings.find((n) => (dates[n.id] || n.created_at).slice(0, 10) >= today);
    if (upcoming) setOpenId(upcoming.id);
  }, [person.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const nextId = meetings.find((n) => (dates[n.id] || n.created_at).slice(0, 10) >= today)?.id;

  const newMeeting = async () => {
    const todayDate = todayStr();
    const todayLabel = fmtDMY(todayDate);
    const title = `1:1 · ${person.name} · ${todayLabel}`;
    let n: Note;
    try { n = await insert('notes', { title, body: '', folder } as Partial<Note>); }
    catch (e: any) {
      if (/folder/i.test(String(e?.message || e))) n = await insert('notes', { title, body: '' } as Partial<Note>);
      else throw e;
    }
    try { await setMeetingDate(n.id, todayDate); } catch { /* non-critical */ }
    setOpenId(n.id);
  };

  const openNote = openId ? data.notes.find((n) => n.id === openId) || null : null;

  return (
    <div className="detail-section">
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        📝 Meeting Notes
        {meetings.length > 0 && <span className="section-count" style={{ background: 'var(--accent)' }}>{meetings.length}</span>}
        <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={newMeeting}>+ New 1:1</button>
      </h3>
      {meetings.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text3)', padding: '8px 0' }}>
          No meeting notes yet. Hit "+ New 1:1" to start capturing.
        </p>
      ) : (
        <div className="mtg-list">
          {meetings.map((n) => {
            const preview = n.body.startsWith('{')
              ? (() => { try { const p = JSON.parse(n.body); return (p.agenda?.[0]?.title || '') + (p.notes ? ' · ' + stripHtml(p.notes) : ''); } catch { return ''; } })()
              : stripHtml(n.body);
            const isNext = n.id === nextId;
            return (
              <button key={n.id} className={`mtg-card${isNext ? ' mtg-card-next' : ''}`} onClick={() => setOpenId(n.id)}>
                <div className="mtg-card-date">
                  {fmtDM(dates[n.id] || n.created_at)}
                  {isNext && <span className="mtg-next-badge">NEXT</span>}
                </div>
                <div className="mtg-card-title">{n.title}</div>
                <div className="mtg-card-preview">{preview.slice(0, 100) || 'Empty note'}</div>
              </button>
            );
          })}
        </div>
      )}
      {openNote && (
        <MeetingNoteModal
          note={openNote}
          person={person}
          allMeetings={meetings}
          onClose={() => setOpenId(null)}
          onNavigate={setOpenId}
        />
      )}
    </div>
  );
}

// ── Single topic (work_item) card ──────────────────────────────────────────────
function TopicCard({ w, onEdit }: { w: WorkItem; onEdit: (w: WorkItem) => void }) {
  const { data, update } = useCadence();
  const proj = data.projects.find((p) => p.id === w.project_id);
  const toggle = () => update('work_items', w.id, { done: !w.done, completed_at: !w.done ? new Date().toISOString() : null } as Partial<WorkItem>);
  return (
    <div className="topic-card">
      <input type="checkbox" checked={w.done} onChange={toggle} />
      <div className="topic-body" onClick={() => onEdit(w)}>
        <div className={`topic-title ${w.done ? 'done' : ''}`}>{w.title}</div>
        <div className="topic-tags">
          <TypeTag type={w.type} /><PriTag priority={w.priority} />
          {proj && <span className="tag tag-info">{proj.name}</span>}
          <Due date={w.due_date} />
        </div>
        {w.notes && <div className="topic-notes">{w.notes.slice(0, 140)}{w.notes.length > 140 ? '…' : ''}</div>}
      </div>
      <button className="btn-icon" onClick={() => onEdit(w)}>✎</button>
    </div>
  );
}

// ── Inline editable background notes ──────────────────────────────────────────
function InlineNotes({ person }: { person: Person }) {
  const { update } = useCadence();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(person.notes);
  const save = () => { update('people', person.id, { notes: draft } as Partial<Person>); setEditing(false); };

  if (editing) return (
    <div className="detail-section">
      <h3>Notes</h3>
      <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={save}
        style={{ width: '100%', minHeight: 80 }}
        onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(person.notes); setEditing(false); } }} />
      <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => { setDraft(person.notes); setEditing(false); }}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={save}>Save</button>
      </div>
    </div>
  );

  if (!person.notes) return (
    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text3)', padding: '2px 0', marginBottom: 8 }}
      onClick={() => { setDraft(''); setEditing(true); }}>+ Add background notes</button>
  );

  return (
    <div className="detail-section" style={{ cursor: 'text' }} onClick={() => { setDraft(person.notes); setEditing(true); }}>
      <h3 style={{ display: 'flex', justifyContent: 'space-between' }}>Background Notes
        <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)', textTransform: 'none', letterSpacing: 0 }}>Click to edit</span>
      </h3>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>{person.notes}</p>
    </div>
  );
}

// ── Recently completed log ─────────────────────────────────────────────────────
function RecentlyDone({ items }: { items: WorkItem[] }) {
  const { update } = useCadence();
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  const fmt = (ts: string | null) => ts ? fmtDM(ts) : '';
  return (
    <div className="detail-section">
      <h3 style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => setOpen((o) => !o)}>
        ✓ Recently Done
        <span className="section-count" style={{ background: 'var(--green)' }}>{items.length}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
          Last 14 days {open ? '▴' : '▾'}</span>
      </h3>
      {open && items.map((w) => (
        <div key={w.id} className="work-item-row" style={{ opacity: 0.65 }}>
          <span style={{ color: 'var(--green)', fontSize: 13 }}>✓</span>
          <span className="wi-title done" style={{ flex: 1 }}>{w.title}</span>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>{fmt(w.completed_at)}</span>
          <button className="btn btn-ghost btn-sm" title="Reopen"
            onClick={(e) => { e.stopPropagation(); update('work_items', w.id, { done: false, completed_at: null } as Partial<WorkItem>); }}>
            ↩
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Ledger section: one direction of the two-way ledger ───────────────────────
// "I owe {name}" and "{name} owes me" are the same UI with a different item
// type behind the quick-add — I-owe inserts a task, owes-me inserts a
// waitingFor (which is what puts it in this column and Home's Waiting lane).
function LedgerSection({ person, title, items, overdue, accent, addType, addPlaceholder, onEdit }: {
  person: Person; title: string; items: WorkItem[]; overdue: number;
  accent: string; addType: WorkItem['type']; addPlaceholder: string;
  onEdit: (w: WorkItem) => void;
}) {
  const { insert, logActivity } = useCadence();
  const [draft, setDraft] = useState('');

  const quickAdd = async () => {
    const t = draft.trim();
    if (!t) return;
    try {
      await insert('work_items', {
        title: t, type: addType, priority: 'medium', person_id: person.id,
        related_entities: [{ type: 'person', id: person.id, name: person.name }],
        notes: '', inboxed: false, source: 'you',
      } as Partial<WorkItem>);
      setDraft(''); // clear only after the save succeeds, so nothing is lost
      logActivity('add_item', t);
    } catch { /* error surfaced via syncError; keep the draft for retry */ }
  };

  return (
    <div className="detail-section ledger-section" style={{ ['--section-accent' as string]: accent }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{title}
        {items.length > 0 && <span className="section-count" style={{ background: accent }}>{items.length}</span>}
        {overdue > 0 && <span className="ledger-overdue-chip">{overdue} overdue</span>}
      </h3>
      {items.map((w) => <TopicCard key={w.id} w={w} onEdit={onEdit} />)}
      {items.length === 0 && <p className="ledger-empty">Nothing here — all square.</p>}
      <div className="topic-add">
        <span style={{ color: 'var(--text3)', fontSize: 16 }}>+</span>
        <input value={draft} placeholder={addPlaceholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') quickAdd(); }} />
      </div>
    </div>
  );
}

// ── Person detail panel ────────────────────────────────────────────────────────
function Detail({ person, onEditPerson }: { person: Person; onEditPerson: () => void }) {
  const { data } = useCadence();
  const { dates } = useMeetingDates();
  const nextMeeting = getNextMeeting(person.id, data.notes, dates);
  const [tab, setTab] = useState<'ledger' | 'meetings'>('ledger');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<WorkItem | null>(null);

  // The two-way ledger: what I owe them vs what they owe me. Inboxed captures
  // are excluded until triaged (getPersonLedger builds on isFiledTask).
  const ledger = useMemo(() => getPersonLedger(data.work_items, person.id), [data.work_items, person.id]);
  const openCount = ledger.iOwe.length + ledger.theyOwe.length;

  const mine = data.work_items.filter((w) => !isAgentTask(w) && !w.inboxed && isPersonLinked(w, person.id));
  const recentDone = mine.filter((w) => w.done && w.completed_at && w.completed_at > daysAgo(14))
    .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));

  const meetingCount = data.notes.filter((n) => n.folder === mtgFolder(person.id)).length;
  const first = person.name.trim().split(/\s+/)[0] || person.name;

  return (
    <div className="split-right">
      <div className="split-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span className="avatar" style={{ background: colorOf(person) }}>{initials(person.name)}</span>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{person.name}</h3>
            {person.role && <div style={{ fontSize: 12, color: 'var(--text2)' }}>{person.role}</div>}
            {nextMeeting && (
              <div style={{ fontSize: 12, marginTop: 2 }}>
                <span style={{
                  background: nextMeeting === todayStr() ? 'var(--green-bg)' : 'var(--blue-bg)',
                  color: nextMeeting === todayStr() ? 'var(--green)' : 'var(--accent)',
                  padding: '1px 7px', borderRadius: 10, fontWeight: 600, fontSize: 11
                }}>📅 {fmtNextMtg(nextMeeting)}</span>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button className="btn btn-secondary btn-sm" onClick={onEditPerson}>Edit</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="people-tabs">
        <button className={`people-tab ${tab === 'ledger' ? 'active' : ''}`} onClick={() => setTab('ledger')}>
          Ledger {openCount > 0 && <span className="ptab-badge">{openCount}</span>}
        </button>
        <button className={`people-tab ${tab === 'meetings' ? 'active' : ''}`} onClick={() => setTab('meetings')}>
          Meetings {meetingCount > 0 && <span className="ptab-badge">{meetingCount}</span>}
        </button>
      </div>

      <div className="split-panel-body">
        {tab === 'ledger' && (
          <>
            {person.email && <p className="card-meta" style={{ marginBottom: 10 }}>✉ {person.email}</p>}
            <InlineNotes person={person} />
            <LedgerSection
              person={person}
              title={`📤 ${first} owes me`}
              items={ledger.theyOwe}
              overdue={ledger.theyOweOverdue}
              accent="var(--teal)"
              addType="waitingFor"
              addPlaceholder={`Give ${first} a task — press Enter`}
              onEdit={setEditing}
            />
            <LedgerSection
              person={person}
              title={`📥 I owe ${first}`}
              items={ledger.iOwe}
              overdue={ledger.iOweOverdue}
              accent="var(--accent)"
              addType="task"
              addPlaceholder={`Something I owe ${first} — press Enter`}
              onEdit={setEditing}
            />
            <button className="btn btn-ghost btn-sm" style={{ marginBottom: 10 }} onClick={() => setAdding(true)}>
              + Add with full details
            </button>
            <RecentlyDone items={recentDone} />
          </>
        )}
        {tab === 'meetings' && <MeetingNotes person={person} />}
      </div>

      {adding && <ItemModal defaults={{ person_id: person.id, type: 'followUp', inboxed: false } as Partial<WorkItem>} onClose={() => setAdding(false)} />}
      {editing && <ItemModal existing={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function People({ onMenu, initialSelectedId }: { onMenu?: () => void; initialSelectedId?: string | null }) {
  const { data, update } = useCadence();
  const { dates } = useMeetingDates();
  const [selected, setSelected] = useState<string | null>(initialSelectedId ?? null);

  useEffect(() => {
    if (initialSelectedId) setSelected(initialSelectedId);
  }, [initialSelectedId]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);

  const sorted = useMemo(() =>
    [...data.people].filter((p) => !p.type || p.type === 'person').sort((a, b) => {
      const gA = GROUPS.indexOf(a.group_name || 'Direct Reports');
      const gB = GROUPS.indexOf(b.group_name || 'Direct Reports');
      if (gA !== gB) return (gA < 0 ? 99 : gA) - (gB < 0 ? 99 : gB);
      const sA = a.sort_order ?? 0, sB = b.sort_order ?? 0;
      if (sA !== sB) return sA - sB;
      return a.name.localeCompare(b.name);
    }), [data.people]);

  const grouped = useMemo(() => {
    const res: Record<string, Person[]> = {};
    GROUPS.forEach(g => { res[g] = []; });
    sorted.forEach(p => {
      const g = p.group_name || 'Direct Reports';
      if (!res[g]) res[g] = [];
      res[g].push(p);
    });
    return res;
  }, [sorted]);

  const moveInGroup = async (person: Person, dir: 'up' | 'down') => {
    const group = person.group_name || 'Direct Reports';
    const gp = sorted.filter(p => (p.group_name || 'Direct Reports') === group);
    const idx = gp.findIndex(p => p.id === person.id);
    const ti = dir === 'up' ? idx - 1 : idx + 1;
    if (ti < 0 || ti >= gp.length) return;
    const newOrder = [...gp];
    [newOrder[idx], newOrder[ti]] = [newOrder[ti], newOrder[idx]];
    await Promise.all(newOrder.map((p, i) => update('people', p.id, { sort_order: i } as Partial<Person>)));
  };

  const person = data.people.find((p) => p.id === selected) || null;

  return (
    <>
      <ScreenHeader title="People" onMenu={onMenu} />
      <div className="split-view">
        <div className="split-left">
          <div className="split-panel-header">
            <h3>{sorted.length} {sorted.length === 1 ? 'person' : 'people'}</h3>
            <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>+ Add</button>
          </div>
          <div className="split-panel-body">
            {sorted.length ? (
              GROUPS.map(groupName => {
                const gPeople = grouped[groupName] || [];
                if (!gPeople.length) return null;
                return (
                  <div key={groupName}>
                    <div className="people-group-hdr">{groupName}</div>
                    {gPeople.map((p, idx) => {
                      const ledger = getPersonLedger(data.work_items, p.id);
                      const overdue = ledger.iOweOverdue + ledger.theyOweOverdue;
                      const pMeeting = getNextMeeting(p.id, data.notes, dates);
                      return (
                        <div key={p.id} className="person-list-row">
                          <button className={`person-item${selected === p.id ? ' selected' : ''}`} onClick={() => setSelected(p.id)}>
                            <span className="avatar" style={{ background: colorOf(p) }}>{initials(p.name)}</span>
                            <div className="project-info">
                              <div className="project-name">{p.name}</div>
                              <div className="project-meta">
                                {p.role ? p.role + ' · ' : ''}
                                owes you {ledger.theyOwe.length} · you owe {ledger.iOwe.length}
                                {overdue > 0 ? ` · ${overdue} overdue` : ''}
                                {pMeeting ? ` · 📅 ${fmtNextMtg(pMeeting)}` : ''}
                              </div>
                            </div>
                          </button>
                          <div className="person-reorder-btns">
                            <button className="person-reorder-btn" title="Move up"
                              disabled={idx === 0} onClick={() => moveInGroup(p, 'up')}>↑</button>
                            <button className="person-reorder-btn" title="Move down"
                              disabled={idx === gPeople.length - 1} onClick={() => moveInGroup(p, 'down')}>↓</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })
            ) : (
              <div className="empty-state">
                <div className="icon">✦</div>
                <p>No people yet</p>
                <small>Track topics, follow-ups and meeting notes by person</small>
              </div>
            )}
          </div>
        </div>
        {person
          ? <Detail key={person.id} person={person} onEditPerson={() => setEditing(person)} />
          : <div className="split-right"><div className="empty-state" style={{ margin: 'auto' }}><div className="icon">✦</div><p>Select a person</p></div></div>
        }
      </div>
      {creating && <PersonModal onClose={() => setCreating(false)} groups={GROUPS} />}
      {editing && <PersonModal existing={editing} onClose={() => setEditing(null)} onDelete={() => { setEditing(null); setSelected(null); }} groups={GROUPS} />}
    </>
  );
}
