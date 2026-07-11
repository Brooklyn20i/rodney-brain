import { useEffect, useState } from 'react';
import { useCadence } from '../../lib/store';
import type { Project } from '../../lib/types';

// THE single edit surface for a project's next action. The old screen edited
// next_action in two tabs with duplicated local state — edits in one could
// silently clobber the other. Every surface now renders this one component.
export function NextActionEditor({ project }: { project: Project }) {
  const { update } = useCadence();
  const [value, setValue] = useState(project.next_action || '');
  useEffect(() => { setValue(project.next_action || ''); }, [project.id, project.next_action]);

  return (
    <div className="proj-control-next">
      <label>Next action</label>
      <input
        type="text"
        value={value}
        placeholder="The single next step…"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { if (value !== (project.next_action || '')) update('projects', project.id, { next_action: value } as Partial<Project>); }}
      />
    </div>
  );
}
