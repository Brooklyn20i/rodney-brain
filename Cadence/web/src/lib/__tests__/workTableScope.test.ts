import { describe, expect, it } from 'vitest';
import { applyWorkTableScope } from '../workTableScope';

function recordingQuery() {
  const filters: Array<[string, string]> = [];
  const query = {
    eq(column: string, value: string) {
      filters.push([column, value]);
      return query;
    },
  };
  return { query, filters };
}

describe('applyWorkTableScope', () => {
  it('does not add workspace_id to owner-scoped agent messages', () => {
    const { query, filters } = recordingQuery();

    applyWorkTableScope(query, 'agent_messages', 'workspace-123');

    expect(filters).toEqual([]);
  });

  it('adds workspace_id to normal workspace-scoped tables', () => {
    const { query, filters } = recordingQuery();

    applyWorkTableScope(query, 'work_items', 'workspace-123');

    expect(filters).toEqual([['workspace_id', 'workspace-123']]);
  });
});
