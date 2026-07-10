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

const renderPanel = () =>
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
});
