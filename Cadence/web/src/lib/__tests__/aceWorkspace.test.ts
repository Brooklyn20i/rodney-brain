import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyTaskFilters,
  buildNoteInsert,
  buildTaskCountQuery,
  buildTaskCountResult,
  buildWorkItemInsert,
  sanitizeTaskFilters,
} from '../../../../backend/functions/ace-chat/workspace';

const here = dirname(fileURLToPath(import.meta.url));
const aceChatSource = () => readFileSync(resolve(here, '../../../../backend/functions/ace-chat/index.ts'), 'utf8');

class FakeTaskQuery {
  calls: Array<[string, string, unknown]> = [];

  from(table: 'work_items') {
    this.calls.push(['from', table, undefined]);
    return this;
  }

  select(columns: string, options?: { count: 'exact'; head: true }) {
    this.calls.push(['select', columns, options]);
    return this;
  }

  eq(column: string, value: unknown) {
    this.calls.push(['eq', column, value]);
    return this;
  }

  is(column: string, value: unknown) {
    this.calls.push(['is', column, value]);
    return this;
  }

  lt(column: string, value: unknown) {
    this.calls.push(['lt', column, value]);
    return this;
  }
}

describe('Ace workspace-scoped tool payloads', () => {
  it('includes workspace_id when creating Work items', () => {
    expect(buildWorkItemInsert('user-1', 'workspace-1', {
      title: 'Follow up with Ann Sofie',
      type: 'action',
      person_id: 'person-1',
      notes: 'ace test',
    })).toEqual({
      owner_id: 'user-1',
      workspace_id: 'workspace-1',
      title: 'Follow up with Ann Sofie',
      type: 'action',
      priority: 'medium',
      due_date: null,
      project_id: null,
      person_id: 'person-1',
      notes: 'ace test',
      source: 'agent:ace',
      done: false,
      inboxed: false,
    });
  });

  it('includes workspace_id when creating notes', () => {
    expect(buildNoteInsert('user-1', 'workspace-1', {
      title: 'Ace note',
      body: 'Summary',
    })).toEqual({
      owner_id: 'user-1',
      workspace_id: 'workspace-1',
      title: 'Ace note',
      body: 'Summary',
      folder: null,
    });
  });

  it('keeps every Ace read/update tool scoped to the resolved workspace', () => {
    const source = aceChatSource();
    expect(source).toContain('from("work_items").select("id,title,type,priority,done,due_date,project_id,person_id,source,inboxed,created_at").eq("workspace_id", workspaceId)');
    expect(source).toContain('from("projects").select("*").eq("workspace_id", workspaceId)');
    expect(source).toContain('.from("people")\n        .select("*")\n        .eq("workspace_id", workspaceId)');
    expect(source).toContain('from("decisions").select("*").eq("workspace_id", workspaceId)');
    expect(source).toContain('from("work_items").select("id,title,type,priority,done,due_date,project_id,person_id").eq("workspace_id", workspaceId)');
    expect(source).toContain('from("notes").select("id,title,folder,updated_at").eq("workspace_id", workspaceId)');
    expect(source).toContain('.update(patch)\n        .eq("workspace_id", workspaceId)\n        .eq("id", input.id as string)');
  });

  it('builds a compact workspace-scoped count query for aggregate task questions', () => {
    const source = aceChatSource();
    expect(source).toContain('name: "count_tasks"');
    expect(source).toContain('Use for aggregate questions like');
    expect(source).toContain('additionalProperties: false');
    expect(source).not.toContain('filters: input');

    const query = new FakeTaskQuery();
    buildTaskCountQuery(query, 'workspace-1', sanitizeTaskFilters({ done: false }), '2026-07-10');

    expect(query.calls).toEqual([
      ['from', 'work_items', undefined],
      ['select', 'id', { count: 'exact', head: true }],
      ['eq', 'workspace_id', 'workspace-1'],
      ['is', 'deleted_at', null],
      ['eq', 'done', false],
    ]);
    expect(buildTaskCountResult(42)).toEqual({ count: 42 });
    expect(buildTaskCountResult(null)).toEqual({ count: 0 });
  });

  it('sanitizes task filters before applying model-produced tool input', () => {
    const filters = sanitizeTaskFilters({
      done: false,
      inboxed: true,
      overdue: true,
      due_today: true,
      priority: 'urgent',
      project_id: '  project-1  ',
      person_id: 'p'.repeat(250),
      source: 'agent:kobe',
      unexpected: 'must not be returned',
    });

    expect(filters).toEqual({
      done: false,
      inboxed: true,
      overdue: true,
      due_today: true,
      project_id: 'project-1',
      person_id: 'p'.repeat(200),
      source: 'agent:kobe',
    });
    expect(filters).not.toHaveProperty('unexpected');
    expect(filters).not.toHaveProperty('priority');
  });

  it('applies open task count filters without fetching rows', () => {
    const query = new FakeTaskQuery();
    applyTaskFilters(query, sanitizeTaskFilters({ done: false, source: 'agent:ace' }), '2026-07-10');

    expect(query.calls).toEqual([
      ['eq', 'done', false],
      ['eq', 'source', 'agent:ace'],
    ]);
  });

  it('applies overdue filters as open items due before today', () => {
    const query = new FakeTaskQuery();
    applyTaskFilters(query, sanitizeTaskFilters({ overdue: true }), '2026-07-10');

    expect(query.calls).toEqual([
      ['lt', 'due_date', '2026-07-10'],
      ['eq', 'done', false],
    ]);
  });
});
