/**
 * Contextual Ace prompts — pure builders. The contract: every prompt embeds
 * the entity's NAME (Ace resolves entities server-side via its search/list
 * tools, not our local ids), and the briefing id is a deterministic
 * UUID-shaped key that changes only with the date.
 */
import { describe, it, expect } from 'vitest';
import {
  projectSummaryPrompt, projectUpdateDraftPrompt, projectRiskPrompt,
  taskBreakdownPrompt, taskFollowUpPrompt, meetingPrepPrompt,
  dailyBriefingPrompt, briefingRequestId,
} from '../acePrompts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('entity prompts embed the entity name', () => {
  const project = { name: 'Apollo Reset' };
  const task = { title: 'Chase vendor quote' };
  const person = { name: 'Anna Lee' };

  it.each([
    ['projectSummaryPrompt', projectSummaryPrompt(project)],
    ['projectUpdateDraftPrompt', projectUpdateDraftPrompt(project)],
    ['projectRiskPrompt', projectRiskPrompt(project)],
  ])('%s names the project', (_n, prompt) => {
    expect(prompt).toContain('Apollo Reset');
  });

  it.each([
    ['taskBreakdownPrompt', taskBreakdownPrompt(task)],
    ['taskFollowUpPrompt', taskFollowUpPrompt(task)],
  ])('%s names the task', (_n, prompt) => {
    expect(prompt).toContain('Chase vendor quote');
  });

  it('meetingPrepPrompt keeps the wording the prep brief has always sent', () => {
    expect(meetingPrepPrompt(person)).toBe(
      'Summarise what I should cover in my 1:1 with Anna Lee today. Include key open actions, any blockers, and suggested agenda items based on our recent history.',
    );
  });

  it('dailyBriefingPrompt names the date', () => {
    expect(dailyBriefingPrompt('2026-07-10')).toContain('2026-07-10');
  });
});

describe('briefingRequestId', () => {
  it('is UUID-shaped (the ace-chat function validates the format)', () => {
    expect(briefingRequestId('2026-07-10')).toMatch(UUID_RE);
  });

  it('is deterministic for a date and distinct across dates', () => {
    expect(briefingRequestId('2026-07-10')).toBe(briefingRequestId('2026-07-10'));
    expect(briefingRequestId('2026-07-10')).not.toBe(briefingRequestId('2026-07-11'));
  });

  it('rejects non-date input rather than minting a colliding id', () => {
    expect(() => briefingRequestId('today')).toThrow();
  });
});
