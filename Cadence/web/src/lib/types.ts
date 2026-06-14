// Types mirror the Postgres schema (snake_case columns) so what the client
// holds is exactly what the database returns — no mapping layer to drift.

export type ItemType = 'task' | 'decision' | 'followUp' | 'waitingFor' | 'risk' | 'action';
export type Priority = 'high' | 'medium' | 'low';
export type ProjectStatus = 'active' | 'onHold' | 'completed';
export type DecisionStatus = 'pending' | 'decided' | 'deferred';
export type Health = 'green' | 'amber' | 'red';
export type EmailStatus = 'draft' | 'queued' | 'sent' | 'cancelled';

export interface Project {
  id: string; owner_id: string;
  name: string; goal: string; status: ProjectStatus; health: Health;
  owner: string; target_date: string | null; next_action: string; color: string;
  pillar_id?: string; kpi_ids?: string[]; // strategy linkage (migration 0006)
  created_at: string; updated_at: string; deleted_at: string | null;
}
export interface Milestone {
  id: string; owner_id: string; project_id: string;
  title: string; due_date: string | null; done: boolean;
  phase_id?: string | null; // migration 0006
  created_at: string; updated_at: string; deleted_at: string | null;
}
export interface ProjectPhase {
  id: string; owner_id: string; project_id: string;
  name: string; start_date: string | null; end_date: string | null; sort: number;
  created_at: string; updated_at: string; deleted_at: string | null;
}
export interface RaidItem {
  id: string; owner_id: string; project_id: string;
  kind: 'risk' | 'assumption' | 'issue' | 'dependency';
  text: string; owner: string; severity: 'high' | 'medium' | 'low'; status: 'open' | 'closed';
  created_at: string; updated_at: string; deleted_at: string | null;
}
export interface Stakeholder {
  id: string; owner_id: string; project_id: string;
  person_id: string | null; name: string; raci: 'R' | 'A' | 'C' | 'I';
  created_at: string; updated_at: string; deleted_at: string | null;
}
export interface ProjectUpdate {
  id: string; owner_id: string; project_id: string;
  text: string; health: Health | null; author: string;
  created_at: string; updated_at: string; deleted_at: string | null;
}
export interface Person {
  id: string; owner_id: string;
  name: string; role: string; email: string; notes: string;
  color?: string; // optional until migration 0004 is applied
  created_at: string; updated_at: string; deleted_at: string | null;
}
export interface TalkingPoint {
  id: string; owner_id: string; person_id: string;
  text: string; done: boolean; author: string;
  created_at: string; updated_at: string; deleted_at: string | null;
}
export interface WorkItem {
  id: string; owner_id: string;
  title: string; type: ItemType; priority: Priority; due_date: string | null;
  project_id: string | null; person_id: string | null; notes: string;
  done: boolean; inboxed: boolean; source: string; completed_at: string | null;
  phase_id?: string | null; // migration 0006
  created_at: string; updated_at: string; deleted_at: string | null;
}
export interface Comment {
  id: string; owner_id: string; work_item_id: string;
  text: string; author: string;
  created_at: string; updated_at: string; deleted_at: string | null;
}
export interface Decision {
  id: string; owner_id: string;
  title: string; status: DecisionStatus; due_date: string | null;
  context: string; outcome: string;
  created_at: string; updated_at: string; deleted_at: string | null;
}
export interface Note {
  id: string; owner_id: string;
  title: string; body: string;
  folder?: string; // optional until migration 0005 is applied
  created_at: string; updated_at: string; deleted_at: string | null;
}
export interface OutboxEmail {
  id: string; owner_id: string;
  to: string; cc: string; subject: string; body: string; status: EmailStatus;
  related_project_id: string | null; related_work_item_id: string | null;
  created_by: string; sent_at: string | null; sent_via: string | null;
  created_at: string; updated_at: string; deleted_at: string | null;
}
export interface LinkRec {
  id: string; owner_id: string;
  parent_type: 'project' | 'work_item'; parent_id: string; url: string; title: string;
  created_at: string; updated_at: string; deleted_at: string | null;
}
export interface Activity {
  id: string; owner_id: string;
  actor: string; action: string; detail: string; created_at: string;
}

export interface CadenceData {
  projects: Project[];
  milestones: Milestone[];
  project_updates: ProjectUpdate[];
  people: Person[];
  talking_points: TalkingPoint[];
  work_items: WorkItem[];
  comments: Comment[];
  decisions: Decision[];
  notes: Note[];
  outbox: OutboxEmail[];
  links: LinkRec[];
  activity: Activity[];
  project_phases: ProjectPhase[];
  raid_items: RaidItem[];
  stakeholders: Stakeholder[];
}

export const TABLES: (keyof CadenceData)[] = [
  'projects', 'milestones', 'project_updates', 'people', 'talking_points',
  'work_items', 'comments', 'decisions', 'notes', 'outbox', 'links', 'activity',
  'project_phases', 'raid_items', 'stakeholders',
];

export const emptyData = (): CadenceData => ({
  projects: [], milestones: [], project_updates: [], people: [], talking_points: [],
  work_items: [], comments: [], decisions: [], notes: [], outbox: [], links: [], activity: [],
  project_phases: [], raid_items: [], stakeholders: [],
});
