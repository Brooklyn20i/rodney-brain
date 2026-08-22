/**
 * Financial IA consolidation — 20 sidebar screens became 11. The hubs must
 * render every absorbed view, old screen ids must deep-link to the right
 * view (in-app navigation and muscle memory keep working), and the loved
 * standalone screens must stay in the nav untouched.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CadenceFinancialCtx, type Ctx } from '../../lib/store';
import { loadDemoData } from '../../lib/demoData';
import { FINANCIAL_NAV } from '../../../components/Sidebar';
import { OverviewHub, CashflowHub, RiskHub } from '../hubs';
import { Strategy } from '../Strategy';
import { MonthClose } from '../MonthClose';

function wrap(node: React.ReactElement) {
  const value = {
    demo: false,
    data: loadDemoData(),
    insert: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    syncError: null,
    clearSyncError: vi.fn(),
  } as unknown as Ctx;
  return render(<CadenceFinancialCtx.Provider value={value}>{node}</CadenceFinancialCtx.Provider>);
}

describe('financial nav consolidation', () => {
  it('is eleven question-first screens', () => {
    const items = FINANCIAL_NAV.flatMap((g) => g.items);
    expect(items).toHaveLength(11);
    expect(items.map((i) => i.id)).toEqual([
      'financial:overview', 'financial:strategy',
      'financial:month-close', 'financial:cashflow', 'financial:debt-offset',
      'financial:investments', 'financial:property', 'financial:watches', 'financial:conviction',
      'financial:risk', 'financial:kobe',
    ]);
  });

  it('keeps the protected standalone screens in the nav', () => {
    const labels = FINANCIAL_NAV.flatMap((g) => g.items).map((i) => i.label);
    for (const loved of ['Investments', 'Property Portfolio', 'Watches', 'Conviction']) {
      expect(labels).toContain(loved);
    }
  });
});

describe('Overview hub', () => {
  it('opens on Pulse and switches to every absorbed view', () => {
    wrap(<OverviewHub onMenu={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByText(/where things stand/i)).toBeTruthy(); // pulse content

    fireEvent.click(screen.getByRole('button', { name: 'Net worth bridge' }));
    expect(screen.getAllByText(/Opening net worth/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Performance' }));
    expect(screen.getByText(/You contributed/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Allocation' }));
    expect(screen.getByText(/policy bands/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Goals & runway' }));
    expect(screen.getByText(/actual pace/i)).toBeTruthy();
  });

  it('deep-links straight to a named view (old screen ids keep working)', () => {
    wrap(<OverviewHub onMenu={vi.fn()} onNavigate={vi.fn()} initialView="performance" />);
    expect(screen.getByText(/You contributed/)).toBeTruthy();
  });
});

describe('Cashflow hub', () => {
  it('opens on Budget and switches to the Free Cash Engine', () => {
    wrap(<CashflowHub onMenu={vi.fn()} />);
    expect(screen.getByText(/Monthly plan across the AU financial year/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Free cash engine' }));
    expect(screen.getByText(/Collectible purchase amount/)).toBeTruthy();
  });
});

describe('Risk & Protection hub', () => {
  it('serves dashboard, stress tests and protection from one screen', () => {
    wrap(<RiskHub onMenu={vi.fn()} />);
    expect(screen.getByText(/Risk metrics/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stress tests' }));
    expect(screen.getAllByText(/Scenario/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Protection' }));
    expect(screen.getAllByText(/Insurance register/).length).toBeGreaterThan(0);
  });
});

describe('absorbed queues', () => {
  it('Strategy carries the decision queue as its second view', () => {
    wrap(<Strategy onMenu={vi.fn()} initialView="decisions" />);
    expect(screen.getByText(/Decisions, missing approvals/)).toBeTruthy();
  });

  it('Month Close carries the evidence register as its second view', () => {
    wrap(<MonthClose onMenu={vi.fn()} initialView="evidence" />);
    expect(screen.getByText(/evidence grade/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ New evidence' })).toBeTruthy();
  });
});
