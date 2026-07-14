import { describe, it, expect } from 'vitest';
import { isFiled, isAgentTask, isUserTask, reassignPrimaryPerson } from '../tasks';
import type { RelatedEntity } from '../types';

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
  it('does not treat agent-created provenance as ownership', () => {
    expect(isAgentTask({ source: 'agent:kobe' })).toBe(false);
    expect(isAgentTask({ source: 'agent:ace' })).toBe(false);
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
  it('excludes delegated work but keeps agent-created provenance in Rodney\'s lane', () => {
    expect(isUserTask({ done: false, source: 'for:kobe' })).toBe(false);
    expect(isUserTask({ done: false, source: 'agent:ace' })).toBe(true);
  });
});
