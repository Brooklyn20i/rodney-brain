/**
 * Meeting-action filing — the shared flow behind "File →" in the Tasks hub.
 * Pins the double-file guards (pushed-check on the freshest body, in-flight
 * lock) and that filing preserves the action's due date and marks the source
 * note without dropping sibling actions or unknown JSON keys.
 */
import { describe, it, expect, vi } from 'vitest';
import { createMeetingActionFiler, UNTARGETED_LABEL } from '../meetingActions';
import type { OpenMeetingAction } from '../tasks';
import type { Note } from '../types';

const noteOf = (body: unknown): Note => ({
  id: 'n1', owner_id: 'o', title: 'Ops sync', body: JSON.stringify(body),
  folder: '__mtg__team', created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z', deleted_at: null,
} as unknown as Note);

const action = (over: Partial<OpenMeetingAction> = {}): OpenMeetingAction => ({
  id: 'a1', title: 'Chase the vendor', owner: 'me', due: '2026-07-20', done: false, pushed: false,
  noteId: 'n1', noteTitle: 'Ops sync', folderOwnerId: 'team',
  ...over,
} as OpenMeetingAction);

const bodyWith = (actions: object[]) => ({ agenda: [], actions, notes: '', custom_key: 'kept' });

function makeStore() {
  return { insert: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) };
}

describe('createMeetingActionFiler', () => {
  it('files an untargeted action as a deliberately-filed task and marks the note', async () => {
    const store = makeStore();
    const file = createMeetingActionFiler(store);
    const notes = [noteOf(bodyWith([{ id: 'a1', title: 'Chase the vendor', due: '2026-07-20', done: false, pushed: false }]))];

    const outcome = await file(() => notes, action(), null);

    expect(outcome).toBe('filed');
    expect(store.insert).toHaveBeenCalledWith('work_items', expect.objectContaining({
      title: 'Chase the vendor',
      due_date: '2026-07-20',
      inboxed: false, // "send to Tasks" is a deliberate filing, not a re-inbox
    }));
    const [, noteId, patch] = store.update.mock.calls[0];
    expect(noteId).toBe('n1');
    const written = JSON.parse((patch as { body: string }).body);
    expect(written.actions[0]).toMatchObject({ pushed: true, pushed_to: UNTARGETED_LABEL });
    expect(written.custom_key).toBe('kept'); // unknown keys survive round-trip
  });

  it('carries the chosen target into the task and the pushed_to label', async () => {
    const store = makeStore();
    const file = createMeetingActionFiler(store);
    const notes = [noteOf(bodyWith([{ id: 'a1', title: 'Chase the vendor', due: '', done: false, pushed: false }]))];

    await file(() => notes, action({ due: '' }), { id: 'p9', type: 'person', name: 'Anna' });

    expect(store.insert).toHaveBeenCalledWith('work_items', expect.objectContaining({ person_id: 'p9' }));
    const written = JSON.parse((store.update.mock.calls[0][2] as { body: string }).body);
    expect(written.actions[0].pushed_to).toBe('Anna');
  });

  it('refuses to file an action already pushed in the latest snapshot', async () => {
    const store = makeStore();
    const file = createMeetingActionFiler(store);
    const notes = [noteOf(bodyWith([{ id: 'a1', title: 'Chase the vendor', due: '', done: false, pushed: true }]))];

    const outcome = await file(() => notes, action(), null);

    expect(outcome).toBe('already-filed');
    expect(store.insert).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
  });

  it('locks out concurrent filing of the same action (in-flight guard)', async () => {
    const store = makeStore();
    let release!: () => void;
    store.insert.mockImplementation(() => new Promise<void>((r) => { release = r; }));
    const file = createMeetingActionFiler(store);
    const notes = [noteOf(bodyWith([{ id: 'a1', title: 'Chase the vendor', due: '', done: false, pushed: false }]))];

    const first = file(() => notes, action(), null);
    const second = await file(() => notes, action(), null); // while first awaits insert
    expect(second).toBe('in-flight');

    release();
    expect(await first).toBe('filed');
    expect(store.insert).toHaveBeenCalledTimes(1);
  });

  it('does not drop sibling actions when marking one as pushed', async () => {
    const store = makeStore();
    const file = createMeetingActionFiler(store);
    const notes = [noteOf(bodyWith([
      { id: 'a1', title: 'Chase the vendor', due: '', done: false, pushed: false },
      { id: 'a2', title: 'Sibling action', due: '', done: false, pushed: false },
    ]))];

    await file(() => notes, action(), null);

    const written = JSON.parse((store.update.mock.calls[0][2] as { body: string }).body);
    expect(written.actions).toHaveLength(2);
    expect(written.actions[1]).toMatchObject({ id: 'a2', pushed: false });
  });
});
