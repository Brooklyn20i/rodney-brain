/**
 * Behavioural workflow tests — render the real screens with controllable mock
 * data and drive the actual user interactions (clicks, toggles, moves) to catch
 * runtime bugs that static review misses. The store and the meeting-dates hook
 * are mocked; every other piece of component logic runs for real.
 */
import type { ReactElement } from 'react';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WORK_NAV } from '../../components/Sidebar';
import { emptyData } from '../../lib/types';
import { addDaysStr } from '../../lib/util';

const h = vi.hoisted(() => ({ store: {} as any, dates: {} as Record<string, string> }));

vi.mock('../../lib/store', () => ({ useCadence: () => h.store }));
vi.mock('../../lib/meetings', async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  useMeetingDates: () => ({ dates: h.dates, setMeetingDate: vi.fn() }),
}));

import { Board } from '../Board';
import { Dashboard } from '../Dashboard';
import { Today } from '../Today';
import { Tasks } from '../Tasks';
import { Inbox } from '../Inbox';
import { Notes } from '../Notes';
import { Review } from '../Review';
import { ProjectGantt, PortfolioTimeline } from '../../components/Gantt';

// ── fixtures ───────────────────────────────────────────────────────────────────
const person = (o: any) => ({ id: 'p', name: 'P', type: 'person', color: '#123', role: '', ...o });
const project = (o: any) => ({
  id: 'pr', name: 'Proj', goal: '', status: 'active', health: 'green', owner: '', target_date: null,
  next_action: '', color: '#456', deleted_at: null, created_at: '', updated_at: '', ...o,
});
const wi = (o: any) => ({
  id: 'w', title: 'T', type: 'task', priority: 'medium', due_date: null, project_id: null, person_id: null,
  notes: '', done: false, inboxed: false, source: '', completed_at: null, related_entities: undefined,
  created_at: '', updated_at: '', deleted_at: null, ...o,
});
function setStore(over: any = {}) {
  const { data: dataOver, ...rest } = over;
  h.store = {
    insert: vi.fn(), update: vi.fn(), remove: vi.fn(), logActivity: vi.fn(),
    session: { user: { id: 'me', email: 'r@x.com' } },
    ready: true, configured: true, canEdit: true,
    ...rest,
    data: { ...emptyData(), ...(dataOver || {}) },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 20));
  h.dates = {};
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

// ── Work navigation ─────────────────────────────────────────────────────────────
describe('Work navigation', () => {
  it('puts Rodney To Do / Control first and keeps database-style task browsing secondary', () => {
    expect(WORK_NAV[0].section).toBe('Control');
    expect(WORK_NAV[0].items.map((i) => i.label)).toEqual([
      'Rodney To Do', 'Quick Capture', 'Calendar', 'Filed Work', 'Notes',
    ]);
    expect(WORK_NAV.flatMap((g) => g.items).find((i) => i.id === 'dashboard')).toBeUndefined();
  });
});

// ── Board ───────────────────────────────────────────────────────────────────────
describe('Board workflow', () => {
  it('renders columns by person, folds orphaned tasks into Unassigned', () => {
    setStore({ data: {
      people: [person({ id: 'pA', name: 'Anna' }), person({ id: 'pB', name: 'Bob' })],
      work_items: [
        wi({ id: 't1', title: 'Alpha', person_id: 'pA' }),
        wi({ id: 't2', title: 'Ghosted', person_id: 'pGHOST' }), // owner not in people
      ],
    }});
    render(<Board onMenu={() => {}} />);
    expect(screen.getByText('Anna')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    // orphan must still be visible under Unassigned, never dropped
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
    expect(screen.getByText('Ghosted')).toBeInTheDocument();
  });

  it('move reassigns person_id and reconciles related_entities', () => {
    setStore({ data: {
      people: [person({ id: 'pA', name: 'Anna' }), person({ id: 'pB', name: 'Bob' })],
      work_items: [wi({ id: 't1', title: 'Alpha', person_id: 'pA', related_entities: [{ type: 'person', id: 'pA', name: 'Anna' }] })],
    }});
    render(<Board onMenu={() => {}} />);
    const card = screen.getByText('Alpha').closest('.board-card') as HTMLElement;
    fireEvent.click(within(card).getByTitle(/Move to another person/));
    fireEvent.click(screen.getByText('Bob')); // Bob is a picker option (no column yet)
    expect(h.store.update).toHaveBeenCalledWith('work_items', 't1', {
      person_id: 'pB', related_entities: [{ type: 'person', id: 'pB', name: 'Bob' }],
    });
  });

  it('projects mode reassigns project_id and reconciles related_entities', () => {
    setStore({ data: {
      projects: [project({ id: 'prA', name: 'Apollo' }), project({ id: 'prB', name: 'Borealis' })],
      work_items: [wi({ id: 't1', title: 'Alpha', project_id: 'prA', related_entities: [{ type: 'project', id: 'prA', name: 'Apollo' }] })],
    }});
    render(<Board onMenu={() => {}} />);
    fireEvent.click(screen.getByText(/By project/));
    const card = screen.getByText('Alpha').closest('.board-card') as HTMLElement;
    fireEvent.click(within(card).getByTitle(/Move to another project/));
    fireEvent.click(screen.getByText('Borealis'));
    expect(h.store.update).toHaveBeenCalledWith('work_items', 't1', {
      project_id: 'prB', related_entities: [{ type: 'project', id: 'prB', name: 'Borealis' }],
    });
  });

  it('shows an empty state when there are no open tasks', () => {
    setStore({ data: { people: [person({ id: 'pA', name: 'Anna' })], work_items: [] } });
    render(<Board onMenu={() => {}} />);
    expect(screen.getByText(/No open tasks to arrange/)).toBeInTheDocument();
  });
});

// ── Dashboard ─────────────────────────────────────────────────────────────────
describe('Dashboard workflow', () => {
  it('renders person cards and navigates on click', () => {
    const onNavigate = vi.fn();
    setStore({ data: {
      people: [person({ id: 'pA', name: 'Anna' })],
      work_items: [wi({ id: 't1', person_id: 'pA', due_date: addDaysStr(-1) })],
    }});
    render(<Dashboard onMenu={() => {}} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText('Anna'));
    expect(onNavigate).toHaveBeenCalledWith('people', 'pA');
  });

  it('toggles to the Projects tab', () => {
    const onNavigate = vi.fn();
    setStore({ data: {
      projects: [project({ id: 'prA', name: 'Apollo', health: 'red' })],
      work_items: [wi({ id: 't1', project_id: 'prA', due_date: addDaysStr(-2) })],
    }});
    render(<Dashboard onMenu={() => {}} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText(/Projects/));
    expect(screen.getByText('Apollo')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Apollo'));
    expect(onNavigate).toHaveBeenCalledWith('projects', 'prA');
  });
});

// ── Control (Today) ──────────────────────────────────────────────────────────────
describe('Control workflow', () => {
  it('shows the load strip with an over-cap nudge', () => {
    setStore({ data: {
      work_items: Array.from({ length: 8 }, (_, i) => wi({ id: 't' + i, title: 'Task' + i })),
    }});
    render(<Today onMenu={() => {}} />);
    expect(screen.getByText('To do')).toBeInTheDocument();
    expect(screen.getByText(/holding 8 open items/)).toBeInTheDocument();
  });

  it('ranks the to-do list by urgency, separates waiting, opens the editor', () => {
    setStore({ data: {
      people: [person({ id: 'pA', name: 'Anna' })],
      work_items: [
        wi({ id: 'o1', title: 'Overdue task', due_date: addDaysStr(-1) }),
        wi({ id: 'w1', title: 'Week task', due_date: addDaysStr(3) }),
        wi({ id: 'd1', title: 'Decision task', type: 'decision' }),
        wi({ id: 'wf', title: 'Vendor reply', type: 'waitingFor', person_id: 'pA' }),
        wi({ id: 'k1', title: 'Kobe task', source: 'for:kobe' }),
        wi({ id: 'ak1', title: 'Created by Kobe task', source: 'agent:kobe' }),
      ],
    }});
    render(<Today onMenu={() => {}} />);
    // urgency group headers and control lanes
    expect(screen.getByText(/Overdue · 1/)).toBeInTheDocument();
    expect(screen.getByText(/This week · 1/)).toBeInTheDocument();
    expect(screen.getByText('Needs Rodney / Do now')).toBeInTheDocument();
    expect(screen.getByText('Decide')).toBeInTheDocument();
    expect(screen.getByText('Decision task')).toBeInTheDocument();
    expect(screen.getByText('Created by Kobe task')).toBeInTheDocument();
    expect(screen.getByText('Created by Kobe')).toBeInTheDocument();
    // waiting + delegated-to-kobe are their own sections, not in the to-do
    expect(screen.getByText('Vendor reply')).toBeInTheDocument();
    expect(screen.getByText('Kobe task')).toBeInTheDocument();
    // tapping a task opens the editor
    fireEvent.click(screen.getByText('Overdue task'));
    expect(screen.getByText('Edit Item')).toBeInTheDocument();
  });

  it('hides the load strip entirely when there is nothing to show', () => {
    setStore({ data: { work_items: [] } });
    render(<Today onMenu={() => {}} />);
    expect(screen.queryByText('To do')).not.toBeInTheDocument();
  });
});

// ── Tasks ────────────────────────────────────────────────────────────────────────
describe('Tasks workflow', () => {
  it('reads as Filed Work, not the primary Control cockpit', () => {
    setStore({ data: { work_items: [
      wi({ id: 't1', title: 'Overdue one', due_date: addDaysStr(-1) }),
      wi({ id: 't2', title: 'Later one', due_date: addDaysStr(20) }),
    ]}});
    render(<Tasks onMenu={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Filed Work' })).toBeInTheDocument();
    expect(screen.getByText('Overdue one')).toBeInTheDocument();
    expect(screen.getByText('Later one')).toBeInTheDocument();
    expect(screen.getByText(/2 open · 1 overdue/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Capture task/ })).toBeInTheDocument();
  });

  it('switches grouping to Person', () => {
    setStore({ data: {
      people: [person({ id: 'pA', name: 'Anna' })],
      work_items: [wi({ id: 't1', title: 'Hers', person_id: 'pA' })],
    }});
    render(<Tasks onMenu={() => {}} />);
    fireEvent.click(screen.getByText('Person'));
    // 'Anna' shows as both the group header and the task's person tag.
    expect(screen.getAllByText('Anna').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Hers')).toBeInTheDocument();
  });

  it('files an unassigned meeting action directly into Filed Work', async () => {
    const body = JSON.stringify({
      agenda: [],
      actions: [{ id: 'a1', title: 'Unassigned meeting action', owner: 'me', due: '', done: false, pushed: false }],
      notes: '',
    });
    setStore({ data: { notes: [{ id: 'n1', title: 'Ops sync', folder: '__mtg__team', body }] } });
    render(<Tasks onMenu={() => {}} />);
    fireEvent.click(screen.getByText('File →'));
    fireEvent.click(screen.getByText('↓ Send to Filed Work'));
    await Promise.resolve();
    await Promise.resolve();
    expect(h.store.insert).toHaveBeenCalledWith('work_items', expect.objectContaining({
      title: 'Unassigned meeting action',
      inboxed: false,
    }));
    expect(h.store.update).toHaveBeenCalledWith('notes', 'n1', expect.objectContaining({
      body: expect.stringContaining('"pushed_to":"Filed Work"'),
    }));
  });
});

// ── Inbox ──────────────────────────────────────────────────────────────────────
describe('Inbox workflow', () => {
  it('stays the quick-capture triage queue', () => {
    setStore({ data: { work_items: [
      wi({ id: 'in1', title: 'Captured note', inboxed: true }),
    ]}});
    render(<Inbox onMenu={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Quick Capture' })).toBeInTheDocument();
    expect(screen.getByText('Unprocessed captures — file each into Control or Filed Work')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Capture task/ })).toBeInTheDocument();
    expect(screen.getByText('Captured note')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done triaging' }));
    expect(h.store.update).toHaveBeenCalledWith('work_items', 'in1', { inboxed: false });
  });
});

// ── Review ─────────────────────────────────────────────────────────────────────
describe('Review workflow', () => {
  it('renders a compact iPad review queue in priority order with project attention', () => {
    setStore({ data: {
      projects: [
        project({ id: 'prA', name: 'Apollo', health: 'red', next_action: 'Lock scope' }),
        project({ id: 'prB', name: 'Borealis', health: 'green', next_action: '' }),
      ],
      work_items: [
        wi({ id: 'todo', title: 'Rodney task', due_date: addDaysStr(-1) }),
        wi({ id: 'decide', title: 'Decision task', type: 'decision', project_id: 'prA' }),
        wi({ id: 'wait', title: 'Waiting task', type: 'waitingFor', project_id: 'prA' }),
        wi({ id: 'kobe', title: 'Kobe task', source: 'for:kobe' }),
        wi({ id: 'capture', title: 'Loose capture', inboxed: true }),
        wi({ id: 'agent', title: 'Created by Kobe task', source: 'agent:kobe', person_id: 'pA' }),
      ],
    }});
    render(<Review onMenu={() => {}} />);

    const queue = screen.getByLabelText('Compact work review queue');
    expect(within(queue).getByText('Needs Rodney / Do now')).toBeInTheDocument();
    expect(within(queue).getByText('Decide')).toBeInTheDocument();
    expect(within(queue).getByText('Waiting')).toBeInTheDocument();
    expect(within(queue).getByText('With Kobe')).toBeInTheDocument();
    expect(within(queue).getByText('Quick Capture')).toBeInTheDocument();
    expect(within(queue).getByText('Projects')).toBeInTheDocument();
    expect(within(queue).getByText('Data hygiene')).toBeInTheDocument();
    expect(screen.getByLabelText('Data hygiene review queue')).toBeInTheDocument();
    expect(screen.getByText(/Read-only queue for confusing Work records/)).toBeInTheDocument();
    expect(screen.getByText(/agent:kobe is provenance only/)).toBeInTheDocument();
    expect(screen.getAllByText('Needs review').length).toBeGreaterThan(0);
    expect(screen.getByText('Projects needing attention')).toBeInTheDocument();
    expect(screen.getAllByText('Apollo').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Borealis').length).toBeGreaterThanOrEqual(1);
  });
});

// ── Gantt ─────────────────────────────────────────────────────────────────────
describe('Gantt', () => {
  it('PortfolioTimeline renders a bar per active project and navigates on click', () => {
    const onSelect = vi.fn();
    const projects = [project({ id: 'pA', name: 'Apollo', status: 'active', health: 'red', target_date: addDaysStr(20) })] as any;
    const milestones = [{ id: 'm1', project_id: 'pA', title: 'MS', due_date: addDaysStr(5), done: false, deleted_at: null }] as any;
    const { container } = render(<PortfolioTimeline projects={projects} milestones={milestones} onSelect={onSelect} />);
    expect(screen.getByText('Apollo')).toBeInTheDocument();
    expect(container.querySelector('.gantt-bar')).toBeTruthy();
    fireEvent.click(screen.getByText('Apollo'));
    expect(onSelect).toHaveBeenCalledWith('pA');
  });

  it('ProjectGantt renders phase bars, milestone markers and activity bars', () => {
    const phases = [{ id: 'ph1', project_id: 'pA', name: 'Build', start_date: addDaysStr(-5), end_date: addDaysStr(10), sort: 0 }] as any;
    const milestones = [{ id: 'm1', project_id: 'pA', title: 'MS', due_date: addDaysStr(3), done: false }] as any;
    const items = [wi({ id: 'w1', title: 'Do work', project_id: 'pA', due_date: addDaysStr(6) })] as any;
    const { container } = render(<ProjectGantt phases={phases} milestones={milestones} items={items} targetDate={addDaysStr(20)} />);
    expect(container.querySelector('.gantt-bar')).toBeTruthy();   // phase
    expect(container.querySelector('.gantt-ms')).toBeTruthy();    // milestone
    expect(container.querySelector('.gantt-abar')).toBeTruthy();  // activity (work item)
    expect(screen.getByText('Do work')).toBeInTheDocument();
  });

  it('ProjectGantt plots a project that has only tasks (no phases or milestones)', () => {
    const items = [wi({ id: 'w1', title: 'Lone task', project_id: 'pA', due_date: addDaysStr(8) })] as any;
    const { container } = render(<ProjectGantt phases={[]} milestones={[]} items={items} targetDate={null} />);
    expect(container.querySelector('.gantt-abar')).toBeTruthy();
  });

  it('ProjectGantt shows a hint when there are too few dates', () => {
    render(<ProjectGantt phases={[]} milestones={[]} items={[]} targetDate={null} />);
    expect(screen.getByText(/Add due dates/)).toBeInTheDocument();
  });
});

// ── Smoke: every screen renders without crashing (empty + populated) ──────────────
describe('Screen render smoke', () => {
  const screens: [string, () => ReactElement][] = [
    ['Tasks', () => <Tasks onMenu={() => {}} />],
    ['Inbox', () => <Inbox onMenu={() => {}} />],
    ['Notes', () => <Notes onMenu={() => {}} />],
    ['Review', () => <Review onMenu={() => {}} />],
    ['Dashboard', () => <Dashboard onMenu={() => {}} onNavigate={() => {}} />],
    ['Board', () => <Board onMenu={() => {}} />],
    ['Today', () => <Today onMenu={() => {}} />],
  ];
  for (const [name, el] of screens) {
    it(`${name} renders with empty data`, () => {
      setStore({ data: {} });
      expect(() => render(el())).not.toThrow();
    });
  }
});
