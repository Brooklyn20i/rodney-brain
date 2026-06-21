import{r as u,j as e}from"./vendor-CfFkUIbN.js";import{u as y,S as _,q as N}from"./screen-today-B5-4qPLn.js";const k=`-- Cadence — update database (safe to re-run)
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
`,b=typeof navigator<"u"&&/iPad|iPhone|iPod/.test(navigator.userAgent);function S(t){const o=N(),d={exported_at:new Date().toISOString(),version:"1.0",tables:{people:t.people,work_items:t.work_items,notes:t.notes,projects:t.projects,milestones:t.milestones,project_updates:t.project_updates,project_phases:t.project_phases,raid_items:t.raid_items,stakeholders:t.stakeholders,decisions:t.decisions,talking_points:t.talking_points,comments:t.comments,outbox:t.outbox,links:t.links,activity:t.activity}},n=JSON.stringify(d,null,2),i=new Blob([n],{type:"application/json"}),a=URL.createObjectURL(i);if(b)window.open(a,"_blank"),setTimeout(()=>URL.revokeObjectURL(a),2e4);else{const l=document.createElement("a");l.href=a,l.download=`cadence-backup-${o}.json`,l.click(),URL.revokeObjectURL(a)}}function $({myUserId:t}){var w;const{workspace:o,workspaceMembers:d,createInvite:n,removeWorkspaceMember:i}=y(),[a,l]=u.useState("editor"),[p,c]=u.useState(""),[x,r]=u.useState(!1),[g,h]=u.useState(!1);if(!o)return null;const m=((w=d.find(s=>s.user_id===t))==null?void 0:w.role)==="admin",j=async()=>{if(p){await navigator.clipboard.writeText(p).catch(()=>{}),r(!0),setTimeout(()=>r(!1),3e3);return}const s=await n(a);c(s),await navigator.clipboard.writeText(s).catch(()=>{}),r(!0),setTimeout(()=>r(!1),3e3)},f=s=>{l(s),c(""),r(!1)};return e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"settings-section-title",style:{display:"flex",alignItems:"center",justifyContent:"space-between"},children:[e.jsx("span",{children:"Workspace"}),m&&e.jsx("button",{className:"btn btn-secondary btn-sm",onClick:()=>{h(s=>!s),c(""),r(!1)},children:g?"Cancel":"+ Invite member"})]}),g&&e.jsxs("div",{className:"settings-group",style:{marginBottom:8},children:[e.jsxs("div",{className:"settings-row",children:[e.jsxs("div",{children:[e.jsx("div",{className:"settings-row-label",children:"Invite as"}),e.jsx("div",{className:"settings-row-sub",children:"Editor can read & write · Viewer is read-only"})]}),e.jsxs("div",{style:{display:"flex",gap:6},children:[e.jsx("button",{className:`btn btn-sm ${a==="editor"?"btn-primary":"btn-secondary"}`,onClick:()=>f("editor"),children:"Editor"}),e.jsx("button",{className:`btn btn-sm ${a==="viewer"?"btn-primary":"btn-secondary"}`,onClick:()=>f("viewer"),children:"Viewer"})]})]}),e.jsxs("div",{className:"settings-row",style:{borderTop:"1px solid var(--border)"},children:[e.jsx("div",{className:"settings-row-sub",style:{fontSize:12,color:"var(--text3)"},children:"Link expires in 7 days. Share via Slack, email, or text."}),e.jsx("button",{className:"btn btn-primary btn-sm",onClick:j,children:x?"✓ Copied!":p?"⎘ Copy again":"⎘ Copy invite link"})]})]}),e.jsxs("div",{className:"settings-group",children:[e.jsxs("div",{className:"settings-row",children:[e.jsx("div",{className:"settings-row-label",style:{fontWeight:600},children:o.name}),e.jsx("span",{className:"tag tag-action",children:o.plan})]}),d.map(s=>e.jsxs("div",{className:"settings-row",style:{borderTop:"1px solid var(--border)"},children:[e.jsx("div",{children:e.jsx("div",{className:"settings-row-label",style:{fontSize:13},children:s.email||s.user_id.slice(0,8)+"…"})}),e.jsxs("div",{style:{display:"flex",gap:8,alignItems:"center"},children:[e.jsx("span",{className:`tag ${s.role==="admin"?"tag-decision":"tag-action"}`,children:s.role}),m&&s.user_id!==t&&e.jsx("button",{className:"btn btn-danger btn-sm",title:"Remove from workspace",onClick:()=>{confirm(`Remove ${s.email||"this member"}?`)&&i(s.user_id)},children:"–"})]})]},s.user_id))]})]})}function I({onMenu:t,email:o,onSignOut:d}){var m;const{data:n,session:i}=y(),[a,l]=u.useState(!1),[p,c]=u.useState(!1),x=async()=>{try{await navigator.clipboard.writeText(k),c(!0),setTimeout(()=>c(!1),3e3)}catch{}},r=n.work_items.length,g=n.work_items.filter(j=>j.done).length,h=n.people.length+n.work_items.length+n.notes.length+n.projects.length+n.decisions.length+n.activity.length,v=()=>{S(n),l(!0),setTimeout(()=>l(!1),4e3)};return e.jsxs(e.Fragment,{children:[e.jsx(_,{title:"Settings",onMenu:t}),e.jsxs("div",{className:"screen-content",children:[((m=i==null?void 0:i.user)==null?void 0:m.id)&&e.jsx($,{myUserId:i.user.id}),e.jsx("div",{className:"settings-section-title",children:"Account"}),e.jsx("div",{className:"settings-group",children:e.jsxs("div",{className:"settings-row",children:[e.jsxs("div",{children:[e.jsx("div",{className:"settings-row-label",children:"Signed in"}),e.jsx("div",{className:"settings-row-sub",children:o||"—"})]}),e.jsx("button",{className:"btn btn-danger btn-sm",onClick:d,children:"Sign out"})]})}),e.jsx("div",{className:"settings-section-title",children:"Sync"}),e.jsx("div",{className:"settings-group",children:e.jsxs("div",{className:"settings-row",children:[e.jsxs("div",{children:[e.jsx("div",{className:"settings-row-label",children:"Live sync"}),e.jsx("div",{className:"settings-row-sub",children:"Real-time across iPad, iPhone & browser via Supabase"})]}),e.jsx("span",{className:"tag tag-action",children:"✓ On"})]})}),e.jsx("div",{className:"settings-section-title",children:"Backup & Export"}),e.jsxs("div",{className:"settings-group",children:[e.jsxs("div",{className:"settings-row",children:[e.jsxs("div",{children:[e.jsx("div",{className:"settings-row-label",children:"Export all data"}),e.jsxs("div",{className:"settings-row-sub",children:[h," records · people, notes, meetings, projects, actions, decisions"]})]}),e.jsx("button",{className:"btn btn-secondary btn-sm",onClick:v,children:a?"✓ Saved":b?"⬆ Export":"⬇ Download"})]}),e.jsx("div",{className:"settings-row",style:{borderTop:"1px solid var(--border)"},children:e.jsxs("div",{className:"settings-row-sub",style:{color:"var(--text3)",fontSize:12},children:["Downloads a dated JSON file with everything in Cadence. Run this weekly as a local backup — takes 2 seconds.",b?" On iPhone/iPad, tap Share → Save to Files after it opens.":""]})})]}),e.jsx("div",{className:"settings-section-title",children:"Privacy & Data"}),e.jsxs("div",{className:"settings-group",children:[e.jsxs("div",{className:"settings-row",children:[e.jsx("div",{className:"settings-row-label",children:"Screenshots stay on-device"}),e.jsx("span",{className:"tag tag-action",children:"✓ Local only"})]}),e.jsxs("div",{className:"settings-row",children:[e.jsx("div",{className:"settings-row-label",children:"No analytics or third-party tracking"}),e.jsx("span",{className:"tag tag-action",children:"✓ Private"})]}),e.jsxs("div",{className:"settings-row",children:[e.jsx("div",{className:"settings-row-label",children:"Row-level security"}),e.jsx("span",{className:"tag tag-action",children:"✓ Your data only"})]})]}),e.jsx("div",{className:"settings-section-title",children:"Database Setup"}),e.jsxs("div",{className:"settings-group",children:[e.jsxs("div",{className:"settings-row",children:[e.jsxs("div",{children:[e.jsx("div",{className:"settings-row-label",children:"Update database"}),e.jsx("div",{className:"settings-row-sub",children:"Unlocks project Priority grouping, Phases, RAID & Stakeholders. Run once."})]}),e.jsx("button",{className:"btn btn-primary btn-sm",onClick:x,children:p?"✓ Copied — now paste in Supabase":"⎘ Copy SQL"})]}),e.jsx("div",{className:"settings-row",style:{borderTop:"1px solid var(--border)"},children:e.jsxs("div",{className:"settings-row-sub",style:{color:"var(--text3)",fontSize:12,lineHeight:1.6},children:["1. Tap ",e.jsx("strong",{children:"Copy SQL"})," above.",e.jsx("br",{}),"2. Open your Supabase project → ",e.jsx("strong",{children:"SQL Editor"})," → ",e.jsx("strong",{children:"New query"}),".",e.jsx("br",{}),"3. Paste and tap ",e.jsx("strong",{children:"Run"}),". It's safe to run more than once.",e.jsx("br",{}),"4. Come back here and pull to refresh. Done."]})})]}),e.jsx("div",{className:"settings-section-title",children:"Stats"}),e.jsxs("div",{className:"settings-group",children:[e.jsxs("div",{className:"settings-row",children:[e.jsx("div",{className:"settings-row-label",children:"Total items"}),e.jsx("strong",{children:r})]}),e.jsxs("div",{className:"settings-row",children:[e.jsx("div",{className:"settings-row-label",children:"Completed"}),e.jsx("strong",{children:g})]}),e.jsxs("div",{className:"settings-row",children:[e.jsx("div",{className:"settings-row-label",children:"Projects"}),e.jsx("strong",{children:n.projects.length})]}),e.jsxs("div",{className:"settings-row",children:[e.jsx("div",{className:"settings-row-label",children:"People"}),e.jsx("strong",{children:n.people.length})]}),e.jsxs("div",{className:"settings-row",children:[e.jsx("div",{className:"settings-row-label",children:"Notes & meetings"}),e.jsx("strong",{children:n.notes.length})]})]}),e.jsx("p",{className:"card-meta",style:{textAlign:"center",color:"var(--text3)",marginTop:20},children:"Cadence — Executive Operating System"})]})]})}export{I as S};
