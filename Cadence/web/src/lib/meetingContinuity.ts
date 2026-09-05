import { newId } from './meetingData';
import type { Note, Person, RelatedEntity, WorkItem } from './types';

export type MeetingActionDirection = 'iOwe' | 'theyOwe' | 'inbox';

export interface MeetingCommitments {
  all: WorkItem[];
  iOwe: WorkItem[];
  theyOwe: WorkItem[];
}

const PRI: Record<string, number> = { high: 0, medium: 1, low: 2 };
const byDueThenPriority = (a: WorkItem, b: WorkItem) =>
  (a.due_date || '9999-99-99').localeCompare(b.due_date || '9999-99-99')
  || (PRI[a.priority] ?? 1) - (PRI[b.priority] ?? 1)
  || (a.created_at || '').localeCompare(b.created_at || '');

export function meetingActionClientId(): string {
  return newId();
}

export function isWorkItemLinkedToMeetingPerson(w: WorkItem, personId: string): boolean {
  return w.person_id === personId
    || (w.related_entities || []).some((re) => re.type === 'person' && re.id === personId);
}

export function getMeetingCommitments(items: WorkItem[], personId: string): MeetingCommitments {
  const byId = new Map<string, WorkItem>();
  for (const w of items) {
    if (w.deleted_at || w.done || w.inboxed) continue;
    if (!isWorkItemLinkedToMeetingPerson(w, personId)) continue;
    byId.set(w.id, w);
  }
  const all = [...byId.values()].sort(byDueThenPriority);
  return {
    all,
    iOwe: all.filter((w) => w.type !== 'waitingFor'),
    theyOwe: all.filter((w) => w.type === 'waitingFor'),
  };
}

const uniqueLinks = (links: RelatedEntity[]): RelatedEntity[] => {
  const seen = new Set<string>();
  const out: RelatedEntity[] = [];
  for (const link of links) {
    const key = `${link.type}:${link.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(link);
  }
  return out;
};

export function buildMeetingActionPayload({
  id,
  title,
  direction,
  dueDate,
  counterparty,
  meetingHost,
  note,
}: {
  id: string;
  title: string;
  direction: MeetingActionDirection;
  dueDate?: string;
  counterparty: Person | null;
  meetingHost: Person;
  note: Pick<Note, 'id' | 'title'>;
}): Partial<WorkItem> {
  const filed = direction !== 'inbox';
  const links: RelatedEntity[] = [];
  if (counterparty) links.push({ type: 'person', id: counterparty.id, name: counterparty.name });
  if (meetingHost.id !== counterparty?.id) links.push({ type: 'person', id: meetingHost.id, name: meetingHost.name });
  links.push({ type: 'note', id: note.id, name: note.title });

  const provenance = `Captured from meeting note: ${note.title} (${note.id})`;
  return {
    id,
    title: title.trim(),
    type: direction === 'theyOwe' ? 'waitingFor' : 'task',
    priority: 'medium',
    due_date: dueDate || null,
    person_id: filed ? (counterparty?.id || null) : null,
    project_id: null,
    related_entities: uniqueLinks(links),
    notes: provenance,
    inboxed: !filed,
    source: filed ? 'meeting' : 'you',
  };
}
