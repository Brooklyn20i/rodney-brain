import { describe, expect, it } from 'vitest';
import { buildNoteInsert, buildWorkItemInsert } from '../../../../backend/functions/ace-chat/workspace';

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
});
