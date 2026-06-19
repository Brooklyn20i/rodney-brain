// WIN — strategy management.
//
// IMPORTANT (privacy): this file deliberately contains NO confidential strategy
// content. The app is a public static site, so anything shipped in source is
// public. The actual strategy text, targets and initiative names live only in
// the user's private database (loaded at runtime behind auth) — see the
// `__win_strategy__` and `__win_state__` records. Here we keep only stable,
// non-confidential IDs and the shape of the data.

// Stable IDs — generic slugs, safe to ship. Strategy data is keyed by these.
export const PILLAR_IDS = ['negotiation', 'product', 'pricing', 'sustainability', 'efficiency'] as const;
export const KPI_IDS = ['capacity', 'harmonisation', 'automation', 'adoption', 'leadtime'] as const;
export const SHIFT_IDS = ['portfolio', 'value', 'harmonised', 'adoption'] as const;
export type PillarId = typeof PILLAR_IDS[number];
export type KpiId = typeof KPI_IDS[number];
export type ShiftId = typeof SHIFT_IDS[number];

// ── The strategy content (entered by the user, stored privately) ────────────
export interface PillarContent { name: string; detail: string; }
export interface ShiftContent { from: string; to: string; }
export interface KpiContent {
  name: string; proves: string; targetLabel: string;
  target: number | null; baseline?: number; unit?: string; headline?: boolean;
}
export interface StrategyContent {
  title: string; tagline: string; aspiration: string; coreMessage: string; operatingRule: string;
  pillars: Record<string, PillarContent>;
  shifts: Record<string, ShiftContent>;
  kpis: Record<string, KpiContent>;
  order?: string[]; // user-defined ordering of priority (pillar) ids
}

export const emptyStrategy = (): StrategyContent => ({
  title: '', tagline: '', aspiration: '', coreMessage: '', operatingRule: '',
  pillars: {}, shifts: {}, kpis: {}, order: [],
});

// Has the user set up their strategy yet?
export const strategyConfigured = (s: StrategyContent) =>
  !!(s.aspiration?.trim() || Object.keys(s.pillars).length || Object.keys(s.kpis).length);

// Ordered helpers that tolerate missing content
export const pillarList = (s: StrategyContent) =>
  PILLAR_IDS.map((id) => ({ id, ...(s.pillars[id] || { name: '', detail: '' }) })).filter((p) => p.name);
export const kpiList = (s: StrategyContent) =>
  KPI_IDS.map((id) => ({ id, ...(s.kpis[id] || { name: '', proves: '', targetLabel: '', target: null }) })).filter((k) => k.name);
export const shiftList = (s: StrategyContent) =>
  SHIFT_IDS.map((id) => ({ id, ...(s.shifts[id] || { from: '', to: '' }) })).filter((sh) => sh.from || sh.to);
export const getPillar = (s: StrategyContent, id: string) => s.pillars[id];
export const getKpi = (s: StrategyContent, id: string) => s.kpis[id];

// ── Priorities ──────────────────────────────────────────────────────────────
// A "priority" is just a pillar, viewed as a lightweight strategic theme that
// projects are tagged against. Unlike the old fixed-slug pillars, priorities can
// be freely added/renamed/reordered. IDs are random (non-confidential); the name
// lives only in the user's private strategy note.
export interface Priority { id: string; name: string; detail?: string; }

// Ordered list of the user's priorities, honouring their custom order and
// tolerating pillars that predate the `order` array (appended at the end).
export const priorityList = (s: StrategyContent): Priority[] => {
  const order = s.order && s.order.length ? s.order.filter((id) => s.pillars[id]) : [];
  const rest = Object.keys(s.pillars).filter((id) => !order.includes(id));
  return [...order, ...rest]
    .map((id) => ({ id, name: s.pillars[id]?.name || '', detail: s.pillars[id]?.detail }))
    .filter((p) => p.name);
};
export const hasPriorities = (s: StrategyContent) => priorityList(s).length > 0;

// Pure mutations — each returns a new StrategyContent for the synced note.
export const addPriority = (s: StrategyContent, name: string): StrategyContent => {
  const id = uid();
  return { ...s, pillars: { ...s.pillars, [id]: { name: name.trim(), detail: '' } }, order: [...(s.order || Object.keys(s.pillars)), id] };
};
export const renamePriority = (s: StrategyContent, id: string, name: string): StrategyContent =>
  s.pillars[id] ? { ...s, pillars: { ...s.pillars, [id]: { ...s.pillars[id], name: name.trim() } } } : s;
export const removePriority = (s: StrategyContent, id: string): StrategyContent => {
  const pillars = { ...s.pillars }; delete pillars[id];
  return { ...s, pillars, order: (s.order || Object.keys(s.pillars)).filter((x) => x !== id) };
};
export const movePriority = (s: StrategyContent, id: string, dir: -1 | 1): StrategyContent => {
  const order = priorityList(s).map((p) => p.id);
  const i = order.indexOf(id); const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return s;
  [order[i], order[j]] = [order[j], order[i]];
  return { ...s, order };
};

// ── Management layer (initiatives, readings, reviews) — the user's data ──────
export type InitiativeStatus = 'onTrack' | 'atRisk' | 'stalled';
export const STATUS_META: Record<InitiativeStatus, { label: string; dot: string }> = {
  onTrack: { label: 'On track', dot: 'var(--green)' },
  atRisk: { label: 'At risk', dot: 'var(--orange)' },
  stalled: { label: 'Stalled', dot: 'var(--red)' },
};

export interface Initiative {
  id: string; name: string; pillarId: string; kpiIds: string[];
  owner: string; status: InitiativeStatus; nextAction: string;
  stoppedFor: string; createdAt: string;
}
export interface KpiReading { date: string; value: number; }
export interface Review { id: string; date: string; summary: string; }

export interface WinState {
  initiatives: Initiative[];
  readings: Record<string, KpiReading[]>;
  reviews: Review[];
}
export const emptyWinState = (): WinState => ({ initiatives: [], readings: {}, reviews: [] });

export const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);

export const STRATEGY_NOTE_TITLE = '__win_strategy__';
// Read the user's private strategy content out of the synced note (shared by
// WIN and Projects). Returns an empty strategy if not set up / unparseable.
export function readStrategy(notes: { title: string; body: string; updated_at?: string }[]): StrategyContent {
  const note = notes.filter((n) => n.title === STRATEGY_NOTE_TITLE)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))[0];
  if (!note) return emptyStrategy();
  try { return { ...emptyStrategy(), ...JSON.parse(note.body || '{}') }; }
  catch { return emptyStrategy(); }
}
