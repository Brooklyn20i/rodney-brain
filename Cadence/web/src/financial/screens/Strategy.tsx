// Strategy — the wealth-strategy execution plan, living in the Financial
// domain where it belongs (not in Cadence Work). Four sections: one-off
// actions, trust deployment tranches, the monthly buy list, and the
// review/diary calendar. The automated wealth reviews read and update the
// same rows, so ticking here is the single source of execution truth.
import { useState } from 'react';
import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card, Metric } from '../components/bits';
import type { StrategyItem, StrategySection } from '../lib/types';

const todayISO = () => new Date().toISOString().slice(0, 10);

const SECTIONS: { key: StrategySection; title: string; blurb: string }[] = [
  { key: 'now', title: 'Actions', blurb: 'One-off moves the strategy needs — do once, tick once.' },
  { key: 'tranche', title: 'Trust deployment', blurb: 'Staged orders for the Brooklyn 20 cash — sister places these.' },
  { key: 'monthly', title: 'Monthly buys', blurb: 'The standing order list. Tick each month once the orders are placed.' },
  { key: 'calendar', title: 'Reviews & key dates', blurb: 'Panel dates fire automatically; diary dates are yours.' },
];

export function Strategy({ onMenu }: { onMenu: () => void }) {
  const { data, insert, update } = useCadenceFinancial();
  const items = (data.strategy_items ?? []).filter((i) => !i.deleted_at);
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState<StrategySection | null>(null);
  const [draft, setDraft] = useState({ title: '', detail: '', due: '' });

  const open = items.filter((i) => !i.done);
  const overdue = open.filter((i) => i.due_date && i.due_date < todayISO());
  const nextUp = open
    .filter((i) => i.due_date)
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))[0];

  const toggle = async (i: StrategyItem) => {
    await update('strategy_items', i.id, i.done
      ? { done: false, done_at: null }
      : { done: true, done_at: new Date().toISOString() });
  };

  const addItem = async (section: StrategySection) => {
    if (!draft.title.trim()) return;
    await insert('strategy_items', {
      section, title: draft.title.trim(), detail: draft.detail.trim(),
      due_date: draft.due || null, done: false, done_at: null,
    });
    setDraft({ title: '', detail: '', due: '' });
    setAdding(null);
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '6px 8px', fontSize: 13, marginTop: 4,
    border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)' };

  return (
    <>
      <ScreenHeader title="Strategy" subtitle="The execution plan — actions, orders and dates. Reviews run automatically." onMenu={onMenu}>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowDone((s) => !s)}>
          {showDone ? 'Hide done' : 'Show done'}
        </button>
      </ScreenHeader>

      <div className="screen-content">
        <div className="cf-metric-grid" style={{ marginBottom: 12 }}>
          <Metric label="Open items" value={String(open.length)} />
          <Metric label="Overdue" value={String(overdue.length)} tone={overdue.length ? 'bad' : 'good'} />
          <Metric label="Next due" value={nextUp?.due_date ?? '—'} delta={nextUp?.title.slice(0, 34)} tone="neutral" />
          <Metric label="Completed" value={String(items.filter((i) => i.done).length)} tone="good" />
        </div>

        {SECTIONS.map(({ key, title, blurb }) => {
          const rows = items
            .filter((i) => i.section === key && (showDone || !i.done))
            .sort((a, b) => {
              if (a.done !== b.done) return a.done ? 1 : -1;
              return (a.due_date ?? '9999') < (b.due_date ?? '9999') ? -1 : 1;
            });
          const openCount = items.filter((i) => i.section === key && !i.done).length;
          return (
            <Card key={key} title={`${title} (${openCount} open)`}>
              <p style={{ fontSize: 12.5, color: 'var(--text2)', margin: '0 0 10px' }}>{blurb}</p>
              <div style={{ display: 'grid', gap: 6 }}>
                {rows.length === 0 && (
                  <p style={{ fontSize: 13, color: 'var(--text3)', margin: 0 }}>
                    {openCount === 0 ? 'All done here.' : 'Nothing to show.'}
                  </p>
                )}
                {rows.map((i) => {
                  const late = !i.done && i.due_date && i.due_date < todayISO();
                  return (
                    <div key={i.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start',
                      padding: '8px 10px', background: 'var(--surface2)', borderRadius: 8,
                      opacity: i.done ? 0.55 : 1 }}>
                      <input type="checkbox" checked={i.done} onChange={() => toggle(i)}
                        style={{ marginTop: 3, width: 16, height: 16, cursor: 'pointer' }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500,
                          textDecoration: i.done ? 'line-through' : 'none' }}>{i.title}</div>
                        {i.detail && (
                          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, whiteSpace: 'pre-wrap' }}>{i.detail}</div>
                        )}
                      </div>
                      {i.due_date && (
                        <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                          color: late ? 'var(--red)' : 'var(--text3)', fontWeight: late ? 600 : 400 }}>
                          {i.due_date}
                        </span>
                      )}
                    </div>
                  );
                })}
                {adding === key ? (
                  <div style={{ display: 'grid', gap: 8, padding: '10px 12px', border: '1px dashed var(--border)', borderRadius: 8 }}>
                    <input style={{ ...inputStyle, marginTop: 0 }} placeholder="Title" value={draft.title}
                      onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
                    <textarea style={{ ...inputStyle, marginTop: 0, minHeight: 44, resize: 'vertical' }} placeholder="Detail (optional)"
                      value={draft.detail} onChange={(e) => setDraft((d) => ({ ...d, detail: e.target.value }))} />
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="date" style={{ ...inputStyle, marginTop: 0, width: 160 }} value={draft.due}
                        onChange={(e) => setDraft((d) => ({ ...d, due: e.target.value }))} />
                      <button className="btn btn-primary btn-sm" onClick={() => addItem(key)}>Add</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setAdding(null); setDraft({ title: '', detail: '', due: '' }); }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button className="btn btn-secondary btn-sm" style={{ justifySelf: 'start' }} onClick={() => setAdding(key)}>
                    + Add item
                  </button>
                )}
              </div>
            </Card>
          );
        })}

        <p style={{ fontSize: 12, color: 'var(--text2)' }}>
          The Motley Crew reviews run themselves (panels 10 Jan &amp; 10 Jul, checks 15 Apr &amp; 15 Oct,
          daily price-trigger watchdog) and deliver to Telegram — calendar rows here are reminders,
          not triggers. Per-asset theses live under each investment and property; the correlation
          audit and price signals are on the Conviction screen.
        </p>
      </div>
    </>
  );
}
