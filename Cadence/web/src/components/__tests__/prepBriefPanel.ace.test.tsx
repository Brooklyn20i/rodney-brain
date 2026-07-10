/**
 * PrepBriefPanel is a second ace-chat caller. It must send a UUID request_id so
 * the Edge Function can dedupe it just like the Ace screen does.
 */
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../../lib/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => h.invoke(...args) } },
}));

import { PrepBriefPanel } from '../PrepBriefPanel';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const person = { id: 'p1', name: 'Milad Zand', type: 'person', color: '#123', role: '' } as any;

beforeEach(() => { h.invoke = vi.fn().mockResolvedValue({ error: null }); });
afterEach(() => cleanup());

describe('PrepBriefPanel → ace-chat', () => {
  it('sends the brief prompt with a UUID request_id', async () => {
    render(
      <PrepBriefPanel
        person={person}
        agenda={[]}
        carryForward={[]}
        deferredAgenda={[]}
        workItems={[]}
        projects={[]}
        projectUpdates={[]}
        onAddToAgenda={() => {}}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Ask Ace for summary/i }));
    await waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(1));
    const [fn, opts] = h.invoke.mock.calls[0];
    expect(fn).toBe('ace-chat');
    expect(opts.body.message).toContain('Milad Zand');
    expect(opts.body.request_id).toMatch(UUID_RE);
  });
});
