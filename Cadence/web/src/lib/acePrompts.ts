// Pure prompt builders for contextual Ace actions. Every builder embeds the
// entity's NAME so Ace's tools (search / list_tasks / list_projects /
// list_people) can resolve it server-side — the function receives only the
// message text, never our local ids. Pure and unit-testable, no LLM involved.

import type { Project, WorkItem, Person } from './types';

export function projectSummaryPrompt(project: Pick<Project, 'name'>): string {
  return `Summarise the current state of the project "${project.name}": overall health, latest update, open actions and blockers, and what needs attention next. Be concise.`;
}

export function projectUpdateDraftPrompt(project: Pick<Project, 'name'>): string {
  return `Draft a short status update for the project "${project.name}" that I could post: what moved recently, what's blocked, and the next step. Base it on the project's open tasks and history.`;
}

export function projectRiskPrompt(project: Pick<Project, 'name'>): string {
  return `What's at risk on the project "${project.name}"? List overdue or stalled items, open decisions and blockers, and suggest the single most useful intervention.`;
}

export function taskBreakdownPrompt(task: Pick<WorkItem, 'title'>): string {
  return `Help me break down this task into concrete next steps: "${task.title}". Suggest 3-5 sub-steps in order.`;
}

export function taskFollowUpPrompt(task: Pick<WorkItem, 'title'>): string {
  return `Draft a short, polite follow-up message chasing this item: "${task.title}". Keep it to a few sentences I can paste into an email or chat.`;
}

// Matches the wording the prep-brief panel has always sent, so retry
// idempotency and server-side behaviour are unchanged by the extraction.
export function meetingPrepPrompt(person: Pick<Person, 'name'>): string {
  return `Summarise what I should cover in my 1:1 with ${person.name} today. Include key open actions, any blockers, and suggested agenda items based on our recent history.`;
}

export function dailyBriefingPrompt(dateISO: string): string {
  return `Give me my daily briefing for ${dateISO}. Cover: tasks overdue and due today, what I'm waiting on from others, projects that are amber or red (and why), and any meetings today I should prepare for. Keep it scannable — short sections, bullet points.`;
}

// Deterministic request id for the once-per-day briefing. The ace-chat
// function requires a UUID-shaped id and enforces uniqueness per
// (owner, request_id) via migration 0041 — embedding the date gives us
// "at most one briefing per day" for free: a second fire the same day is
// treated as already accepted. Not random by design.
export function briefingRequestId(dateISO: string): string {
  const digits = dateISO.replace(/-/g, ''); // e.g. 20260710 — all hex-safe
  if (!/^\d{8}$/.test(digits)) throw new Error(`briefingRequestId: expected YYYY-MM-DD, got "${dateISO}"`);
  return `${digits}-ace0-4000-8000-da11b81ef000`;
}
