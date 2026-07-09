// Deterministic fixture for the E2E provider. Dates are computed relative to the
// real clock at runtime so "overdue / this week / horizon" buckets are stable.
const pad = (n: number) => String(n).padStart(2, '0');
const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function makeSeed() {
  const people = [
    { id: 'pAnna', name: 'Anna Lee', type: 'person', role: 'Director', color: '#1B5E9E' },
    { id: 'pBob', name: 'Bob Ng', type: 'person', role: 'Lead', color: '#6B3FA0' },
    { id: 'pCara', name: 'Cara Diaz', type: 'person', role: 'Partner', color: '#1A7F37' },
  ];

  const projects = [
    { id: 'prApollo', name: 'Apollo', goal: 'Ship v2', status: 'active', health: 'red', owner: 'Anna Lee', target_date: addDays(5), next_action: 'Lock the scope', color: '#D93025', deleted_at: null },
    { id: 'prBorealis', name: 'Borealis', goal: 'Expand', status: 'active', health: 'amber', owner: 'Bob Ng', target_date: addDays(20), next_action: 'Confirm resourcing', color: '#E07D00', deleted_at: null },
    { id: 'prCeres', name: 'Ceres', goal: 'Maintain', status: 'active', health: 'green', owner: 'Cara Diaz', target_date: null, next_action: '', color: '#1A7F37', deleted_at: null },
  ];

  const wi = (o: any) => ({
    type: 'task', priority: 'medium', due_date: null, project_id: null, person_id: null,
    notes: '', done: false, inboxed: false, source: '', completed_at: null, related_entities: undefined, ...o,
  });

  const work_items = [
    wi({ id: 'w1', title: 'Approve Q3 budget', type: 'decision', priority: 'high', person_id: 'pAnna' }),
    wi({ id: 'w2', title: 'Finalise vendor list', priority: 'high', person_id: 'pAnna', project_id: 'prApollo', due_date: addDays(3) }),
    wi({ id: 'w3', title: 'Overdue review', person_id: 'pAnna', due_date: addDays(-2) }),
    wi({ id: 'w4', title: 'Prep board pack', person_id: 'pBob', due_date: addDays(6) }),
    wi({ id: 'w5', title: 'Ceres rollout', person_id: 'pBob', project_id: 'prCeres' }),
    wi({ id: 'w6', title: 'Loose idea' }),
    wi({ id: 'w7', title: 'Multi-owner task', person_id: 'pAnna', related_entities: [
      { type: 'person', id: 'pAnna', name: 'Anna Lee' }, { type: 'person', id: 'pBob', name: 'Bob Ng' },
    ]}),
    wi({ id: 'w8', title: 'Cara task', person_id: 'pCara' }),
    wi({ id: 'w9', title: 'Awaiting legal sign-off', type: 'waitingFor', person_id: 'pBob' }),
    wi({ id: 'w10', title: 'Draft summary', source: 'for:kobe' }),
    wi({ id: 'w11', title: 'Created by Kobe check', source: 'agent:kobe', person_id: 'pAnna' }),
  ];

  const milestones = [
    { id: 'm1', project_id: 'prApollo', title: 'Design freeze', due_date: addDays(4), done: false, deleted_at: null },
    { id: 'm2', project_id: 'prBorealis', title: 'Beta launch', due_date: addDays(15), done: false, deleted_at: null },
  ];

  const notes = [
    { id: 'note-anna', title: '1:1 · Anna Lee', folder: '__mtg__pAnna', body: '{}', updated_at: addDays(-1) },
    { id: 'mdates', title: '__meeting_dates__', body: JSON.stringify({ 'note-anna': addDays(2) }), updated_at: addDays(-1) },
  ];

  return { people, projects, work_items, milestones, notes };
}
