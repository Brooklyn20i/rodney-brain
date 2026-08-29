// ── CANONICAL TYPE CONTRACT — Cadence Life ────────────────────────────────
// Personal admin as its own system: one-off items (captured → triaged →
// done) and the obligations register (things that come back — BAS, rego,
// insurance, passport). Postgres schema `life` (migrations/0049) must match.
// Derived figures (due status, days out, roll-forward dates) are computed in
// lib/lifeCalc.ts, never stored.

export type LifeItemStatus = 'inbox' | 'open' | 'waiting' | 'done';

export type LifeCategory =
  | 'tax'
  | 'bills'
  | 'travel'
  | 'home'
  | 'vehicles'
  | 'health'
  | 'family'
  | 'admin';

export const LIFE_CATEGORIES: LifeCategory[] = [
  'tax', 'bills', 'travel', 'home', 'vehicles', 'health', 'family', 'admin',
];

export const CATEGORY_LABEL: Record<LifeCategory, string> = {
  tax: 'Tax',
  bills: 'Bills',
  travel: 'Travel',
  home: 'Home',
  vehicles: 'Vehicles',
  health: 'Health admin',
  family: 'Family',
  admin: 'Admin',
};

export const CATEGORY_ICON: Record<LifeCategory, string> = {
  tax: '▤',
  bills: '$',
  travel: '✈',
  home: '⌂',
  vehicles: '⛍',
  health: '♥',
  family: '✦',
  admin: '✎',
};

// A one-off piece of personal admin. Captured into the inbox (from Life
// itself, or flicked across from Work triage), categorized, done. Rows with
// obligation_id are the logged history of an obligation's cycles.
export interface LifeItem {
  id: string;
  owner_id: string;
  title: string;
  notes: string;
  status: LifeItemStatus;
  category: LifeCategory;
  due_date: string | null; // 'YYYY-MM-DD'
  obligation_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// A recurring obligation or renewal. The register stores only the NEXT due
// date and the cycle; ticking one off rolls next_due forward (lifeCalc) and
// logs a history LifeItem — no generated future rows, nothing to sweep.
export interface Obligation {
  id: string;
  owner_id: string;
  name: string;
  category: LifeCategory;
  cadence_months: number; // 1 monthly, 3 quarterly, 12 annual, 120 passport…
  next_due: string; // 'YYYY-MM-DD'
  lead_days: number; // surface on the dashboard this far out
  amount: number | null; // typical cost, optional
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CadenceLifeData {
  life_items: LifeItem[];
  obligations: Obligation[];
}

export const TABLES: (keyof CadenceLifeData)[] = ['life_items', 'obligations'];

export const emptyData = (): CadenceLifeData => ({
  life_items: [],
  obligations: [],
});
