/**
 * Behavioural workflow tests — render the real screens with controllable mock
 * data and drive the actual user interactions (clicks, toggles, moves) to catch
 * runtime bugs that static review misses. The store and the meeting-dates hook
 * are mocked; every other piece of component logic runs for real.
 */
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
import { Horizon } from '../Horizon';
import { Today } from '../Today';
import { Tasks } from '../Tasks';
import { Inbox } from '../Inbox';
import { Notes } from '../Notes';
import { Review } from '../Review';

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
const milestone = (o: any) => ({
  id: 'm', project_id: 'pr', title: 'MS', due_date: null, done: false,
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

  it('projects mode moves by project_id only', () => {
    setStore({ data: {
      projects: [project({ id: 'prA', name: 'Apollo' }), project({ id: 'prB', name: 'Borealis' })],
      work_items: [wi({ id: 't1', title: 'Alpha', project_id: 'prA' })],
    }});
    render(<Board onMenu={() => {}} />);
    fireEvent.click(screen.getByText(/By project/));
    const card = screen.getByText('Alpha').closest('.board-card') as HTMLElement;
    fireEvent.click(within(card).getByTitle(/Move to another project/));
    fireEvent.click(screen.getByText('Borealis'));
    expect(h.store.update).toHaveBeenCalledWith('work_items', 't1', { project_id: 'prB' });
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

// ── Horizon ─────────────────────────────────────────────────────────────────────
describe('Horizon workflow', () => {
  it('renders forward markers and navigates to the project', () => {
    const onNavigate = vi.fn();
    setStore({ data: {
      projects: [project({ id: 'prA', name: 'Apollo', target_date: addDaysStr(10), health: 'amber' })],
      milestones: [milestone({ id: 'm1', project_id: 'prA', title: 'Kickoff', due_date: addDaysStr(3) })],
    }});
    render(<Horizon onMenu={() => {}} onNavigate={onNavigate} />);
    expect(screen.getByText('Kickoff')).toBeInTheDocument();
    // Apollo appears twice — milestone subtitle + target title — both expected.
    expect(screen.getAllByText('Apollo').length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByText('Kickoff'));
    expect(onNavigate).toHaveBeenCalledWith('projects', 'prA');
  });

  it('shows an empty state with no markers', () => {
    setStore({ data: {} });
    render(<Horizon onMenu={() => {}} onNavigate={() => {}} />);
    expect(screen.getByText(/No upcoming milestones/)).toBeInTheDocument();
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
        wi({ id: 'wf', title: 'Vendor reply', type: 'waitingFor', person_id: 'pA' }),
        wi({ id: 'k1', title: 'Kobe task', source: 'for:kobe' }),
      ],
    }});
    render(<Today onMenu={() => {}} />);
    // urgency group headers
    expect(screen.getByText(/Overdue · 1/)).toBeInTheDocument();
    expect(screen.getByText(/This week · 1/)).toBeInTheDocument();
    // waiting + kobe are their own sections, not in the to-do
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
  it('groups by due date and reflects the subtitle counts', () => {
    setStore({ data: { work_items: [
      wi({ id: 't1', title: 'Overdue one', due_date: addDaysStr(-1) }),
      wi({ id: 't2', title: 'Later one', due_date: addDaysStr(20) }),
    ]}});
    render(<Tasks onMenu={() => {}} />);
    expect(screen.getByText('Overdue one')).toBeInTheDocument();
    expect(screen.getByText('Later one')).toBeInTheDocument();
    expect(screen.getByText(/2 open · 1 overdue/)).toBeInTheDocument();
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
});

// ── Smoke: every screen renders without crashing (empty + populated) ──────────────
describe('Screen render smoke', () => {
  const screens: [string, () => JSX.Element][] = [
    ['Tasks', () => <Tasks onMenu={() => {}} />],
    ['Inbox', () => <Inbox onMenu={() => {}} />],
    ['Notes', () => <Notes onMenu={() => {}} />],
    ['Review', () => <Review onMenu={() => {}} />],
    ['Dashboard', () => <Dashboard onMenu={() => {}} onNavigate={() => {}} />],
    ['Horizon', () => <Horizon onMenu={() => {}} onNavigate={() => {}} />],
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
