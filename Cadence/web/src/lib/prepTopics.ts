// Topics-with-a-work-trail for big meetings (CLT, ADX…): what I'm bringing to
// the next occurrence, why it's on the agenda, the prep work behind it, and a
// ready/not-ready status I can see at a glance.
//
// Storage: one hidden note per meeting series titled `__prep__<groupId>` with
// body {"topics": PrepTopic[]}. Topics span occurrences (a topic builds over
// weeks), which is why they live at series level rather than inside any dated
// meeting note. Prep tasks are REAL work_items linked to the group (a
// meeting_group is a people row, so they surface in my Home list tagged with
// the group) — the topic only stores their ids.

import { useCallback, useRef } from 'react';
import { useCadence } from './store';
import type { Note, WorkItem } from './types';
import { uid } from './meetingData';

export type TopicStatus = 'building' | 'ready' | 'covered';

export interface TopicLink { url: string; title?: string }

export interface PrepTopic {
  id: string;
  title: string;
  why: string;
  status: TopicStatus;
  links: TopicLink[];
  notes: string;
  prep_task_ids: string[];
}

export const PREP_NOTE_PREFIX = '__prep__';
export const prepNoteTitle = (groupId: string) => `${PREP_NOTE_PREFIX}${groupId}`;

export function findPrepNote(notes: Note[], groupId: string): Note | undefined {
  return notes
    .filter((n) => n.title === prepNoteTitle(groupId) && !n.deleted_at)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))[0];
}

export function parsePrepBody(body: string | null | undefined): PrepTopic[] {
  if (!body) return [];
  try {
    const p = JSON.parse(body);
    if (!Array.isArray(p?.topics)) return [];
    // Normalise so downstream code never touches undefined fields.
    return (p.topics as Partial<PrepTopic>[]).map((t) => ({
      id: t.id || uid(),
      title: t.title || '',
      why: t.why || '',
      status: (t.status as TopicStatus) || 'building',
      links: Array.isArray(t.links) ? t.links : [],
      notes: t.notes || '',
      prep_task_ids: Array.isArray(t.prep_task_ids) ? t.prep_task_ids : [],
    }));
  } catch {
    return [];
  }
}

export function readPrepTopics(notes: Note[], groupId: string): PrepTopic[] {
  return parsePrepBody(findPrepNote(notes, groupId)?.body);
}

export const serializeTopics = (topics: PrepTopic[]) => JSON.stringify({ topics });

export function newTopic(title: string): PrepTopic {
  return { id: uid(), title: title.trim(), why: '', status: 'building', links: [], notes: '', prep_task_ids: [] };
}

// Pure: replace one topic by id (no-op when absent).
export function upsertTopic(topics: PrepTopic[], topic: PrepTopic): PrepTopic[] {
  const exists = topics.some((t) => t.id === topic.id);
  return exists ? topics.map((t) => (t.id === topic.id ? topic : t)) : [...topics, topic];
}

// Hook: read/mutate the series prep note with freshest-snapshot semantics
// (same ref-guarded pattern as lib/agendaQueue).
export function usePrepTopics(groupId: string) {
  const { data, insert, update } = useCadence();
  const notesRef = useRef(data.notes);
  notesRef.current = data.notes;

  const topics = readPrepTopics(data.notes, groupId);

  const write = useCallback(async (mut: (topics: PrepTopic[]) => PrepTopic[]) => {
    const note = findPrepNote(notesRef.current, groupId);
    const next = mut(parsePrepBody(note?.body));
    const body = serializeTopics(next);
    if (note) await update('notes', note.id, { body } as Partial<Note>);
    else await insert('notes', { title: prepNoteTitle(groupId), body } as Partial<Note>);
  }, [groupId, insert, update]);

  const addTopic = useCallback((title: string) => {
    const t = title.trim();
    if (!t) return Promise.resolve();
    return write((topics) => [...topics, newTopic(t)]);
  }, [write]);

  const updateTopic = useCallback((topic: PrepTopic) =>
    write((topics) => upsertTopic(topics, topic)), [write]);

  const removeTopic = useCallback((topicId: string) =>
    write((topics) => topics.filter((t) => t.id !== topicId)), [write]);

  // Mark every topic in `topicIds` covered — used when a meeting closes with
  // their agenda items marked covered.
  const markCovered = useCallback((topicIds: string[]) => {
    if (!topicIds.length) return Promise.resolve();
    return write((topics) => topics.map((t) => topicIds.includes(t.id) ? { ...t, status: 'covered' as const } : t));
  }, [write]);

  // Create a REAL prep task linked to the group and attach it to the topic.
  const addPrepTask = useCallback(async (topic: PrepTopic, title: string, groupName: string, due?: string | null) => {
    const t = title.trim();
    if (!t) return;
    const prepNote = findPrepNote(notesRef.current, groupId);
    const row = await insert('work_items', {
      title: t, type: 'task', priority: 'medium', due_date: due || null,
      person_id: groupId,
      related_entities: [
        { type: 'person', id: groupId, name: groupName },
        ...(prepNote ? [{ type: 'note' as const, id: prepNote.id, name: `${groupName} prep` }] : []),
      ],
      notes: `Prep for topic: ${topic.title}`,
      inboxed: false, source: 'you',
    } as Partial<WorkItem>);
    const newId = (row as WorkItem | undefined)?.id;
    if (newId) {
      await write((topics) => topics.map((x) =>
        x.id === topic.id ? { ...x, prep_task_ids: [...x.prep_task_ids, newId] } : x));
    }
  }, [groupId, insert, write]);

  return { topics, addTopic, updateTopic, removeTopic, markCovered, addPrepTask };
}
