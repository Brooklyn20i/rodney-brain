import { useMemo, useState } from 'react';
import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card, Metric } from '../components/bits';
import {
  fxLookup,
  fyLabel,
  fyMonths,
  fyStartYearOf,
  monthlyNativeAmount,
  summarizeFY,
  summarizeMonth,
  unratedCurrencies,
} from '../lib/budgetCalc';
import {
  BUDGET_CURRENCIES,
  BUDGET_CATEGORY_LABEL,
  BUDGET_EXPENSE_CATEGORIES,
  BUDGET_FREQUENCY_LABEL,
  BUDGET_INCOME_CATEGORIES,
  currentMonth,
  formatMoney,
  formatPercent,
  monthShort,
} from '../lib/util';
import type { BudgetFrequency, BudgetKind, BudgetLine } from '../lib/types';

const num = (s: string) => Number(s.replace(/[^0-9.-]/g, '')) || 0;
const FREQUENCIES: BudgetFrequency[] = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'annual', 'one_off'];
const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'custom';

// The macro budget: a per-month plan over the Australian financial year
// (1 Jul → 30 Jun), rolled up to an annual view. Income streams in, recurring
// payments out, free cash the bottom line — converted to an AUD base so EUR
// income and AUD rent net correctly.
export function Budget({ onMenu }: { onMenu: () => void }) {
  const { data, insert, update, remove } = useCadenceFinancial();

  const thisMonth = currentMonth();
  const [fyStart, setFyStart] = useState(() => fyStartYearOf(thisMonth));
  const monthsOfFy = useMemo(() => fyMonths(fyStart), [fyStart]);
  // Selected month defaults to the current month if it's in this FY, else July.
  const [month, setMonth] = useState(() => (monthsOfFy.includes(thisMonth) ? thisMonth : monthsOfFy[0]));
  const [tab, setTab] = useState<'month' | 'year'>('month');

  // Keep the selected month valid when the FY changes.
  const selMonth = monthsOfFy.includes(month) ? month : monthsOfFy[0];

  const rates = useMemo(() => fxLookup(data.budget_fx_rates), [data.budget_fx_rates]);
  const lines = useMemo(
    () => [...data.budget_lines].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
    [data.budget_lines]
  );
  const income = lines.filter((l) => l.kind === 'income');
  const expenses = lines.filter((l) => l.kind === 'expense');
  const monthSummary = useMemo(() => summarizeMonth(data.budget_lines, rates, selMonth), [data.budget_lines, rates, selMonth]);
  const fy = useMemo(() => summarizeFY(data.budget_lines, rates, fyStart), [data.budget_lines, rates, fyStart]);
  const unrated = useMemo(() => unratedCurrencies(data.budget_lines, rates), [data.budget_lines, rates]);

  // Category options: built-ins ∪ owner-added, per kind.
  const categoriesFor = (kind: BudgetKind) => {
    const builtin = kind === 'income' ? BUDGET_INCOME_CATEGORIES : BUDGET_EXPENSE_CATEGORIES;
    const custom = data.budget_categories
      .filter((c) => c.kind === kind && !c.deleted_at)
      .map((c) => ({ key: c.key, label: c.label }));
    const seen = new Set(builtin.map((b) => b.key));
    return [...builtin, ...custom.filter((c) => !seen.has(c.key))];
  };
  const catLabel = (key: string) =>
    data.budget_categories.find((c) => c.key === key && !c.deleted_at)?.label ?? BUDGET_CATEGORY_LABEL[key] ?? key;

  const addLine = async (kind: BudgetKind) => {
    const cats = categoriesFor(kind);
    await insert('budget_lines', {
      kind,
      category: cats[0].key,
      label: '',
      amount: 0,
      currency: 'AUD',
      frequency: 'monthly',
      start_month: null,
      end_month: null,
      active: true,
      sort_order: lines.length,
      notes: '',
    });
  };

  const addCategory = async (kind: BudgetKind) => {
    const label = window.prompt(`New ${kind} category name`)?.trim();
    if (!label) return;
    const key = slug(label);
    if (categoriesFor(kind).some((c) => c.key === key)) return;
    await insert('budget_categories', { kind, key, label, sort_order: data.budget_categories.length });
  };

  const setRate = async (currency: string, value: string) => {
    const rate = num(value);
    if (rate <= 0) return; // a 0/negative rate would zero out the currency's lines
    const existing = data.budget_fx_rates.find((r) => r.currency === currency && !r.deleted_at);
    if (existing) await update('budget_fx_rates', existing.id, { rate_to_aud: rate });
    else await insert('budget_fx_rates', { currency, rate_to_aud: rate });
  };

  const [advancedFor, setAdvancedFor] = useState<string | null>(null);

  const lineRow = (l: BudgetLine) => {
    const cats = categoriesFor(l.kind);
    const native = monthlyNativeAmount(l, selMonth);
    const isForeign = (l.currency || 'AUD') !== 'AUD';
    return (
      <div key={l.id} className={`bg-row ${!l.active ? 'bg-row-off' : ''}`}>
        <input
          className="bg-label"
          type="text"
          defaultValue={l.label}
          placeholder={catLabel(l.category)}
          onBlur={(e) => e.target.value !== l.label && update('budget_lines', l.id, { label: e.target.value })}
        />
        <select className="bg-cat" value={l.category} onChange={(e) => update('budget_lines', l.id, { category: e.target.value })}>
          {cats.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
          {!cats.some((c) => c.key === l.category) && <option value={l.category}>{catLabel(l.category)}</option>}
        </select>
        <div className="bg-amount">
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
          className="bg-cur"
          value={l.currency || 'AUD'}
          onChange={(e) => update('budget_lines', l.id, { currency: e.target.value })}
        >
          {BUDGET_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          className="bg-freq"
          value={l.frequency}
          onChange={(e) => {
            const f = e.target.value as BudgetFrequency;
            // A one-off needs an anchor month; default it to the selected month.
            update('budget_lines', l.id, f === 'one_off' && !l.start_month ? { frequency: f, start_month: selMonth } : { frequency: f });
          }}
        >
          {FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {BUDGET_FREQUENCY_LABEL[f]}
            </option>
          ))}
        </select>
        <span className="bg-normalised" title={`${monthShort(selMonth, true)} — ${l.frequency === 'one_off' ? 'one-off' : 'per month'}`}>
          {native
            ? isForeign
              ? `${native.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${l.currency}`
              : formatMoney(native)
            : '—'}
        </span>
        <button
          className={`bg-toggle ${l.active ? 'on' : ''}`}
          title={l.active ? 'Included — tap to pause' : 'Paused — tap to include'}
          onClick={() => update('budget_lines', l.id, { active: !l.active })}
        >
          {l.active ? '✓' : '○'}
        </button>
        <button
          className={`bg-adv ${advancedFor === l.id ? 'on' : ''}`}
          title="Limit to specific months"
          onClick={() => setAdvancedFor(advancedFor === l.id ? null : l.id)}
        >
          ⋯
        </button>
        <button className="bg-del" aria-label="Delete line" onClick={() => remove('budget_lines', l.id)}>
          ✕
        </button>
        {advancedFor === l.id && (
          <div className="bg-window">
            <span className="bg-window-lbl">{l.frequency === 'one_off' ? 'In month' : 'Only between'}</span>
            <input
              type="month"
              value={l.start_month ?? ''}
              onChange={(e) => update('budget_lines', l.id, { start_month: e.target.value || null })}
            />
            {l.frequency !== 'one_off' && (
              <>
                <span>→</span>
                <input
                  type="month"
                  value={l.end_month ?? ''}
                  onChange={(e) => update('budget_lines', l.id, { end_month: e.target.value || null })}
                />
              </>
            )}
            <span className="bg-window-note">
              {l.frequency === 'one_off' ? 'the whole amount lands here' : 'blank = every month'}
            </span>
          </div>
        )}
      </div>
    );
  };

  const section = (kind: BudgetKind, rows: BudgetLine[]) => {
    const total = kind === 'income' ? monthSummary.incomeAud : monthSummary.expensesAud;
    return (
      <Card title={kind === 'income' ? 'Income in' : 'Payments out'}>
        {rows.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 10px' }}>
            {kind === 'income'
              ? 'Add your income streams — salary, rent received, interest, dividends.'
              : 'Add your recurring payments — mortgage, credit cards, rent, bills.'}
          </p>
        )}
        {rows.map(lineRow)}
        <div className="bg-section-foot">
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => addLine(kind)}>
              + Add {kind === 'income' ? 'income' : 'payment'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => addCategory(kind)}>
              + Category
            </button>
          </div>
          <span className="bg-section-total">
            {monthShort(selMonth, true)} {kind === 'income' ? 'income' : 'payments'}: <strong>{formatMoney(total)}</strong>
          </span>
        </div>
      </Card>
    );
  };

  return (
    <>
      <ScreenHeader title="Budget" subtitle="Monthly plan across the AU financial year, in AUD." onMenu={onMenu}>
        <div className="bg-view-toggle">
          <button className={tab === 'month' ? 'active' : ''} onClick={() => setTab('month')}>
            Month
          </button>
          <button className={tab === 'year' ? 'active' : ''} onClick={() => setTab('year')}>
            Year
          </button>
        </div>
      </ScreenHeader>
      <div className="screen-content">
        <div className="bg-period">
          <button className="btn btn-secondary btn-sm" onClick={() => setFyStart(fyStart - 1)}>
            ←
          </button>
          <span className="bg-fy">{fyLabel(fyStart)}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setFyStart(fyStart + 1)}>
            →
          </button>
          {tab === 'month' && (
            <select className="bg-month-select" value={selMonth} onChange={(e) => setMonth(e.target.value)}>
              {monthsOfFy.map((m) => (
                <option key={m} value={m}>
                  {monthShort(m, true)}
                </option>
              ))}
            </select>
          )}
        </div>

        {unrated.length > 0 && (
          <Card className="bg-warn-card">
            <p style={{ fontSize: 13, margin: 0 }}>
              ⚠ Set your conversion rate for <strong>{unrated.join(', ')}</strong> below so AUD totals are correct — until
              then these are counted at 1:1.
            </p>
          </Card>
        )}

        {tab === 'month' ? (
          <>
            <div className="cf-metric-grid">
              <Metric label="Income" value={formatMoney(monthSummary.incomeAud, true)} tone="neutral" />
              <Metric label="Payments" value={formatMoney(monthSummary.expensesAud, true)} tone="neutral" />
              <Metric
                label="Free cash"
                value={formatMoney(monthSummary.freeCashAud, true)}
                delta={monthSummary.freeCashAud >= 0 ? 'surplus' : 'shortfall'}
                tone={monthSummary.freeCashAud >= 0 ? 'good' : 'bad'}
              />
              <Metric label={monthShort(selMonth, true)} value={monthShort(selMonth)} delta="all figures in AUD" tone="neutral" />
            </div>

            {data.budget_lines.length === 0 && (
              <Card>
                <p style={{ fontSize: 14, margin: 0 }}>
                  Build your macro budget: add what comes <strong>in</strong> (salary, rent, interest, dividends) and what
                  goes <strong>out</strong> (mortgage, credit cards, rent, bills). Set each line's currency and how often it
                  recurs; Cadence converts everything to AUD and shows this month's free cash, then builds the whole
                  financial year.
                </p>
              </Card>
            )}

            {section('income', income)}
            {section('expense', expenses)}
          </>
        ) : (
          <Card title={`${fyLabel(fyStart)} — month by month (AUD)`}>
            <div className="cf-table-wrap">
              <table className="cf-table bg-year-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th style={{ textAlign: 'right' }}>Income</th>
                    <th style={{ textAlign: 'right' }}>Payments</th>
                    <th style={{ textAlign: 'right' }}>Free cash</th>
                  </tr>
                </thead>
                <tbody>
                  {fy.months.map((m) => (
                    <tr
                      key={m.month}
                      className="bg-year-row"
                      onClick={() => {
                        setMonth(m.month);
                        setTab('month');
                      }}
                    >
                      <td>{monthShort(m.month, true)}</td>
                      <td style={{ textAlign: 'right' }}>{formatMoney(m.incomeAud)}</td>
                      <td style={{ textAlign: 'right' }}>{formatMoney(m.expensesAud)}</td>
                      <td style={{ textAlign: 'right', color: m.freeCashAud >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {formatMoney(m.freeCashAud)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="cf-total">
                    <td>{fyLabel(fyStart)} total</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(fy.totalIncomeAud)}</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(fy.totalExpensesAud)}</td>
                    <td style={{ textAlign: 'right', color: fy.totalFreeCashAud >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {formatMoney(fy.totalFreeCashAud)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="cf-metric-grid" style={{ marginTop: 14 }}>
              <Metric label="FY free cash" value={formatMoney(fy.totalFreeCashAud, true)} tone={fy.totalFreeCashAud >= 0 ? 'good' : 'bad'} />
              <Metric label="FY income" value={formatMoney(fy.totalIncomeAud, true)} tone="neutral" />
              <Metric label="FY payments" value={formatMoney(fy.totalExpensesAud, true)} tone="neutral" />
              <Metric
                label="Savings rate"
                value={fy.totalIncomeAud > 0 ? formatPercent(fy.savingsRate) : '—'}
                delta="free cash ÷ income"
                tone={fy.savingsRate >= 0.2 ? 'good' : fy.savingsRate >= 0 ? 'neutral' : 'bad'}
              />
            </div>
            <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 10 }}>Tap any month to open and edit it.</p>
          </Card>
        )}

        <Card title="Currency conversion (to AUD)">
          <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 10px' }}>
            AUD is the base. Set the rate for each currency you earn or spend in — e.g. how many AUD one EUR is worth.
          </p>
          {BUDGET_CURRENCIES.filter((c) => c !== 'AUD').map((c) => {
            const row = data.budget_fx_rates.find((r) => r.currency === c && !r.deleted_at);
            const used = data.budget_lines.some((l) => (l.currency || 'AUD') === c && !l.deleted_at);
            if (!row && !used) return null;
            return (
              <div key={c} className="bg-fx-row">
                <span className="bg-fx-cur">
                  1 {c} ={used && !row ? ' ⚠' : ''}
                </span>
                <div className="bg-amount" style={{ maxWidth: 160 }}>
                  <span className="bg-amount-prefix">A$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    defaultValue={row ? String(Number(row.rate_to_aud)) : ''}
                    placeholder="0.00"
                    onBlur={(e) => e.target.value && setRate(c, e.target.value)}
                  />
                </div>
                {used && <span className="bg-fx-used">used by your budget</span>}
              </div>
            );
          })}
          {!data.budget_lines.some((l) => (l.currency || 'AUD') !== 'AUD') && (
            <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0 }}>
              No foreign-currency lines yet. Set a line's currency to EUR/USD/etc. and its rate appears here.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
