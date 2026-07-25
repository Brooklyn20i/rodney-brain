import React, { useState } from 'react';
import { useCadence } from '../../lib/store';
import type { Person, WorkItem } from '../../lib/types';
import type { Commitments } from '../../lib/selectors';
import { PriTag, Due } from '../../components/bits';
import { groupByDueBucket } from '../../lib/dateBuckets';
import { isOverdue } from '../../lib/util';

// The commitments board — Home's working surface. Three dense columns answer
// the only two questions Rodney asks of his task list: "what's just mine to
// do?" and "who am I on the hook to (and who's on the hook to me)?" Each
// column carries its natural grouping (to-dos by due date, debts by person),
// so there is no lane toggle and no group-by control. Rows are deliberately
// minimal — the slide-over detail holds everything else.

// A single dense row. Keeps the `task-hub-row` class + pin-star titles that
// day-plan e2e depends on; checkbox completes inline; body opens the detail.
function BoardRow({ w, selected, onSelect, pinned, onTogglePin }: {
  w: WorkItem; selected: boolean; onSelect: (w: WorkItem) => void;
  pinned: boolean; onTogglePin: (w: WorkItem) => void;
}) {
  const { update } = useCadence();
  const toggle = () => update('work_items', w.id, {
    done: !w.done, completed_at: !w.done ? new Date().toISOString() : null,
  } as Partial<WorkItem>);

  return (
    <div className={`card card-compact task-hub-row commit-row${selected ? ' selected' : ''}`}>
      <div className="card-row">
        <input type="checkbox" checked={w.done} onChange={toggle}
          style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
        <div style={{ flex: 1, cursor: 'pointer', minWidth: 0 }} onClick={() => onSelect(w)}>
          <div className={`card-title ${w.done ? 'checkbox-done' : ''}`}>{w.title}</div>
          {(w.priority === 'high' || w.due_date) && (
            <div style={{ display: 'flex', gap: 6, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' }}>
              {w.priority === 'high' && <PriTag priority="high" />}
              <Due date={w.due_date} />
            </div>
          )}
        </div>
        <button
          className={`pin-star${pinned ? ' pinned' : ''}`}
          title={pinned ? "Unpin from Today's focus" : "Pin to Today's focus"}
          onClick={(e) => { e.stopPropagation(); onTogglePin(w); }}
        >{pinned ? '★' : '☆'}</button>
      </div>
    </div>
  );
}

// Inline quick-add at the bottom of the My-to-do column (lifted from the old
// per-group quick-add; same class, same Enter/blur submit).
function ColumnQuickAdd({ placeholder, onAdd }: { placeholder: string; onAdd: (title: string) => void }) {
  const [text, setText] = useState('');
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onAdd(t);
    setText('');
  };
  return (
    <input
      className="task-group-quickadd"
      type="text"
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
      onBlur={() => { if (text.trim()) submit(); }}
    />
  );
}

function BoardColumn({ testId, icon, label, count, overdue, children }: {
  testId: string; icon: string; label: string; count: number; overdue: number;
  children: React.ReactNode;
}) {
  return (
    <section className="commit-col" data-testid={testId} aria-label={label}>
      <div className="commit-col-hdr">
        <h2>{icon} {label}</h2>
        <span className="section-count">{count}</span>
        {overdue > 0 && <span className="ledger-overdue-chip">{overdue} overdue</span>}
      </div>
      {children}
    </section>
  );
}

// Group items by their current counterparty, in name order; person-less
// waitingFors trail as "No one specific" (the TriageTray path produces these
// — they must not vanish).
function groupByPerson(items: WorkItem[], people: Person[]) {
  const byId = new Map<string, { id: string; name: string; items: WorkItem[] }>();
  for (const w of items) {
    const key = w.person_id || '_none';
    let g = byId.get(key);
    if (!g) {
      const name = w.person_id
        ? people.find((p) => p.id === w.person_id)?.name || 'Unknown person'
        : 'No one specific';
      g = { id: key, name, items: [] };
      byId.set(key, g);
    }
    g.items.push(w);
  }
  return [...byId.values()].sort((a, b) =>
    (a.id === '_none' ? 1 : 0) - (b.id === '_none' ? 1 : 0) || a.name.localeCompare(b.name));
}

const overdueIn = (items: WorkItem[]) => items.filter((w) => isOverdue(w.due_date)).length;

export function CommitmentsBoard({ commitments, people, selectedId, onSelect, onQuickAddTodo, pinnedIds, onTogglePin }: {
  commitments: Commitments;
  people: Person[];
  selectedId: string | null;
  onSelect: (w: WorkItem) => void;
  onQuickAddTodo: (title: string) => void;
  pinnedIds: Set<string>;
  onTogglePin: (w: WorkItem) => void;
}) {
  const { todo, owedByMe, waiting } = commitments;
  const row = (w: WorkItem) => (
    <BoardRow key={w.id} w={w} selected={selectedId === w.id} onSelect={onSelect}
      pinned={pinnedIds.has(w.id)} onTogglePin={onTogglePin} />
  );

  const todoBuckets = groupByDueBucket(todo).filter((b) => b.items.length > 0);
  const owedGroups = groupByPerson(owedByMe, people);
  const waitingGroups = groupByPerson(waiting, people);

  return (
    <div className="commit-board" aria-label="Commitments">
      <BoardColumn testId="col-todo" icon="📝" label="My to-do" count={todo.length} overdue={overdueIn(todo)}>
        {todo.length === 0 && <div className="commit-empty">Nothing that's just yours — clear.</div>}
        {todoBuckets.map(({ bucket, items }) => (
          <React.Fragment key={bucket.key}>
            <div className="commit-col-sub">
              {bucket.label}
              <span className="section-count" style={{ background: bucket.color }}>{items.length}</span>
            </div>
            {items.map(row)}
          </React.Fragment>
        ))}
        <ColumnQuickAdd placeholder="+ Add a to-do — press Enter" onAdd={onQuickAddTodo} />
      </BoardColumn>

      <BoardColumn testId="col-owed" icon="📥" label="I owe" count={owedByMe.length} overdue={overdueIn(owedByMe)}>
        {owedByMe.length === 0 && <div className="commit-empty">You owe no one — all square.</div>}
        {owedGroups.map((g) => (
          <React.Fragment key={g.id}>
            <div className="commit-col-sub">
              {g.name}
              <span className="section-count" style={{ background: 'var(--accent)' }}>{g.items.length}</span>
              {overdueIn(g.items) > 0 && <span className="ledger-overdue-chip">{overdueIn(g.items)} overdue</span>}
            </div>
            {g.items.map(row)}
          </React.Fragment>
        ))}
      </BoardColumn>

      <BoardColumn testId="col-waiting" icon="📤" label="Waiting on" count={waiting.length} overdue={overdueIn(waiting)}>
        {waiting.length === 0 && <div className="commit-empty">No one owes you anything.</div>}
        {waitingGroups.map((g) => (
          <React.Fragment key={g.id}>
            <div className="commit-col-sub">
              {g.name}
              <span className="section-count" style={{ background: 'var(--teal)' }}>{g.items.length}</span>
              {overdueIn(g.items) > 0 && <span className="ledger-overdue-chip">{overdueIn(g.items)} overdue</span>}
            </div>
            {g.items.map(row)}
          </React.Fragment>
        ))}
      </BoardColumn>
    </div>
  );
}
