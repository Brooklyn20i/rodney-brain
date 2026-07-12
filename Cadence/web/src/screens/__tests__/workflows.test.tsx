/**
 * Behavioural workflow tests — render the real screens with controllable mock
 * data and drive the actual user interactions (clicks, toggles, moves) to catch
 * runtime bugs that static review misses. The store and the meeting-dates hook
 * are mocked; every other piece of component logic runs for real.
 */
import type { ReactElement } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
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

import { Dashboard } from '../Dashboard';
import { Home } from '../taskScreens';
import { Inbox } from '../Inbox';
import { Notes } from '../Notes';
import { People } from '../People';
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
  it('is seven screens, Home first, with Search/Settings in the footer only', () => {
    const items = WORK_NAV.flatMap((g) => g.items);
    expect(items.map((i) => i.id)).toEqual([
      'home', 'people', 'meetings', 'projects', 'notes', 'inbox', 'dashboard',
    ]);
    expect(items[0].label).toBe('Home');
  });

  it('has no agent or retired-cockpit surfaces in the sidebar', () => {
    const ids = WORK_NAV.flatMap((g) => g.items).map((i) => i.id);
    for (const gone of ['ace', 'kobe', 'today', 'tasks', 'board', 'review', 'calendar']) {
      expect(ids).not.toContain(gone);
    }
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

// ── Home ────────────────────────────────────────────────────────────────────────
describe('Home workflow', () => {
  it('lands as Home: my commitments with lanes and counts', () => {
    setStore({ data: { work_items: [
      wi({ id: 't1', title: 'Overdue one', due_date: addDaysStr(-1) }),
      wi({ id: 't2', title: 'Later one', due_date: addDaysStr(20) }),
    ]}});
    render(<Home onMenu={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByText('Mine')).toBeInTheDocument();
    expect(screen.getByText('Waiting')).toBeInTheDocument();
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
    render(<Home onMenu={() => {}} />);
    fireEvent.click(screen.getByText('Person'));
    // 'Anna' shows as both the group header and the task's person tag.
    expect(screen.getAllByText('Anna').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Hers')).toBeInTheDocument();
  });

  it('files an unassigned meeting action directly into Tasks', async () => {
    const body = JSON.stringify({
      agenda: [],
      actions: [{ id: 'a1', title: 'Unassigned meeting action', owner: 'me', due: '', done: false, pushed: false }],
      notes: '',
    });
    setStore({ data: { notes: [{ id: 'n1', title: 'Ops sync', folder: '__mtg__team', body }] } });
    render(<Home onMenu={() => {}} />);
    fireEvent.click(screen.getByText('File →'));
    fireEvent.click(screen.getByText('↓ Send to Tasks'));
    await Promise.resolve();
    await Promise.resolve();
    expect(h.store.insert).toHaveBeenCalledWith('work_items', expect.objectContaining({
      title: 'Unassigned meeting action',
      inboxed: false,
    }));
    expect(h.store.update).toHaveBeenCalledWith('notes', 'n1', expect.objectContaining({
      body: expect.stringContaining('"pushed_to":"Tasks"'),
    }));
  });
});

// ── People ledger ───────────────────────────────────────────────────────────────
describe('People ledger', () => {
  it('splits a person into owes-me and I-owe sections with overdue flag', () => {
    setStore({ data: {
      people: [person({ id: 'pA', name: 'Anna Lee' })],
      work_items: [
        wi({ id: 'mine', title: 'Send Anna the deck', person_id: 'pA', type: 'task' }),
        wi({ id: 'theirs', title: 'Q3 numbers from Anna', person_id: 'pA', type: 'waitingFor', due_date: addDaysStr(-1) }),
      ],
    }});
    render(<People onMenu={() => {}} initialSelectedId="pA" />);
    expect(screen.getByText('📤 Anna owes me')).toBeInTheDocument();
    expect(screen.getByText('📥 I owe Anna')).toBeInTheDocument();
    expect(screen.getByText('Q3 numbers from Anna')).toBeInTheDocument();
    expect(screen.getByText('Send Anna the deck')).toBeInTheDocument();
    expect(screen.getByText('1 overdue')).toBeInTheDocument();
    // Rail meta shows the two-way counts.
    expect(screen.getByText(/owes you 1 · you owe 1/)).toBeInTheDocument();
  });

  it('the owes-me quick-add delegates: inserts a waitingFor linked to the person', () => {
    const insert = vi.fn().mockResolvedValue({});
    setStore({ insert, data: { people: [person({ id: 'pA', name: 'Anna Lee' })] } });
    render(<People onMenu={() => {}} initialSelectedId="pA" />);
    const input = screen.getByPlaceholderText('Give Anna a task — press Enter');
    fireEvent.change(input, { target: { value: 'Send me the Q3 numbers' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(insert).toHaveBeenCalledWith('work_items', expect.objectContaining({
      title: 'Send me the Q3 numbers',
      type: 'waitingFor',
      person_id: 'pA',
      inboxed: false,
    }));
  });

  it('the I-owe quick-add inserts a plain task linked to the person', () => {
    const insert = vi.fn().mockResolvedValue({});
    setStore({ insert, data: { people: [person({ id: 'pA', name: 'Anna Lee' })] } });
    render(<People onMenu={() => {}} initialSelectedId="pA" />);
    const input = screen.getByPlaceholderText('Something I owe Anna — press Enter');
    fireEvent.change(input, { target: { value: 'Review her proposal' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(insert).toHaveBeenCalledWith('work_items', expect.objectContaining({
      title: 'Review her proposal',
      type: 'task',
      person_id: 'pA',
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
    expect(screen.getByRole('heading', { name: 'Inbox' })).toBeInTheDocument();
    expect(screen.getByText('Unprocessed captures — triage each into its home')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Capture task/ })).toBeInTheDocument();
    expect(screen.getByText('Captured note')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done triaging' }));
    expect(h.store.update).toHaveBeenCalledWith('work_items', 'in1', { inboxed: false });
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
    ['Home', () => <Home onMenu={() => {}} />],
    ['Inbox', () => <Inbox onMenu={() => {}} />],
    ['Notes', () => <Notes onMenu={() => {}} />],
    ['Dashboard', () => <Dashboard onMenu={() => {}} onNavigate={() => {}} />],
  ];
  for (const [name, el] of screens) {
    it(`${name} renders with empty data`, () => {
      setStore({ data: {} });
      expect(() => render(el())).not.toThrow();
    });
  }
});
