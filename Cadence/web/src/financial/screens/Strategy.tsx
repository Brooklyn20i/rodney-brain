// Strategy — the wealth-strategy execution plan, in the Financial domain.
// Layout borrows the app's polished patterns: a hero card for the current
// month's buy orders, per-section progress, and Horizon-style time buckets
// (overdue / this month / next 3 months / later) instead of raw checklists.
// Automated review dates are shown as schedule rows, not tasks.
import { useState } from 'react';
import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card, Metric } from '../components/bits';
import type { StrategyItem, StrategySection } from '../lib/types';

const todayISO = () => new Date().toISOString().slice(0, 10);
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const SECTION_META: Record<StrategySection, { label: string; color: string }> = {
  now: { label: 'Action', color: 'var(--accent)' },
  tranche: { label: 'Trust order', color: 'var(--purple)' },
  monthly: { label: 'Monthly buys', color: 'var(--blue)' },
  calendar: { label: 'Key date', color: 'var(--teal)' },
};

// Long details are stored " | "-separated; render them as lines, not a blob.
const detailLines = (detail: string): string[] =>
  detail.split(' | ').map((l) => l.trim()).filter(Boolean);

const isAutomated = (i: StrategyItem) =>
  i.section === 'calendar' && (i.title.toLowerCase().includes('automated') || i.detail.toLowerCase().includes('fires itself'));

function fmtDue(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return `${day} ${MONTH_NAMES[m - 1].slice(0, 3)} ${String(y).slice(2)}`;
}

export function Strategy({ onMenu }: { onMenu: () => void }) {
  const { data, insert, update } = useCadenceFinancial();
  const items = (data.strategy_items ?? []).filter((i) => !i.deleted_at);
  const [showDone, setShowDone] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showAllMonths, setShowAllMonths] = useState(false);
  const [draft, setDraft] = useState({ section: 'now' as StrategySection, title: '', detail: '', due: '' });

  const today = todayISO();
  const ym = today.slice(0, 7);
  const monthName = MONTH_NAMES[Number(ym.slice(5, 7)) - 1];

  const open = items.filter((i) => !i.done);
  const doneCount = items.length - open.length;
  const overdue = open.filter((i) => i.due_date && i.due_date < today && !isAutomated(i));

  const toggle = async (i: StrategyItem) => {
    await update('strategy_items', i.id, i.done
      ? { done: false, done_at: null }
      : { done: true, done_at: new Date().toISOString() });
  };

  // ── this month's buy order (the hero) ──────────────────────────────────
  const thisMonthBuy = items.find((i) => i.section === 'monthly' && i.due_date?.startsWith(ym));
  const futureBuys = items
    .filter((i) => i.section === 'monthly' && i.due_date && i.due_date.slice(0, 7) > ym)
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1));
  const monthlyDone = items.filter((i) => i.section === 'monthly' && i.done).length;
  const monthlyTotal = items.filter((i) => i.section === 'monthly').length;

  // ── time buckets for everything except monthly + automated ─────────────
  const bucketable = items.filter((i) =>
    i.section !== 'monthly' && !isAutomated(i) && (showDone || !i.done));
  const in3Months = (() => {
    const d = new Date(today + 'T00:00:00');
    d.setMonth(d.getMonth() + 3);
    return d.toISOString().slice(0, 10);
  })();
  const buckets: { key: string; label: string; rows: StrategyItem[]; overdue?: boolean }[] = [
    { key: 'overdue', label: 'Overdue', overdue: true,
      rows: bucketable.filter((i) => !i.done && i.due_date && i.due_date < today) },
    { key: 'month', label: `This month — ${monthName}`,
      rows: bucketable.filter((i) => !i.done && i.due_date && i.due_date >= today && i.due_date.slice(0, 7) === ym) },
    { key: 'quarter', label: 'Next 3 months',
      rows: bucketable.filter((i) => !i.done && i.due_date && i.due_date.slice(0, 7) > ym && i.due_date <= in3Months) },
    { key: 'later', label: 'Later',
      rows: bucketable.filter((i) => !i.done && (!i.due_date || i.due_date > in3Months)) },
    ...(showDone ? [{ key: 'done', label: 'Done',
      rows: items.filter((i) => i.done && i.section !== 'monthly' && !isAutomated(i)) }] : []),
  ];
  const autoRows = items.filter(isAutomated).sort((a, b) => ((a.due_date ?? '') < (b.due_date ?? '') ? -1 : 1));
  const nextAuto = autoRows.find((r) => r.due_date && r.due_date >= today);

  const sectionProgress = (['now', 'tranche', 'monthly'] as StrategySection[]).map((s) => {
    const all = items.filter((i) => i.section === s && !isAutomated(i));
    return { s, done: all.filter((i) => i.done).length, total: all.length };
  }).filter((p) => p.total > 0);

  const addItem = async () => {
    if (!draft.title.trim()) return;
    await insert('strategy_items', {
      section: draft.section, title: draft.title.trim(), detail: draft.detail.trim(),
      due_date: draft.due || null, done: false, done_at: null,
    });
    setDraft({ section: 'now', title: '', detail: '', due: '' });
    setAdding(false);
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '7px 9px', fontSize: 13,
    border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)' };

  const renderRow = (i: StrategyItem) => {
    const meta = SECTION_META[i.section];
    const late = !i.done && i.due_date && i.due_date < today;
    const isOpen = expandedId === i.id;
    const lines = detailLines(i.detail);
    return (
      <div key={i.id}>
        <div className="horizon-row" style={{ alignItems: 'center' }} onClick={() => setExpandedId(isOpen ? null : i.id)}>
          <input type="checkbox" checked={i.done} onClick={(e) => e.stopPropagation()} onChange={() => toggle(i)}
            style={{ width: 18, height: 18, accentColor: 'var(--accent)', flexShrink: 0, cursor: 'pointer' }} />
          <span className="horizon-dot" style={{ background: late ? 'var(--red)' : meta.color }} />
          <div className="horizon-row-main">
            <div className="horizon-row-title" style={{ textDecoration: i.done ? 'line-through' : 'none',
              color: i.done ? 'var(--text3)' : 'var(--text)' }}>{i.title}</div>
            {!isOpen && lines[0] && <div className="horizon-row-sub">{lines[0]}</div>}
          </div>
          <span className={`horizon-date${late ? ' red' : ''}`}>{i.due_date ? fmtDue(i.due_date) : ''}</span>
        </div>
        {isOpen && (
          <div style={{ margin: '4px 0 8px 36px', padding: '10px 14px', background: 'var(--surface2)',
            borderRadius: 9, fontSize: 13, color: 'var(--text)', display: 'grid', gap: 6 }}>
            <span className="tag" style={{ background: 'var(--surface)', color: meta.color, justifySelf: 'start' }}>{meta.label}</span>
            {lines.map((l, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8 }}>
                <span style={{ color: meta.color, flexShrink: 0 }}>•</span>
                <span>{l}</span>
              </div>
            ))}
            {i.done && i.done_at && (
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>Completed {i.done_at.slice(0, 10)}</div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <ScreenHeader title="Strategy" subtitle="The execution plan. Reviews run themselves — your moves are below." onMenu={onMenu}>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowDone((s) => !s)}>
          {showDone ? 'Hide done' : 'Show done'}
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => setAdding((s) => !s)}>
          {adding ? 'Close' : '+ Add'}
        </button>
      </ScreenHeader>

      <div className="screen-content">
        <div className="cf-metric-grid">
          <Metric label="Open" value={String(open.length)} />
          <Metric label="Overdue" value={String(overdue.length)} tone={overdue.length ? 'bad' : 'good'} />
          <Metric label="Done" value={String(doneCount)} tone="good" />
          <Metric label="Next review (auto)" value={nextAuto?.due_date ? fmtDue(nextAuto.due_date) : '—'} />
        </div>

        {adding && (
          <Card title="Add an item">
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 150px', gap: 8 }}>
                <select style={inputStyle} value={draft.section}
                  onChange={(e) => setDraft((d) => ({ ...d, section: e.target.value as StrategySection }))}>
                  <option value="now">Action</option>
                  <option value="tranche">Trust order</option>
                  <option value="monthly">Monthly buys</option>
                  <option value="calendar">Key date</option>
                </select>
                <input style={inputStyle} placeholder="Title" value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
                <input type="date" style={inputStyle} value={draft.due}
                  onChange={(e) => setDraft((d) => ({ ...d, due: e.target.value }))} />
              </div>
              <textarea style={{ ...inputStyle, minHeight: 44, resize: 'vertical' }} placeholder="Detail (optional — use ' | ' to separate lines)"
                value={draft.detail} onChange={(e) => setDraft((d) => ({ ...d, detail: e.target.value }))} />
              <div><button className="btn btn-primary btn-sm" onClick={addItem}>Add</button></div>
            </div>
          </Card>
        )}

        {/* This month's buys — the hero */}
        {thisMonthBuy && (
          <Card>
            <div className="cf-card-head">
              <div className="cf-card-title">{monthName} buys — $25,000</div>
              {thisMonthBuy.done
                ? <span className="tag tag-action">Placed ✓</span>
                : <span className="tag tag-followUp">Due {thisMonthBuy.due_date ? fmtDue(thisMonthBuy.due_date) : ''}</span>}
            </div>
            <div style={{ display: 'grid', gap: 7, marginBottom: 12 }}>
              {detailLines(thisMonthBuy.detail).map((l, idx) => {
                const warn = /do not|stays armed/i.test(l);
                return (
                  <div key={idx} style={{ display: 'flex', gap: 9, alignItems: 'baseline', fontSize: 13.5,
                    color: warn ? 'var(--text2)' : 'var(--text)' }}>
                    <span style={{ color: warn ? 'var(--orange)' : 'var(--accent)', flexShrink: 0, fontSize: 11 }}>{warn ? '⚠' : '●'}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{l}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <button className={`btn btn-sm ${thisMonthBuy.done ? 'btn-secondary' : 'btn-primary'}`} onClick={() => toggle(thisMonthBuy)}>
                {thisMonthBuy.done ? 'Undo — not placed yet' : `Mark ${monthName} orders placed ✓`}
              </button>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>
                  <span>Months completed</span><span>{monthlyDone}/{monthlyTotal}</span>
                </div>
                <div className="progress-bar"><div className="progress-bar-fill" style={{ width: `${monthlyTotal ? (monthlyDone / monthlyTotal) * 100 : 0}%` }} /></div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAllMonths((s) => !s)}>
                {showAllMonths ? 'Hide months' : `All months (${futureBuys.length} ahead)`}
              </button>
            </div>
            {showAllMonths && (
              <div className="horizon-bucket-body" style={{ marginTop: 12 }}>
                {futureBuys.map(renderRow)}
              </div>
            )}
          </Card>
        )}

        {/* time buckets */}
        {buckets.map(({ key, label, rows, overdue: isOver }) => rows.length > 0 && (
          <div key={key} className={`horizon-bucket${isOver ? ' overdue' : ''}`}>
            <div className="horizon-bucket-hdr">
              <span className="horizon-bucket-label">{label}</span>
              <span className="horizon-bucket-count">{rows.length}</span>
            </div>
            <div className="horizon-bucket-body">
              {rows.slice().sort((a, b) => ((a.due_date ?? '9999') < (b.due_date ?? '9999') ? -1 : 1)).map(renderRow)}
            </div>
          </div>
        ))}

        {/* automated schedule + progress */}
        <Card>
          <div className="cf-card-title">The machine — runs itself</div>
          <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
            {autoRows.map((r) => (
              <div key={r.id} className="horizon-row" style={{ cursor: 'default' }}>
                <span style={{ fontSize: 13, flexShrink: 0 }}>⚡</span>
                <div className="horizon-row-main">
                  <div className="horizon-row-title">{r.title.replace(/ — automated.*$/i, '').replace(/ \(gpt.*\)$/i, '')}</div>
                  <div className="horizon-row-sub">{detailLines(r.detail)[0]}</div>
                </div>
                <span className="horizon-date">{r.due_date ? fmtDue(r.due_date) : ''}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {sectionProgress.map(({ s, done, total }) => (
              <div key={s}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>
                  <span>{SECTION_META[s].label}{s === 'now' ? 's' : s === 'tranche' ? 's' : ''}</span><span>{done}/{total}</span>
                </div>
                <div className="progress-bar"><div className="progress-bar-fill" style={{ width: `${(done / total) * 100}%`, background: SECTION_META[s].color }} /></div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text2)', margin: '12px 0 0' }}>
            Panels, quarterly checks, the red-team and the daily price watchdog fire automatically and
            deliver to Telegram — the ⚡ rows are their schedule, not your tasks. Theses live under each
            investment and property; the correlation audit and price signals are on Conviction.
          </p>
        </Card>
      </div>
    </>
  );
}
