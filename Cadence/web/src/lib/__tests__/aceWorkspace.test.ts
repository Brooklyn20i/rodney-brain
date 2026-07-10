import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildNoteInsert, buildWorkItemInsert } from '../../../../backend/functions/ace-chat/workspace';

const here = dirname(fileURLToPath(import.meta.url));
const aceChatSource = () => readFileSync(resolve(here, '../../../../backend/functions/ace-chat/index.ts'), 'utf8');

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
    expect(source).toContain('from("work_items").select("*").eq("workspace_id", workspaceId)');
    expect(source).toContain('from("projects").select("*").eq("workspace_id", workspaceId)');
    expect(source).toContain('.from("people")\n        .select("*")\n        .eq("workspace_id", workspaceId)');
    expect(source).toContain('from("decisions").select("*").eq("workspace_id", workspaceId)');
    expect(source).toContain('from("work_items").select("id,title,type,priority,done,due_date,project_id,person_id").eq("workspace_id", workspaceId)');
    expect(source).toContain('from("notes").select("id,title,folder,updated_at").eq("workspace_id", workspaceId)');
    expect(source).toContain('.update(patch)\n        .eq("workspace_id", workspaceId)\n        .eq("id", input.id as string)');
  });
});
