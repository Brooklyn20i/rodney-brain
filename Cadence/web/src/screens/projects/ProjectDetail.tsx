import { useState } from 'react';
import type { Project } from '../../lib/types';
import type { StrategyContent } from '../../lib/strategy';
import { healthIcon } from '../../lib/util';
import { HEALTH_LABEL, HEALTH_PILL_CLASS } from '../../lib/health';
import { portfolioOf } from '../../lib/selectors';
import { OverviewTab } from './tabs/OverviewTab';
import { PlanTab } from './tabs/PlanTab';
import { GovernanceTab } from './tabs/GovernanceTab';
import { AceActionButton } from '../../components/AceActionButton';
import { projectSummaryPrompt, projectUpdateDraftPrompt, projectRiskPrompt } from '../../lib/acePrompts';

type Tab = 'overview' | 'plan' | 'governance';
const TAB_LABEL: Record<Tab, string> = { overview: 'Overview', plan: 'Plan', governance: 'Governance' };

// Right pane of the Projects split view. Three tabs:
//  Overview — the control sheet (goal, health + evidence, next action, lanes)
//  Plan — timeline, phases, milestones, open items
//  Governance — updates, RACI, RAID, links, completed (né "Advanced")
export function ProjectDetail({ project, strategy, onEdit, onClose }: {
  project: Project; strategy: StrategyContent;
  onEdit: () => void; onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  const portfolio = portfolioOf(project);

  return (
    <div className="split-right proj-detail-pane" key={project.id}>
      <div className="proj-detail-head">
        <div className="proj-detail-head-main">
          <h2 className="proj-detail-name">{project.name}</h2>
          <div className="proj-detail-chips">
            <span className={`health-pill ${HEALTH_PILL_CLASS[project.health]}`}>{healthIcon(project.health)} {HEALTH_LABEL[project.health]}</span>
            {portfolio && <span className="tag tag-info">{portfolio}</span>}
          </div>
        </div>
        <div className="proj-detail-head-actions">
          <AceActionButton
            contextLabel={project.name}
            actions={[
              { label: 'Summarise this project', prompt: projectSummaryPrompt(project) },
              { label: 'Draft a status update', prompt: projectUpdateDraftPrompt(project) },
              { label: "What's at risk?", prompt: projectRiskPrompt(project) },
            ]}
          />
          <button className="btn btn-secondary btn-sm" onClick={onEdit}>Edit</button>
          <button className="btn btn-ghost btn-sm" onClick={onClose} title="Close">✕</button>
        </div>
      </div>

      <div className="proj-detail-tabs proj-detail-tabs-secondary">
        {(['overview', 'plan', 'governance'] as const).map((t) => (
          <button key={t} className={`proj-sheet-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="proj-detail-body">
        {tab === 'overview' && <OverviewTab project={project} strategy={strategy} />}
        {tab === 'plan' && <PlanTab project={project} />}
        {tab === 'governance' && <GovernanceTab project={project} />}
      </div>
    </div>
  );
}
