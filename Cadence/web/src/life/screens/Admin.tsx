import { useRef, useState } from 'react';
import { useCadenceLife } from '../lib/store';
import { ScreenHeader, Card, EmptyState } from '../components/bits';
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  LIFE_CATEGORIES,
  type LifeCategory,
  type LifeItem,
} from '../lib/types';
import { dueLabel, fmtDay, todayLocalISO } from '../lib/lifeCalc';

type View = 'inbox' | 'open' | 'waiting' | 'done';

type EditDraft = {
  id: string;
  originalTitle: string;
  title: string;
  notes: string;
  category: LifeCategory;
  due_date: string;
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

// Personal admin to-dos: capture → file (category + optional due) → waiting/done.
export function Admin({ onMenu, initialView = 'open' }: { onMenu: () => void; initialView?: View }) {
  const { data, insert, update, remove, loading, syncError } = useCadenceLife();
  const today = todayLocalISO();

  const items = data.life_items.filter((i) => !i.deleted_at);
  const inbox = items.filter((i) => i.status === 'inbox');
  const openItems = items
    .filter((i) => i.status === 'open' || i.status === 'waiting')
    .sort((a, b) => (a.due_date ?? '9999-99-99').localeCompare(b.due_date ?? '9999-99-99'));
  const waitingItems = openItems.filter((i) => i.status === 'waiting');
  const done = items
    .filter((i) => i.status === 'done')
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
    .slice(0, 40);

  const [view, setView] = useState<View>(initialView === 'open' && inbox.length > 0 ? 'inbox' : initialView);
  const [newTitle, setNewTitle] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [filing, setFiling] = useState<Record<string, { category: LifeCategory; due: string }>>({});
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<LifeCategory | 'all'>('all');
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const captureRef = useRef<{ id: string; title: string; inFlight: boolean } | null>(null);

  const filingFor = (id: string) => filing[id] ?? { category: 'admin' as LifeCategory, due: '' };
  const setFilingFor = (id: string, patch: Partial<{ category: LifeCategory; due: string }>) =>
    setFiling((f) => ({ ...f, [id]: { ...(f[id] ?? { category: 'admin' as LifeCategory, due: '' }), ...patch } }));

  const addCapture = async () => {
    const title = newTitle.trim();
    if (!title) return;
    if (!captureRef.current || captureRef.current.title !== title) {
      captureRef.current = { id: crypto.randomUUID(), title, inFlight: false };
    }
    if (captureRef.current.inFlight) return;
    captureRef.current.inFlight = true;
    const captureId = captureRef.current.id;
    setLocalError(null);
    try {
      await insert('life_items', { id: captureId, title, notes: '', status: 'inbox', category: 'admin', due_date: null, obligation_id: null, completed_at: null });
      setNewTitle((current) => (current.trim() === title ? '' : current));
      captureRef.current = null;
      setView('inbox');
    } catch (error) {
      captureRef.current = { id: captureId, title, inFlight: false };
      setLocalError(errorMessage(error, 'Save failed'));
    }
  };

  const fileItem = async (item: LifeItem) => {
    const f = filingFor(item.id);
    setLocalError(null);
    try {
      await update('life_items', item.id, { status: 'open', category: f.category, due_date: f.due || null });
    } catch (error) {
      setLocalError(errorMessage(error, 'File failed'));
    }
  };

  const completeItem = async (item: LifeItem) => {
    setLocalError(null);
    try {
      await update('life_items', item.id, { status: 'done', completed_at: new Date().toISOString() });
    } catch (error) {
      setLocalError(errorMessage(error, 'Completion failed'));
    }
  };

  const toggleWaiting = async (item: LifeItem) => {
    setLocalError(null);
    try {
      await update('life_items', item.id, { status: item.status === 'waiting' ? 'open' : 'waiting' });
    } catch (error) {
      setLocalError(errorMessage(error, 'Waiting update failed'));
    }
  };

  const reopen = async (item: LifeItem) => {
    if (item.obligation_id) return;
    setLocalError(null);
    try {
      await update('life_items', item.id, { status: 'open', completed_at: null });
    } catch (error) {
      setLocalError(errorMessage(error, 'Reopen failed'));
    }
  };

  const startEdit = (item: LifeItem) => {
    setLocalError(null);
    setEditDraft({
      id: item.id,
      originalTitle: item.title,
      title: item.title,
      notes: item.notes,
      category: item.category,
      due_date: item.due_date ?? '',
    });
  };

  const saveEdit = async () => {
    if (!editDraft) return;
    const title = editDraft.title.trim();
    if (!title) {
      setLocalError('Title is required.');
      return;
    }
    setLocalError(null);
    try {
      await update('life_items', editDraft.id, {
        title,
        notes: editDraft.notes,
        category: editDraft.category,
        due_date: editDraft.due_date || null,
      });
      setEditDraft(null);
    } catch (error) {
      setLocalError(errorMessage(error, 'Save failed'));
    }
  };

  const q = search.trim().toLowerCase();
  const filteredOpen = (view === 'waiting' ? waitingItems : openItems).filter((item) => {
    if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
    if (!q) return true;
    return [item.title, item.notes, CATEGORY_LABEL[item.category], item.status].join(' ').toLowerCase().includes(q);
  });

  const openByCategory = LIFE_CATEGORIES.map((c) => ({ category: c, rows: filteredOpen.filter((i) => i.category === c) })).filter(
    (g) => g.rows.length > 0
  );

  const editForm = (item: LifeItem) =>
    editDraft?.id === item.id ? (
      <div className="life-inline-edit">
        <div className="form-grid">
          <div>
            <label className="field">Title</label>
            <input
              type="text"
              aria-label={`Edit title for ${editDraft.originalTitle}`}
              value={editDraft.title}
              onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
            />
          </div>
          <div>
            <label className="field">Category</label>
            <select
              aria-label={`Edit category for ${editDraft.originalTitle}`}
              value={editDraft.category}
              onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value as LifeCategory })}
            >
              {LIFE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field">Due date</label>
            <input
              type="date"
              aria-label={`Edit due date for ${editDraft.originalTitle}`}
              value={editDraft.due_date}
              onChange={(e) => setEditDraft({ ...editDraft, due_date: e.target.value })}
            />
          </div>
          <div>
            <label className="field">Notes</label>
            <input
              type="text"
              aria-label={`Edit notes for ${editDraft.originalTitle}`}
              value={editDraft.notes}
              onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })}
            />
          </div>
        </div>
        <div className="life-shortcuts">
          <button className="btn btn-primary btn-sm" onClick={() => void saveEdit()} disabled={!editDraft.title.trim()}>
            Save item changes
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setEditDraft(null)}>
            Cancel
          </button>
        </div>
      </div>
    ) : null;

  return (
    <>
      <ScreenHeader title="Admin" subtitle="Capture it, file it, get it done." onMenu={onMenu} />
      <div className="hub-toolbar">
        <div className="hub-seg-group">
          <button className={`hub-seg ${view === 'inbox' ? 'active' : ''}`} onClick={() => setView('inbox')}>
            Inbox{inbox.length > 0 ? ` (${inbox.length})` : ''}
          </button>
          <button className={`hub-seg ${view === 'open' ? 'active' : ''}`} onClick={() => setView('open')}>
            Open{openItems.length > 0 ? ` (${openItems.length})` : ''}
          </button>
          <button className={`hub-seg ${view === 'waiting' ? 'active' : ''}`} onClick={() => setView('waiting')}>
            Waiting{waitingItems.length > 0 ? ` (${waitingItems.length})` : ''}
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

        {(syncError || localError) && <div className="life-error">{syncError || localError}</div>}
        {loading && <div className="life-error">Life data is loading; do not treat an empty list as clear yet.</div>}

        {view === 'inbox' &&
          (inbox.length === 0 ? (
            <EmptyState icon="✓" title="Inbox is clear" sub="Captures — and anything flicked over from Work — land here." />
          ) : (
            <Card title="File each capture">
              <div className="life-row-sub">Work transfer disabled until the server can acknowledge a safe cross-domain move.</div>
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

        {(view === 'open' || view === 'waiting') && (
          <>
            <div className="life-capture">
              <input
                type="search"
                aria-label="Search admin items"
                placeholder="Search admin items…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select aria-label="Filter category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as LifeCategory | 'all')}>
                <option value="all">All categories</option>
                {LIFE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
            {filteredOpen.length === 0 ? (
              <EmptyState icon="✓" title={view === 'waiting' ? 'Nothing waiting' : 'Nothing open'} sub="Capture something above, or check the inbox." />
            ) : (
              openByCategory.map(({ category, rows }) => (
                <Card key={category} title={`${CATEGORY_ICON[category]} ${CATEGORY_LABEL[category]}`}>
                  <div className="life-rows">
                    {rows.map((item) => (
                      <div key={item.id} className={`life-row ${item.status === 'waiting' ? 'life-row-waiting' : ''}`}>
                        <button className="life-tick" aria-label={`Mark ${item.title} done`} onClick={() => void completeItem(item)}>
                          ✓
                        </button>
                        <div className="life-row-main">
                          <span className="life-row-title">{item.title}</span>
                          {item.notes && <span className="life-row-sub">{item.notes}</span>}
                          {editForm(item)}
                        </div>
                        {item.due_date && <span className={`life-due ${item.due_date < today ? 'overdue' : 'due'}`}>{dueLabel(item.due_date, today)}</span>}
                        <button
                          className={`btn btn-secondary btn-sm ${item.status === 'waiting' ? 'life-waiting-on' : ''}`}
                          title="Waiting on someone else"
                          aria-label={`Waiting on ${item.title}`}
                          aria-pressed={item.status === 'waiting'}
                          onClick={() => void toggleWaiting(item)}
                        >
                          ⏳
                        </button>
                        <button className="btn btn-secondary btn-sm" aria-label={`Edit ${item.title}`} onClick={() => startEdit(item)}>
                          ✎
                        </button>
                        <button className="btn btn-danger btn-sm" aria-label={`Delete ${item.title}`} onClick={() => void remove('life_items', item.id)}>
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </Card>
              ))
            )}
          </>
        )}

        {view === 'done' &&
          (done.length === 0 ? (
            <EmptyState icon="—" title="Nothing done yet" sub="Completed items and renewal history land here." />
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
                      </span>
                    </div>
                    {item.obligation_id ? (
                      <span className="life-row-sub">Renewal history</span>
                    ) : (
                      <button className="btn btn-secondary btn-sm" aria-label={`Reopen ${item.title}`} onClick={() => void reopen(item)}>
                        Reopen
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}
      </div>
    </>
  );
}
