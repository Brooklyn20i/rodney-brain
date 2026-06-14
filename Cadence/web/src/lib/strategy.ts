// The Commercial Technology Strategy — "Enabling Commercial to WIN".
// Static strategy content lives here (it rarely changes); the live, editable
// numbers (KPI current values, shift progress, initiative→KPI links) are stored
// separately and synced. This keeps the strategy itself version-controlled.

export const WIN_TITLE = 'Commercial Technology Strategy';
export const WIN_TAGLINE = 'Enabling Commercial to WIN';

export const WIN_ASPIRATION =
  'Make Commercial teams more effective and Commercial outcomes stronger through technology, AI, and agentic workflows.';

export const WIN_CORE_MESSAGE =
  'Commercial Technology exists to enable Commercial through technology, AI and better ways of working at scale. The focus is on fixing the basics: the core workflows, data and tools people rely on; better decisions with embedded insight and AI; and moving from manual execution to agentic workflows.';

export const WIN_OPERATING_RULE =
  'No new demand starts unless something else stops. One in, one out — trade-offs are enforced.';

export interface Pillar { id: string; name: string; detail: string; }
export const WIN_PILLARS: Pillar[] = [
  { id: 'negotiation', name: 'Negotiation, tendering & supplier collaboration', detail: 'Direct impact on buying outcomes and commercial performance' },
  { id: 'product', name: 'Product, data & lifecycle management', detail: 'Foundation for range, pricing, quality and transparency' },
  { id: 'pricing', name: 'Pricing, range & performance decisioning', detail: 'Better decisions through usable data and repeatable insight' },
  { id: 'sustainability', name: 'Sustainability & compliance execution', detail: 'Reliable execution of non-financial commitments' },
  { id: 'efficiency', name: 'Internal efficiency & governance overhead', detail: 'Reduce administrative effort and shift capacity to value creation' },
];

export interface Shift { id: string; from: string; to: string; }
export const WIN_SHIFTS: Shift[] = [
  { id: 'portfolio', from: 'Technology as a broad activity portfolio', to: 'A focused portfolio aligned to Commercial outcomes and explicit trade-offs' },
  { id: 'value', from: 'Waiting for platform solutions before delivering value', to: 'Delivering value early while building scalable capability' },
  { id: 'harmonised', from: 'Fragmented local ways of working', to: 'Harmonised priority workflows with sensible flexibility' },
  { id: 'adoption', from: 'Go-live as proof of success', to: 'Adoption, capacity release and faster execution as proof of value' },
];

export interface Kpi {
  id: string; name: string; proves: string; targetLabel: string;
  target: number | null; baseline?: number; unit?: string; headline?: boolean;
}
export const WIN_KPIS: Kpi[] = [
  { id: 'capacity', name: 'Capacity released', proves: 'Time is returned to Commercial', targetLabel: 'Set per named workflow · tracked quarterly', target: null, headline: true },
  { id: 'harmonisation', name: 'Harmonisation', proves: 'Common ways of working are scaling', targetLabel: '70% harmonisation', target: 70, unit: '%' },
  { id: 'automation', name: 'Automation by 2028', proves: 'Manual steps are being removed', targetLabel: '6% → 30% by 2028', target: 30, baseline: 6, unit: '%' },
  { id: 'adoption', name: 'Priority workflow adoption', proves: 'Users are changing how work gets done', targetLabel: '≥70% by 2028', target: 70, unit: '%' },
  { id: 'leadtime', name: 'Lead-time reduction', proves: 'Execution is faster where it matters', targetLabel: '≥50% reduction', target: 50, unit: '%' },
];

// Editable, synced state
export interface WinState {
  shifts: Record<string, number>; // shift id -> progress 0..100
  kpis: Record<string, string>;   // kpi id -> current value (string, may be number or note)
  links: Record<string, string>;  // project id -> kpi id ('' = none)
}
export const emptyWinState = (): WinState => ({ shifts: {}, kpis: {}, links: {} });
