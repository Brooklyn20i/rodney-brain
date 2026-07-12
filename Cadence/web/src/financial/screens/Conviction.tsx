// Conviction — the PORTFOLIO-level view of investment theses: correlation
// audit, reviews due, and price signals. The per-asset dossiers themselves
// live where the assets live — under each holding on the Investments screen
// and on each property's detail page — via the shared ThesisDossier component.
import { useCallback, useEffect, useState } from 'react';
import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card, Metric } from '../components/bits';
import { formatMoney } from '../lib/util';
import { fetchLiveQuotes, yahooSymbol, type QuoteMap } from '../lib/livePrices';
import {
  Chip, CONVICTION_TONE, STATUS_TONE, ThesisDossier, ThesisFieldEditor,
  blankThesisDraft, fmtPrice, priceSignal, rollReview, todayISO, addMonths,
  type ThesisDraft,
} from '../components/ThesisDossier';
import type { InvestmentThesis, ThesisTargetKind } from '../lib/types';

const DEMO = import.meta.env.VITE_DEMO === '1';

export function Conviction({ onMenu }: { onMenu: () => void }) {
  const { data, insert, update } = useCadenceFinancial();
  const theses = data.investment_theses ?? [];
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<ThesisDraft>(blankThesisDraft());
  const [quotes, setQuotes] = useState<QuoteMap>({});
  const [quotesState, setQuotesState] = useState<'idle' | 'loading' | 'error'>('idle');

  const refreshQuotes = useCallback(async () => {
    const holdings = data.investment_holdings.filter((h) =>
      (data.investment_theses ?? []).some((t) => t.target_kind === 'holding' && t.target_id === h.id && !t.deleted_at));
    const symbols = [...new Set(holdings.map((h) => yahooSymbol(h)))];
    if (!symbols.length) return;
    setQuotesState('loading');
    try {
      setQuotes(await fetchLiveQuotes(symbols, DEMO));
      setQuotesState('idle');
    } catch {
      setQuotesState('error');
    }
  }, [data.investment_holdings, data.investment_theses]);

  useEffect(() => { refreshQuotes(); }, [refreshQuotes]);

  const fxRow = data.budget_fx_rates?.find((f) => (f as any).currency?.toUpperCase?.() === 'USD');
  const usdAudRaw = fxRow ? Number((fxRow as any).rate_to_aud) : NaN;
  const usdAud = usdAudRaw && usdAudRaw > 0 ? usdAudRaw : 1.53;

  const holdingOf = (t: InvestmentThesis) =>
    t.target_kind === 'holding' ? data.investment_holdings.find((x) => x.id === t.target_id) : undefined;

  const currentPrice = (t: InvestmentThesis): number | null => {
    if (t.target_kind === 'property') {
      const p = data.properties.find((x) => x.id === t.target_id);
      return p ? p.value : null;
    }
    const h = holdingOf(t);
    if (!h) return null;
    const q = quotes[yahooSymbol(h)];
    if (q) return q.price;
    return h.units > 0 ? h.native_value / h.units : null;
  };

  const valueOf = (t: InvestmentThesis): number => {
    if (t.target_kind === 'property') {
      const p = data.properties.find((x) => x.id === t.target_id);
      return p ? p.value : 0;
    }
    if (t.target_kind === 'holding') {
      const h = holdingOf(t);
      if (!h) return 0;
      return h.currency?.toUpperCase() === 'USD' ? h.native_value * usdAud : h.native_value;
    }
    if (t.target_kind === 'bucket') {
      const b = data.liquidity_buckets.find((x) => x.id === t.target_id);
      return b ? b.amount : 0;
    }
    return 0;
  };

  const active = theses.filter((t) => !t.deleted_at);
  const investable = active.filter((t) => !t.is_structural);
  const due = active.filter((t) => !t.is_structural && (!t.next_review_date || t.next_review_date <= todayISO()));
  const signals = investable
    .map((t) => ({ t, sig: priceSignal(t, currentPrice(t)) }))
    .filter((x): x is { t: InvestmentThesis; sig: NonNullable<ReturnType<typeof priceSignal>> } => x.sig != null);

  const driverMap = new Map<string, number>();
  for (const t of investable) {
    const d = t.driver.trim() || 'Untagged';
    driverMap.set(d, (driverMap.get(d) ?? 0) + valueOf(t));
  }
  const driverRows = [...driverMap.entries()].map(([driver, value]) => ({ driver, value })).sort((a, b) => b.value - a.value);
  const driverTotal = driverRows.reduce((s, r) => s + r.value, 0);

  const assetCount = data.properties.length + data.investment_holdings.length
    + data.liquidity_buckets.filter((b) => b.amount > 0).length;
  const covered = new Set(active.filter((t) => t.target_id).map((t) => t.target_id)).size;

  const thesisTargetIds = new Set(active.map((t) => t.target_id));
  const openTargets = [
    ...data.properties.filter((p) => !thesisTargetIds.has(p.id)).map((p) => ({ kind: 'property' as ThesisTargetKind, id: p.id, label: p.address })),
    ...data.investment_holdings.filter((h) => !thesisTargetIds.has(h.id)).map((h) => ({ kind: 'holding' as ThesisTargetKind, id: h.id, label: `${h.ticker} · ${h.market}` })),
    ...data.liquidity_buckets.filter((b) => b.amount > 0 && !thesisTargetIds.has(b.id)).map((b) => ({ kind: 'bucket' as ThesisTargetKind, id: b.id, label: b.label })),
  ];

  const saveNew = async () => {
    if (!draft.target_label.trim()) return;
    const freq = draft.review_frequency_months || 3;
    await insert('investment_theses', { ...draft, last_reviewed: todayISO(), next_review_date: addMonths(todayISO(), freq) });
    setDraft(blankThesisDraft());
    setAdding(false);
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '6px 8px', fontSize: 13, marginTop: 4,
    border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)' };
  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.3 };

  return (
    <>
      <ScreenHeader title="Conviction" subtitle="Portfolio intelligence — dossiers live under each investment and property." onMenu={onMenu}>
        <button className="btn btn-secondary btn-sm" onClick={refreshQuotes} disabled={quotesState === 'loading'}>
          {quotesState === 'loading' ? 'Fetching…' : '↻ Live prices'}
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => setAdding((s) => !s)}>
          {adding ? 'Close' : '+ Thesis'}
        </button>
      </ScreenHeader>

      <div className="screen-content">
        <div className="cf-metric-grid" style={{ marginBottom: 12 }}>
          <Metric label="Theses" value={String(active.length)} />
          <Metric label="Coverage" value={`${covered}/${assetCount}`} delta="assets with a thesis" tone="neutral" />
          <Metric label="Reviews due" value={String(due.length)} tone={due.length ? 'bad' : 'good'} />
          <Metric label="Price signals" value={String(signals.length)} tone={signals.length ? 'bad' : 'good'} />
        </div>

        {signals.length > 0 && (
          <Card title="Price signals — a level you set has been crossed">
            <div style={{ display: 'grid', gap: 8 }}>
              {signals.map(({ t, sig }) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between',
                  padding: '8px 10px', background: 'var(--surface2)', borderRadius: 8 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{t.target_label}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>
                      now {fmtPrice(currentPrice(t), t.price_currency)}
                    </span>
                    <Chip bg={sig.bg} fg={sig.fg}>{sig.label}</Chip>
                    <button className="btn btn-secondary btn-sm" onClick={() => setExpanded(expanded === t.id ? null : t.id)}>Open</button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {adding && (
          <Card title="New thesis">
            <div style={{ display: 'grid', gap: 10 }}>
              <label><span style={labelStyle}>Asset</span>
                <select style={inputStyle} value={draft.target_id ?? (draft.target_kind === 'sleeve' ? 'sleeve' : '')}
                  onChange={(e) => {
                    if (e.target.value === 'sleeve') { setDraft((d) => ({ ...d, target_kind: 'sleeve', target_id: null, target_label: '' })); return; }
                    const t = openTargets.find((o) => o.id === e.target.value);
                    if (t) setDraft((d) => ({ ...d, target_kind: t.kind, target_id: t.id, target_label: t.label }));
                  }}>
                  <option value="">Select an asset…</option>
                  {openTargets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  <option value="sleeve">— Whole sleeve (custom) —</option>
                </select>
              </label>
              {draft.target_kind === 'sleeve' && (
                <label><span style={labelStyle}>Sleeve name</span>
                  <input style={inputStyle} value={draft.target_label} onChange={(e) => setDraft((d) => ({ ...d, target_label: e.target.value }))} placeholder="e.g. Energy & uranium satellite" />
                </label>
              )}
              <ThesisFieldEditor d={draft} set={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={saveNew}>Save thesis</button>
                <button className="btn btn-secondary btn-sm" onClick={() => { setAdding(false); setDraft(blankThesisDraft()); }}>Cancel</button>
              </div>
            </div>
          </Card>
        )}

        <Card title="Correlation audit — value by return driver">
          <p style={{ fontSize: 12.5, color: 'var(--text2)', margin: '0 0 12px' }}>
            The real diversification test: if one driver dominates, the “diversified” book is one bet. Approx AUD, thesis-covered assets only.
          </p>
          {driverRows.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text3)' }}>No theses yet — add one to populate the audit.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {driverRows.map((r) => {
                const pct = driverTotal ? (r.value / driverTotal) * 100 : 0;
                const hot = pct >= 40;
                return (
                  <div key={r.driver}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                      <span style={{ fontWeight: 500 }}>{r.driver}</span>
                      <span style={{ color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(r.value, true)} · {pct.toFixed(0)}%</span>
                    </div>
                    <div style={{ height: 8, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(2, pct)}%`, height: '100%', background: hot ? 'var(--red)' : 'var(--accent)' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {due.length > 0 && (
          <Card title={`Reviews due (${due.length})`}>
            <div style={{ display: 'grid', gap: 8 }}>
              {due.map((t) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between',
                  padding: '8px 10px', background: 'var(--surface2)', borderRadius: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.target_label}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text2)' }}>
                      {t.next_review_date ? `due ${t.next_review_date}` : 'never reviewed'} · every {t.review_frequency_months}mo
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Chip bg={CONVICTION_TONE[t.conviction].bg} fg={CONVICTION_TONE[t.conviction].fg}>{CONVICTION_TONE[t.conviction].label}</Chip>
                    <button className="btn btn-secondary btn-sm" onClick={() => setExpanded(expanded === t.id ? null : t.id)}>Open</button>
                    <button className="btn btn-primary btn-sm" onClick={() => rollReview(t, update, insert)}>Mark reviewed</button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card title="All theses">
          {active.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text3)' }}>No theses yet. Add one per asset — start with the biggest positions.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {active.slice().sort((a, b) => valueOf(b) - valueOf(a)).map((t) => {
                const isOpen = expanded === t.id;
                const overdue = !t.is_structural && (!t.next_review_date || t.next_review_date <= todayISO());
                const cur = currentPrice(t);
                const sig = t.is_structural ? null : priceSignal(t, cur);
                const pl = t.entry_price != null && cur != null && t.entry_price > 0 ? (cur / t.entry_price - 1) * 100 : null;
                return (
                  <div key={t.id} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: 'pointer', flexWrap: 'wrap' }}
                      onClick={() => setExpanded(isOpen ? null : t.id)}>
                      <span style={{ fontWeight: 500, fontSize: 13.5, flex: 1, minWidth: 120 }}>{t.target_label}</span>
                      {pl != null && (
                        <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                          color: pl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {pl >= 0 ? '+' : ''}{pl.toFixed(0)}%
                        </span>
                      )}
                      {sig && <Chip bg={sig.bg} fg={sig.fg}>{sig.label}</Chip>}
                      {t.driver && <Chip bg="var(--surface2)" fg="var(--text2)">{t.driver}</Chip>}
                      {t.is_structural
                        ? <Chip bg="var(--surface2)" fg="var(--text3)">Structural</Chip>
                        : <Chip bg={CONVICTION_TONE[t.conviction].bg} fg={CONVICTION_TONE[t.conviction].fg}>{CONVICTION_TONE[t.conviction].label}</Chip>}
                      {!t.is_structural && t.status !== 'intact' && (
                        <Chip bg={STATUS_TONE[t.status].bg} fg={STATUS_TONE[t.status].fg}>{STATUS_TONE[t.status].label}</Chip>
                      )}
                      <span style={{ fontSize: 12, color: overdue ? 'var(--red)' : 'var(--text3)', fontVariantNumeric: 'tabular-nums', minWidth: 74, textAlign: 'right' }}>
                        {t.is_structural ? '—' : (t.next_review_date ?? 'set date')}
                      </span>
                    </div>
                    {isOpen && (
                      <div style={{ padding: '12px', borderTop: '1px solid var(--border)' }}>
                        <ThesisDossier thesisId={t.id} targetKind={t.target_kind} targetId={t.target_id}
                          targetLabel={t.target_label} currentPrice={cur} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
