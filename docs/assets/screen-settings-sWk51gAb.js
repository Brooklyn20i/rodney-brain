import{r as c,j as e}from"./vendor-CfFkUIbN.js";import{u as j,S as b,q as f}from"./screen-today-Dn_1Oe5u.js";const v=`-- Cadence — update database (safe to re-run)
-- Uses named dollar-quote tags ($fn$/$rls$/$rt$) so it survives iPad/Safari copy-paste.

-- updated_at helper (used by triggers below)
create or replace function set_updated_at() returns trigger as $fn$
begin new.updated_at = now(); return new; end;
$fn$ language plpgsql;

-- People: avatar colour + grouping
alter table people add column if not exists color      text    not null default '#1B5E9E';
alter table people add column if not exists group_name text    not null default 'Direct Reports';
alter table people add column if not exists sort_order integer not null default 0;

-- Projects: strategy linkage (priority + KPIs)
alter table projects add column if not exists pillar_id text  not null default '';
alter table projects add column if not exists kpi_ids   jsonb not null default '[]'::jsonb;

-- Phases / workstreams
create table if not exists project_phases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null default '', start_date date, end_date date, sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table milestones add column if not exists phase_id uuid references project_phases(id) on delete set null;
alter table work_items add column if not exists phase_id uuid references project_phases(id) on delete set null;

-- RAID (Risks, Assumptions, Issues, Dependencies)
create table if not exists raid_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id uuid not null references projects(id) on delete cascade,
  kind text not null default 'risk', text text not null default '', owner text not null default '',
  severity text not null default 'medium', status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Stakeholders / RACI
create table if not exists stakeholders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id uuid not null references projects(id) on delete cascade,
  person_id uuid references people(id) on delete set null,
  name text not null default '', raci text not null default 'I',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Triggers + row-level security for the new tables
do $rls$
declare t text;
begin
  foreach t in array array['project_phases','raid_items','stakeholders'] loop
    execute format('drop trigger if exists trg_%1$s_updated on %1$s;', t);
    execute format('create trigger trg_%1$s_updated before update on %1$s for each row execute function set_updated_at();', t);
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists %1$s_all on %1$s;', t);
    execute format('create policy %1$s_all on %1$s using (owner_id = auth.uid()) with check (owner_id = auth.uid());', t);
  end loop;
end $rls$;

-- Realtime cross-device sync for every table (base + new)
do $rt$
declare t text;
begin
  foreach t in array array[
    'projects','milestones','project_updates','people','talking_points',
    'work_items','comments','decisions','notes','outbox','links','activity',
    'project_phases','raid_items','stakeholders'
  ] loop
    execute format('alter table %I replica identity full;', t);
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table %I;', t);
    end if;
  end loop;
end $rt$;
`,r=typeof navigator<"u"&&/iPad|iPhone|iPod/.test(navigator.userAgent);function w(t){const i=f(),l={exported_at:new Date().toISOString(),version:"1.0",tables:{people:t.people,work_items:t.work_items,notes:t.notes,projects:t.projects,milestones:t.milestones,project_updates:t.project_updates,project_phases:t.project_phases,raid_items:t.raid_items,stakeholders:t.stakeholders,decisions:t.decisions,talking_points:t.talking_points,comments:t.comments,outbox:t.outbox,links:t.links,activity:t.activity}},s=JSON.stringify(l,null,2),o=new Blob([s],{type:"application/json"}),a=URL.createObjectURL(o);if(r)window.open(a,"_blank"),setTimeout(()=>URL.revokeObjectURL(a),2e4);else{const n=document.createElement("a");n.href=a,n.download=`cadence-backup-${i}.json`,n.click(),URL.revokeObjectURL(a)}}function y({onMenu:t,email:i,onSignOut:l}){const{data:s}=j(),[o,a]=c.useState(!1),[n,d]=c.useState(!1),u=async()=>{try{await navigator.clipboard.writeText(v),d(!0),setTimeout(()=>d(!1),3e3)}catch{}},p=s.work_items.length,m=s.work_items.filter(x=>x.done).length,g=s.people.length+s.work_items.length+s.notes.length+s.projects.length+s.decisions.length+s.activity.length,h=()=>{w(s),a(!0),setTimeout(()=>a(!1),4e3)};return e.jsxs(e.Fragment,{children:[e.jsx(b,{title:"Settings",onMenu:t}),e.jsxs("div",{className:"screen-content",children:[e.jsx("div",{className:"settings-section-title",children:"Account"}),e.jsx("div",{className:"settings-group",children:e.jsxs("div",{className:"settings-row",children:[e.jsxs("div",{children:[e.jsx("div",{className:"settings-row-label",children:"Signed in"}),e.jsx("div",{className:"settings-row-sub",children:i||"—"})]}),e.jsx("button",{className:"btn btn-danger btn-sm",onClick:l,children:"Sign out"})]})}),e.jsx("div",{className:"settings-section-title",children:"Sync"}),e.jsx("div",{className:"settings-group",children:e.jsxs("div",{className:"settings-row",children:[e.jsxs("div",{children:[e.jsx("div",{className:"settings-row-label",children:"Live sync"}),e.jsx("div",{className:"settings-row-sub",children:"Real-time across iPad, iPhone & browser via Supabase"})]}),e.jsx("span",{className:"tag tag-action",children:"✓ On"})]})}),e.jsx("div",{className:"settings-section-title",children:"Backup & Export"}),e.jsxs("div",{className:"settings-group",children:[e.jsxs("div",{className:"settings-row",children:[e.jsxs("div",{children:[e.jsx("div",{className:"settings-row-label",children:"Export all data"}),e.jsxs("div",{className:"settings-row-sub",children:[g," records · people, notes, meetings, projects, actions, decisions"]})]}),e.jsx("button",{className:"btn btn-secondary btn-sm",onClick:h,children:o?"✓ Saved":r?"⬆ Export":"⬇ Download"})]}),e.jsx("div",{className:"settings-row",style:{borderTop:"1px solid var(--border)"},children:e.jsxs("div",{className:"settings-row-sub",style:{color:"var(--text3)",fontSize:12},children:["Downloads a dated JSON file with everything in Cadence. Run this weekly as a local backup — takes 2 seconds.",r?" On iPhone/iPad, tap Share → Save to Files after it opens.":""]})})]}),e.jsx("div",{className:"settings-section-title",children:"Privacy & Data"}),e.jsxs("div",{className:"settings-group",children:[e.jsxs("div",{className:"settings-row",children:[e.jsx("div",{className:"settings-row-label",children:"Screenshots stay on-device"}),e.jsx("span",{className:"tag tag-action",children:"✓ Local only"})]}),e.jsxs("div",{className:"settings-row",children:[e.jsx("div",{className:"settings-row-label",children:"No analytics or third-party tracking"}),e.jsx("span",{className:"tag tag-action",children:"✓ Private"})]}),e.jsxs("div",{className:"settings-row",children:[e.jsx("div",{className:"settings-row-label",children:"Row-level security"}),e.jsx("span",{className:"tag tag-action",children:"✓ Your data only"})]})]}),e.jsx("div",{className:"settings-section-title",children:"Database Setup"}),e.jsxs("div",{className:"settings-group",children:[e.jsxs("div",{className:"settings-row",children:[e.jsxs("div",{children:[e.jsx("div",{className:"settings-row-label",children:"Update database"}),e.jsx("div",{className:"settings-row-sub",children:"Unlocks project Priority grouping, Phases, RAID & Stakeholders. Run once."})]}),e.jsx("button",{className:"btn btn-primary btn-sm",onClick:u,children:n?"✓ Copied — now paste in Supabase":"⎘ Copy SQL"})]}),e.jsx("div",{className:"settings-row",style:{borderTop:"1px solid var(--border)"},children:e.jsxs("div",{className:"settings-row-sub",style:{color:"var(--text3)",fontSize:12,lineHeight:1.6},children:["1. Tap ",e.jsx("strong",{children:"Copy SQL"})," above.",e.jsx("br",{}),"2. Open your Supabase project → ",e.jsx("strong",{children:"SQL Editor"})," → ",e.jsx("strong",{children:"New query"}),".",e.jsx("br",{}),"3. Paste and tap ",e.jsx("strong",{children:"Run"}),". It's safe to run more than once.",e.jsx("br",{}),"4. Come back here and pull to refresh. Done."]})})]}),e.jsx("div",{className:"settings-section-title",children:"Stats"}),e.jsxs("div",{className:"settings-group",children:[e.jsxs("div",{className:"settings-row",children:[e.jsx("div",{className:"settings-row-label",children:"Total items"}),e.jsx("strong",{children:p})]}),e.jsxs("div",{className:"settings-row",children:[e.jsx("div",{className:"settings-row-label",children:"Completed"}),e.jsx("strong",{children:m})]}),e.jsxs("div",{className:"settings-row",children:[e.jsx("div",{className:"settings-row-label",children:"Projects"}),e.jsx("strong",{children:s.projects.length})]}),e.jsxs("div",{className:"settings-row",children:[e.jsx("div",{className:"settings-row-label",children:"People"}),e.jsx("strong",{children:s.people.length})]}),e.jsxs("div",{className:"settings-row",children:[e.jsx("div",{className:"settings-row-label",children:"Notes & meetings"}),e.jsx("strong",{children:s.notes.length})]})]}),e.jsx("p",{className:"card-meta",style:{textAlign:"center",color:"var(--text3)",marginTop:20},children:"Cadence — Executive Operating System"})]})]})}export{y as S};
