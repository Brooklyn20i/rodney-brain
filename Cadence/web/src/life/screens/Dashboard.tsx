import { useState } from 'react';
import { useCadenceLife } from '../lib/store';
import { ScreenHeader, Card, EmptyState } from '../components/bits';
import { CATEGORY_ICON, CATEGORY_LABEL, type LifeItem, type Obligation } from '../lib/types';
import {
  actionVisibleItems,
  dueLabel,
  dueState,
  fmtAmount,
  needsAttention,
  rollForward,
  todayLocalISO,
} from '../lib/lifeCalc';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function Dashboard({ onMenu, onNavigate }: { onMenu: () => void; onNavigate: (id: string) => void }) {
  const { data, insert, update, completeObligation, loading, syncError } = useCadenceLife();
  const today = todayLocalISO();

  const obligations = data.obligations.filter((o) => !o.deleted_at);
  const items = data.life_items.filter((i) => !i.deleted_at);
  const attention = needsAttention(obligations, today);
  const actionItems = actionVisibleItems(items, today, 14);
  const inboxCount = items.filter((i) => i.status === 'inbox').length;
  const openCount = items.filter((i) => i.status === 'open' || i.status === 'waiting').length;

  const [newTitle, setNewTitle] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(() => new Set());

  const runBusy = async (key: string, action: () => Promise<void>) => {
    if (busy.has(key)) return;
    setBusy((b) => new Set(b).add(key));
    setLocalError(null);
    try {
      await action();
    } catch (error) {
      setLocalError(errorMessage(error, 'Life action failed'));
    } finally {
      setBusy((b) => {
        const next = new Set(b);
        next.delete(key);
        return next;
      });
    }
  };

  const addCapture = async () => {
    const title = newTitle.trim();
    if (!title) return;
    await runBusy('capture', async () => {
      await insert('life_items', {
        title,
        notes: '',
        status: 'inbox',
        category: 'admin',
        due_date: null,
        obligation_id: null,
        completed_at: null,
      });
      setNewTitle('');
    });
  };

  const completeRenewal = (ob: Obligation) =>
    runBusy(`ob:${ob.id}:${ob.next_due}`, async () => {
      await completeObligation(ob.id, ob.next_due, today);
    });

  const completeItem = (item: LifeItem) =>
    runBusy(`item:${item.id}:done`, async () => {
      await update('life_items', item.id, { status: 'done', completed_at: new Date().toISOString() });
    });

  const obligationRow = (ob: Obligation) => {
    const state = dueState(ob, today);
    const key = `ob:${ob.id}:${ob.next_due}`;
    const nextDue = rollForward(ob, today);
    return (
      <div key={ob.id} className="life-row">
        <span className="life-row-icon">{CATEGORY_ICON[ob.category]}</span>
        <div className="life-row-main">
          <span className="life-row-title">{ob.name}</span>
          <span className="life-row-sub">
            {CATEGORY_LABEL[ob.category]} · Next due {ob.next_due} · rolls to {nextDue}
            {ob.amount != null ? ` · ${fmtAmount(ob.amount)}` : ''}
          </span>
        </div>
        <span className={`life-due ${state === 'overdue' ? 'overdue' : 'due'}`}>{dueLabel(ob.next_due, today)}</span>
        <button
          className="btn btn-primary btn-sm"
          aria-label={`Complete ${ob.name} renewal`}
          onClick={() => void completeRenewal(ob)}
          disabled={busy.has(key)}
        >
          {busy.has(key) ? 'Completing…' : 'Done ✓'}
        </button>
      </div>
    );
  };

  return (
    <>
      <ScreenHeader title="Life" subtitle="Tax, bills, renewals, travel and admin — everything personal." onMenu={onMenu} />
      <div className="screen-content">
        <div className="life-capture">
          <input
            type="text"
            placeholder="Quick capture a life to-do…"
            aria-label="Quick capture a life to-do"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addCapture();
            }}
          />
          <button className="btn btn-primary" onClick={() => void addCapture()} disabled={!newTitle.trim() || busy.has('capture')}>
            + Capture
          </button>
        </div>

        {(syncError || localError) && <div className="life-error">{syncError || localError}</div>}

        {inboxCount > 0 && (
          <div className="cf-callout">
            <strong>{inboxCount} capture{inboxCount === 1 ? '' : 's'}</strong> waiting to be filed.{' '}
            <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('admin')}>
              Go to inbox →
            </button>
          </div>
        )}

        <Card title="Needs you">
          {loading ? (
            <EmptyState icon="…" title="Life data is loading" sub="Waiting for the Life schema before showing an all-clear." />
          ) : syncError ? (
            <EmptyState icon="!" title="Life data did not load" sub="Fix the load error before treating this as clear." />
          ) : attention.length === 0 && actionItems.length === 0 ? (
            <EmptyState icon="✓" title="Nothing needs you" sub="Every obligation is ahead of its lead window and no open admin item is waiting." />
          ) : (
            <div className="life-rows">
              {attention.map(obligationRow)}
              {actionItems.map((item) => {
                const key = `item:${item.id}:done`;
                return (
                  <div key={item.id} className="life-row">
                    <span className="life-row-icon">{CATEGORY_ICON[item.category]}</span>
                    <div className="life-row-main">
                      <span className="life-row-title">{item.title}</span>
                      <span className="life-row-sub">
                        {CATEGORY_LABEL[item.category]}
                        {item.status === 'waiting' ? ' · waiting' : ''}
                        {!item.due_date ? ' · undated' : ''}
                      </span>
                    </div>
                    {item.due_date ? (
                      <span className={`life-due ${item.due_date < today ? 'overdue' : 'due'}`}>{dueLabel(item.due_date, today)}</span>
                    ) : (
                      <span className="life-due">No date</span>
                    )}
                    <button className="btn btn-primary btn-sm" onClick={() => void completeItem(item)} disabled={busy.has(key)}>
                      Done ✓
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div className="cf-metric-grid">
          <div className="life-stat"><span className="life-stat-value">{openCount}</span><span className="life-stat-label">Open items</span></div>
          <div className="life-stat"><span className="life-stat-value">{obligations.length}</span><span className="life-stat-label">Obligations tracked</span></div>
          <div className="life-stat"><span className="life-stat-value">{attention.length}</span><span className="life-stat-label">Need attention</span></div>
          <div className="life-stat"><span className="life-stat-value">{inboxCount}</span><span className="life-stat-label">In the inbox</span></div>
        </div>

        <Card title="Shortcuts">
          <div className="life-shortcuts">
            <button className="btn btn-secondary" onClick={() => onNavigate('admin')}>✎ Admin & to-dos</button>
            <button className="btn btn-secondary" onClick={() => onNavigate('obligations')}>↺ Obligations & renewals</button>
          </div>
        </Card>
      </div>
    </>
  );
}
