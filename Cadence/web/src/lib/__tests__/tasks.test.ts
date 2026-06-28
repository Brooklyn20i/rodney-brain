import { describe, it, expect } from 'vitest';
import { buildTaskFromAction, isFiled, isAgentTask, isUserTask, collectOpenMeetingActions, MTG_FOLDER_PREFIX, reassignPrimaryPerson } from '../tasks';
import type { ActionItem } from '../meetingData';
import type { Note, RelatedEntity } from '../types';

// ── reassignPrimaryPerson ──────────────────────────────────────────────────────

describe('reassignPrimaryPerson', () => {
  const personA: RelatedEntity = { type: 'person', id: 'A', name: 'Anna' };
  const personC: RelatedEntity = { type: 'person', id: 'C', name: 'Cara' };
  const projX: RelatedEntity = { type: 'project', id: 'X', name: 'Proj' };

  it('swaps the previous primary person for the new one', () => {
    const out = reassignPrimaryPerson([personA], 'A', { id: 'B', name: 'Bob' });
    expect(out).toEqual([{ type: 'person', id: 'B', name: 'Bob' }]);
  });

  it('preserves other people and project links', () => {
    const out = reassignPrimaryPerson([personA, personC, projX], 'A', { id: 'B', name: 'Bob' });
    expect(out).toEqual([personC, projX, { type: 'person', id: 'B', name: 'Bob' }]);
  });

  it('moving to Unassigned drops the old primary and adds nothing', () => {
    expect(reassignPrimaryPerson([personA, projX], 'A', null)).toEqual([projX]);
  });

  it('does not duplicate when the new person is already linked', () => {
    const out = reassignPrimaryPerson([personA, personC], 'A', { id: 'C', name: 'Cara' });
    expect(out).toEqual([personC]);
  });

  it('handles an empty/undefined link list', () => {
    expect(reassignPrimaryPerson(undefined, null, { id: 'B', name: 'Bob' })).toEqual([{ type: 'person', id: 'B', name: 'Bob' }]);
  });
});

// ── isFiled ──────────────────────────────────────────────────────────────────

describe('isFiled', () => {
  it('is filed when it has a person_id', () => {
    expect(isFiled({ person_id: 'p1', project_id: null })).toBe(true);
  });

  it('is filed when it has a project_id', () => {
    expect(isFiled({ person_id: null, project_id: 'proj1' })).toBe(true);
  });

  it('is NOT filed by a bare due date — triage needs a person or project', () => {
    expect(isFiled({ person_id: null, project_id: null })).toBe(false);
  });

  it('is NOT filed when person and project are null', () => {
    expect(isFiled({ person_id: null, project_id: null })).toBe(false);
  });
});

// ── isAgentTask / isUserTask ──────────────────────────────────────────────────

describe('isAgentTask', () => {
  it('flags tasks delegated to Kobe', () => {
    expect(isAgentTask({ source: 'for:kobe' })).toBe(true);
  });
  it('flags tasks created by an agent', () => {
    expect(isAgentTask({ source: 'agent:kobe' })).toBe(true);
    expect(isAgentTask({ source: 'agent:ace' })).toBe(true);
  });
  it('does not flag ordinary user tasks', () => {
    expect(isAgentTask({ source: 'you' })).toBe(false);
    expect(isAgentTask({ source: 'capture' })).toBe(false);
    expect(isAgentTask({ source: 'meeting' })).toBe(false);
    expect(isAgentTask({ source: '' })).toBe(false);
  });
});

describe('isUserTask', () => {
  it('is the user\'s own open work', () => {
    expect(isUserTask({ done: false, source: 'you' })).toBe(true);
  });
  it('excludes completed work', () => {
    expect(isUserTask({ done: true, source: 'you' })).toBe(false);
  });
  it('excludes agent-owned work', () => {
    expect(isUserTask({ done: false, source: 'for:kobe' })).toBe(false);
    expect(isUserTask({ done: false, source: 'agent:ace' })).toBe(false);
  });
});

// ── buildTaskFromAction ───────────────────────────────────────────────────────

const baseAction = (overrides: Partial<ActionItem> = {}): ActionItem => ({
  id: 'a1',
  title: 'Write report',
  owner: 'me',
  due: '2026-06-30',
  done: false,
  pushed: false,
  ...overrides,
});

describe('buildTaskFromAction', () => {
  it('preserves the action title and due date', () => {
    const task = buildTaskFromAction(baseAction(), '1:1 · Alice · 20/06/2026');
    expect(task.title).toBe('Write report');
    expect(task.due_date).toBe('2026-06-30');
  });

  it('assigns person_id from target', () => {
    const task = buildTaskFromAction(
      baseAction(),
      'Meeting',
      { id: 'p1', type: 'person', name: 'Alice' }
    );
    expect(task.person_id).toBe('p1');
    expect(task.project_id).toBeNull();
    expect(task.inboxed).toBe(false);
  });

  it('assigns project_id from target', () => {
    const task = buildTaskFromAction(
      baseAction(),
      'Meeting',
      { id: 'proj1', type: 'project', name: 'Big Project' }
    );
    expect(task.project_id).toBe('proj1');
    expect(task.person_id).toBeNull();
    expect(task.inboxed).toBe(false);
  });

  it('falls back to action.owner_person_id when target is null', () => {
    const task = buildTaskFromAction(
      baseAction({ owner_person_id: 'p2' }),
      'Meeting',
      null
    );
    expect(task.person_id).toBe('p2');
    expect(task.inboxed).toBe(false);
  });

  it('lands in inbox when no target and no owner_person_id', () => {
    const task = buildTaskFromAction(baseAction(), 'Meeting', null);
    expect(task.person_id).toBeNull();
    expect(task.project_id).toBeNull();
    expect(task.inboxed).toBe(true);
  });

  it('sets source to "meeting"', () => {
    expect(buildTaskFromAction(baseAction(), 'Meeting').source).toBe('meeting');
  });

  it('records the meeting title in notes', () => {
    const task = buildTaskFromAction(baseAction(), '1:1 · Alice · 20/06/2026');
    expect(task.notes).toContain('1:1 · Alice · 20/06/2026');
  });

  it('handles empty due date as null', () => {
    const task = buildTaskFromAction(baseAction({ due: '' }), 'Meeting');
    expect(task.due_date).toBeNull();
  });
});

// ── collectOpenMeetingActions ─────────────────────────────────────────────────

const mkNote = (id: string, folderId: string, body: string): Note =>
  ({
    id,
    owner_id: 'owner1',
    title: `Meeting ${id}`,
    body,
    folder: `${MTG_FOLDER_PREFIX}${folderId}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
  }) as Note;

describe('collectOpenMeetingActions', () => {
  it('returns empty array for non-meeting notes', () => {
    const note = { ...mkNote('n1', 'p1', '{}'), folder: 'inbox' };
    expect(collectOpenMeetingActions([note])).toEqual([]);
  });

  it('returns open, unpushed, non-empty actions', () => {
    const body = JSON.stringify({
      actions: [
        { id: 'a1', title: 'Do X', owner: 'me', due: '', done: false, pushed: false },
        { id: 'a2', title: 'Do Y', owner: 'them', due: '', done: true, pushed: false },
        { id: 'a3', title: 'Do Z', owner: 'me', due: '', done: false, pushed: true },
        { id: 'a4', title: '', owner: 'me', due: '', done: false, pushed: false }, // empty title
      ],
    });
    const result = collectOpenMeetingActions([mkNote('n1', 'person1', body)]);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Do X');
    expect(result[0].noteId).toBe('n1');
    expect(result[0].folderOwnerId).toBe('person1');
  });

  it('aggregates actions across multiple meeting notes', () => {
    const body = (title: string) =>
      JSON.stringify({ actions: [{ id: title, title, owner: 'me', due: '', done: false, pushed: false }] });
    const notes = [mkNote('n1', 'p1', body('Action A')), mkNote('n2', 'p2', body('Action B'))];
    expect(collectOpenMeetingActions(notes)).toHaveLength(2);
  });
});
