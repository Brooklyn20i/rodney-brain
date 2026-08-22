import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { FINANCIAL_NAV } from '../../../components/Sidebar';
import { loadDemoData } from '../../lib/demoData';
import { CadenceFinancialCtx, type Ctx } from '../../lib/store';
import { emptyData, type CadenceFinancialData } from '../../lib/types';
import { Kobe } from '../Kobe';

function renderFinancialAgent(data: CadenceFinancialData = emptyData()) {
  const value: Ctx = {
    demo: false,
    data,
    insert: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    syncError: null,
    clearSyncError: vi.fn(),
  };

  return render(
    <CadenceFinancialCtx.Provider value={value}>
      <Kobe onMenu={vi.fn()} />
    </CadenceFinancialCtx.Provider>
  );
}

describe('Cadence Financial customer-facing branding', () => {
  it('uses Cadence Financial for the financial agent navigation and screen', () => {
    const agentItem = FINANCIAL_NAV.flatMap((section) => section.items).find(
      (item) => item.id === 'financial:kobe'
    );

    expect(agentItem?.label).toBe('Cadence Financial');

    renderFinancialAgent();

    expect(screen.getByRole('heading', { name: 'Cadence Financial' })).toBeInTheDocument();
    expect(screen.getByText('Your private wealth operating agent.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Message Cadence Financial...')).toBeInTheDocument();
    expect(screen.getByText(/Messages here use the same secure Cadence Financial channel\./)).toBeInTheDocument();
    expect(screen.queryByText(/as Kobe/i)).not.toBeInTheDocument();
  });

  it('keeps seeded financial agent sender labels customer-facing while retaining internal owner lenses', () => {
    const demo = loadDemoData();
    const demoAgentLabels = demo.agent_messages
      .filter((message) => message.sender_type === 'agent')
      .map((message) => message.sender_label);

    expect(demoAgentLabels).not.toEqual(expect.arrayContaining(['Kobe', 'Warren']));
    expect(new Set(demoAgentLabels)).toEqual(new Set(['Cadence Financial']));
    expect(demo.decisions.map((decision) => decision.owner_lens)).toEqual(
      expect.arrayContaining(['kobe', 'warren', 'dan'])
    );
  });

  it('renders live financial agent messages with the customer-facing label only', () => {
    const data = emptyData();
    data.agent_messages = [
      {
        id: 'live-kobe-label',
        owner_id: 'owner',
        sender_type: 'agent',
        sender_label: 'Kobe',
        body: 'Live close note.',
        status: 'unread',
        linked_decision_id: null,
        linked_period: null,
        created_at: '2026-08-01T00:00:00.000Z',
        updated_at: '2026-08-01T00:00:00.000Z',
        deleted_at: null,
      },
      {
        id: 'live-warren-label',
        owner_id: 'owner',
        sender_type: 'agent',
        sender_label: 'Warren',
        body: 'Live portfolio note.',
        status: 'processed',
        linked_decision_id: null,
        linked_period: null,
        created_at: '2026-08-02T00:00:00.000Z',
        updated_at: '2026-08-02T00:00:00.000Z',
        deleted_at: null,
      },
    ];

    renderFinancialAgent(data);

    expect(screen.queryByText(/Kobe ·/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Warren ·/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Cadence Financial ·/)).toHaveLength(2);
  });

  it('seeds live financial agent messages with the customer-facing sender label', () => {
    const mcpSource = readFileSync(join(process.cwd(), '../agent/cadence_financial_mcp.py'), 'utf8');

    expect(mcpSource).toContain('"sender_label": "Cadence Financial"');
    expect(mcpSource).not.toContain('"sender_label": "Kobe"');
    expect(mcpSource).not.toContain('Post a message from Kobe');
    expect(mcpSource).not.toContain('Financial Kobe screen');
  });
});
