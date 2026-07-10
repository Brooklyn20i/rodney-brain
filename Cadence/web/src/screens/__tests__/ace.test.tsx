/**
 * Ace screen — the in-app Work agent. Drives the real send flow and asserts
 * the user-visible behaviour: the thread is scoped to agent:ace, a send calls
 * the ace-chat Edge Function with the trimmed message, and a function error
 * surfaces to the user without losing their draft.
 */
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { emptyData } from '../../lib/types';

const h = vi.hoisted(() => ({ store: {} as any, invoke: vi.fn() }));

vi.mock('../../lib/store', () => ({ useCadence: () => h.store }));
vi.mock('../../lib/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => h.invoke(...args) } },
}));

import { Ace } from '../Ace';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const msg = (o: any) => ({
  id: 'm', owner_id: 'me', sender_type: 'user', sender_id: null, recipient_type: 'agent',
  recipient_key: 'agent:ace', body: 'Message', status: 'unread', linked_work_item_id: null,
  linked_project_id: null, linked_person_id: null, linked_note_id: null, metadata: {},
  created_at: '2026-06-20T09:00:00.000Z', updated_at: '2026-06-20T09:00:00.000Z',
  processed_at: null, deleted_at: null, ...o,
});

function setStore(over: any = {}) {
  const { data: dataOver, ...rest } = over;
  h.store = { ...rest, data: { ...emptyData(), ...(dataOver || {}) } };
}

beforeEach(() => {
  h.invoke = vi.fn();
  // jsdom doesn't implement scrollIntoView; the screen auto-scrolls on new messages.
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => cleanup());

describe('Ace screen', () => {
  it('shows the empty state before any messages', () => {
    setStore();
    render(<Ace onMenu={() => {}} />);
    expect(screen.getByText('Ask Ace anything about your Cadence')).toBeInTheDocument();
  });

  it('scopes the thread to agent:ace and excludes Kobe or other agents', () => {
    setStore({ data: { agent_messages: [
      msg({ id: 'u1', body: 'Rodney to Ace', sender_type: 'user', recipient_key: 'agent:ace' }),
      msg({ id: 'a1', body: '<p>Ace reply</p>', sender_type: 'agent', recipient_key: 'agent:ace', created_at: '2026-06-20T09:01:00.000Z' }),
      msg({ id: 'k1', body: 'Kobe reply', sender_type: 'agent', recipient_key: 'agent:kobe', created_at: '2026-06-20T09:02:00.000Z' }),
      msg({ id: 'x1', body: 'Other agent', sender_type: 'agent', recipient_key: 'agent:other', created_at: '2026-06-20T09:03:00.000Z' }),
    ] } });
    render(<Ace onMenu={() => {}} />);
    expect(screen.getByText('Rodney to Ace')).toBeInTheDocument();
    expect(screen.getByText('Ace reply')).toBeInTheDocument();
    expect(screen.queryByText('Kobe reply')).not.toBeInTheDocument();
    expect(screen.queryByText('Other agent')).not.toBeInTheDocument();
  });

  it('invokes ace-chat with the trimmed message and a UUID request_id, and clears the composer', async () => {
    h.invoke.mockResolvedValue({ error: null });
    setStore();
    render(<Ace onMenu={() => {}} />);
    const input = screen.getByPlaceholderText('Ask Ace…');
    fireEvent.change(input, { target: { value: '  What is overdue?  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(h.invoke).toHaveBeenCalledWith('ace-chat', {
        body: { message: 'What is overdue?', request_id: expect.stringMatching(UUID_RE) },
      }),
    );
    expect(input).toHaveValue('');
  });

  it('surfaces a function error and restores the draft so nothing is lost', async () => {
    h.invoke.mockResolvedValue({ error: { message: 'not deployed' } });
    setStore();
    render(<Ace onMenu={() => {}} />);
    const input = screen.getByPlaceholderText('Ask Ace…');
    fireEvent.change(input, { target: { value: 'Summarise my week' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(screen.getByText(/ace-chat function is deployed/i)).toBeInTheDocument(),
    );
    expect(input).toHaveValue('Summarise my week');
  });

  it('reuses the same request_id when a not-accepted send is retried', async () => {
    // First send is rejected (not accepted); the restored draft is resent.
    h.invoke.mockResolvedValue({ error: { message: 'boom' } });
    setStore();
    render(<Ace onMenu={() => {}} />);
    const input = screen.getByPlaceholderText('Ask Ace…');
    fireEvent.change(input, { target: { value: 'Chase pricing' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(1));
    // Draft restored — retry it.
    fireEvent.keyDown(screen.getByPlaceholderText('Ask Ace…'), { key: 'Enter' });
    await waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(2));
    const first = h.invoke.mock.calls[0][1].body.request_id;
    const second = h.invoke.mock.calls[1][1].body.request_id;
    expect(first).toMatch(UUID_RE);
    expect(second).toBe(first); // idempotent retry — same id
  });

  it('mints a NEW request_id when the restored draft is edited before retrying', async () => {
    // First send rejected; the restored draft is then edited to a different
    // instruction. A changed instruction must not ride the previous turn's id.
    h.invoke.mockResolvedValue({ error: { message: 'boom' } });
    setStore();
    render(<Ace onMenu={() => {}} />);
    const input = screen.getByPlaceholderText('Ask Ace…');
    fireEvent.change(input, { target: { value: 'Chase pricing' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(1));
    // Edit the restored draft, then send.
    fireEvent.change(screen.getByPlaceholderText('Ask Ace…'), { target: { value: 'Chase renewal instead' } });
    fireEvent.keyDown(screen.getByPlaceholderText('Ask Ace…'), { key: 'Enter' });
    await waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(2));
    const first = h.invoke.mock.calls[0][1];
    const second = h.invoke.mock.calls[1][1];
    expect(first.body.message).toBe('Chase pricing');
    expect(second.body.message).toBe('Chase renewal instead');
    expect(second.body.request_id).not.toBe(first.body.request_id); // fresh id
    expect(second.body.request_id).toMatch(UUID_RE);
  });

  it('mints a fresh request_id for a new turn after one was accepted', async () => {
    h.invoke.mockResolvedValue({ error: null }); // accepted
    setStore();
    render(<Ace onMenu={() => {}} />);
    const input = screen.getByPlaceholderText('Ask Ace…');
    fireEvent.change(input, { target: { value: 'First' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByPlaceholderText('Ask Ace…'), { target: { value: 'Second' } });
    fireEvent.keyDown(screen.getByPlaceholderText('Ask Ace…'), { key: 'Enter' });
    await waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(2));
    const first = h.invoke.mock.calls[0][1].body.request_id;
    const second = h.invoke.mock.calls[1][1].body.request_id;
    expect(second).not.toBe(first); // distinct turn — fresh id
  });

  it('does not send empty or whitespace-only drafts', () => {
    h.invoke.mockResolvedValue({ error: null });
    setStore();
    render(<Ace onMenu={() => {}} />);
    const input = screen.getByPlaceholderText('Ask Ace…');
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(h.invoke).not.toHaveBeenCalled();
  });
});
