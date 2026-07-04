import { useMemo, useState } from 'react';
import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card, Metric } from '../components/bits';
import { annualAmount, monthlyAmount, summarizeBudget } from '../lib/budgetCalc';
import {
  BUDGET_CATEGORY_LABEL,
  BUDGET_EXPENSE_CATEGORIES,
  BUDGET_FREQUENCY_LABEL,
  BUDGET_INCOME_CATEGORIES,
  formatMoney,
  formatPercent,
} from '../lib/util';
import type { BudgetFrequency, BudgetKind, BudgetLine } from '../lib/types';

const num = (s: string) => Number(s.replace(/[^0-9.-]/g, '')) || 0;
const FREQUENCIES: BudgetFrequency[] = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'annual'];

// The macro budget: income streams in, recurring payments out, free cash the
// bottom line. A plan Rodney sets, distinct from Month Close (actuals) and the
// Free Cash Engine (which reads actuals). Everything is stored per-line with a
// frequency; the screen shows a normalised monthly or annual view.
export function Budget({ onMenu }: { onMenu: () => void }) {
  const { data, insert, update, remove } = useCadenceFinancial();
  const [view, setView] = useState<'monthly' | 'annual'>('monthly');

  const lines = useMemo(
    () => [...data.budget_lines].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
    [data.budget_lines]
  );
  const summary = useMemo(() => summarizeBudget(data.budget_lines), [data.budget_lines]);
  const income = lines.filter((l) => l.kind === 'income');
  const expenses = lines.filter((l) => l.kind === 'expense');

  const perView = (line: BudgetLine) => (view === 'monthly' ? monthlyAmount(line) : annualAmount(line));
  const freeCash = view === 'monthly' ? summary.monthlyFreeCash : summary.annualFreeCash;
  const totalIncome = view === 'monthly' ? summary.monthlyIncome : summary.annualIncome;
  const totalExpenses = view === 'monthly' ? summary.monthlyExpenses : summary.annualExpenses;

  const addLine = async (kind: BudgetKind) => {
    const cats = kind === 'income' ? BUDGET_INCOME_CATEGORIES : BUDGET_EXPENSE_CATEGORIES;
    await insert('budget_lines', {
      kind,
      category: cats[0].key,
      label: '',
      amount: 0,
      frequency: 'monthly',
      active: true,
      sort_order: lines.length,
      notes: '',
    });
  };

  const section = (kind: BudgetKind, rows: BudgetLine[]) => {
    const cats = kind === 'income' ? BUDGET_INCOME_CATEGORIES : BUDGET_EXPENSE_CATEGORIES;
    const total = kind === 'income' ? totalIncome : totalExpenses;
    return (
      <Card title={kind === 'income' ? 'Income in' : 'Payments out'}>
        {rows.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 10px' }}>
            {kind === 'income'
              ? 'Add your income streams — salary, rent received, interest, dividends.'
              : 'Add your recurring payments — mortgage, credit cards, rent, bills.'}
          </p>
        )}
        {rows.map((l) => (
          <div key={l.id} className={`bg-row ${!l.active ? 'bg-row-off' : ''}`}>
            <input
              className="bg-label"
              type="text"
              defaultValue={l.label}
              placeholder={BUDGET_CATEGORY_LABEL[l.category] ?? 'Label'}
              onBlur={(e) => e.target.value !== l.label && update('budget_lines', l.id, { label: e.target.value })}
            />
            <select
              className="bg-cat"
              value={l.category}
              onChange={(e) => update('budget_lines', l.id, { category: e.target.value })}
            >
              {cats.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            <div className="bg-amount">
              <span className="bg-amount-prefix">A$</span>
              <input
                type="text"
                inputMode="decimal"
                defaultValue={l.amount ? String(l.amount) : ''}
                placeholder="0"
                onBlur={(e) => {
                  const v = num(e.target.value);
                  if (v !== Number(l.amount)) update('budget_lines', l.id, { amount: v });
                }}
              />
            </div>
            <select
              className="bg-freq"
              value={l.frequency}
              onChange={(e) => update('budget_lines', l.id, { frequency: e.target.value as BudgetFrequency })}
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {BUDGET_FREQUENCY_LABEL[f]}
                </option>
              ))}
            </select>
            <span className="bg-normalised" title={`${view} equivalent`}>
              {formatMoney(perView(l))}
            </span>
            <button
              className={`bg-toggle ${l.active ? 'on' : ''}`}
              title={l.active ? 'Included — tap to pause' : 'Paused — tap to include'}
              aria-label={l.active ? 'Pause this line' : 'Include this line'}
              onClick={() => update('budget_lines', l.id, { active: !l.active })}
            >
              {l.active ? '✓' : '○'}
            </button>
            <button className="bg-del" aria-label="Delete line" onClick={() => remove('budget_lines', l.id)}>
              ✕
            </button>
          </div>
        ))}
        <div className="bg-section-foot">
          <button className="btn btn-secondary btn-sm" onClick={() => addLine(kind)}>
            + Add {kind === 'income' ? 'income' : 'payment'}
          </button>
          <span className="bg-section-total">
            {view === 'monthly' ? 'Monthly' : 'Annual'} {kind === 'income' ? 'income' : 'payments'}:{' '}
            <strong>{formatMoney(total)}</strong>
          </span>
        </div>
      </Card>
    );
  };

  return (
    <>
      <ScreenHeader
        title="Budget"
        subtitle="Income in, payments out, free cash — your recurring plan."
        onMenu={onMenu}
      >
        <div className="bg-view-toggle">
          <button className={view === 'monthly' ? 'active' : ''} onClick={() => setView('monthly')}>
            Monthly
          </button>
          <button className={view === 'annual' ? 'active' : ''} onClick={() => setView('annual')}>
            Annual
          </button>
        </div>
      </ScreenHeader>
      <div className="screen-content">
        <div className="cf-metric-grid">
          <Metric label={`Income (${view})`} value={formatMoney(totalIncome, true)} tone="neutral" />
          <Metric label={`Payments (${view})`} value={formatMoney(totalExpenses, true)} tone="neutral" />
          <Metric
            label={`Free cash (${view})`}
            value={formatMoney(freeCash, true)}
            delta={freeCash >= 0 ? 'surplus' : 'shortfall'}
            tone={freeCash >= 0 ? 'good' : 'bad'}
          />
          <Metric
            label="Savings rate"
            value={summary.monthlyIncome > 0 ? formatPercent(summary.savingsRate) : '—'}
            delta="free cash ÷ income"
            tone={summary.savingsRate >= 0.2 ? 'good' : summary.savingsRate >= 0 ? 'neutral' : 'bad'}
          />
        </div>

        {data.budget_lines.length === 0 && (
          <Card>
            <p style={{ fontSize: 14, margin: 0 }}>
              Build your macro budget: add what comes <strong>in</strong> (salary, rent, interest, dividends)
              and what goes <strong>out</strong> (mortgage, credit cards, rent, bills). Cadence normalises
              every line to a monthly or annual view and shows your free cash — the surplus you have to save,
              invest or pay down debt.
            </p>
          </Card>
        )}

        {section('income', income)}
        {section('expense', expenses)}

        <Card title={`Free cash — ${view}`}>
          <div className="cf-table-wrap">
            <table className="cf-table">
              <tbody>
                <tr>
                  <td>Total income in</td>
                  <td style={{ textAlign: 'right' }}>{formatMoney(totalIncome)}</td>
                </tr>
                <tr>
                  <td>Total payments out</td>
                  <td style={{ textAlign: 'right' }}>−{formatMoney(totalExpenses)}</td>
                </tr>
                <tr className="cf-total">
                  <td>Free cash</td>
                  <td style={{ textAlign: 'right', color: freeCash >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {formatMoney(freeCash)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 10 }}>
            {freeCash >= 0
              ? `You're planning to keep ${formatMoney(freeCash)} a ${view === 'monthly' ? 'month' : 'year'} — that's the fuel the Free Cash Engine deploys into savings, investments and debt reduction.`
              : `This plan spends ${formatMoney(-freeCash)} a ${view === 'monthly' ? 'month' : 'year'} more than it earns. Trim payments or add income to get back to surplus.`}
          </p>
        </Card>

        {summary.expenseByCategory.length > 0 && (
          <Card title="Where the money goes (monthly)">
            {summary.expenseByCategory.map((c) => {
              const pct = summary.monthlyExpenses > 0 ? (c.monthly / summary.monthlyExpenses) * 100 : 0;
              return (
                <div className="cf-bar-row" key={c.category}>
                  <div className="cf-bar-label">{BUDGET_CATEGORY_LABEL[c.category] ?? c.category}</div>
                  <div className="cf-bar-track">
                    <div className="cf-bar-fill" style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                  <div className="cf-bar-value">{formatMoney(c.monthly)}</div>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </>
  );
}
