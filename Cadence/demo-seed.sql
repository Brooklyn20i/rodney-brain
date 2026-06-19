-- ============================================================
-- Cadence — Demo Account Seed Script
-- ============================================================
-- HOW TO USE:
--   1. Open your Cadence app and sign up with a new email
--      (e.g. yourname+demo@gmail.com or any temp-mail address)
--   2. Verify the email and sign in once so the user row is created
--   3. Go to Supabase Dashboard → Authentication → Users
--      Find the new account and copy the User UID (a UUID)
--   4. Replace 'PASTE-YOUR-DEMO-USER-UUID-HERE' below with that UUID
--   5. Paste this entire script into Supabase → SQL Editor → Run
--
-- The script is safe to re-run on a fresh demo account.
-- All records are owned by the user UUID you supply.
-- ============================================================

DO $$
DECLARE
  -- ── CHANGE THIS ONE VALUE ─────────────────────────────────
  uid uuid := 'PASTE-YOUR-DEMO-USER-UUID-HERE';
  -- ──────────────────────────────────────────────────────────

  -- People
  p_sarah    uuid := gen_random_uuid();
  p_marcus   uuid := gen_random_uuid();
  p_priya    uuid := gen_random_uuid();
  p_tom      uuid := gen_random_uuid();
  p_lisa     uuid := gen_random_uuid();

  -- Projects
  proj_dc    uuid := gen_random_uuid();   -- Distribution Centre Efficiency
  proj_rs    uuid := gen_random_uuid();   -- New Store Rollout — Riverdale
  proj_tdp   uuid := gen_random_uuid();   -- Team Development Program

  -- Project phases
  ph_dc1     uuid := gen_random_uuid();   -- DC: Audit & Root Cause
  ph_dc2     uuid := gen_random_uuid();   -- DC: Process Improvements
  ph_rs1     uuid := gen_random_uuid();   -- RS: Fit-out & Equipment
  ph_rs2     uuid := gen_random_uuid();   -- RS: Pre-launch & Staffing

  -- Meeting notes (2 per person = 10 total)
  n_sarah1   uuid := gen_random_uuid();   -- Sarah  upcoming 19 Jun
  n_sarah2   uuid := gen_random_uuid();   -- Sarah  past     05 Jun
  n_marcus1  uuid := gen_random_uuid();   -- Marcus upcoming 24 Jun
  n_marcus2  uuid := gen_random_uuid();   -- Marcus past     10 Jun
  n_priya1   uuid := gen_random_uuid();   -- Priya  upcoming 23 Jun
  n_priya2   uuid := gen_random_uuid();   -- Priya  past     09 Jun
  n_tom1     uuid := gen_random_uuid();   -- Tom    upcoming 01 Jul
  n_tom2     uuid := gen_random_uuid();   -- Tom    past     04 Jun
  n_lisa1    uuid := gen_random_uuid();   -- Lisa   upcoming 25 Jun
  n_lisa2    uuid := gen_random_uuid();   -- Lisa   past     11 Jun

BEGIN

-- ── PEOPLE ───────────────────────────────────────────────────────────────────
INSERT INTO people
  (id, owner_id, name, role, email, notes, color, group_name, sort_order, created_at, updated_at)
VALUES
  (p_sarah,  uid, 'Sarah Chen',    'Head of Logistics',            'sarah.chen@example.com',    'Strong analytical thinker. Data-driven. Tends to over-commit — coach on prioritisation.', '#2E7D32', 'Direct Reports',   0, now() - interval '6 months', now()),
  (p_marcus, uid, 'Marcus Webb',   'Store Operations Lead',        'marcus.webb@example.com',   'Great relationship builder. Execution-focused. Needs support on upward communication.',   '#1565C0', 'Direct Reports',   1, now() - interval '6 months', now()),
  (p_priya,  uid, 'Priya Patel',   'People & Culture Manager',     'priya.patel@example.com',   'High potential. Excellent facilitator. Development goal: strategic business partnering.',  '#6A1B9A', 'Direct Reports',   2, now() - interval '6 months', now()),
  (p_lisa,   uid, 'Lisa Tanaka',   'Category Manager',             'lisa.tanaka@example.com',   'Sharp commercial instinct. Strong supplier relationships. Keen to take on broader scope.', '#00695C', 'Direct Reports',   3, now() - interval '6 months', now()),
  (p_tom,    uid, 'Tom Hendricks', 'Finance Business Partner',     'tom.hendricks@example.com', 'Trusted finance partner. Detail-oriented. Monthly cadence working well.',                 '#E65100', 'Support Partners', 0, now() - interval '6 months', now());


-- ── PROJECTS ─────────────────────────────────────────────────────────────────
INSERT INTO projects
  (id, owner_id, name, goal, status, health, owner, target_date, next_action, color, pillar_id, kpi_ids, created_at, updated_at)
VALUES
  (proj_dc, uid,
   'Distribution Centre Efficiency',
   'Reduce delivery exceptions by 15% and achieve 98% on-time delivery rate by end of Q3 2026',
   'active', 'green', 'Sarah Chen', '2026-09-30',
   'Review June exception report with Sarah at next 1:1',
   '#2E7D32', '', '[]'::jsonb, now() - interval '3 months', now()),

  (proj_rs, uid,
   'New Store Rollout — Riverdale',
   'Open Riverdale store on time and within budget, achieving 90% staffing rate at launch',
   'active', 'amber', 'Marcus Webb', '2026-11-15',
   'Confirm fit-out contractor start date with Marcus',
   '#E65100', '', '[]'::jsonb, now() - interval '2 months', now()),

  (proj_tdp, uid,
   'Team Development Program',
   'Build capability across the leadership team through structured development plans and cross-functional exposure by December 2026',
   'active', 'green', 'Priya Patel', '2026-12-31',
   'Review mid-year capability review schedule with Priya',
   '#6A1B9A', '', '[]'::jsonb, now() - interval '4 months', now());


-- ── PROJECT PHASES ────────────────────────────────────────────────────────────
INSERT INTO project_phases
  (id, owner_id, project_id, name, start_date, end_date, sort, created_at, updated_at)
VALUES
  (ph_dc1, uid, proj_dc, 'Audit & Root Cause Analysis', '2026-04-01', '2026-05-15', 0, now() - interval '3 months', now()),
  (ph_dc2, uid, proj_dc, 'Process Improvements',        '2026-05-16', '2026-08-30', 1, now() - interval '3 months', now()),
  (ph_rs1, uid, proj_rs, 'Fit-out & Equipment',         '2026-06-01', '2026-09-30', 0, now() - interval '2 months', now()),
  (ph_rs2, uid, proj_rs, 'Pre-launch & Staffing',       '2026-10-01', '2026-11-14', 1, now() - interval '2 months', now());


-- ── MILESTONES ────────────────────────────────────────────────────────────────
INSERT INTO milestones
  (id, owner_id, project_id, title, due_date, done, phase_id, created_at, updated_at)
VALUES
  -- Distribution Centre Efficiency
  (gen_random_uuid(), uid, proj_dc, 'Complete exception analysis report',   '2026-05-10', true,  ph_dc1, now() - interval '3 months', now()),
  (gen_random_uuid(), uid, proj_dc, 'Route optimisation model built',       '2026-06-01', true,  ph_dc2, now() - interval '3 months', now()),
  (gen_random_uuid(), uid, proj_dc, 'Pilot route changes across 3 DCs',    '2026-07-15', false, ph_dc2, now() - interval '3 months', now()),
  (gen_random_uuid(), uid, proj_dc, 'Full network rollout complete',        '2026-09-01', false, ph_dc2, now() - interval '3 months', now()),
  -- New Store Rollout — Riverdale
  (gen_random_uuid(), uid, proj_rs, 'Site handover from landlord',         '2026-06-01', true,  ph_rs1, now() - interval '2 months', now()),
  (gen_random_uuid(), uid, proj_rs, 'Fit-out contractor engaged',          '2026-06-30', false, ph_rs1, now() - interval '2 months', now()),
  (gen_random_uuid(), uid, proj_rs, 'Equipment ordered and scheduled',     '2026-07-15', false, ph_rs1, now() - interval '2 months', now()),
  (gen_random_uuid(), uid, proj_rs, 'All staff recruited',                 '2026-10-15', false, ph_rs2, now() - interval '2 months', now()),
  (gen_random_uuid(), uid, proj_rs, 'Staff training complete',             '2026-11-07', false, ph_rs2, now() - interval '2 months', now()),
  -- Team Development Program
  (gen_random_uuid(), uid, proj_tdp, 'Individual development plans signed off', '2026-06-01', true,  NULL, now() - interval '4 months', now()),
  (gen_random_uuid(), uid, proj_tdp, 'Mid-year capability review complete',     '2026-07-30', false, NULL, now() - interval '4 months', now()),
  (gen_random_uuid(), uid, proj_tdp, 'Cross-functional shadowing program launched', '2026-08-15', false, NULL, now() - interval '4 months', now());


-- ── RAID ITEMS ────────────────────────────────────────────────────────────────
INSERT INTO raid_items
  (id, owner_id, project_id, kind, text, owner, severity, status, created_at, updated_at)
VALUES
  -- DC Efficiency
  (gen_random_uuid(), uid, proj_dc, 'risk',       'Driver shortage in July could delay pilot rollout if agency capacity is constrained', 'Sarah Chen', 'high',   'open', now() - interval '6 weeks', now()),
  (gen_random_uuid(), uid, proj_dc, 'dependency', 'Route optimisation requires IT to update dispatch system by 30 June',                 'IT Team',    'medium', 'open', now() - interval '6 weeks', now()),
  (gen_random_uuid(), uid, proj_dc, 'assumption', 'DC capacity and throughput volumes remain constant through Q3',                       '',           'low',    'open', now() - interval '6 weeks', now()),
  -- Riverdale Store Rollout
  (gen_random_uuid(), uid, proj_rs, 'risk',       'Supply chain delays on refrigeration units — 8-week lead time may impact fit-out schedule', 'Marcus Webb', 'high',   'open', now() - interval '5 weeks', now()),
  (gen_random_uuid(), uid, proj_rs, 'issue',      'Planning permit variance still pending council approval — July 3 decision date',           'Marcus Webb', 'high',   'open', now() - interval '3 weeks', now()),
  (gen_random_uuid(), uid, proj_rs, 'dependency', 'Full staffing plan requires Priya to complete recruitment brief by 15 July',               'Priya Patel', 'medium', 'open', now() - interval '5 weeks', now()),
  -- Team Development Program
  (gen_random_uuid(), uid, proj_tdp, 'assumption', 'Managers will have sufficient capacity to support development activities alongside BAU demands', '', 'medium', 'open', now() - interval '8 weeks', now());


-- ── STAKEHOLDERS ─────────────────────────────────────────────────────────────
INSERT INTO stakeholders
  (id, owner_id, project_id, person_id, name, raci, created_at, updated_at)
VALUES
  (gen_random_uuid(), uid, proj_dc,  p_sarah,  'Sarah Chen',    'R', now() - interval '3 months', now()),
  (gen_random_uuid(), uid, proj_dc,  p_tom,    'Tom Hendricks', 'C', now() - interval '3 months', now()),
  (gen_random_uuid(), uid, proj_rs,  p_marcus, 'Marcus Webb',   'R', now() - interval '2 months', now()),
  (gen_random_uuid(), uid, proj_rs,  p_priya,  'Priya Patel',   'C', now() - interval '2 months', now()),
  (gen_random_uuid(), uid, proj_rs,  p_tom,    'Tom Hendricks', 'I', now() - interval '2 months', now()),
  (gen_random_uuid(), uid, proj_tdp, p_priya,  'Priya Patel',   'R', now() - interval '4 months', now()),
  (gen_random_uuid(), uid, proj_tdp, p_lisa,   'Lisa Tanaka',   'C', now() - interval '4 months', now());


-- ── PROJECT UPDATES ──────────────────────────────────────────────────────────
INSERT INTO project_updates
  (id, owner_id, project_id, text, health, author, created_at, updated_at)
VALUES
  (gen_random_uuid(), uid, proj_dc,
   'Completed root cause analysis. Top 3 drivers of exceptions: late inbound freight (42%), traffic routing inefficiency (33%), driver allocation gaps (25%). Moving into solution design phase.',
   'green', 'You', now() - interval '4 weeks', now()),

  (gen_random_uuid(), uid, proj_dc,
   'Route optimisation model completed and tested in simulation — showing 12% improvement in exception rates. Pilot-ready. 3 DCs selected based on volume and accessibility.',
   'green', 'You', now() - interval '1 week', now()),

  (gen_random_uuid(), uid, proj_rs,
   'Planning permit variance still pending. Council meeting rescheduled to 3 July — this creates risk to the fit-out start date. Contractor shortlisting underway. Flagging project amber.',
   'amber', 'You', now() - interval '2 days', now()),

  (gen_random_uuid(), uid, proj_tdp,
   'All five direct reports have completed individual development plans. Strong engagement across the team. Key themes: data literacy, strategic thinking, cross-functional exposure.',
   'green', 'You', now() - interval '6 weeks', now()),

  (gen_random_uuid(), uid, proj_tdp,
   'Mid-year review dates being set for late July. Cross-functional shadowing program design underway with Lisa Tanaka — good stretch opportunity aligned to her development goals.',
   'green', 'You', now() - interval '2 days', now());


-- ── MEETING NOTES ────────────────────────────────────────────────────────────
INSERT INTO notes (id, owner_id, title, body, folder, created_at, updated_at) VALUES

-- Sarah Chen — upcoming (19 Jun 2026)
(n_sarah1, uid, '1:1 · Sarah Chen · 19/06/2026',
  json_build_object(
    'agenda', json_build_array(
      json_build_object('id', gen_random_uuid()::text, 'title', 'June delivery exception review',
        'notes', 'Current rate 6.2% vs 2% target — walk through the data before pilot kick-off',
        'status', 'discuss'),
      json_build_object('id', gen_random_uuid()::text, 'title', 'Pilot site selection for route changes',
        'notes', 'Confirm final 3 DCs and introduce Sarah to the IT contact for dispatch updates',
        'status', 'discuss')
    ),
    'actions', json_build_array(
      json_build_object('id', gen_random_uuid()::text, 'title', 'Prepare exception analysis slide for leadership review',
        'owner', 'me', 'due', '2026-06-24', 'done', false, 'pushed', false),
      json_build_object('id', gen_random_uuid()::text, 'title', 'Confirm the 3 DC site contacts for pilot rollout',
        'owner', 'them', 'due', '2026-06-21', 'done', false, 'pushed', false)
    ),
    'notes', '<p>Following up on last session''s discussion about inbound freight delays. Sarah has identified Tuesday morning as the highest-risk delivery window. She''ll bring the data to this meeting so we can design the pilot parameters around it.</p>'
  )::text,
  '__mtg__' || p_sarah::text,
  '2026-06-12 09:00:00+00', now()),

-- Sarah Chen — past (05 Jun 2026)
(n_sarah2, uid, '1:1 · Sarah Chen · 05/06/2026',
  json_build_object(
    'agenda', json_build_array(
      json_build_object('id', gen_random_uuid()::text, 'title', 'Q2 exception report findings',
        'notes', '', 'status', 'covered'),
      json_build_object('id', gen_random_uuid()::text, 'title', 'IT dispatch system update timeline',
        'notes', '', 'status', 'covered'),
      json_build_object('id', gen_random_uuid()::text, 'title', 'Team capacity concerns for pilot phase',
        'notes', '', 'status', 'deferred')
    ),
    'actions', json_build_array(
      json_build_object('id', gen_random_uuid()::text, 'title', 'Chase IT for dispatch system update timeline',
        'owner', 'me', 'due', '2026-06-12', 'done', true, 'pushed', false),
      json_build_object('id', gen_random_uuid()::text, 'title', 'Prepare route optimisation brief for pilot sign-off',
        'owner', 'them', 'due', '2026-06-15', 'done', true, 'pushed', false)
    ),
    'notes', '<p>Good session. Exception rate sitting at 6.2% — significantly above our 2% target. Root cause is clear: inbound freight delays upstream are the primary driver. Sarah has a strong hypothesis about Tuesday morning delivery windows being the highest-risk slot and will test this with the data before the next meeting.</p>'
  )::text,
  '__mtg__' || p_sarah::text,
  '2026-06-05 10:00:00+00', now()),

-- Marcus Webb — upcoming (24 Jun 2026)
(n_marcus1, uid, '1:1 · Marcus Webb · 24/06/2026',
  json_build_object(
    'agenda', json_build_array(
      json_build_object('id', gen_random_uuid()::text, 'title', 'Riverdale planning permit status',
        'notes', 'Council decision expected 3 July — what is our contingency if it is delayed further?',
        'status', 'discuss'),
      json_build_object('id', gen_random_uuid()::text, 'title', 'Contractor selection update',
        'notes', 'Three quotes expected by 21 June — review together and make selection call',
        'status', 'discuss')
    ),
    'actions', json_build_array(
      json_build_object('id', gen_random_uuid()::text, 'title', 'Follow up with council planning officer on July 3 timeline',
        'owner', 'me', 'due', '2026-06-20', 'done', false, 'pushed', false),
      json_build_object('id', gen_random_uuid()::text, 'title', 'Finalise three contractor quotes for review at this meeting',
        'owner', 'them', 'due', '2026-06-21', 'done', false, 'pushed', false)
    ),
    'notes', '<p>Critical meeting given the permit risk. Need to understand our contingency plan if the July 3 council decision goes against us. Marcus has been proactive in managing the council relationship — important to acknowledge that and keep him motivated on what is a frustrating process.</p>'
  )::text,
  '__mtg__' || p_marcus::text,
  '2026-06-17 14:00:00+00', now()),

-- Marcus Webb — past (10 Jun 2026)
(n_marcus2, uid, '1:1 · Marcus Webb · 10/06/2026',
  json_build_object(
    'agenda', json_build_array(
      json_build_object('id', gen_random_uuid()::text, 'title', 'Site handover confirmation',
        'notes', '', 'status', 'covered'),
      json_build_object('id', gen_random_uuid()::text, 'title', 'Fit-out scope and budget review',
        'notes', '', 'status', 'covered'),
      json_build_object('id', gen_random_uuid()::text, 'title', 'Staffing brief for Priya',
        'notes', 'Need numbers and role breakdown before Priya can start the recruitment brief',
        'status', 'discuss')
    ),
    'actions', json_build_array(
      json_build_object('id', gen_random_uuid()::text, 'title', 'Send Riverdale staffing numbers and role breakdown to Priya',
        'owner', 'them', 'due', '2026-06-30', 'done', false, 'pushed', false),
      json_build_object('id', gen_random_uuid()::text, 'title', 'Confirm fit-out scope with architect',
        'owner', 'them', 'due', '2026-06-17', 'done', true, 'pushed', false)
    ),
    'notes', '<p>Site handover confirmed on 1 June — smooth process, Marcus managed it well. The refrigeration equipment lead time (8 weeks minimum) is the biggest risk to watch on the fit-out schedule. If the contractor is not engaged by end of June we will be under real pressure.</p>'
  )::text,
  '__mtg__' || p_marcus::text,
  '2026-06-10 10:00:00+00', now()),

-- Priya Patel — upcoming (23 Jun 2026)
(n_priya1, uid, '1:1 · Priya Patel · 23/06/2026',
  json_build_object(
    'agenda', json_build_array(
      json_build_object('id', gen_random_uuid()::text, 'title', 'Mid-year review scheduling',
        'notes', 'Target: all reviews complete by 30 July — check calendar and flag any blockers',
        'status', 'discuss'),
      json_build_object('id', gen_random_uuid()::text, 'title', 'Riverdale recruitment brief status',
        'notes', 'Pending role numbers from Marcus — what can we progress in the meantime?',
        'status', 'discuss')
    ),
    'actions', json_build_array(
      json_build_object('id', gen_random_uuid()::text, 'title', 'Send mid-year review calendar invites to all direct reports',
        'owner', 'them', 'due', '2026-06-25', 'done', false, 'pushed', false),
      json_build_object('id', gen_random_uuid()::text, 'title', 'Confirm Riverdale role count once Marcus sends numbers through',
        'owner', 'them', 'due', '2026-07-05', 'done', false, 'pushed', false)
    ),
    'notes', '<p>Priya has been doing excellent work on the development program. The mid-year reviews are a key deliverable for July and I want to make sure she has adequate capacity alongside the Riverdale work. May need to sequence priorities with her in this meeting.</p>'
  )::text,
  '__mtg__' || p_priya::text,
  '2026-06-17 11:00:00+00', now()),

-- Priya Patel — past (09 Jun 2026)
(n_priya2, uid, '1:1 · Priya Patel · 09/06/2026',
  json_build_object(
    'agenda', json_build_array(
      json_build_object('id', gen_random_uuid()::text, 'title', 'Development plan sign-offs',
        'notes', '', 'status', 'covered'),
      json_build_object('id', gen_random_uuid()::text, 'title', 'Team engagement pulse check',
        'notes', '', 'status', 'covered')
    ),
    'actions', json_build_array(
      json_build_object('id', gen_random_uuid()::text, 'title', 'Share development plan template with broader leadership team',
        'owner', 'me', 'due', '2026-06-15', 'done', true, 'pushed', false),
      json_build_object('id', gen_random_uuid()::text, 'title', 'Schedule cross-functional shadowing program kickoff',
        'owner', 'them', 'due', '2026-07-01', 'done', false, 'pushed', false)
    ),
    'notes', '<p>All five direct reports have signed off development plans — great outcome. Common themes emerging: data literacy, strategic thinking, cross-functional exposure. Priya has done an excellent job facilitating these conversations and tailoring the approach to each individual.</p>'
  )::text,
  '__mtg__' || p_priya::text,
  '2026-06-09 10:00:00+00', now()),

-- Tom Hendricks — upcoming (01 Jul 2026)
(n_tom1, uid, '1:1 · Tom Hendricks · 01/07/2026',
  json_build_object(
    'agenda', json_build_array(
      json_build_object('id', gen_random_uuid()::text, 'title', 'Q2 actuals vs budget',
        'notes', 'Tom to present summary — looking for any material variances to flag upward',
        'status', 'discuss'),
      json_build_object('id', gen_random_uuid()::text, 'title', 'Riverdale store P&L model review',
        'notes', 'Align on cost assumptions before the project team sees the numbers',
        'status', 'discuss')
    ),
    'actions', json_build_array(
      json_build_object('id', gen_random_uuid()::text, 'title', 'Send Riverdale cost assumptions to Tom for P&L model',
        'owner', 'me', 'due', '2026-06-24', 'done', false, 'pushed', false),
      json_build_object('id', gen_random_uuid()::text, 'title', 'Prepare Q2 variance summary for leadership review',
        'owner', 'them', 'due', '2026-06-28', 'done', false, 'pushed', false)
    ),
    'notes', '<p>Monthly finance 1:1. Tom has confirmed Q2 actuals will be ready by 28 June. This meeting is critical — the L&D budget decision and the Riverdale financial model both depend on the Q2 numbers. Holding off on both until after this meeting.</p>'
  )::text,
  '__mtg__' || p_tom::text,
  '2026-06-17 15:00:00+00', now()),

-- Tom Hendricks — past (04 Jun 2026)
(n_tom2, uid, '1:1 · Tom Hendricks · 04/06/2026',
  json_build_object(
    'agenda', json_build_array(
      json_build_object('id', gen_random_uuid()::text, 'title', 'Q1 actuals and updated full-year forecast',
        'notes', '', 'status', 'covered'),
      json_build_object('id', gen_random_uuid()::text, 'title', 'L&D budget options for Q3',
        'notes', '', 'status', 'covered')
    ),
    'actions', json_build_array(
      json_build_object('id', gen_random_uuid()::text, 'title', 'Defer L&D budget decision until Q2 actuals available',
        'owner', 'me', 'due', '', 'done', true, 'pushed', false),
      json_build_object('id', gen_random_uuid()::text, 'title', 'Provide Riverdale project cost assumptions to Tom',
        'owner', 'me', 'due', '2026-06-24', 'done', false, 'pushed', false)
    ),
    'notes', '<p>Q1 came in 3% under budget — mainly driven by DC headcount running below plan through April. Tom recommends holding the L&D budget decision until we have Q2 actuals. Decision deferred to the July meeting. Full-year forecast remains on track.</p>'
  )::text,
  '__mtg__' || p_tom::text,
  '2026-06-04 14:00:00+00', now()),

-- Lisa Tanaka — upcoming (25 Jun 2026)
(n_lisa1, uid, '1:1 · Lisa Tanaka · 25/06/2026',
  json_build_object(
    'agenda', json_build_array(
      json_build_object('id', gen_random_uuid()::text, 'title', 'Q3 category review preparation',
        'notes', 'Lisa presenting to leadership team in August — check structure and key messages',
        'status', 'discuss'),
      json_build_object('id', gen_random_uuid()::text, 'title', 'Cross-functional TDP contribution',
        'notes', 'Lisa designing the shadowing program as a stretch project — check progress and offer support',
        'status', 'discuss')
    ),
    'actions', json_build_array(
      json_build_object('id', gen_random_uuid()::text, 'title', 'Share category data format template with Lisa for Q3 presentation',
        'owner', 'me', 'due', '2026-06-20', 'done', false, 'pushed', false),
      json_build_object('id', gen_random_uuid()::text, 'title', 'Draft cross-functional shadowing program outline',
        'owner', 'them', 'due', '2026-07-10', 'done', false, 'pushed', false)
    ),
    'notes', '<p>Lisa is taking on the TDP cross-functional shadowing design as a stretch assignment — directly relevant to her development goals for the year. Good opportunity to grow her facilitation and program design skills alongside her category work.</p>'
  )::text,
  '__mtg__' || p_lisa::text,
  '2026-06-17 13:00:00+00', now()),

-- Lisa Tanaka — past (11 Jun 2026)
(n_lisa2, uid, '1:1 · Lisa Tanaka · 11/06/2026',
  json_build_object(
    'agenda', json_build_array(
      json_build_object('id', gen_random_uuid()::text, 'title', 'Category performance Q2 review',
        'notes', '', 'status', 'covered'),
      json_build_object('id', gen_random_uuid()::text, 'title', 'Supplier contract renewals',
        'notes', '', 'status', 'covered'),
      json_build_object('id', gen_random_uuid()::text, 'title', 'Q3 planning priorities',
        'notes', '', 'status', 'discuss')
    ),
    'actions', json_build_array(
      json_build_object('id', gen_random_uuid()::text, 'title', 'Review and summarise supplier contract renewal terms',
        'owner', 'them', 'due', '2026-06-25', 'done', false, 'pushed', false),
      json_build_object('id', gen_random_uuid()::text, 'title', 'Confirm Q3 category focus areas in writing',
        'owner', 'them', 'due', '2026-06-18', 'done', false, 'pushed', false)
    ),
    'notes', '<p>Strong Q2 category performance. Lisa has been managing supplier relationships effectively. Key Q3 focus: range review and alignment with the promotional calendar. She flagged a risk on the refrigeration supplier (same vendor as the Riverdale store equipment) — worth keeping an eye on.</p>'
  )::text,
  '__mtg__' || p_lisa::text,
  '2026-06-11 10:00:00+00', now());


-- ── MEETING DATES (system note — drives "Next 1:1" badges everywhere) ─────────
INSERT INTO notes (id, owner_id, title, body, folder, created_at, updated_at) VALUES
(gen_random_uuid(), uid, '__meeting_dates__',
  json_build_object(
    n_sarah1::text,  '2026-06-19',
    n_sarah2::text,  '2026-06-05',
    n_marcus1::text, '2026-06-24',
    n_marcus2::text, '2026-06-10',
    n_priya1::text,  '2026-06-23',
    n_priya2::text,  '2026-06-09',
    n_tom1::text,    '2026-07-01',
    n_tom2::text,    '2026-06-04',
    n_lisa1::text,   '2026-06-25',
    n_lisa2::text,   '2026-06-11'
  )::text,
  '', now(), now());


-- ── WORK ITEMS ───────────────────────────────────────────────────────────────
INSERT INTO work_items
  (id, owner_id, title, type, priority, due_date, project_id, person_id,
   notes, done, inboxed, source, completed_at, created_at, updated_at)
VALUES
  -- Sarah Chen — linked to Distribution Centre project
  (gen_random_uuid(), uid, 'Review June delivery exception report with Sarah', 'task', 'high',
   '2026-06-20', proj_dc, p_sarah, '', false, false, 'you', NULL, now() - interval '3 days', now()),
  (gen_random_uuid(), uid, 'Sign off on route optimisation pilot plan', 'task', 'high',
   '2026-06-19', proj_dc, p_sarah, '', false, false, 'you', NULL, now() - interval '3 days', now()),
  (gen_random_uuid(), uid, 'Follow up with IT on dispatch system update deadline', 'followUp', 'medium',
   '2026-06-30', proj_dc, p_sarah, '', false, false, 'you', NULL, now() - interval '1 week', now()),
  (gen_random_uuid(), uid, 'Waiting on Q3 DC volume assumptions from Sarah', 'waitingFor', 'medium',
   NULL, proj_dc, p_sarah, '', false, false, 'you', NULL, now() - interval '5 days', now()),
  (gen_random_uuid(), uid, 'Q2 performance review discussion', 'task', 'low',
   NULL, NULL, p_sarah, '', true, false, 'you', '2026-06-10T09:00:00Z', now() - interval '2 months', now()),

  -- Marcus Webb — linked to Riverdale project
  (gen_random_uuid(), uid, 'Chase contractor quotes for Riverdale fit-out', 'followUp', 'high',
   '2026-06-25', proj_rs, p_marcus, '', false, false, 'you', NULL, now() - interval '4 days', now()),
  (gen_random_uuid(), uid, 'Submit planning permit variance documents to council', 'task', 'high',
   '2026-06-19', proj_rs, p_marcus, 'Supporting documents needed before the July 3 council meeting', false, false, 'you', NULL, now() - interval '1 week', now()),
  (gen_random_uuid(), uid, 'Brief Priya on Riverdale staffing requirements', 'task', 'medium',
   '2026-06-30', proj_rs, p_marcus, '', false, false, 'you', NULL, now() - interval '1 week', now()),
  (gen_random_uuid(), uid, 'Review Riverdale store layout plans with fit-out architect', 'task', 'medium',
   NULL, proj_rs, p_marcus, '', false, false, 'you', NULL, now() - interval '5 days', now()),

  -- Priya Patel
  (gen_random_uuid(), uid, 'Complete Riverdale recruitment brief once staffing numbers confirmed', 'task', 'high',
   '2026-07-15', proj_rs, p_priya, '', false, false, 'you', NULL, now() - interval '3 days', now()),
  (gen_random_uuid(), uid, 'Schedule mid-year capability reviews for all direct reports', 'task', 'medium',
   '2026-06-30', proj_tdp, p_priya, '', false, false, 'you', NULL, now() - interval '1 week', now()),
  (gen_random_uuid(), uid, 'Draft cross-functional shadowing program with Lisa', 'task', 'medium',
   '2026-07-15', proj_tdp, p_priya, '', false, false, 'you', NULL, now() - interval '5 days', now()),
  (gen_random_uuid(), uid, 'Development plan template shared with leadership team', 'task', 'medium',
   NULL, proj_tdp, p_priya, '', true, false, 'you', '2026-06-15T09:00:00Z', now() - interval '3 weeks', now()),

  -- Tom Hendricks
  (gen_random_uuid(), uid, 'Send Riverdale cost assumptions to Tom for P&L model', 'task', 'high',
   '2026-06-24', proj_rs, p_tom, 'Includes fit-out capex, operating cost assumptions, revenue ramp model', false, false, 'you', NULL, now() - interval '3 days', now()),
  (gen_random_uuid(), uid, 'Review Riverdale store P&L model with Tom', 'task', 'medium',
   '2026-06-30', proj_rs, p_tom, '', false, false, 'you', NULL, now() - interval '5 days', now()),
  (gen_random_uuid(), uid, 'Q1 actuals noted and filed', 'task', 'low',
   NULL, NULL, p_tom, '', true, false, 'you', '2026-06-05T10:00:00Z', now() - interval '2 months', now()),

  -- Lisa Tanaka
  (gen_random_uuid(), uid, 'Review Q3 category presentation structure with Lisa', 'task', 'high',
   '2026-06-25', NULL, p_lisa, '', false, false, 'you', NULL, now() - interval '3 days', now()),
  (gen_random_uuid(), uid, 'Review supplier contract renewal terms summary', 'task', 'medium',
   '2026-06-25', NULL, p_lisa, '', false, false, 'you', NULL, now() - interval '1 week', now()),

  -- Inbox items (unassigned — appear in Inbox screen)
  (gen_random_uuid(), uid, 'Decision needed: Q4 promotional calendar approach', 'decision', 'medium',
   '2026-07-15', NULL, NULL, 'Finance and Category need to align before Q4 campaigns are locked in', false, true, 'you', NULL, now() - interval '2 days', now()),
  (gen_random_uuid(), uid, 'Waiting on legal sign-off for Riverdale lease amendment', 'waitingFor', 'high',
   '2026-06-25', proj_rs, NULL, '', false, true, 'you', NULL, now() - interval '4 days', now()),
  (gen_random_uuid(), uid, 'Review updated supply chain risk framework', 'task', 'medium',
   NULL, NULL, NULL, '', false, true, 'you', NULL, now() - interval '1 day', now());


-- ── DECISIONS ────────────────────────────────────────────────────────────────
INSERT INTO decisions
  (id, owner_id, title, status, due_date, context, outcome, created_at, updated_at)
VALUES
  (gen_random_uuid(), uid,
   'Go/No-Go: Riverdale store August opening',
   'pending', '2026-07-03',
   'Council planning permit decision on 3 July will determine whether the August opening window is viable. Need to assess contractor lead times and staffing timeline if permit is approved on the day.',
   '',
   now() - interval '1 week', now()),

  (gen_random_uuid(), uid,
   'Distribution route restructure approach',
   'decided', NULL,
   'Two options evaluated: (A) full network cutover in Q4 vs (B) phased rollout starting with highest-volume DCs. Risk and cost analysis conducted with Sarah Chen and Tom Hendricks.',
   'Approved Option B: phased rollout starting with 3 highest-volume DCs from 15 July. Full network rollout target 30 September. Risk profile significantly lower than Option A.',
   now() - interval '2 weeks', now()),

  (gen_random_uuid(), uid,
   'L&D budget allocation Q3',
   'deferred', '2026-07-01',
   'Pending final Q2 actuals from Tom Hendricks before committing the development budget. Q1 underspend creates some headroom but want to confirm the Q2 position before making the call.',
   '',
   now() - interval '10 days', now());


-- ── TALKING POINTS ───────────────────────────────────────────────────────────
INSERT INTO talking_points
  (id, owner_id, person_id, text, done, author, created_at, updated_at)
VALUES
  (gen_random_uuid(), uid, p_sarah,  'Update on Q3 DC capacity and headcount position',                                     false, 'you', now() - interval '3 days', now()),
  (gen_random_uuid(), uid, p_sarah,  'Pilot readiness check — confirm 3 DC sites and IT contact handoff',                   false, 'you', now() - interval '1 day',  now()),
  (gen_random_uuid(), uid, p_marcus, 'Riverdale permit contingency — what is Plan B if July 3 council decision is negative?', false, 'you', now() - interval '2 days', now());


-- ── REGULAR NOTES (visible in the Notes screen) ────────────────────────────
INSERT INTO notes
  (id, owner_id, title, body, folder, created_at, updated_at)
VALUES
  (gen_random_uuid(), uid,
   'Team Charter',
   '<h2>Our Team Charter</h2><p>We are a high-performing operations leadership team. We hold each other to account, communicate openly, and make decisions with the whole business in mind.</p><h3>How we work together</h3><ul><li>We are direct and respectful</li><li>We come to meetings prepared</li><li>We follow through on commitments</li><li>We share information proactively</li><li>We celebrate wins and learn from setbacks</li></ul><h3>Our rhythm</h3><p>Weekly team stand-up every Monday at 9am. Fortnightly 1:1s with each direct report. Monthly cross-functional update with key stakeholders.</p>',
   'Leadership',
   now() - interval '3 months', now()),

  (gen_random_uuid(), uid,
   'Q3 Priorities',
   '<h2>Q3 2026 Focus Areas</h2><ol><li><strong>Distribution Centre Efficiency</strong> — pilot route changes across 3 DCs, achieve 98% on-time delivery by 30 September</li><li><strong>Riverdale Store Rollout</strong> — secure planning permit, engage fit-out contractor, begin staffing brief</li><li><strong>Team Development</strong> — complete mid-year capability reviews, launch cross-functional shadowing program</li></ol><h3>Key dates</h3><p>Riverdale planning decision: 3 July · Budget submission: 30 August · Q3 leadership review: 15 September</p>',
   'Leadership',
   now() - interval '2 weeks', now()),

  (gen_random_uuid(), uid,
   '1:1 Framework',
   '<h2>How I run my 1:1s</h2><p>30 minutes, fortnightly. Their agenda first — what is on their mind, blockers, wins. Then mine — context, changes, what I need from them.</p><h3>Standard questions</h3><ul><li>What is going well?</li><li>What is blocking you?</li><li>What do you need from me?</li><li>How are you tracking against your priorities?</li></ul><h3>Format</h3><p>Agenda items, action items, and free notes all captured in Cadence. Actions are reviewed at every session.</p>',
   '',
   now() - interval '1 month', now());


-- ── ACTIVITY ─────────────────────────────────────────────────────────────────
INSERT INTO activity
  (id, owner_id, actor, action, detail, created_at)
VALUES
  (gen_random_uuid(), uid, 'You', 'add_person',    'Added Sarah Chen to your team',                   now() - interval '6 months'),
  (gen_random_uuid(), uid, 'You', 'add_project',   'Created: Distribution Centre Efficiency',          now() - interval '3 months'),
  (gen_random_uuid(), uid, 'You', 'add_project',   'Created: New Store Rollout — Riverdale',           now() - interval '2 months'),
  (gen_random_uuid(), uid, 'You', 'update_status', 'Distribution Centre Efficiency → green',           now() - interval '1 week'),
  (gen_random_uuid(), uid, 'You', 'add_item',      'Added planning permit action for Marcus Webb',     now() - interval '4 days');

END $$;
