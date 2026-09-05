import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CadenceCtx, type Ctx } from '../store';
import { emptyData, type Note } from '../types';
import { MEETING_DATES_NOTE_TITLE, useMeetingDates } from '../meetings';

const meta = (body = '{}'): Note => ({
  id: 'meta', owner_id: 'o', title: MEETING_DATES_NOTE_TITLE, body,
  created_at: '2026-06-01', updated_at: '2026-06-01', deleted_at: null,
}) as Note;

function ctx(over: Partial<Ctx> = {}): Ctx {
  return {
    ready: true, configured: true, session: null, needsPasswordSet: false,
    data: { ...emptyData(), notes: [meta('{"n0":"2026-06-01"}')] },
    workspace: null, workspaceMembers: [], myRole: null, canEdit: true,
    syncError: null, clearSyncError: vi.fn(), pendingCount: 0, isOffline: false, isSyncing: false,
    signIn: vi.fn(), signUp: vi.fn(), setPassword: vi.fn(), resetPassword: vi.fn(), signOut: vi.fn(),
    insert: vi.fn(), update: vi.fn().mockResolvedValue(meta()), remove: vi.fn(), reload: vi.fn(), logActivity: vi.fn(),
    createWorkspace: vi.fn(), createInvite: vi.fn(), removeWorkspaceMember: vi.fn(), acceptInvite: vi.fn(),
    ...over,
  } as unknown as Ctx;
}

describe('useMeetingDates strict writes', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('requires server acknowledgement when updating the meeting date metadata note', async () => {
    const c = ctx();
    const wrapper = ({ children }: { children: React.ReactNode }) => <CadenceCtx.Provider value={c}>{children}</CadenceCtx.Provider>;
    const { result } = renderHook(() => useMeetingDates(), { wrapper });

    await act(async () => { await result.current.setMeetingDate('n1', '2026-06-20'); });

    expect(c.update).toHaveBeenCalledWith('notes', 'meta', { body: JSON.stringify({ n0: '2026-06-01', n1: '2026-06-20' }) }, { strict: true });
  });

  it('does not advance the local date map after a rejected metadata save', async () => {
    const c = ctx({ update: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(meta()) });
    const wrapper = ({ children }: { children: React.ReactNode }) => <CadenceCtx.Provider value={c}>{children}</CadenceCtx.Provider>;
    const { result } = renderHook(() => useMeetingDates(), { wrapper });

    await expect(result.current.setMeetingDate('n1', '2026-06-20')).rejects.toThrow('offline');
    await act(async () => { await result.current.setMeetingDate('n2', '2026-06-21'); });

    expect(c.update).toHaveBeenLastCalledWith('notes', 'meta', { body: JSON.stringify({ n0: '2026-06-01', n2: '2026-06-21' }) }, { strict: true });
  });
});
