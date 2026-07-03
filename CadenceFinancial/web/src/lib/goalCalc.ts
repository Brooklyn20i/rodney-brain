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
