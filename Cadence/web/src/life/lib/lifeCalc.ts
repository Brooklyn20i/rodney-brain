// Pure obligation/date logic for Cadence Life. Everything here is computed
// from raw rows at render time — nothing derived is ever stored.
//
// Date rule (see the UTC-day-drift family of bugs in Financial): "today" and
// all date arithmetic are LOCAL. toISOString() is UTC — which is yesterday
// until ~10-11am in Australia — so it never appears here.

import type { LifeItem, Obligation } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function todayLocalISO(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Local-calendar month add with month-end clamp (Jan 31 + 1mo = Feb 28/29).
export function addMonthsClamped(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const targetMonth = m - 1 + months;
  const year = y + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  const daysInTarget = new Date(year, month + 1, 0).getDate();
  const day = Math.min(d, daysInTarget);
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

// Whole local days from today to `iso` (negative = past).
export function daysUntil(iso: string, todayIso: string): number {
  const [y1, m1, d1] = todayIso.split('-').map(Number);
  const [y2, m2, d2] = iso.split('-').map(Number);
  const a = new Date(y1, m1 - 1, d1);
  const b = new Date(y2, m2 - 1, d2);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

// Where the next cycle lands after ticking an obligation off. Rolls by the
// cadence — repeatedly if the obligation was overdue by more than one cycle
// (a rego paid three months late still renews on its anniversary, not three
// months shifted) — until the result is strictly after today.
export function rollForward(ob: Pick<Obligation, 'next_due' | 'cadence_months'>, todayIso: string): string {
  const cadence = Math.max(1, Math.round(ob.cadence_months));
  let next = addMonthsClamped(ob.next_due, cadence);
  while (next <= todayIso) next = addMonthsClamped(next, cadence);
  return next;
}

export type DueState = 'overdue' | 'due' | 'upcoming';

// 'overdue' past its date; 'due' inside the lead window; 'upcoming' otherwise.
export function dueState(ob: Pick<Obligation, 'next_due' | 'lead_days'>, todayIso: string): DueState {
  const days = daysUntil(ob.next_due, todayIso);
  if (days < 0) return 'overdue';
  if (days <= Math.max(0, ob.lead_days)) return 'due';
  return 'upcoming';
}

// The dashboard's attention list: overdue first, then inside-lead, both by
// date. Upcoming obligations are excluded — a register is not a nag.
export function needsAttention(obligations: Obligation[], todayIso: string): Obligation[] {
  return obligations
    .filter((o) => !o.deleted_at && dueState(o, todayIso) !== 'upcoming')
    .sort((a, b) => a.next_due.localeCompare(b.next_due));
}

// Open one-off items that are overdue or due within `horizonDays`.
export function itemsDueSoon(items: LifeItem[], todayIso: string, horizonDays = 14): LifeItem[] {
  return items
    .filter(
      (i) =>
        !i.deleted_at &&
        (i.status === 'open' || i.status === 'waiting') &&
        i.due_date !== null &&
        daysUntil(i.due_date, todayIso) <= horizonDays
    )
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
}

// Human cycle label for the register.
export function cadenceLabel(cadenceMonths: number): string {
  if (cadenceMonths === 1) return 'Monthly';
  if (cadenceMonths === 3) return 'Quarterly';
  if (cadenceMonths === 6) return 'Half-yearly';
  if (cadenceMonths === 12) return 'Yearly';
  if (cadenceMonths % 12 === 0) return `Every ${cadenceMonths / 12} years`;
  return `Every ${cadenceMonths} months`;
}

// 'Fri, 21 Aug' — noon-anchored so the local calendar day can't drift.
export function fmtDay(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function fmtAmount(amount: number | null): string {
  if (amount == null) return '';
  return `$${Number(amount).toLocaleString('en-AU', { maximumFractionDigits: 0 })}`;
}

// "3 days", "today", "12 days overdue" — the dashboard's plain-language read.
export function dueLabel(iso: string, todayIso: string): string {
  const days = daysUntil(iso, todayIso);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days > 1) return `in ${days} days`;
  if (days === -1) return '1 day overdue';
  return `${-days} days overdue`;
}
