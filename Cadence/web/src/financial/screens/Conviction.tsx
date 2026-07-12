import { useState } from 'react';
import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card, Metric } from '../components/bits';
import { formatMoney } from '../lib/util';
import type { Conviction as ConvictionRating, InvestmentThesis, ThesisStatus, ThesisTargetKind } from '../lib/types';

// ── small helpers ──────────────────────────────────────────────────────────
const todayISO = () => new Date().toISOString().slice(0, 10);
function addMonths(iso: string, months: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
const num = (s: string) => Number(s.replace(/[^0-9.-]/g, '')) || 0;

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

function Chip({ bg, fg, children }: { bg: string; fg: string; children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 12,
      fontSize: 11, fontWeight: 600, background: bg, color: fg, whiteSpace: 'nowrap' }}>{children}</span>
  );
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '6px 8px', fontSize: 13, marginTop: 4,
  border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)' };
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.3 };

// Shared field editor (add + edit). Module-scope so it isn't re-created each render.
function FieldEditor({ d, set }: { d: Draft; set: (patch: Partial<Draft>) => void }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label><span style={labelStyle}>Return driver</span>
          <input list="driver-presets" style={inputStyle} value={d.driver}
            onChange={(e) => set({ driver: e.target.value })} placeholder="e.g. AI compute" />
          <datalist id="driver-presets">{DRIVER_PRESETS.map((p) => <option key={p} value={p} />)}</datalist>
        </label>
        <label><span style={labelStyle}>Role in portfolio</span>
          <input style={inputStyle} value={d.role} onChange={(e) => set({ role: e.target.value })} placeholder="e.g. growth satellite" />
        </label>
      </div>
      <label><span style={labelStyle}>Thesis — why I own it</span>
        <textarea style={{ ...inputStyle, minHeight: 54, resize: 'vertical' }} value={d.thesis}
          onChange={(e) => set({ thesis: e.target.value })} />
      </label>
      <label><span style={labelStyle}>Kill criteria — what would make me sell</span>
        <textarea style={{ ...inputStyle, minHeight: 44, resize: 'vertical' }} value={d.kill_criteria}
          onChange={(e) => set({ kill_criteria: e.target.value })} placeholder="Written now, while calm." />
      </label>
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

// Preset return-drivers — the correlation-audit keys. Free text also allowed.
const DRIVER_PRESETS = [
  'AI compute', 'AU property', 'Inflation hedge', 'Protected liquidity',
  'Crypto / digital gold', 'Global equity beta', 'Active alpha', 'Family commitment',
];

type Draft = Omit<InvestmentThesis, 'id' | 'owner_id' | 'created_at' | 'updated_at' | 'deleted_at'>;

const blankDraft = (): Draft => ({
  target_kind: 'holding', target_id: null, target_label: '', driver: '', role: '',
  thesis: '', kill_criteria: '', conviction: 'hold', status: 'intact', conviction_score: null,
  is_structural: false, review_frequency_months: 3, last_reviewed: null, next_review_date: null,
});

export function Conviction({ onMenu }: { onMenu: () => void }) {
  const { data, insert, update, remove } = useCadenceFinancial();
  const theses = data.investment_theses ?? [];
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, Draft>>({});
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(blankDraft());

  // USD→AUD for the correlation audit (best available; else a sensible default).
  const fxRow = data.budget_fx_rates?.find((f) => (f as any).currency?.toUpperCase?.() === 'USD');
  const usdAudRaw = fxRow ? Number((fxRow as any).rate_to_aud) : NaN;
  const usdAud = usdAudRaw && usdAudRaw > 0 ? usdAudRaw : 1.53;

  // Approx AUD value behind a thesis target (property / holding / bucket).
  const valueOf = (t: InvestmentThesis): number => {
    if (t.target_kind === 'property') {
      const p = data.properties.find((x) => x.id === t.target_id);
      return p ? p.value : 0;
    }
    if (t.target_kind === 'holding') {
      const h = data.investment_holdings.find((x) => x.id === t.target_id);
      if (!h) return 0;
      return (h.currency?.toUpperCase() === 'USD' ? h.native_value * usdAud : h.native_value);
    }
    if (t.target_kind === 'bucket') {
      const b = data.liquidity_buckets.find((x) => x.id === t.target_id);
      return b ? b.amount : 0;
    }
    return 0; // sleeve — no single backing asset
  };

  const active = theses.filter((t) => !t.deleted_at);
  const investable = active.filter((t) => !t.is_structural);

  // Reviews due: next_review_date missing or on/before today.
  const due = active.filter((t) => !t.is_structural && (!t.next_review_date || t.next_review_date <= todayISO()));

  // Correlation audit — group investable theses by driver, sum approx AUD value.
  const driverMap = new Map<string, number>();
  for (const t of investable) {
    const d = t.driver.trim() || 'Untagged';
    driverMap.set(d, (driverMap.get(d) ?? 0) + valueOf(t));
  }
  const driverRows = [...driverMap.entries()].map(([driver, value]) => ({ driver, value })).sort((a, b) => b.value - a.value);
  const driverTotal = driverRows.reduce((s, r) => s + r.value, 0);
  const byDriver = { rows: driverRows, total: driverTotal };

  // Coverage — how many assets carry a thesis.
  const assetCount = data.properties.length + data.investment_holdings.length
    + data.liquidity_buckets.filter((b) => b.amount > 0).length;
  const covered = new Set(active.filter((t) => t.target_id).map((t) => t.target_id)).size;

  const brokenOrWatch = active.filter((t) => t.status !== 'intact').length;

  // Assets without a thesis yet (for the add picker).
  const thesisTargetIds = new Set(active.map((t) => t.target_id));
  const openTargets = [
    ...data.properties.filter((p) => !thesisTargetIds.has(p.id)).map((p) => ({ kind: 'property' as ThesisTargetKind, id: p.id, label: p.address })),
    ...data.investment_holdings.filter((h) => !thesisTargetIds.has(h.id)).map((h) => ({ kind: 'holding' as ThesisTargetKind, id: h.id, label: `${h.ticker} · ${h.market}` })),
    ...data.liquidity_buckets.filter((b) => b.amount > 0 && !thesisTargetIds.has(b.id)).map((b) => ({ kind: 'bucket' as ThesisTargetKind, id: b.id, label: b.label })),
  ];

  // ── actions ────────────────────────────────────────────────────────────
  const saveNew = async () => {
    if (!draft.target_label.trim()) return;
    const freq = draft.review_frequency_months || 3;
    await insert('investment_theses', {
      ...draft,
      last_reviewed: todayISO(),
      next_review_date: addMonths(todayISO(), freq),
    });
    setDraft(blankDraft());
    setAdding(false);
  };

  const saveEdit = async (id: string) => {
    const e = editing[id];
    if (!e) return;
    await update('investment_theses', id, {
      driver: e.driver, role: e.role, thesis: e.thesis, kill_criteria: e.kill_criteria,
      conviction: e.conviction, status: e.status, is_structural: e.is_structural,
      review_frequency_months: e.review_frequency_months,
    });
    setEditing((p) => { const { [id]: _drop, ...rest } = p; return rest; });
  };

  const markReviewed = async (t: InvestmentThesis) => {
    const freq = t.review_frequency_months || 3;
    await update('investment_theses', t.id, {
      last_reviewed: todayISO(),
      next_review_date: addMonths(todayISO(), freq),
    });
  };

  const startEdit = (t: InvestmentThesis) => setEditing((p) => ({ ...p, [t.id]: {
    target_kind: t.target_kind, target_id: t.target_id, target_label: t.target_label,
    driver: t.driver, role: t.role, thesis: t.thesis, kill_criteria: t.kill_criteria,
    conviction: t.conviction, status: t.status, conviction_score: t.conviction_score,
    is_structural: t.is_structural, review_frequency_months: t.review_frequency_months,
    last_reviewed: t.last_reviewed, next_review_date: t.next_review_date,
  } }));

  return (
    <>
      <ScreenHeader title="Conviction" subtitle="A thesis, a rating and a review date on every asset." onMenu={onMenu}>
        <button className="btn btn-primary btn-sm" onClick={() => setAdding((s) => !s)}>
          {adding ? 'Close' : '+ Thesis'}
        </button>
      </ScreenHeader>

      <div className="screen-content">
        {/* summary */}
        <div className="cf-metric-grid" style={{ marginBottom: 12 }}>
          <Metric label="Theses" value={String(active.length)} />
          <Metric label="Coverage" value={`${covered}/${assetCount}`} delta="assets with a thesis" tone="neutral" />
          <Metric label="Reviews due" value={String(due.length)} tone={due.length ? 'bad' : 'good'} />
          <Metric label="Watch / broken" value={String(brokenOrWatch)} tone={brokenOrWatch ? 'bad' : 'good'} />
        </div>

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

        {/* correlation audit */}
        <Card title="Correlation audit — value by return driver">
          <p style={{ fontSize: 12.5, color: 'var(--text2)', margin: '0 0 12px' }}>
            The real diversification test: if one driver dominates, the “diversified” book is one bet. Approx AUD, thesis-covered assets only.
          </p>
          {byDriver.rows.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text3)' }}>No theses yet — add one to populate the audit.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {byDriver.rows.map((r) => {
                const pct = byDriver.total ? (r.value / byDriver.total) * 100 : 0;
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

        {/* reviews due */}
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

        {/* all theses */}
        <Card title="All theses">
          {active.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text3)' }}>No theses yet. Add one per asset — start with the biggest positions.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {active.slice().sort((a, b) => valueOf(b) - valueOf(a)).map((t) => {
                const isOpen = expanded === t.id;
                const isEditing = !!editing[t.id];
                const overdue = !t.is_structural && (!t.next_review_date || t.next_review_date <= todayISO());
                return (
                  <div key={t.id} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: 'pointer', flexWrap: 'wrap' }}
                      onClick={() => setExpanded(isOpen ? null : t.id)}>
                      <span style={{ fontWeight: 500, fontSize: 13.5, flex: 1, minWidth: 120 }}>{t.target_label}</span>
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
                          <div style={{ paddingTop: 12, display: 'grid', gap: 10, fontSize: 13 }}>
                            {t.role && <div><span style={labelStyle}>Role</span><div>{t.role}</div></div>}
                            <div><span style={labelStyle}>Thesis</span><div style={{ color: 'var(--text)' }}>{t.thesis || <em style={{ color: 'var(--text3)' }}>none written</em>}</div></div>
                            <div><span style={labelStyle}>Kill criteria</span><div style={{ color: t.kill_criteria ? 'var(--text)' : 'var(--text3)' }}>{t.kill_criteria || <em>none written — this is the field that matters most</em>}</div></div>
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
