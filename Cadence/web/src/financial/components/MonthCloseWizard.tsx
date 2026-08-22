import { useMemo, useState } from 'react';
import { useCadenceFinancial } from '../lib/store';
import { deriveNewMonth, netWorthBridge, nextPeriod, priorMonthOf } from '../lib/financeCalc';
import type { NewMonthInputs } from '../lib/financeCalc';
import type { EvidenceGrade, EvidenceItem, MonthlyMetric } from '../lib/types';
import { EVIDENCE_GRADE_LABEL, formatMoney, monthLabel } from '../lib/util';
import { Card } from './bits';

// Guided replacement for the manual workbook-update ritual: enter closing
// balances as evidenced, the app derives every movement figure from the
// prior month (deriveNewMonth), each line carries an evidence grade, and
// saving writes the monthly_metrics row plus one evidence_items row per
// balance line.
//
// The DB enforces ONE live row per (owner, period) — so saving a period that
// already exists is a CORRECTION and must update that row in place, never
// insert a duplicate (which the constraint would reject with a cryptic
// error — the old "monthly report is broken" brick). The same rule applies
// to the evidence rows: re-closing refreshes them instead of duplicating.

interface BalanceField {
  key: keyof Omit<NewMonthInputs, 'period'>;
  label: string;
  carryForward: boolean; // prefill from prior month (super/property style)
  defaultGrade: EvidenceGrade;
  evidenceItem: string;
}

const BALANCE_FIELDS: BalanceField[] = [
  { key: 'cash_offsets', label: 'Cash / offsets (closing)', carryForward: false, defaultGrade: 'screenshot', evidenceItem: 'Cash and offsets' },
  { key: 'total_debt', label: 'Total debt (closing)', carryForward: false, defaultGrade: 'screenshot', evidenceItem: 'Loans' },
  { key: 'btc_crypto', label: 'BTC / crypto value', carryForward: false, defaultGrade: 'screenshot', evidenceItem: 'BTC crypto' },
  { key: 'shares', label: 'Listed shares value', carryForward: false, defaultGrade: 'market_repriced', evidenceItem: 'Listed shares' },
  { key: 'super_balance', label: 'Super balance', carryForward: true, defaultGrade: 'stale_carry_forward', evidenceItem: 'Super' },
  { key: 'property_value', label: 'Property value', carryForward: true, defaultGrade: 'stale_carry_forward', evidenceItem: 'Property values' },
  { key: 'collectibles_value', label: 'Collectibles value', carryForward: true, defaultGrade: 'stale_carry_forward', evidenceItem: 'Collectibles' },
];

const BUY_FIELDS: { key: 'share_buys' | 'btc_buys'; label: string }[] = [
  { key: 'share_buys', label: 'Shares bought this month' },
  { key: 'btc_buys', label: 'BTC bought this month' },
];

export function MonthCloseWizard({ months, mode, onDone }: {
  months: MonthlyMetric[];
  // 'next' closes the month after the latest close; 'edit-latest' re-opens the
  // latest close for correction (prefilled with its saved balances).
  mode: 'next' | 'edit-latest';
  onDone: () => void;
}) {
  const { data, insert, update } = useCadenceFinancial();
  const sorted = useMemo(() => [...months].sort((a, b) => a.period.localeCompare(b.period)), [months]);
  const latest = sorted[sorted.length - 1];
  const period = mode === 'next' ? nextPeriod(latest.period) : latest.period;
  // Derivations always run against the month BEFORE the target period. When
  // closing the NEXT month that is the latest close. Correcting the very
  // FIRST month has no prior to derive movements from — that path is blocked
  // below rather than silently writing self-referential deltas.
  const truePrior = priorMonthOf(sorted, period);
  const prior = truePrior ?? latest;
  const existing = useMemo(
    () => sorted.find((m) => m.period === period) ?? null,
    [sorted, period]
  );

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of BALANCE_FIELDS) {
      if (existing) v[f.key] = String(existing[f.key as keyof MonthlyMetric] ?? 0);
      else v[f.key] = f.carryForward ? String(prior[f.key as keyof MonthlyMetric] ?? 0) : '';
    }
    for (const f of BUY_FIELDS) v[f.key] = existing ? String(existing[f.key] ?? 0) : '0';
    return v;
  });
  const [grades, setGrades] = useState<Record<string, EvidenceGrade>>(() =>
    Object.fromEntries(BALANCE_FIELDS.map((f) => [f.key, f.defaultGrade]))
  );

  const num = (key: string) => Number(values[key]?.replace(/[^0-9.-]/g, '')) || 0;
  const allBalancesEntered = BALANCE_FIELDS.every((f) => values[f.key] !== '');

  const preview = useMemo(() => {
    if (!allBalancesEntered) return null;
    const inputs: NewMonthInputs = {
      period,
      cash_offsets: num('cash_offsets'),
      total_debt: num('total_debt'),
      shares: num('shares'),
      btc_crypto: num('btc_crypto'),
      super_balance: num('super_balance'),
      property_value: num('property_value'),
      collectibles_value: num('collectibles_value'),
      share_buys: num('share_buys'),
      btc_buys: num('btc_buys'),
    };
    const derived = deriveNewMonth(prior, inputs);
    const bridge = netWorthBridge(prior, { ...prior, ...derived });
    return { derived, bridge };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, prior, period, allBalancesEntered]);

  const save = async () => {
    if (!preview) return;
    setBusy(true);
    setErr('');
    try {
      // One live row per period: correcting an existing close updates it in
      // place; only a genuinely new period inserts.
      if (existing) await update('monthly_metrics', existing.id, preview.derived);
      else await insert('monthly_metrics', preview.derived);

      for (const f of BALANCE_FIELDS) {
        // Collectibles at zero with no history isn't evidence of anything.
        if (f.key === 'collectibles_value' && num(f.key) === 0) continue;
        const row: Partial<EvidenceItem> = {
          item: f.evidenceItem,
          period,
          grade: grades[f.key],
          status: grades[f.key] === 'stale_carry_forward' ? 'missing' : 'received',
          source: `${monthLabel(period)} month close`,
          notes: '',
        };
        // Re-closing refreshes the period's evidence line instead of stacking
        // a duplicate row per correction.
        const prev = data.evidence_items.find(
          (e) => e.period === period && e.item === f.evidenceItem && !e.deleted_at
        );
        if (prev) await update('evidence_items', prev.id, row);
        else await insert('evidence_items', row);
      }
      onDone();
    } catch (e: any) {
      setErr(e?.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  if (existing && !truePrior) {
    return (
      <Card title={`Correct ${monthLabel(period)}`}>
        <p style={{ fontSize: 13, color: 'var(--text2)' }}>
          {monthLabel(period)} is the earliest month on record, so there is no prior month to
          re-derive its movement figures from. Corrections to the opening month are a data-import
          operation — adjust it at the source instead.
        </p>
        <button className="btn btn-secondary" onClick={onDone}>Close</button>
      </Card>
    );
  }

  const title = existing ? `Correct ${monthLabel(period)}` : `Close ${monthLabel(period)}`;
  return (
    <Card title={title}>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
        {existing
          ? `Adjust the closing balances below — movement figures re-derive from ${monthLabel(prior.period)} and the saved close is corrected in place.`
          : `Enter closing balances as evidenced. Movement figures (cash saved, debt reduction, net worth) are derived automatically from ${monthLabel(prior.period)}.`}
      </p>
      <div className="wizard-grid">
        {BALANCE_FIELDS.map((f) => (
          <div className="form-group" key={f.key}>
            <label className="field">{f.label}</label>
            <input
              type="text"
              inputMode="decimal"
              aria-label={f.label}
              value={values[f.key]}
              placeholder={f.carryForward ? '' : '0.00'}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
            <select
              className="wizard-grade"
              aria-label={`${f.label} evidence grade`}
              value={grades[f.key]}
              onChange={(e) => setGrades((g) => ({ ...g, [f.key]: e.target.value as EvidenceGrade }))}
            >
              {Object.entries(EVIDENCE_GRADE_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        ))}
        {BUY_FIELDS.map((f) => (
          <div className="form-group" key={f.key}>
            <label className="field">{f.label}</label>
            <input
              type="text"
              inputMode="decimal"
              aria-label={f.label}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      {preview && (
        <div className="cf-callout" style={{ marginTop: 4 }}>
          <strong>Derived:</strong> cash saved {formatMoney(preview.derived.cash_saved)} · debt
          reduced {formatMoney(preview.derived.debt_reduction)} · closing net worth{' '}
          {formatMoney(preview.derived.net_worth)} ({formatMoney(preview.bridge.netWorthMovement)}{' '}
          vs {monthLabel(prior.period)}) · operating {formatMoney(preview.bridge.operatingCashAndDebt)}{' '}
          vs market {formatMoney(preview.bridge.marketAndOtherMovement)}
        </div>
      )}

      {err && <p className="form-error">{err}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" disabled={!preview || busy} onClick={save}>
          {busy ? 'Saving…' : existing ? `Save correction to ${monthLabel(period)}` : `Close ${monthLabel(period)}`}
        </button>
        <button className="btn btn-secondary" onClick={onDone} disabled={busy}>
          Cancel
        </button>
      </div>
    </Card>
  );
}
