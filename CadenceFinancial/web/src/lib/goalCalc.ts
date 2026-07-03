// Goal runway math.
//
// Answers the question the workbook never could ("no defined objective" was
// its own top strategy-lane finding): given where net worth is today and
// what the operating engine actually produces per month, when does the
// stated target arrive?
//
// Two scenarios, deliberately kept separate so the honest one is never
// hidden behind an assumption:
//   operating-only  -- contributions at the actual trailing monthly pace,
//                      zero market assumption anywhere. This is the floor.
//   with growth     -- the same contributions, PLUS the goal's stated
//                      annual growth assumption compounding on the assets
//                      already actively managed (shares, BTC, super). Cash
//                      and property equity are carried flat in both
//                      scenarios: cash doesn't compound, and property
//                      appreciation is a separate, uncertain assumption
//                      this app deliberately doesn't fold into runway math
//                      (it shows up as market movement in Performance
//                      instead). This is a planning input, not a forecast.
//
// Pure functions, integer-cents arithmetic (see financeCalc.ts). Nothing
// here is ever stored back to a row.

import type { Goal, MonthlyMetric } from './types';
import { centsToDollars, summarizePeriod, toCents } from './financeCalc';

const MAX_MONTHS = 1200; // 100 years; beyond this we report "not on current pace"

export interface RunwayResult {
  // Fraction of the target already reached (1 = achieved). 0 when target is 0.
  progressFraction: number;
  // Months until the target is reached at trailing operating pace, no growth.
  // null = never reaches on current pace (or already reached => 0).
  monthsOperatingOnly: number | null;
  // Months until the target is reached with the goal's growth assumption
  // applied to already-managed assets (shares + BTC + super) only.
  monthsWithGrowth: number | null;
  // The trailing all-in monthly operating average used for the projection.
  monthlyOperatingAverage: number;
  // How many trailing months the average was taken over.
  trailingMonths: number;
  // Current value of shares + BTC + super -- the pool the growth assumption
  // actually compounds. Shown so the split is never a black box.
  managedAssets: number;
}

// Months for the target to be reached, where only managedC compounds at
// monthlyRate and otherC (cash, property equity, collectibles) is carried
// flat -- new contributions land in otherC each month. Iterative on
// purpose: an explicit month loop in cents is auditable against a
// spreadsheet, unlike a closed-form log() whose rounding can differ.
function monthsToTarget(
  managedC: number,
  otherC: number,
  targetC: number,
  monthlyContributionC: number,
  monthlyRate: number
): number | null {
  let managed = managedC;
  let other = otherC;
  if (managed + other >= targetC) return 0;
  for (let month = 1; month <= MAX_MONTHS; month++) {
    managed = Math.round(managed * (1 + monthlyRate));
    other += monthlyContributionC;
    if (managed + other >= targetC) return month;
    // A shrinking total with no growth and no positive contribution can
    // never recover.
    if (monthlyRate <= 0 && monthlyContributionC <= 0) return null;
  }
  return null;
}

export function annualToMonthlyRate(annual: number): number {
  return Math.pow(1 + annual, 1 / 12) - 1;
}

// trailingWindow: how many most-recent months to average the operating pace
// over. Uses the all-in surplus (cash saved + investment buys + debt
// principal reduction) -- everything the owner directly controls.
export function computeRunway(
  goal: Goal,
  months: MonthlyMetric[],
  trailingWindow = 6
): RunwayResult | null {
  if (months.length === 0) return null;
  const sorted = [...months].sort((a, b) => a.period.localeCompare(b.period));
  const trailing = sorted.slice(-trailingWindow);
  const summary = summarizePeriod(
    trailing,
    trailing[0].period,
    trailing[trailing.length - 1].period
  );

  const latest = sorted[sorted.length - 1];
  const nwC = toCents(latest.net_worth);
  const targetC = toCents(goal.target_net_worth);
  const contributionC = toCents(summary.allInMonthlyAverage);
  const managedC = toCents(latest.shares) + toCents(latest.btc_crypto) + toCents(latest.super_balance);
  const otherC = nwC - managedC;

  return {
    progressFraction: targetC > 0 ? nwC / targetC : 0,
    monthsOperatingOnly: monthsToTarget(managedC, otherC, targetC, contributionC, 0),
    monthsWithGrowth: monthsToTarget(
      managedC,
      otherC,
      targetC,
      contributionC,
      annualToMonthlyRate(goal.assumed_growth_rate)
    ),
    monthlyOperatingAverage: summary.allInMonthlyAverage,
    trailingMonths: trailing.length,
    managedAssets: centsToDollars(managedC),
  };
}

// 'today + n months' -> 'Mon YYYY' label input ('YYYY-MM'). Kept here (not
// util.ts) because it's only meaningful next to runway output.
export function periodAfterMonths(fromPeriod: string, months: number): string {
  const [y, m] = fromPeriod.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

// ── What-if scenario engine ─────────────────────────────────────────────
// Full-balance-sheet projection with a separate growth assumption per asset
// class -- including property, compounding on the full property VALUE while
// debt is carried flat, so the leveraged-equity effect is captured (5%
// growth on a mortgaged property grows equity much faster than 5%). The
// monthly operating contribution is added flat on top, same basis as the
// runway floor. Every rate here is an owner-stated planning input, not a
// forecast; the UI never persists these -- it's a sandbox.

export type WhatIfClass = 'cash' | 'property' | 'shares' | 'btc' | 'super' | 'collectibles';

export const WHAT_IF_CLASSES: WhatIfClass[] = [
  'cash',
  'property',
  'shares',
  'btc',
  'super',
  'collectibles',
];

export interface WhatIfInputs {
  targetNetWorth: number;
  // Flat monthly addition to net worth (savings + buys + debt paydown pace).
  monthlyContribution: number;
  // Annual growth assumption per asset class (0.05 = 5%/yr). Missing = 0.
  rates: Partial<Record<WhatIfClass, number>>;
}

export interface WhatIfMilestone {
  months: number;
  netWorth: number;
}

export interface WhatIfResult {
  // First month projected net worth >= target (0 = already there),
  // null = not within 100 years on these assumptions.
  monthsToTarget: number | null;
  // Projected net worth at fixed horizons, for a sanity-check table.
  milestones: WhatIfMilestone[];
  startingNetWorth: number;
}

const MILESTONE_MONTHS = [12, 36, 60, 120, 240];

export function projectWhatIf(latest: MonthlyMetric, inputs: WhatIfInputs): WhatIfResult {
  const balances: Record<WhatIfClass, number> = {
    cash: toCents(latest.cash_offsets),
    property: toCents(latest.property_value),
    shares: toCents(latest.shares),
    btc: toCents(latest.btc_crypto),
    super: toCents(latest.super_balance),
    collectibles: toCents(latest.collectibles_value),
  };
  const monthlyRates: Record<WhatIfClass, number> = {} as Record<WhatIfClass, number>;
  for (const cls of WHAT_IF_CLASSES) {
    monthlyRates[cls] = annualToMonthlyRate(inputs.rates[cls] ?? 0);
  }

  const debtC = toCents(latest.total_debt);
  const contributionC = toCents(inputs.monthlyContribution);
  const targetC = toCents(inputs.targetNetWorth);

  const netWorthAt = () =>
    WHAT_IF_CLASSES.reduce((s, cls) => s + balances[cls], 0) - debtC;

  let contributedC = 0;
  let monthsToTarget: number | null = netWorthAt() >= targetC ? 0 : null;
  const milestones: WhatIfMilestone[] = [];
  const startingNetWorth = centsToDollars(netWorthAt());

  for (let month = 1; month <= MAX_MONTHS; month++) {
    for (const cls of WHAT_IF_CLASSES) {
      balances[cls] = Math.round(balances[cls] * (1 + monthlyRates[cls]));
    }
    contributedC += contributionC;
    const nwC = netWorthAt() + contributedC;
    if (monthsToTarget === null && nwC >= targetC) monthsToTarget = month;
    if (MILESTONE_MONTHS.includes(month)) {
      milestones.push({ months: month, netWorth: centsToDollars(nwC) });
    }
    if (month >= Math.max(...MILESTONE_MONTHS) && monthsToTarget !== null) break;
  }

  return { monthsToTarget, milestones, startingNetWorth };
}

// The trailing operating pace used to prefill the what-if contribution --
// same 6-month all-in average the runway floor uses.
export function trailingOperatingAverage(months: MonthlyMetric[], trailingWindow = 6): number {
  if (months.length === 0) return 0;
  const sorted = [...months].sort((a, b) => a.period.localeCompare(b.period));
  const trailing = sorted.slice(-trailingWindow);
  return summarizePeriod(trailing, trailing[0].period, trailing[trailing.length - 1].period)
    .allInMonthlyAverage;
}
