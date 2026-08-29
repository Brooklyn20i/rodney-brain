import { useCadenceLife } from '../lib/store';
import { ScreenHeader, Card, EmptyState } from '../components/bits';
import { CATEGORY_ICON, CATEGORY_LABEL, type LifeItem, type Obligation } from '../lib/types';
import {
  dueLabel,
  dueState,
  fmtAmount,
  itemsDueSoon,
  needsAttention,
  rollForward,
  todayLocalISO,
} from '../lib/lifeCalc';

// The Life home: what needs you, and nothing else. Overdue and inside-lead
// obligations, dated items coming up, and the inbox count — a register that
// surfaces things on time, not a feed to scroll.
export function Dashboard({ onMenu, onNavigate }: { onMenu: () => void; onNavigate: (id: string) => void }) {
  const { data, insert, update } = useCadenceLife();
  const today = todayLocalISO();

  const obligations = data.obligations.filter((o) => !o.deleted_at);
  const items = data.life_items.filter((i) => !i.deleted_at);
  const attention = needsAttention(obligations, today);
  const dueItems = itemsDueSoon(items, today, 14);
  const inboxCount = items.filter((i) => i.status === 'inbox').length;
  const openCount = items.filter((i) => i.status === 'open' || i.status === 'waiting').length;

  // Ticking an obligation rolls next_due forward one (or more, if long
  // overdue) cycles and logs a history item, so the register never needs
  // generated rows and the Done list shows what actually happened.
  const completeObligation = async (ob: Obligation) => {
    await insert('life_items', {
      title: ob.name,
      notes: '',
      status: 'done',
      category: ob.category,
      due_date: ob.next_due,
      obligation_id: ob.id,
      completed_at: new Date().toISOString(),
    });
    await update('obligations', ob.id, { next_due: rollForward(ob, today) });
  };

  const completeItem = (item: LifeItem) =>
    update('life_items', item.id, { status: 'done', completed_at: new Date().toISOString() });

  const obligationRow = (ob: Obligation) => {
    const state = dueState(ob, today);
    return (
      <div key={ob.id} className="life-row">
        <span className="life-row-icon">{CATEGORY_ICON[ob.category]}</span>
        <div className="life-row-main">
          <span className="life-row-title">{ob.name}</span>
          <span className="life-row-sub">
            {CATEGORY_LABEL[ob.category]}
            {ob.amount != null ? ` · ${fmtAmount(ob.amount)}` : ''}
          </span>
        </div>
        <span className={`life-due ${state === 'overdue' ? 'overdue' : 'due'}`}>{dueLabel(ob.next_due, today)}</span>
        <button className="btn btn-primary btn-sm" onClick={() => void completeObligation(ob)}>
          Done ✓
        </button>
      </div>
    );
  };

  return (
    <>
      <ScreenHeader title="Life" subtitle="Tax, bills, renewals, travel and admin — everything personal." onMenu={onMenu} />
      <div className="screen-content">
        {inboxCount > 0 && (
          <div className="cf-callout">
            <strong>{inboxCount} capture{inboxCount === 1 ? '' : 's'}</strong> waiting to be filed.{' '}
            <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('admin')}>
              Go to inbox →
            </button>
          </div>
        )}

        <Card title="Needs you">
          {attention.length === 0 && dueItems.length === 0 ? (
            <EmptyState icon="✓" title="Nothing needs you" sub="Every obligation is ahead of its lead window." />
          ) : (
            <div className="life-rows">
              {attention.map(obligationRow)}
              {dueItems.map((item) => (
                <div key={item.id} className="life-row">
                  <span className="life-row-icon">{CATEGORY_ICON[item.category]}</span>
                  <div className="life-row-main">
                    <span className="life-row-title">{item.title}</span>
                    <span className="life-row-sub">
                      {CATEGORY_LABEL[item.category]}
                      {item.status === 'waiting' ? ' · waiting on someone' : ''}
                    </span>
                  </div>
                  {item.due_date && (
                    <span className={`life-due ${item.due_date < today ? 'overdue' : 'due'}`}>
                      {dueLabel(item.due_date, today)}
                    </span>
                  )}
                  <button className="btn btn-primary btn-sm" onClick={() => void completeItem(item)}>
                    Done ✓
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="cf-metric-grid">
          <div className="life-stat">
            <span className="life-stat-value">{openCount}</span>
            <span className="life-stat-label">Open items</span>
          </div>
          <div className="life-stat">
            <span className="life-stat-value">{obligations.length}</span>
            <span className="life-stat-label">Obligations tracked</span>
          </div>
          <div className="life-stat">
            <span className="life-stat-value">{attention.length}</span>
            <span className="life-stat-label">Need attention</span>
          </div>
          <div className="life-stat">
            <span className="life-stat-value">{inboxCount}</span>
            <span className="life-stat-label">In the inbox</span>
          </div>
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
