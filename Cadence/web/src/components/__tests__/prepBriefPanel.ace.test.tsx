/**
 * PrepBriefPanel is a second ace-chat caller. It must send a UUID request_id so
 * the Edge Function can dedupe it just like the Ace screen does.
 */
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({ invoke: vi.fn(), store: { workspace: { id: 'ws1' } } }));
vi.mock('../../lib/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => h.invoke(...args) } },
}));
vi.mock('../../lib/store', () => ({ useCadence: () => h.store }));

import { PrepBriefPanel } from '../PrepBriefPanel';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const person = { id: 'p1', name: 'Milad Zand', type: 'person', color: '#123', role: '' } as any;
const otherPerson = { id: 'p2', name: 'Priya Rao', type: 'person', color: '#456', role: '' } as any;

const panel = (p: any = person) => (
  <PrepBriefPanel
    person={p}
    agenda={[]}
    carryForward={[]}
    deferredAgenda={[]}
    workItems={[]}
    projects={[]}
    projectUpdates={[]}
    onAddToAgenda={() => {}}
    onClose={() => {}}
  />
);
const renderPanel = (p: any = person) => render(panel(p));
const clickAsk = () => fireEvent.click(screen.getByRole('button', { name: /Ask Ace for summary/i }));

beforeEach(() => { h.invoke = vi.fn().mockResolvedValue({ error: null }); });
afterEach(() => cleanup());

describe('PrepBriefPanel → ace-chat', () => {
  it('sends the brief prompt with a UUID request_id and confirms sent on success', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Ask Ace for summary/i }));
    await waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(1));
    const [fn, opts] = h.invoke.mock.calls[0];
    expect(fn).toBe('ace-chat');
    expect(opts.body.message).toContain('Milad Zand');
    expect(opts.body.request_id).toMatch(UUID_RE);
    expect(opts.body.workspace_id).toBe('ws1');
    await waitFor(() => expect(screen.getByText(/Brief sent/i)).toBeInTheDocument());
  });

  it('on invoke error: surfaces the failure, does not claim sent, and is not stuck busy', async () => {
    h.invoke = vi.fn().mockResolvedValue({ error: { message: 'not deployed' } });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Ask Ace for summary/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't reach Ace/i));
    // Never claims success…
    expect(screen.queryByText(/Brief sent/i)).not.toBeInTheDocument();
    // …and the button is back to idle (not stuck on "Asking Ace…").
    const btn = screen.getByRole('button', { name: /Ask Ace for summary/i });
    expect(btn).not.toBeDisabled();
  });

  it('on thrown error: surfaces the failure and re-enables the button', async () => {
    h.invoke = vi.fn().mockRejectedValue(new Error('network down'));
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Ask Ace for summary/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByText(/Brief sent/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ask Ace for summary/i })).not.toBeDisabled();
  });

  it('reuses the same request_id when the same brief is retried after a failure', async () => {
    // A failed (not-accepted) send may have been an ambiguous accepted-but-lost
    // response; retrying the identical brief must reuse the id so the server can
    // dedupe it rather than create a second brief.
    h.invoke = vi.fn().mockResolvedValue({ error: { message: 'boom' } });
    renderPanel();
    clickAsk();
    await waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(1));
    clickAsk(); // retry — button is still present because we never claimed sent
    await waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(2));
    const first = h.invoke.mock.calls[0][1].body.request_id;
    const second = h.invoke.mock.calls[1][1].body.request_id;
    expect(first).toMatch(UUID_RE);
    expect(second).toBe(first);
  });

  it('mints a NEW request_id when the person (and thus the prompt) changes', async () => {
    h.invoke = vi.fn().mockResolvedValue({ error: { message: 'boom' } });
    const { rerender } = renderPanel(person);
    clickAsk();
    await waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(1));
    // Same panel instance now prepping a different person → different prompt.
    rerender(panel(otherPerson));
    clickAsk();
    await waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(2));
    const first = h.invoke.mock.calls[0][1].body;
    const second = h.invoke.mock.calls[1][1].body;
    expect(first.message).toContain('Milad Zand');
    expect(second.message).toContain('Priya Rao');
    expect(second.request_id).not.toBe(first.request_id);
    expect(second.request_id).toMatch(UUID_RE);
  });
});
