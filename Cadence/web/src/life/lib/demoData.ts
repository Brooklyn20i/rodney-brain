// Seeded demo data for VITE_DEMO builds (marketing shots, local poking).
// Dates are generated RELATIVE to today so the dashboard always shows a
// realistic mix of overdue / due / upcoming, whenever the demo is opened.

import { CadenceLifeData, emptyData } from './types';
import { addMonthsClamped, todayLocalISO } from './lifeCalc';

const pad = (n: number) => String(n).padStart(2, '0');
const shiftDays = (iso: string, days: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};

export function loadDemoData(): CadenceLifeData {
  const data = emptyData();
  const today = todayLocalISO();
  const now = new Date().toISOString();
  const stamp = { owner_id: 'demo-owner', created_at: now, updated_at: now, deleted_at: null };
  let n = 0;
  const id = () => `life-demo-${++n}`;

  data.obligations.push(
    { id: id(), name: 'BAS lodgement', category: 'tax', cadence_months: 3, next_due: shiftDays(today, 6), lead_days: 21, amount: null, notes: 'Lodge via accountant', ...stamp },
    { id: id(), name: 'Car rego — Ranger', category: 'vehicles', cadence_months: 12, next_due: shiftDays(today, -3), lead_days: 30, amount: 890, notes: '', ...stamp },
    { id: id(), name: 'Home insurance renewal', category: 'home', cadence_months: 12, next_due: shiftDays(today, 24), lead_days: 30, amount: 2150, notes: 'Compare before auto-renewal', ...stamp },
    { id: id(), name: 'Passport renewal', category: 'travel', cadence_months: 120, next_due: addMonthsClamped(today, 14), lead_days: 90, amount: 398, notes: '', ...stamp },
    { id: id(), name: 'Health fund review', category: 'health', cadence_months: 12, next_due: addMonthsClamped(today, 7), lead_days: 30, amount: null, notes: '', ...stamp }
  );

  data.life_items.push(
    { id: id(), title: 'Book flights — school holidays', notes: 'Check points balance first', status: 'open', category: 'travel', due_date: shiftDays(today, 9), obligation_id: null, completed_at: null, ...stamp },
    { id: id(), title: 'Send accountant the trust distribution minutes', notes: '', status: 'waiting', category: 'tax', due_date: shiftDays(today, 4), obligation_id: null, completed_at: null, ...stamp },
    { id: id(), title: 'Dispute duplicate charge on Amex', notes: '', status: 'open', category: 'bills', due_date: null, obligation_id: null, completed_at: null, ...stamp },
    { id: id(), title: 'Gutter clean quote', notes: 'From the flyer in the letterbox', status: 'inbox', category: 'admin', due_date: null, obligation_id: null, completed_at: null, ...stamp },
    { id: id(), title: 'Renew Costco membership?', notes: '', status: 'inbox', category: 'admin', due_date: null, obligation_id: null, completed_at: null, ...stamp }
  );

  return data;
}
