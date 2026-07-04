import { useMemo, useState } from 'react';
import { useCadenceFinancial } from '../lib/store';
import { deriveNewMonth, netWorthBridge, nextPeriod } from '../lib/financeCalc';
import type { NewMonthInputs } from '../lib/financeCalc';
import type { EvidenceGrade, MonthlyMetric } from '../lib/types';
import { EVIDENCE_GRADE_LABEL, formatMoney, monthLabel } from '../lib/util';
import { Card } from './bits';

// Guided replacement for the manual workbook-update ritual: enter closing
// balances as evidenced, the app derives every movement figure from the
// prior month (deriveNewMonth), each line carries an evidence grade, and
// saving writes the monthly_metrics row plus one evidence_items row per
// balance line.

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

export function MonthCloseWizard({ prior, onDone }: { prior: MonthlyMetric; onDone: () => void }) {
  const { insert } = useCadenceFinancial();
  const period = nextPeriod(prior.period);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of BALANCE_FIELDS) v[f.key] = f.carryForward ? String(prior[f.key as keyof MonthlyMetric] ?? 0) : '';
    for (const f of BUY_FIELDS) v[f.key] = '0';
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
      await insert('monthly_metrics', preview.derived);
      for (const f of BALANCE_FIELDS) {
        // Collectibles at zero with no history isn't evidence of anything.
        if (f.key === 'collectibles_value' && num(f.key) === 0) continue;
        await insert('evidence_items', {
          item: f.evidenceItem,
          period,
          grade: grades[f.key],
          status: grades[f.key] === 'stale_carry_forward' ? 'missing' : 'received',
          source: `${monthLabel(period)} month close`,
          notes: '',
        });
      }
      onDone();
    } catch (e: any) {
      setErr(e?.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={`Close ${monthLabel(period)}`}>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
        Enter closing balances as evidenced. Movement figures (cash saved, debt reduction, net
        worth) are derived automatically from {monthLabel(prior.period)}.
      </p>
      <div className="wizard-grid">
        {BALANCE_FIELDS.map((f) => (
          <div className="form-group" key={f.key}>
            <label className="field">{f.label}</label>
            <input
              type="text"
              inputMode="decimal"
              value={values[f.key]}
              placeholder={f.carryForward ? '' : '0.00'}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
            <select
              className="wizard-grade"
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
          {busy ? 'Saving…' : `Close ${monthLabel(period)}`}
        </button>
        <button className="btn btn-secondary" onClick={onDone} disabled={busy}>
          Cancel
        </button>
      </div>
    </Card>
  );
}
