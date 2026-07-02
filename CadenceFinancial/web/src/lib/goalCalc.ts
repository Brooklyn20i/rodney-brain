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
//                      zero market assumption. This is the floor.
//   with growth     -- the same contributions plus the goal's stated annual
//                      growth assumption compounding on the balance. This is
//                      a planning input, not a forecast.
//
// Pure functions, integer-cents arithmetic (see financeCalc.ts). Nothing
// here is ever stored back to a row.

import type { Goal, MonthlyMetric } from './types';
import { summarizePeriod, toCents } from './financeCalc';

const MAX_MONTHS = 1200; // 100 years; beyond this we report "not on current pace"

export interface RunwayResult {
  // Fraction of the target already reached (1 = achieved). 0 when target is 0.
  progressFraction: number;
  // Months until the target is reached at trailing operating pace, no growth.
  // null = never reaches on current pace (or already reached => 0).
  monthsOperatingOnly: number | null;
  // Months until the target is reached with the goal's growth assumption.
  monthsWithGrowth: number | null;
  // The trailing all-in monthly operating average used for the projection.
  monthlyOperatingAverage: number;
  // How many trailing months the average was taken over.
  trailingMonths: number;
}

// Months for balanceC to reach targetC with a fixed monthly contribution and
// a monthly compounding rate. Iterative on purpose: an explicit month loop in
// cents is auditable against a spreadsheet, unlike a closed-form log() whose
// rounding can differ. Contribution is credited after growth each month.
function monthsToTarget(
  balanceC: number,
  targetC: number,
  monthlyContributionC: number,
  monthlyRate: number
): number | null {
  if (balanceC >= targetC) return 0;
  let bal = balanceC;
  for (let month = 1; month <= MAX_MONTHS; month++) {
    bal = Math.round(bal * (1 + monthlyRate)) + monthlyContributionC;
    if (bal >= targetC) return month;
    // A shrinking balance with non-positive contributions can never recover.
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

  return {
    progressFraction: targetC > 0 ? nwC / targetC : 0,
    monthsOperatingOnly: monthsToTarget(nwC, targetC, contributionC, 0),
    monthsWithGrowth: monthsToTarget(
      nwC,
      targetC,
      contributionC,
      annualToMonthlyRate(goal.assumed_growth_rate)
    ),
    monthlyOperatingAverage: summary.allInMonthlyAverage,
    trailingMonths: trailing.length,
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
