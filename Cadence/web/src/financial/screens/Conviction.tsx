import { useCallback, useEffect, useState } from 'react';
import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card, Metric } from '../components/bits';
import { formatMoney } from '../lib/util';
import { fetchLiveQuotes, yahooSymbol, type QuoteMap } from '../lib/livePrices';
import type {
  Conviction as ConvictionRating, InvestmentThesis, ThesisNoteKind,
  ThesisStatus, ThesisTargetKind,
} from '../lib/types';

// ── helpers ────────────────────────────────────────────────────────────────
const DEMO = import.meta.env.VITE_DEMO === '1';
const todayISO = () => new Date().toISOString().slice(0, 10);
function addMonths(iso: string, months: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
const num = (s: string) => Number(s.replace(/[^0-9.-]/g, '')) || 0;
const numOrNull = (s: string): number | null => {
  const v = Number(s.replace(/[^0-9.-]/g, ''));
  return s.trim() === '' || !isFinite(v) ? null : v;
};
// Price formatter: sensible decimals for anything from $0.50 to $180,000.
function fmtPrice(v: number | null | undefined, ccy?: string): string {
  if (v == null || !isFinite(v)) return '—';
  const dp = v >= 1000 ? 0 : v >= 10 ? 2 : 4;
  return `${ccy ? ccy + ' ' : ''}${v.toLocaleString(undefined, { maximumFractionDigits: dp })}`;
}

const CONVICTION_TONE: Record<ConvictionRating, { bg: string; fg: string; label: string }> = {
  core: { bg: 'var(--green-bg)', fg: 'var(--green)', label: 'Core' },
  hold: { bg: 'var(--blue-bg)', fg: 'var(--blue)', label: 'Hold' },
  trim: { bg: 'var(--orange-bg)', fg: 'var(--orange)', label: 'Trim' },
  exit: { bg: 'var(--red-bg)', fg: 'var(--red)', label: 'Exit' },
};
const STATUS_TONE: Record<ThesisStatus, { bg: string; fg: string; label: string }> = {
  intact: { bg: 'var(--green-bg)', fg: 'var(--green)', label: 'Intact' },
  watch: { bg: 'var(--orange-bg)', fg: 'var(--orange)', label: 'Watch' },
  broken: { bg: 'var(--red-bg)', fg: 'var(--red)', label: 'Broken' },
};
const NOTE_KIND_TONE: Record<ThesisNoteKind, { bg: string; fg: string; label: string }> = {
  note: { bg: 'var(--surface2)', fg: 'var(--text2)', label: 'Note' },
  review: { bg: 'var(--blue-bg)', fg: 'var(--blue)', label: 'Review' },
  article: { bg: 'var(--purple-bg)', fg: 'var(--purple)', label: 'Article' },
  decision: { bg: 'var(--teal-bg)', fg: 'var(--teal)', label: 'Decision' },
};

function Chip({ bg, fg, children }: { bg: string; fg: string; children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 12,
      fontSize: 11, fontWeight: 600, background: bg, color: fg, whiteSpace: 'nowrap' }}>{children}</span>
  );
}

const DRIVER_PRESETS = [
  'AI / energy buildout', 'AU property', 'Inflation hedge / gold', 'Protected liquidity',
  'Crypto / digital gold', 'Global equity beta', 'Active alpha (global)', 'Family commitment',
];

type Draft = Omit<InvestmentThesis, 'id' | 'owner_id' | 'created_at' | 'updated_at' | 'deleted_at'>;

const blankDraft = (): Draft => ({
  target_kind: 'holding', target_id: null, target_label: '', driver: '', role: '',
  thesis: '', kill_criteria: '', conviction: 'hold', status: 'intact', conviction_score: null,
  is_structural: false, review_frequency_months: 3, last_reviewed: null, next_review_date: null,
  entry_price: null, entry_date: null, add_below: null, target_price: null, stop_price: null,
  price_currency: '', bull_case: '', bear_case: '', catalysts: '',
});

const inputStyle: React.CSSProperties = { width: '100%', padding: '6px 8px', fontSize: 13, marginTop: 4,
  border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)' };
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.3 };
const sectionHead: React.CSSProperties = { ...labelStyle, display: 'block', marginBottom: 2 };

// ── price level logic ──────────────────────────────────────────────────────
// Returns the active price signal for a thesis given a current per-unit price.
function priceSignal(t: InvestmentThesis, current: number | null):
  { key: string; label: string; bg: string; fg: string } | null {
  if (current == null) return null;
  if (t.stop_price != null && current <= t.stop_price)
    return { key: 'stop', label: 'STOP BREACHED', bg: 'var(--red-bg)', fg: 'var(--red)' };
  if (t.target_price != null && current >= t.target_price)
    return { key: 'target', label: 'Target hit', bg: 'var(--green-bg)', fg: 'var(--green)' };
  if (t.add_below != null && current <= t.add_below)
    return { key: 'add', label: 'In add zone', bg: 'var(--blue-bg)', fg: 'var(--blue)' };
  return null;
}

// ── module-scope subcomponents (react-compiler: never create during render) ─
function FieldEditor({ d, set }: { d: Draft; set: (patch: Partial<Draft>) => void }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label><span style={labelStyle}>Return driver</span>
          <input list="driver-presets" style={inputStyle} value={d.driver}
            onChange={(e) => set({ driver: e.target.value })} placeholder="e.g. AI / energy buildout" />
          <datalist id="driver-presets">{DRIVER_PRESETS.map((p) => <option key={p} value={p} />)}</datalist>
        </label>
        <label><span style={labelStyle}>Role in portfolio</span>
          <input style={inputStyle} value={d.role} onChange={(e) => set({ role: e.target.value })} placeholder="e.g. growth satellite" />
        </label>
      </div>

      <label><span style={labelStyle}>Thesis — why I own it</span>
        <textarea style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }} value={d.thesis}
          onChange={(e) => set({ thesis: e.target.value })} />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label><span style={labelStyle}>Bull case</span>
          <textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }} value={d.bull_case ?? ''}
            onChange={(e) => set({ bull_case: e.target.value })} placeholder="What has to go right, and what it's worth if it does." />
        </label>
        <label><span style={labelStyle}>Bear case</span>
          <textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }} value={d.bear_case ?? ''}
            onChange={(e) => set({ bear_case: e.target.value })} placeholder="The strongest argument against owning this." />
        </label>
      </div>
      <label><span style={labelStyle}>Catalysts — what moves it, and when</span>
        <textarea style={{ ...inputStyle, minHeight: 48, resize: 'vertical' }} value={d.catalysts ?? ''}
          onChange={(e) => set({ catalysts: e.target.value })} placeholder="Earnings, contracts, rate decisions, unlock dates…" />
      </label>
      <label><span style={labelStyle}>Kill criteria — what would make me sell</span>
        <textarea style={{ ...inputStyle, minHeight: 48, resize: 'vertical' }} value={d.kill_criteria}
          onChange={(e) => set({ kill_criteria: e.target.value })} placeholder="Written now, while calm." />
      </label>

      <div>
        <span style={sectionHead}>Price discipline (per unit, native currency)</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
          <label><span style={labelStyle}>Entry</span>
            <input style={inputStyle} value={d.entry_price == null ? '' : String(d.entry_price)}
              onChange={(e) => set({ entry_price: numOrNull(e.target.value) })} placeholder="avg cost" />
          </label>
          <label><span style={labelStyle}>Entry date</span>
            <input type="date" style={inputStyle} value={d.entry_date ?? ''}
              onChange={(e) => set({ entry_date: e.target.value || null })} />
          </label>
          <label><span style={labelStyle}>Add below</span>
            <input style={inputStyle} value={d.add_below == null ? '' : String(d.add_below)}
              onChange={(e) => set({ add_below: numOrNull(e.target.value) })} placeholder="accumulate" />
          </label>
          <label><span style={labelStyle}>Target</span>
            <input style={inputStyle} value={d.target_price == null ? '' : String(d.target_price)}
              onChange={(e) => set({ target_price: numOrNull(e.target.value) })} placeholder="take profit" />
          </label>
          <label><span style={labelStyle}>Stop / exit</span>
            <input style={inputStyle} value={d.stop_price == null ? '' : String(d.stop_price)}
              onChange={(e) => set({ stop_price: numOrNull(e.target.value) })} placeholder="thesis dead" />
          </label>
          <label><span style={labelStyle}>Currency</span>
            <input style={inputStyle} value={d.price_currency ?? ''}
              onChange={(e) => set({ price_currency: e.target.value.toUpperCase() })} placeholder="AUD / USD" />
          </label>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <label><span style={labelStyle}>Conviction</span>
          <select style={inputStyle} value={d.conviction} onChange={(e) => set({ conviction: e.target.value as ConvictionRating })}>
            <option value="core">Core — buy more on weakness</option>
            <option value="hold">Hold — right-sized</option>
            <option value="trim">Trim — overweight / weakening</option>
            <option value="exit">Exit — thesis broken</option>
          </select>
        </label>
        <label><span style={labelStyle}>Thesis status</span>
          <select style={inputStyle} value={d.status} onChange={(e) => set({ status: e.target.value as ThesisStatus })}>
            <option value="intact">Intact</option>
            <option value="watch">Watch</option>
            <option value="broken">Broken</option>
          </select>
        </label>
        <label><span style={labelStyle}>Review every (months)</span>
          <input style={inputStyle} value={String(d.review_frequency_months)}
            onChange={(e) => set({ review_frequency_months: num(e.target.value) || 3 })} />
        </label>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)' }}>
        <input type="checkbox" checked={d.is_structural} onChange={(e) => set({ is_structural: e.target.checked })} />
        Structural holding (family home / locked super) — not graded as an investment
      </label>
    </div>
  );
}

interface NoteDraft { kind: ThesisNoteKind; title: string; body: string; url: string; source: string; }
const blankNote = (): NoteDraft => ({ kind: 'note', title: '', body: '', url: '', source: '' });

function NoteComposer({ nd, set, onAdd }: { nd: NoteDraft; set: (p: Partial<NoteDraft>) => void; onAdd: () => void }) {
  return (
    <div style={{ display: 'grid', gap: 8, padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8 }}>
        <select style={{ ...inputStyle, marginTop: 0 }} value={nd.kind} onChange={(e) => set({ kind: e.target.value as ThesisNoteKind })}>
          <option value="note">Note</option>
          <option value="review">Review</option>
          <option value="article">Article</option>
          <option value="decision">Decision</option>
        </select>
        <input style={{ ...inputStyle, marginTop: 0 }} value={nd.title} placeholder="Title"
          onChange={(e) => set({ title: e.target.value })} />
      </div>
      <textarea style={{ ...inputStyle, marginTop: 0, minHeight: 56, resize: 'vertical' }} value={nd.body}
        placeholder={nd.kind === 'article' ? 'Key takeaway — why this article matters to the thesis.' : 'What happened / what I think / what I decided.'}
        onChange={(e) => set({ body: e.target.value })} />
      {nd.kind === 'article' && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
          <input style={{ ...inputStyle, marginTop: 0 }} value={nd.url} placeholder="https://…"
            onChange={(e) => set({ url: e.target.value })} />
          <input style={{ ...inputStyle, marginTop: 0 }} value={nd.source} placeholder="Source (AFR, Bloomberg…)"
            onChange={(e) => set({ source: e.target.value })} />
        </div>
      )}
      <div>
        <button className="btn btn-primary btn-sm" onClick={onAdd} disabled={!nd.title.trim() && !nd.body.trim()}>
          Add to journal
        </button>
      </div>
    </div>
  );
}

// ── screen ─────────────────────────────────────────────────────────────────
export function Conviction({ onMenu }: { onMenu: () => void }) {
  const { data, insert, update, remove } = useCadenceFinancial();
  const theses = data.investment_theses ?? [];
  const notes = data.thesis_notes ?? [];
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, Draft>>({});
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(blankDraft());
  const [noteDraft, setNoteDraft] = useState<NoteDraft>(blankNote());
  const [quotes, setQuotes] = useState<QuoteMap>({});
  const [quotesState, setQuotesState] = useState<'idle' | 'loading' | 'error'>('idle');

  // Live quotes for holding-backed theses.
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

  // FX for the correlation audit only.
  const fxRow = data.budget_fx_rates?.find((f) => (f as any).currency?.toUpperCase?.() === 'USD');
  const usdAudRaw = fxRow ? Number((fxRow as any).rate_to_aud) : NaN;
  const usdAud = usdAudRaw && usdAudRaw > 0 ? usdAudRaw : 1.53;

  const holdingOf = (t: InvestmentThesis) =>
    t.target_kind === 'holding' ? data.investment_holdings.find((x) => x.id === t.target_id) : undefined;

  // Current per-unit price: live quote first, else stored native_value/units.
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

  // ── actions ──────────────────────────────────────────────────────────────
  const saveNew = async () => {
    if (!draft.target_label.trim()) return;
    const freq = draft.review_frequency_months || 3;
    await insert('investment_theses', { ...draft, last_reviewed: todayISO(), next_review_date: addMonths(todayISO(), freq) });
    setDraft(blankDraft());
    setAdding(false);
  };

  const saveEdit = async (id: string) => {
    const e = editing[id];
    if (!e) return;
    await update('investment_theses', id, {
      driver: e.driver, role: e.role, thesis: e.thesis, kill_criteria: e.kill_criteria,
      bull_case: e.bull_case, bear_case: e.bear_case, catalysts: e.catalysts,
      entry_price: e.entry_price, entry_date: e.entry_date, add_below: e.add_below,
      target_price: e.target_price, stop_price: e.stop_price, price_currency: e.price_currency,
      conviction: e.conviction, status: e.status, is_structural: e.is_structural,
      review_frequency_months: e.review_frequency_months,
    });
    setEditing((p) => { const { [id]: _drop, ...rest } = p; return rest; });
  };

  const markReviewed = async (t: InvestmentThesis) => {
    const freq = t.review_frequency_months || 3;
    await update('investment_theses', t.id, { last_reviewed: todayISO(), next_review_date: addMonths(todayISO(), freq) });
    // The review leaves a paper trail in the journal automatically.
    await insert('thesis_notes', {
      thesis_id: t.id, note_date: todayISO(), kind: 'review',
      title: 'Reviewed', body: `Conviction ${t.conviction}, status ${t.status}. Next review ${addMonths(todayISO(), freq)}.`,
      url: '', source: '',
    });
  };

  const addNote = async (t: InvestmentThesis) => {
    if (!noteDraft.title.trim() && !noteDraft.body.trim()) return;
    await insert('thesis_notes', {
      thesis_id: t.id, note_date: todayISO(), kind: noteDraft.kind,
      title: noteDraft.title.trim(), body: noteDraft.body.trim(),
      url: noteDraft.url.trim(), source: noteDraft.source.trim(),
    });
    setNoteDraft(blankNote());
  };

  const startEdit = (t: InvestmentThesis) => setEditing((p) => ({ ...p, [t.id]: {
    target_kind: t.target_kind, target_id: t.target_id, target_label: t.target_label,
    driver: t.driver, role: t.role, thesis: t.thesis, kill_criteria: t.kill_criteria,
    conviction: t.conviction, status: t.status, conviction_score: t.conviction_score,
    is_structural: t.is_structural, review_frequency_months: t.review_frequency_months,
    last_reviewed: t.last_reviewed, next_review_date: t.next_review_date,
    entry_price: t.entry_price ?? null, entry_date: t.entry_date ?? null, add_below: t.add_below ?? null,
    target_price: t.target_price ?? null, stop_price: t.stop_price ?? null,
    price_currency: t.price_currency ?? '', bull_case: t.bull_case ?? '', bear_case: t.bear_case ?? '',
    catalysts: t.catalysts ?? '',
  } }));

  return (
    <>
      <ScreenHeader title="Conviction" subtitle="A thesis, price discipline and a paper trail on every asset." onMenu={onMenu}>
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
                    <button className="btn btn-secondary btn-sm" onClick={() => setExpanded(t.id)}>Open</button>
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
              <FieldEditor d={draft} set={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={saveNew}>Save thesis</button>
                <button className="btn btn-secondary btn-sm" onClick={() => { setAdding(false); setDraft(blankDraft()); }}>Cancel</button>
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
                    <button className="btn btn-primary btn-sm" onClick={() => markReviewed(t)}>Mark reviewed</button>
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
                const isEditing = !!editing[t.id];
                const overdue = !t.is_structural && (!t.next_review_date || t.next_review_date <= todayISO());
                const cur = currentPrice(t);
                const sig = t.is_structural ? null : priceSignal(t, cur);
                const pl = t.entry_price != null && cur != null && t.entry_price > 0
                  ? (cur / t.entry_price - 1) * 100 : null;
                const tNotes = notes.filter((n) => n.thesis_id === t.id && !n.deleted_at)
                  .sort((a, b) => (b.note_date + b.created_at).localeCompare(a.note_date + a.created_at));
                return (
                  <div key={t.id} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: 'pointer', flexWrap: 'wrap' }}
                      onClick={() => { setExpanded(isOpen ? null : t.id); setNoteDraft(blankNote()); }}>
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
                      <div style={{ padding: '0 12px 12px', borderTop: '1px solid var(--border)' }}>
                        {isEditing ? (
                          <div style={{ paddingTop: 12, display: 'grid', gap: 10 }}>
                            <FieldEditor d={editing[t.id]} set={(patch) => setEditing((p) => ({ ...p, [t.id]: { ...p[t.id], ...patch } }))} />
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button className="btn btn-primary btn-sm" onClick={() => saveEdit(t.id)}>Save</button>
                              <button className="btn btn-secondary btn-sm" onClick={() => setEditing((p) => { const { [t.id]: _d, ...rest } = p; return rest; })}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ paddingTop: 12, display: 'grid', gap: 12, fontSize: 13 }}>
                            {/* price panel */}
                            {!t.is_structural && (t.target_kind === 'holding' || t.target_kind === 'property') && (
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(105px, 1fr))', gap: 8,
                                padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8, fontVariantNumeric: 'tabular-nums' }}>
                                <div><span style={labelStyle}>Now</span><div style={{ fontWeight: 600 }}>{fmtPrice(cur, t.price_currency)}</div></div>
                                <div><span style={labelStyle}>Entry</span><div>{fmtPrice(t.entry_price, t.price_currency)}{t.entry_date ? ` · ${t.entry_date.slice(0, 7)}` : ''}</div></div>
                                <div><span style={labelStyle}>P&L</span><div style={{ color: pl == null ? 'var(--text3)' : pl >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{pl == null ? '—' : `${pl >= 0 ? '+' : ''}${pl.toFixed(1)}%`}</div></div>
                                <div><span style={labelStyle}>Add below</span><div>{fmtPrice(t.add_below, t.price_currency)}</div></div>
                                <div><span style={labelStyle}>Target</span><div>{fmtPrice(t.target_price, t.price_currency)}</div></div>
                                <div><span style={labelStyle}>Stop / exit</span><div>{fmtPrice(t.stop_price, t.price_currency)}</div></div>
                              </div>
                            )}

                            {t.role && <div><span style={sectionHead}>Role</span>{t.role}</div>}
                            <div><span style={sectionHead}>Thesis</span>{t.thesis || <em style={{ color: 'var(--text3)' }}>none written</em>}</div>
                            {(t.bull_case || t.bear_case) && (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div><span style={{ ...sectionHead, color: 'var(--green)' }}>Bull case</span>{t.bull_case || <em style={{ color: 'var(--text3)' }}>—</em>}</div>
                                <div><span style={{ ...sectionHead, color: 'var(--red)' }}>Bear case</span>{t.bear_case || <em style={{ color: 'var(--text3)' }}>—</em>}</div>
                              </div>
                            )}
                            {t.catalysts && <div><span style={sectionHead}>Catalysts</span>{t.catalysts}</div>}
                            <div><span style={sectionHead}>Kill criteria</span>
                              <span style={{ color: t.kill_criteria ? 'var(--text)' : 'var(--text3)' }}>
                                {t.kill_criteria || <em>none written — this is the field that matters most</em>}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--text2)' }}>
                              <span>Approx value: {formatMoney(valueOf(t), true)}</span>
                              {!t.is_structural && <span>Last reviewed: {t.last_reviewed ?? 'never'}</span>}
                              {!t.is_structural && <span>Every {t.review_frequency_months} months</span>}
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <button className="btn btn-secondary btn-sm" onClick={() => startEdit(t)}>Edit</button>
                              {!t.is_structural && <button className="btn btn-primary btn-sm" onClick={() => markReviewed(t)}>Mark reviewed today</button>}
                              <button className="btn btn-secondary btn-sm" style={{ color: 'var(--red)' }} onClick={() => remove('investment_theses', t.id)}>Delete</button>
                            </div>

                            {/* journal */}
                            <div>
                              <span style={{ ...sectionHead, marginBottom: 8 }}>Journal & research ({tNotes.length})</span>
                              <div style={{ display: 'grid', gap: 8 }}>
                                <NoteComposer nd={noteDraft} set={(p) => setNoteDraft((d) => ({ ...d, ...p }))} onAdd={() => addNote(t)} />
                                {tNotes.map((n) => (
                                  <div key={n.id} style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                      <Chip bg={NOTE_KIND_TONE[n.kind].bg} fg={NOTE_KIND_TONE[n.kind].fg}>{NOTE_KIND_TONE[n.kind].label}</Chip>
                                      <span style={{ fontWeight: 500, fontSize: 12.5, flex: 1 }}>{n.title}</span>
                                      <span style={{ fontSize: 11.5, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>{n.note_date}</span>
                                      <button className="btn btn-secondary btn-sm" style={{ color: 'var(--red)', padding: '1px 7px' }}
                                        onClick={() => remove('thesis_notes', n.id)}>×</button>
                                    </div>
                                    {n.body && <div style={{ fontSize: 12.5, marginTop: 4, color: 'var(--text)' }}>{n.body}</div>}
                                    {n.url && (
                                      <div style={{ marginTop: 4, fontSize: 12 }}>
                                        <a href={n.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                                          {n.source ? `${n.source} ↗` : 'Open link ↗'}
                                        </a>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
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
