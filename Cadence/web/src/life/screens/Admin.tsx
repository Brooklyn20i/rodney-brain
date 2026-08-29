import { useState } from 'react';
import { useCadenceLife } from '../lib/store';
import { useCadence } from '../../lib/store';
import { ScreenHeader, Card, EmptyState } from '../components/bits';
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  LIFE_CATEGORIES,
  type LifeCategory,
  type LifeItem,
} from '../lib/types';
import { dueLabel, fmtDay, todayLocalISO } from '../lib/lifeCalc';

type View = 'inbox' | 'open' | 'done';

// Personal admin to-dos: capture → file (category + optional due) → done.
// The inbox is the routing point in BOTH directions — a capture that turns
// out to be work goes back to Cadence Work's inbox with one tap, mirroring
// the "→ Life" flick in Work's triage.
export function Admin({ onMenu, initialView = 'open' }: { onMenu: () => void; initialView?: View }) {
  const { data, insert, update, remove } = useCadenceLife();
  const work = useCadence();
  const today = todayLocalISO();

  const items = data.life_items.filter((i) => !i.deleted_at);
  const inbox = items.filter((i) => i.status === 'inbox');
  const [view, setView] = useState<View>(initialView === 'open' && inbox.length > 0 ? 'inbox' : initialView);

  // Quick capture straight into Life (GlobalCapture stays work-only, on purpose).
  const [newTitle, setNewTitle] = useState('');
  const addCapture = async () => {
    const title = newTitle.trim();
    if (!title) return;
    await insert('life_items', { title, notes: '', status: 'inbox', category: 'admin', due_date: null, obligation_id: null, completed_at: null });
    setNewTitle('');
  };

  // Per-inbox-row filing state (category + due chosen before File).
  const [filing, setFiling] = useState<Record<string, { category: LifeCategory; due: string }>>({});
  const filingFor = (id: string) => filing[id] ?? { category: 'admin' as LifeCategory, due: '' };
  const setFilingFor = (id: string, patch: Partial<{ category: LifeCategory; due: string }>) =>
    setFiling((f) => ({ ...f, [id]: { ...filingFor(id), ...patch } }));

  const fileItem = async (item: LifeItem) => {
    const f = filingFor(item.id);
    await update('life_items', item.id, { status: 'open', category: f.category, due_date: f.due || null });
  };

  // The reverse flick: this capture is actually work — send it to Cadence
  // Work's inbox (where its triage ritual takes over) and drop it here.
  const sendToWork = async (item: LifeItem) => {
    await work.insert('work_items', {
      title: item.title,
      notes: item.notes,
      type: 'task',
      inboxed: true,
    } as never);
    await remove('life_items', item.id);
  };

  const completeItem = (item: LifeItem) =>
    update('life_items', item.id, { status: 'done', completed_at: new Date().toISOString() });
  const toggleWaiting = (item: LifeItem) =>
    update('life_items', item.id, { status: item.status === 'waiting' ? 'open' : 'waiting' });
  const reopen = (item: LifeItem) => update('life_items', item.id, { status: 'open', completed_at: null });

  const open = items
    .filter((i) => i.status === 'open' || i.status === 'waiting')
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
  const done = items
    .filter((i) => i.status === 'done')
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
    .slice(0, 40);

  const openByCategory = LIFE_CATEGORIES.map((c) => ({ category: c, rows: open.filter((i) => i.category === c) })).filter(
    (g) => g.rows.length > 0
  );

  return (
    <>
      <ScreenHeader title="Admin" subtitle="Capture it, file it, get it done." onMenu={onMenu} />
      <div className="hub-toolbar">
        <div className="hub-seg-group">
          <button className={`hub-seg ${view === 'inbox' ? 'active' : ''}`} onClick={() => setView('inbox')}>
            Inbox{inbox.length > 0 ? ` (${inbox.length})` : ''}
          </button>
          <button className={`hub-seg ${view === 'open' ? 'active' : ''}`} onClick={() => setView('open')}>
            Open{open.length > 0 ? ` (${open.length})` : ''}
          </button>
          <button className={`hub-seg ${view === 'done' ? 'active' : ''}`} onClick={() => setView('done')}>
            Done
          </button>
        </div>
      </div>
      <div className="screen-content">
        <div className="life-capture">
          <input
            type="text"
            placeholder="Capture a life to-do… (e.g. 'Rebook dentist')"
            aria-label="Capture a life to-do"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addCapture();
            }}
          />
          <button className="btn btn-primary" onClick={() => void addCapture()} disabled={!newTitle.trim()}>
            + Capture
          </button>
        </div>

        {view === 'inbox' &&
          (inbox.length === 0 ? (
            <EmptyState icon="✓" title="Inbox is clear" sub="Captures — and anything flicked over from Work — land here." />
          ) : (
            <Card title="File each capture">
              <div className="life-rows">
                {inbox.map((item) => {
                  const f = filingFor(item.id);
                  return (
                    <div key={item.id} className="life-inbox-row">
                      <div className="life-row-main">
                        <span className="life-row-title">{item.title}</span>
                        {item.notes && <span className="life-row-sub">{item.notes}</span>}
                      </div>
                      <div className="life-inbox-controls">
                        <select
                          aria-label={`Category for ${item.title}`}
                          value={f.category}
                          onChange={(e) => setFilingFor(item.id, { category: e.target.value as LifeCategory })}
                        >
                          {LIFE_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {CATEGORY_LABEL[c]}
                            </option>
                          ))}
                        </select>
                        <input
                          type="date"
                          aria-label={`Due date for ${item.title}`}
                          value={f.due}
                          onChange={(e) => setFilingFor(item.id, { due: e.target.value })}
                        />
                        <button className="btn btn-primary btn-sm" onClick={() => void fileItem(item)}>
                          File
                        </button>
                        <button className="btn btn-secondary btn-sm" title="This is actually work — send it to Cadence Work's inbox" onClick={() => void sendToWork(item)}>
                          → Work
                        </button>
                        <button className="btn btn-danger btn-sm" aria-label={`Bin ${item.title}`} onClick={() => void remove('life_items', item.id)}>
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}

        {view === 'open' &&
          (open.length === 0 ? (
            <EmptyState icon="✓" title="Nothing open" sub="Capture something above, or check the inbox." />
          ) : (
            openByCategory.map(({ category, rows }) => (
              <Card key={category} title={`${CATEGORY_ICON[category]} ${CATEGORY_LABEL[category]}`}>
                <div className="life-rows">
                  {rows.map((item) => (
                    <div key={item.id} className={`life-row ${item.status === 'waiting' ? 'life-row-waiting' : ''}`}>
                      <button
                        className="life-tick"
                        aria-label={`Mark ${item.title} done`}
                        onClick={() => void completeItem(item)}
                      >
                        ✓
                      </button>
                      <div className="life-row-main">
                        <span className="life-row-title">{item.title}</span>
                        {item.notes && <span className="life-row-sub">{item.notes}</span>}
                      </div>
                      {item.due_date && (
                        <span className={`life-due ${item.due_date < today ? 'overdue' : 'due'}`}>
                          {dueLabel(item.due_date, today)}
                        </span>
                      )}
                      <button
                        className={`btn btn-secondary btn-sm ${item.status === 'waiting' ? 'life-waiting-on' : ''}`}
                        title="Waiting on someone else"
                        aria-pressed={item.status === 'waiting'}
                        onClick={() => void toggleWaiting(item)}
                      >
                        ⏳
                      </button>
                      <button className="btn btn-danger btn-sm" aria-label={`Delete ${item.title}`} onClick={() => void remove('life_items', item.id)}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </Card>
            ))
          ))}

        {view === 'done' &&
          (done.length === 0 ? (
            <EmptyState icon="—" title="Nothing done yet" sub="Completed items and obligation history land here." />
          ) : (
            <Card title="Recently done">
              <div className="life-rows">
                {done.map((item) => (
                  <div key={item.id} className="life-row life-row-done">
                    <span className="life-row-icon">{CATEGORY_ICON[item.category]}</span>
                    <div className="life-row-main">
                      <span className="life-row-title">{item.title}</span>
                      <span className="life-row-sub">
                        {item.completed_at ? fmtDay(item.completed_at.slice(0, 10)) : ''}
                        {item.obligation_id ? ' · obligation cycle' : ''}
                      </span>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={() => void reopen(item)}>
                      Reopen
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          ))}
      </div>
    </>
  );
}
