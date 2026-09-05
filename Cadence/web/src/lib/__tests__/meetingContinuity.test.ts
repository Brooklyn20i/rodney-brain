import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Note, Person, WorkItem } from '../types';
import {
  buildMeetingActionPayload,
  getMeetingCommitments,
  meetingActionClientId,
} from '../meetingContinuity';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 20));
});

const wi = (o: Partial<WorkItem>): WorkItem => ({
  id: 'w', owner_id: 'o', title: 'Task', type: 'task', priority: 'medium', due_date: null,
  project_id: null, person_id: null, notes: '', done: false, inboxed: false, source: 'you',
  completed_at: null, related_entities: undefined, created_at: '2026-06-01', updated_at: '2026-06-01',
  deleted_at: null, ...o,
}) as WorkItem;

const person = (o: Partial<Person>): Person => ({
  id: 'p1', owner_id: 'o', name: 'Anna Lee', role: '', email: '', notes: '', color: '#123',
  created_at: '2026-06-01', updated_at: '2026-06-01', deleted_at: null, type: 'person', ...o,
}) as Person;

const note = (o: Partial<Note>): Note => ({
  id: 'n1', owner_id: 'o', title: '1:1 · Anna Lee · 20/06/2026', body: '<p>Notes</p>', folder: '__mtg__p1',
  created_at: '2026-06-01', updated_at: '2026-06-01', deleted_at: null, ...o,
}) as Note;

describe('getMeetingCommitments', () => {
  it('dedupes canonical open work_items linked by person_id OR related_entities and keeps delegated items', () => {
    const items = [
      wi({ id: 'mine-primary', title: 'Draft pack', person_id: 'p1', type: 'task' }),
      wi({ id: 'theirs-related', title: 'Send numbers', person_id: 'p2', type: 'waitingFor', related_entities: [{ type: 'person', id: 'p1', name: 'Anna Lee' }] }),
      wi({ id: 'delegated', title: 'Kobe prep', person_id: 'p1', source: 'for:kobe' }),
      wi({ id: 'inbox', title: 'Rough capture', person_id: 'p1', inboxed: true }),
      wi({ id: 'done', title: 'Finished', person_id: 'p1', done: true }),
      wi({ id: 'deleted', title: 'Gone', person_id: 'p1', deleted_at: '2026-06-19' }),
    ];

    const out = getMeetingCommitments(items, 'p1');

    expect(out.all.map((w) => w.id).sort()).toEqual(['delegated', 'mine-primary', 'theirs-related']);
    expect(out.iOwe.map((w) => w.id).sort()).toEqual(['delegated', 'mine-primary']);
    expect(out.theyOwe.map((w) => w.id)).toEqual(['theirs-related']);
  });
});

describe('buildMeetingActionPayload', () => {
  it('creates a directly filed I-owe action with stable client id, due date, note provenance and no inbox detour', () => {
    const id = meetingActionClientId();
    const payload = buildMeetingActionPayload({
      id,
      title: 'Send Anna the draft',
      direction: 'iOwe',
      dueDate: '2026-07-01',
      counterparty: person({ id: 'p1', name: 'Anna Lee' }),
      meetingHost: person({ id: 'p1', name: 'Anna Lee' }),
      note: note({ id: 'n1', title: '1:1 · Anna Lee · 20/06/2026' }),
    });

    expect(payload).toMatchObject({
      id,
      title: 'Send Anna the draft',
      type: 'task',
      priority: 'medium',
      due_date: '2026-07-01',
      person_id: 'p1',
      inboxed: false,
      source: 'meeting',
    });
    expect(payload.related_entities).toEqual([
      { type: 'person', id: 'p1', name: 'Anna Lee' },
      { type: 'note', id: 'n1', name: '1:1 · Anna Lee · 20/06/2026' },
    ]);
    expect(payload.notes).toContain('Captured from meeting note: 1:1 · Anna Lee · 20/06/2026');
  });

  it('creates a directly filed they-owe action for a chosen group participant while preserving group context', () => {
    const group = person({ id: 'g1', name: 'Leadership Weekly', type: 'meeting_group' });
    const anna = person({ id: 'p1', name: 'Anna Lee' });
    const payload = buildMeetingActionPayload({
      id: 'client-action-id',
      title: 'Anna to send numbers',
      direction: 'theyOwe',
      dueDate: '',
      counterparty: anna,
      meetingHost: group,
      note: note({ id: 'n2', title: 'Leadership Weekly · 20/06/2026', folder: '__mtg__g1' }),
    });

    expect(payload).toMatchObject({
      id: 'client-action-id',
      type: 'waitingFor',
      person_id: 'p1',
      due_date: null,
      inboxed: false,
      source: 'meeting',
    });
    expect(payload.related_entities).toContainEqual({ type: 'person', id: 'p1', name: 'Anna Lee' });
    expect(payload.related_entities).toContainEqual({ type: 'person', id: 'g1', name: 'Leadership Weekly' });
    expect(payload.related_entities).toContainEqual({ type: 'note', id: 'n2', name: 'Leadership Weekly · 20/06/2026' });
  });
});
