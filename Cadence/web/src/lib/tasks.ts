// Shared task helpers — used by the Tasks hub, the Inbox, meeting "push"
// flows, and quick capture. Centralising these guarantees that converting a
// meeting action into a work_item always carries its due date and owner, and
// that the "filed vs needs-triage" rule is applied consistently everywhere.

import type { WorkItem, RelatedEntity } from './types';

export const MTG_FOLDER_PREFIX = '__mtg__';

// Reassign a work item's primary person: drop the previous primary from
// related_entities and add the new one, preserving every other link (extra
// people, projects, notes). Keeps the Board's quick-move consistent with the
// People screen, which matches on person_id OR a related_entities person link.
export function reassignPrimaryPerson(
  links: RelatedEntity[] | undefined,
  oldPersonId: string | null,
  newPerson: { id: string; name: string } | null,
): RelatedEntity[] {
  const next = (links || []).filter((e) => !(e.type === 'person' && e.id === oldPersonId));
  if (newPerson && !next.some((e) => e.id === newPerson.id)) {
    next.push({ type: 'person', id: newPerson.id, name: newPerson.name });
  }
  return next;
}

// Reassign a work item's primary project: drop the previous primary from
// related_entities and add the new one, preserving every other link. Mirrors
// reassignPrimaryPerson so the Board's quick-move can't leave a stale project
// link behind that would keep the task showing under its old project.
export function reassignPrimaryProject(
  links: RelatedEntity[] | undefined,
  oldProjectId: string | null,
  newProject: { id: string; name: string } | null,
): RelatedEntity[] {
  const next = (links || []).filter((e) => !(e.type === 'project' && e.id === oldProjectId));
  if (newProject && !next.some((e) => e.id === newProject.id)) {
    next.push({ type: 'project', id: newProject.id, name: newProject.name });
  }
  return next;
}

// Canonical "does this task belong to X" predicates — the single source of
// truth for every open-items count. A task is linked to a person/project if the
// denormalised column points at it OR a related_entities link does, so a task
// that names several people/projects is counted consistently on every surface
// (cards, detail panels, meeting import) instead of some using person_id/
// project_id and others using related_entities.
export const isLinkedToPerson = (
  w: Pick<WorkItem, 'person_id' | 'related_entities'>,
  personId: string,
): boolean =>
  w.person_id === personId ||
  (w.related_entities || []).some((re) => re.type === 'person' && re.id === personId);

export const isLinkedToProject = (
  w: Pick<WorkItem, 'project_id' | 'related_entities'>,
  projectId: string,
): boolean =>
  w.project_id === projectId ||
  (w.related_entities || []).some((re) => re.type === 'project' && re.id === projectId);

export interface PushTarget {
  id: string;
  type: 'person' | 'project';
  name: string;
}

// A task is considered "filed" (out of the triage Inbox) once it has been
// assigned a home: a person or a project. A bare due date is deliberately NOT
// enough — adding a date in the editor shouldn't make an un-triaged capture
// silently vanish from the Inbox before you've said where it belongs.
export const isFiled = (w: Pick<WorkItem, 'person_id' | 'project_id'>): boolean =>
  !!(w.person_id || w.project_id);

// Tasks delegated away from Rodney. `for:kobe` = delegated to Kobe and is the
// only source that should read as "With Kobe" in user-facing lanes/counts.
// `agent:kobe` / `agent:ace` are provenance only (created by an agent), not
// ownership; if they are filed and open, they remain Rodney's work unless some
// other field moves them to Waiting/Decide/etc.
export const isAgentTask = (w: Pick<WorkItem, 'source'>): boolean =>
  /^(for:)/.test(w.source || '');

export const isAgentCreated = (w: Pick<WorkItem, 'source'>): boolean =>
  /^(agent:)/.test(w.source || '');

// Rodney's own open work — excludes completed and delegated-away items. This is
// the canonical base filter for every user-facing task list and count.
export const isUserTask = (w: Pick<WorkItem, 'done' | 'source'>): boolean =>
  !w.done && !isAgentTask(w);

// A user task that has been TRIAGED out of the Inbox — i.e. a "filed" task that
// belongs on the Today / Tasks / Board / People / Projects surfaces. Inbox
// captures (inboxed) are quick captures awaiting triage; they live only in the
// Inbox — even when tagged with a person or project — until the user files them
// (which clears `inboxed`). This is what lets Quick Add capture-first: tagging a
// person/project no longer yanks the note straight into that folder.
export const isFiledTask = (w: Pick<WorkItem, 'done' | 'source' | 'inboxed'>): boolean =>
  isUserTask(w) && !w.inboxed;
