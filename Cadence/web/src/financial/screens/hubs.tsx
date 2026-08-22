import { useState } from 'react';
import { ScreenHeader } from '../components/bits';
import { OverviewPulseView } from './Overview';
import { BridgeView } from './NetWorthBridge';
import { PerformanceView } from './Performance';
import { AllocationView } from './AssetAllocation';
import { GoalsView } from './Goals';
import { BudgetView } from './Budget';
import { FreeCashView } from './FreeCashEngine';
import { RiskDashboardView } from './RiskDashboard';
import { StressTestsView } from './StressTests';
import { ProtectionView } from './Protection';

// The consolidation hubs. Cadence Financial grew screen-by-screen until the
// same numbers lived on five surfaces; these hubs give each QUESTION one
// screen with a segmented switcher (the Projects-toolbar pattern), instead of
// a sidebar entry per calculation. Old screen ids still deep-link — App.tsx
// routes them here with the matching initial view — so nothing that navigated
// to 'performance' or 'evidence' breaks.

function HubSeg<V extends string>({ views, view, onPick }: {
  views: { key: V; label: string }[];
  view: V;
  onPick: (v: V) => void;
}) {
  return (
    <div className="hub-toolbar">
      <div className="hub-seg-group">
        {views.map((v) => (
          <button key={v.key} className={`hub-seg ${view === v.key ? 'active' : ''}`} onClick={() => onPick(v.key)}>
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Overview: the monthly story, one screen ────────────────────────────────
export type OverviewView = 'pulse' | 'bridge' | 'performance' | 'allocation' | 'goals';
const OVERVIEW_VIEWS: { key: OverviewView; label: string }[] = [
  { key: 'pulse', label: 'Pulse' },
  { key: 'bridge', label: 'Net worth bridge' },
  { key: 'performance', label: 'Performance' },
  { key: 'allocation', label: 'Allocation' },
  { key: 'goals', label: 'Goals & runway' },
];

export function OverviewHub({ onMenu, onNavigate, initialView = 'pulse' }: {
  onMenu: () => void;
  onNavigate: (id: string) => void;
  initialView?: OverviewView;
}) {
  const [view, setView] = useState<OverviewView>(initialView);
  return (
    <>
      <ScreenHeader title="Overview" subtitle="Where things stand, what moved it, and where it's heading." onMenu={onMenu} />
      <HubSeg views={OVERVIEW_VIEWS} view={view} onPick={setView} />
      {view === 'pulse' && <OverviewPulseView onNavigate={onNavigate} />}
      {view === 'bridge' && <BridgeView />}
      {view === 'performance' && <PerformanceView />}
      {view === 'allocation' && <AllocationView />}
      {view === 'goals' && <GoalsView />}
    </>
  );
}

// ── Cashflow: the plan and the engine are one subject ──────────────────────
export type CashflowView = 'budget' | 'freecash';
const CASHFLOW_VIEWS: { key: CashflowView; label: string }[] = [
  { key: 'budget', label: 'Budget' },
  { key: 'freecash', label: 'Free cash engine' },
];

export function CashflowHub({ onMenu, initialView = 'budget' }: {
  onMenu: () => void;
  initialView?: CashflowView;
}) {
  const [view, setView] = useState<CashflowView>(initialView);
  return (
    <>
      <ScreenHeader title="Cashflow" subtitle="The monthly plan, and the free cash it actually generates." onMenu={onMenu} />
      <HubSeg views={CASHFLOW_VIEWS} view={view} onPick={setView} />
      {view === 'budget' && <BudgetView />}
      {view === 'freecash' && <FreeCashView />}
    </>
  );
}

// ── Risk & Protection: exposure, scenarios, cover ──────────────────────────
export type RiskView = 'dashboard' | 'stress' | 'protection';
const RISK_VIEWS: { key: RiskView; label: string }[] = [
  { key: 'dashboard', label: 'Risk dashboard' },
  { key: 'stress', label: 'Stress tests' },
  { key: 'protection', label: 'Protection' },
];

export function RiskHub({ onMenu, initialView = 'dashboard' }: {
  onMenu: () => void;
  initialView?: RiskView;
}) {
  const [view, setView] = useState<RiskView>(initialView);
  return (
    <>
      <ScreenHeader title="Risk & Protection" subtitle="Live risk metrics, scenario impacts, and the cover behind them." onMenu={onMenu} />
      <HubSeg views={RISK_VIEWS} view={view} onPick={setView} />
      {view === 'dashboard' && <RiskDashboardView />}
      {view === 'stress' && <StressTestsView />}
      {view === 'protection' && <ProtectionView />}
    </>
  );
}
