import { useState } from 'react';
import { useCadence } from '../lib/store';
import type { Person, WorkItem } from '../lib/types';
import { usePrepTopics } from '../lib/prepTopics';
import type { PrepTopic, TopicStatus } from '../lib/prepTopics';
import { Due } from './bits';

const STATUS_META: Record<TopicStatus, { label: string; cls: string }> = {
  building: { label: 'Building', cls: 'topic-status-building' },
  ready: { label: 'Ready', cls: 'topic-status-ready' },
  covered: { label: 'Covered', cls: 'topic-status-covered' },
};

// One topic card: title, why-it's-on-the-agenda, ready toggle, links, and the
// live prep-task trail (real work_items — tick them here or anywhere).
function TopicCard({ topic, group, onAddToAgenda, agendaHasTopic }: {
  topic: PrepTopic;
  group: Person;
  onAddToAgenda?: (topic: PrepTopic) => void;
  agendaHasTopic?: (topicId: string) => boolean;
}) {
  const { data, update } = useCadence();
  const { updateTopic, removeTopic, addPrepTask } = usePrepTopics(group.id);
  const [why, setWhy] = useState(topic.why);
  const [taskDraft, setTaskDraft] = useState('');
  const [linkDraft, setLinkDraft] = useState('');

  const prepTasks = topic.prep_task_ids
    .map((id) => data.work_items.find((w) => w.id === id))
    .filter((w): w is WorkItem => !!w && !w.deleted_at);
  const openCount = prepTasks.filter((w) => !w.done).length;

  const cycleStatus = () => {
    const next: TopicStatus = topic.status === 'building' ? 'ready' : topic.status === 'ready' ? 'covered' : 'building';
    void updateTopic({ ...topic, status: next });
  };

  const addTask = () => {
    if (!taskDraft.trim()) return;
    void addPrepTask(topic, taskDraft, group.name);
    setTaskDraft('');
  };

  const addLink = () => {
    const url = linkDraft.trim();
    if (!url) return;
    void updateTopic({ ...topic, links: [...topic.links, { url }] });
    setLinkDraft('');
  };

  const alreadyOnAgenda = agendaHasTopic?.(topic.id) ?? false;

  return (
    <div className={`prep-topic-card${topic.status === 'covered' ? ' covered' : ''}`}>
      <div className="prep-topic-head">
        <input
          className="prep-topic-title"
          value={topic.title}
          onChange={(e) => void updateTopic({ ...topic, title: e.target.value })}
          placeholder="Topic title…"
        />
        <button className={`topic-status-chip ${STATUS_META[topic.status].cls}`} onClick={cycleStatus}
          title="Tap to cycle building → ready → covered">
          {STATUS_META[topic.status].label}
        </button>
        {onAddToAgenda && topic.status === 'ready' && (
          alreadyOnAgenda
            ? <span className="topic-on-agenda">On agenda ✓</span>
            : <button className="btn btn-primary btn-sm" onClick={() => onAddToAgenda(topic)}>+ Agenda</button>
        )}
        <button className="btn-icon" title="Delete topic" onClick={() => {
          if (window.confirm('Delete this topic (prep tasks stay)?')) void removeTopic(topic.id);
        }}>✕</button>
      </div>

      <textarea
        className="prep-topic-why"
        value={why}
        placeholder="Why is this on the agenda? What's the ask?"
        rows={2}
        onChange={(e) => setWhy(e.target.value)}
        onBlur={() => { if (why !== topic.why) void updateTopic({ ...topic, why }); }}
      />

      {/* Prep-task work trail — real tasks, live state */}
      <div className="prep-topic-tasks">
        {prepTasks.map((w) => (
          <div key={w.id} className="work-item-row">
            <input type="checkbox" checked={w.done}
              onChange={() => update('work_items', w.id, { done: !w.done, completed_at: !w.done ? new Date().toISOString() : null } as Partial<WorkItem>)} />
            <span className={`wi-title ${w.done ? 'done' : ''}`} style={{ flex: 1 }}>{w.title}</span>
            <Due date={w.due_date} />
          </div>
        ))}
        <input
          className="task-group-quickadd"
          type="text"
          placeholder="+ Prep task (lands in your Home list)…"
          value={taskDraft}
          onChange={(e) => setTaskDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addTask(); }}
        />
        {openCount > 0 && <div className="prep-topic-progress">{openCount} prep task{openCount === 1 ? '' : 's'} open</div>}
      </div>

      {/* Links / materials */}
      {(topic.links.length > 0 || true) && (
        <div className="prep-topic-links">
          {topic.links.map((l, i) => (
            <span key={i} className="prep-topic-link">
              🔗 <a href={l.url} target="_blank" rel="noreferrer">{l.title || l.url}</a>
              <button className="link-chip-remove" title="Remove link"
                onClick={() => void updateTopic({ ...topic, links: topic.links.filter((_, j) => j !== i) })}>✕</button>
            </span>
          ))}
          <input
            className="prep-topic-link-add"
            type="text"
            placeholder="+ paste a link…"
            value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addLink(); }}
          />
        </div>
      )}
    </div>
  );
}

// The topics board for a meeting series (CLT, ADX…). Used as the default tab
// on the Meetings screen and as the in-meeting panel (where `onAddToAgenda`
// puts a ready topic straight onto the open occurrence's agenda).
export function TopicsPanel({ group, onAddToAgenda, agendaHasTopic }: {
  group: Person;
  onAddToAgenda?: (topic: PrepTopic) => void;
  agendaHasTopic?: (topicId: string) => boolean;
}) {
  const { topics, addTopic } = usePrepTopics(group.id);
  const [draft, setDraft] = useState('');
  const active = topics.filter((t) => t.status !== 'covered');
  const covered = topics.filter((t) => t.status === 'covered');
  const [showCovered, setShowCovered] = useState(false);

  const add = () => {
    if (!draft.trim()) return;
    void addTopic(draft);
    setDraft('');
  };

  return (
    <div className="prep-topics">
      {active.length === 0 && (
        <p className="ledger-empty">No topics yet — what are you bringing to the next {group.name}?</p>
      )}
      {active.map((t) => (
        <TopicCard key={t.id} topic={t} group={group}
          onAddToAgenda={onAddToAgenda} agendaHasTopic={agendaHasTopic} />
      ))}
      <input
        className="task-group-quickadd"
        type="text"
        placeholder={`+ Topic for the next ${group.name}…`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
      />
      {covered.length > 0 && (
        <div className="detail-section" style={{ marginTop: 12 }}>
          <h3 style={{ cursor: 'pointer' }} onClick={() => setShowCovered((s) => !s)}>
            ✓ Covered ({covered.length}) {showCovered ? '▴' : '▾'}
          </h3>
          {showCovered && covered.map((t) => (
            <TopicCard key={t.id} topic={t} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
