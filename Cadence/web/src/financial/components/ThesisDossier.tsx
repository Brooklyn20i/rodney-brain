// Per-asset investment-thesis dossier — embedded under each holding on the
// Investments screen, on each property's detail page, and reused by the
// Conviction screen (which keeps only the cross-asset views: correlation
// audit, reviews due, price signals). Self-contained: reads/writes via the
// financial store; the parent only supplies which asset and (optionally) a
// current per-unit price for the price panel.
import { useState } from 'react';
import { useCadenceFinancial } from '../lib/store';
import type {
  Conviction as ConvictionRating, InvestmentThesis, ThesisNoteKind,
  ThesisStatus, ThesisTargetKind,
} from '../lib/types';

// ── shared helpers (exported for the Conviction screen) ────────────────────
export const todayISO = () => new Date().toISOString().slice(0, 10);
export function addMonths(iso: string, months: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
const num = (s: string) => Number(s.replace(/[^0-9.-]/g, '')) || 0;
const numOrNull = (s: string): number | null => {
  const v = Number(s.replace(/[^0-9.-]/g, ''));
  return s.trim() === '' || !isFinite(v) ? null : v;
};
export function fmtPrice(v: number | null | undefined, ccy?: string): string {
  if (v == null || !isFinite(v)) return '—';
  const dp = v >= 1000 ? 0 : v >= 10 ? 2 : 4;
  return `${ccy ? ccy + ' ' : ''}${v.toLocaleString(undefined, { maximumFractionDigits: dp })}`;
}

export const CONVICTION_TONE: Record<ConvictionRating, { bg: string; fg: string; label: string }> = {
  core: { bg: 'var(--green-bg)', fg: 'var(--green)', label: 'Core' },
  hold: { bg: 'var(--blue-bg)', fg: 'var(--blue)', label: 'Hold' },
  trim: { bg: 'var(--orange-bg)', fg: 'var(--orange)', label: 'Trim' },
  exit: { bg: 'var(--red-bg)', fg: 'var(--red)', label: 'Exit' },
};
export const STATUS_TONE: Record<ThesisStatus, { bg: string; fg: string; label: string }> = {
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

export function Chip({ bg, fg, children }: { bg: string; fg: string; children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 12,
      fontSize: 11, fontWeight: 600, background: bg, color: fg, whiteSpace: 'nowrap' }}>{children}</span>
  );
}

// Active price signal for a thesis given a current per-unit price.
export function priceSignal(t: InvestmentThesis, current: number | null):
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

// Roll the review date forward and leave a journal entry — shared by the
// dossier's button and Conviction's reviews-due quick action.
export async function rollReview(
  t: InvestmentThesis,
  update: ReturnType<typeof useCadenceFinancial>['update'],
  insert: ReturnType<typeof useCadenceFinancial>['insert'],
) {
  const freq = t.review_frequency_months || 3;
  await update('investment_theses', t.id, { last_reviewed: todayISO(), next_review_date: addMonths(todayISO(), freq) });
  await insert('thesis_notes', {
    thesis_id: t.id, note_date: todayISO(), kind: 'review',
    title: 'Reviewed', body: `Conviction ${t.conviction}, status ${t.status}. Next review ${addMonths(todayISO(), freq)}.`,
    url: '', source: '',
  });
}

const DRIVER_PRESETS = [
  'AI / energy buildout', 'AU property', 'Inflation hedge / gold', 'Protected liquidity',
  'Crypto / digital gold', 'Global equity beta', 'Active alpha (global)', 'Family commitment',
];

export type ThesisDraft = Omit<InvestmentThesis, 'id' | 'owner_id' | 'created_at' | 'updated_at' | 'deleted_at'>;

export const blankThesisDraft = (): ThesisDraft => ({
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

export function ThesisFieldEditor({ d, set }: { d: ThesisDraft; set: (patch: Partial<ThesisDraft>) => void }) {
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

// ── the dossier ────────────────────────────────────────────────────────────
export function ThesisDossier({
  targetKind,
  targetId,
  targetLabel,
  currentPrice,
  defaultFrequencyMonths,
  thesisId,
}: {
  targetKind: ThesisTargetKind;
  targetId: string | null;
  targetLabel: string;
  // Current per-unit price in the asset's native currency (property: whole-asset AUD value).
  currentPrice?: number | null;
  defaultFrequencyMonths?: number;
  // Optional direct thesis reference (used for sleeve-level theses).
  thesisId?: string;
}) {
  const { data, insert, update, remove } = useCadenceFinancial();
  const [editing, setEditing] = useState<ThesisDraft | null>(null);
  const [noteDraft, setNoteDraft] = useState<NoteDraft>(blankNote());

  const t = thesisId
    ? (data.investment_theses ?? []).find((x) => x.id === thesisId && !x.deleted_at)
    : (data.investment_theses ?? []).find((x) => x.target_id === targetId && !x.deleted_at);

  const startThesis = async () => {
    const freq = defaultFrequencyMonths ?? (targetKind === 'property' ? 6 : 3);
    await insert('investment_theses', {
      ...blankThesisDraft(),
      target_kind: targetKind, target_id: targetId, target_label: targetLabel,
      review_frequency_months: freq,
      last_reviewed: todayISO(), next_review_date: addMonths(todayISO(), freq),
    });
  };

  if (!t) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
        background: 'var(--surface2)', borderRadius: 8, fontSize: 13 }}>
        <span style={{ color: 'var(--text2)' }}>No investment thesis yet for {targetLabel}.</span>
        <button className="btn btn-primary btn-sm" onClick={startThesis}>Start a thesis</button>
      </div>
    );
  }

  const cur = currentPrice ?? null;
  const sig = t.is_structural ? null : priceSignal(t, cur);
  const pl = t.entry_price != null && cur != null && t.entry_price > 0 ? (cur / t.entry_price - 1) * 100 : null;
  const overdue = !t.is_structural && (!t.next_review_date || t.next_review_date <= todayISO());
  const tNotes = (data.thesis_notes ?? []).filter((n) => n.thesis_id === t.id && !n.deleted_at)
    .sort((a, b) => (b.note_date + b.created_at).localeCompare(a.note_date + a.created_at));

  const saveEdit = async () => {
    if (!editing) return;
    await update('investment_theses', t.id, {
      driver: editing.driver, role: editing.role, thesis: editing.thesis, kill_criteria: editing.kill_criteria,
      bull_case: editing.bull_case, bear_case: editing.bear_case, catalysts: editing.catalysts,
      entry_price: editing.entry_price, entry_date: editing.entry_date, add_below: editing.add_below,
      target_price: editing.target_price, stop_price: editing.stop_price, price_currency: editing.price_currency,
      conviction: editing.conviction, status: editing.status, is_structural: editing.is_structural,
      review_frequency_months: editing.review_frequency_months,
    });
    setEditing(null);
  };

  const addNote = async () => {
    if (!noteDraft.title.trim() && !noteDraft.body.trim()) return;
    await insert('thesis_notes', {
      thesis_id: t.id, note_date: todayISO(), kind: noteDraft.kind,
      title: noteDraft.title.trim(), body: noteDraft.body.trim(),
      url: noteDraft.url.trim(), source: noteDraft.source.trim(),
    });
    setNoteDraft(blankNote());
  };

  if (editing) {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <ThesisFieldEditor d={editing} set={(patch) => setEditing((p) => (p ? { ...p, ...patch } : p))} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={saveEdit}>Save</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12, fontSize: 13 }}>
      {/* status strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {t.is_structural
          ? <Chip bg="var(--surface2)" fg="var(--text3)">Structural</Chip>
          : <Chip bg={CONVICTION_TONE[t.conviction].bg} fg={CONVICTION_TONE[t.conviction].fg}>{CONVICTION_TONE[t.conviction].label}</Chip>}
        {!t.is_structural && t.status !== 'intact' && (
          <Chip bg={STATUS_TONE[t.status].bg} fg={STATUS_TONE[t.status].fg}>{STATUS_TONE[t.status].label}</Chip>
        )}
        {sig && <Chip bg={sig.bg} fg={sig.fg}>{sig.label}</Chip>}
        {t.driver && <Chip bg="var(--surface2)" fg="var(--text2)">{t.driver}</Chip>}
        <span style={{ fontSize: 12, color: overdue ? 'var(--red)' : 'var(--text3)', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
          {t.is_structural ? 'not graded' : `review ${t.next_review_date ?? 'unscheduled'}`}
        </span>
      </div>

      {/* price panel */}
      {!t.is_structural && (targetKind === 'holding' || targetKind === 'property') && (
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
        {!t.is_structural && <span>Last reviewed: {t.last_reviewed ?? 'never'}</span>}
        {!t.is_structural && <span>Every {t.review_frequency_months} months</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => setEditing({
          target_kind: t.target_kind, target_id: t.target_id, target_label: t.target_label,
          driver: t.driver, role: t.role, thesis: t.thesis, kill_criteria: t.kill_criteria,
          conviction: t.conviction, status: t.status, conviction_score: t.conviction_score,
          is_structural: t.is_structural, review_frequency_months: t.review_frequency_months,
          last_reviewed: t.last_reviewed, next_review_date: t.next_review_date,
          entry_price: t.entry_price ?? null, entry_date: t.entry_date ?? null, add_below: t.add_below ?? null,
          target_price: t.target_price ?? null, stop_price: t.stop_price ?? null,
          price_currency: t.price_currency ?? '', bull_case: t.bull_case ?? '', bear_case: t.bear_case ?? '',
          catalysts: t.catalysts ?? '',
        })}>Edit</button>
        {!t.is_structural && <button className="btn btn-primary btn-sm" onClick={() => rollReview(t, update, insert)}>Mark reviewed today</button>}
        <button className="btn btn-secondary btn-sm" style={{ color: 'var(--red)' }} onClick={() => remove('investment_theses', t.id)}>Delete thesis</button>
      </div>

      {/* journal */}
      <div>
        <span style={{ ...sectionHead, marginBottom: 8 }}>Journal & research ({tNotes.length})</span>
        <div style={{ display: 'grid', gap: 8 }}>
          <NoteComposer nd={noteDraft} set={(p) => setNoteDraft((d) => ({ ...d, ...p }))} onAdd={addNote} />
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
  );
}
