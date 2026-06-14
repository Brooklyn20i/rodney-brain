"""
Cadence MCP server — LEGACY local JSON interface.

This file is retained for the older local-file prototype only. The live Cadence
app is Supabase-backed; use `agent/cadence_supabase_mcp.py` for Kobe/Hermes
access to the same data Rodney sees in the app.

Run it:
    pip install "mcp[cli]"
    python cadence_mcp.py            # stdio transport

Point it at a shared local prototype store and version every change:
    CADENCE_DATA=/path/to/cadence_data.json CADENCE_GIT_AUTOCOMMIT=1 python cadence_mcp.py

Register with an MCP client (example, Claude Desktop / Code):
    {
      "mcpServers": {
        "cadence": {
          "command": "python",
          "args": ["/abs/path/to/Cadence/cadence_mcp.py"],
          "env": { "CADENCE_DATA": "/abs/path/to/Cadence/cadence_data.json",
                   "CADENCE_GIT_AUTOCOMMIT": "1" }
        }
      }
    }

Every tool reads the latest local JSON store from disk, mutates, and writes back.
This does not contact Supabase and should not be used for live Rodney/Kobe data.
"""

from __future__ import annotations

from mcp.server.fastmcp import FastMCP

import cadence_core as core

mcp = FastMCP("cadence")


# ── Reads ─────────────────────────────────────────────────────────────────────
@mcp.tool()
def get_today() -> dict:
    """The cockpit view: suggested focus, top 3 priorities, overdue items,
    things due today, what you're waiting on others for, and decisions needed."""
    return core.get_today(core.load())


@mcp.tool()
def get_weekly_review() -> dict:
    """Weekly-review snapshot: inbox/overdue/decision counts, stale projects,
    and the items that need attention to close out the week."""
    return core.get_weekly_review(core.load())


@mcp.tool()
def list_tasks(status: str = "open", type: str | None = None,
               project: str | None = None, person: str | None = None,
               overdue: bool = False, due_today: bool = False) -> list[dict]:
    """List work items, highest-priority first.

    status: 'open' (default), 'done', or 'all'.
    type: filter by task|decision|followUp|waitingFor|risk|action.
    project / person: filter by name or id.
    overdue / due_today: set true to restrict to those.
    """
    return core.list_tasks(core.load(), status=status, type=type, project=project,
                           person=person, overdue=overdue or None,
                           due_today=due_today or None)


@mcp.tool()
def get_inbox() -> list[dict]:
    """Unprocessed items captured but not yet filed. Triage these first."""
    db = core.load()
    return [core.enrich(db, w) for w in db["work_items"]
            if w.get("inboxed") and not w.get("done")]


@mcp.tool()
def list_projects(status: str | None = None) -> list[dict]:
    """List projects, optionally filtered by status (active|onHold|completed)."""
    db = core.load()
    return [p for p in db["projects"] if status is None or p.get("status") == status]


@mcp.tool()
def list_people() -> list[dict]:
    """List people you track follow-ups and waiting-for items against."""
    return core.load()["people"]


@mcp.tool()
def list_decisions(status: str | None = None) -> list[dict]:
    """List decisions, optionally filtered by status (pending|decided|deferred)."""
    db = core.load()
    return [d for d in db["decisions"] if status is None or d.get("status") == status]


@mcp.tool()
def search(query: str) -> list[dict]:
    """Full-text search across tasks, decisions, projects, and people."""
    return core.search(core.load(), query)


# ── Writes ────────────────────────────────────────────────────────────────────
@mcp.tool()
def add_task(title: str, type: str = "task", priority: str = "medium",
             due_date: str | None = None, project: str | None = None,
             person: str | None = None, notes: str = "",
             to_inbox: bool = True, source: str = "agent") -> dict:
    """Add a work item.

    type: task|decision|followUp|waitingFor|risk|action.
    priority: high|medium|low.
    due_date: 'YYYY-MM-DD' or null.
    project / person: name or id (resolved automatically).
    to_inbox: true (default) routes it to the inbox for the human to triage;
              set false to file it directly.
    source: tag who created it, e.g. 'agent:hermes' — shows in the cockpit.
    """
    db = core.load()
    item = core.add_task(db, title, type=type, priority=priority, due_date=due_date,
                         project=project, person=person, notes=notes,
                         inboxed=to_inbox, source=source)
    core.save(db)
    return item


@mcp.tool()
def update_task(task_id: str, title: str | None = None, type: str | None = None,
                priority: str | None = None, due_date: str | None = None,
                project: str | None = None, person: str | None = None,
                notes: str | None = None) -> dict:
    """Update fields on an existing task. Only the fields you pass are changed."""
    db = core.load()
    fields = {k: v for k, v in {
        "title": title, "type": type, "priority": priority, "due_date": due_date,
        "project": project, "person": person, "notes": notes,
    }.items() if v is not None}
    item = core.update_task(db, task_id, **fields)
    core.save(db)
    return item


@mcp.tool()
def complete_task(task_id: str) -> dict:
    """Mark a task done."""
    db = core.load()
    item = core.complete_task(db, task_id)
    core.save(db)
    return item


@mcp.tool()
def delete_task(task_id: str) -> dict:
    """Delete a task permanently."""
    db = core.load()
    ok = core.delete_task(db, task_id)
    core.save(db)
    return {"deleted": ok, "task_id": task_id}


@mcp.tool()
def add_project(name: str, goal: str = "", status: str = "active",
                color: str = "#1B5E9E") -> dict:
    """Create a project. status: active|onHold|completed."""
    db = core.load()
    item = core.add_project(db, name, goal=goal, status=status, color=color)
    core.save(db)
    return item


@mcp.tool()
def add_person(name: str, role: str = "", notes: str = "") -> dict:
    """Add a person to track follow-ups and waiting-for items against."""
    db = core.load()
    item = core.add_person(db, name, role=role, notes=notes)
    core.save(db)
    return item


@mcp.tool()
def add_decision(title: str, context: str = "", status: str = "pending",
                 due_date: str | None = None) -> dict:
    """Log a decision that needs to be made. status: pending|decided|deferred."""
    db = core.load()
    item = core.add_decision(db, title, context=context, status=status, due_date=due_date)
    core.save(db)
    return item


@mcp.tool()
def resolve_decision(decision_id: str, outcome: str, status: str = "decided") -> dict:
    """Record the outcome of a decision and close it out."""
    db = core.load()
    item = core.resolve_decision(db, decision_id, outcome=outcome, status=status)
    core.save(db)
    return item


# ── Executive brief ───────────────────────────────────────────────────────────
@mcp.tool()
def get_brief() -> str:
    """Generate the markdown executive brief (focus, top 3, overdue, waiting,
    decisions, project health). Send it to the human by email each morning:
    call this, then send via your Gmail tool, then log_action('sent brief')."""
    return core.generate_brief(core.load())


# ── Project management ────────────────────────────────────────────────────────
@mcp.tool()
def update_project(project: str, name: str | None = None, goal: str | None = None,
                   status: str | None = None, owner: str | None = None,
                   target_date: str | None = None, next_action: str | None = None,
                   health: str | None = None) -> dict:
    """Update project fields. project = name or id.
    status: active|onHold|completed. health: green|amber|red."""
    db = core.load()
    fields = {k: v for k, v in {"name": name, "goal": goal, "status": status,
                                "owner": owner, "target_date": target_date,
                                "next_action": next_action, "health": health}.items()
              if v is not None}
    p = core.update_project(db, project, **fields)
    core.log_activity(db, "agent", "update_project", f"{p['name']}: {list(fields)}")
    core.save(db)
    return p


@mcp.tool()
def add_milestone(project: str, title: str, due_date: str | None = None) -> dict:
    """Add a milestone to a project (project = name or id, due_date ISO)."""
    db = core.load()
    m = core.add_milestone(db, project, title, due_date=due_date)
    core.log_activity(db, "agent", "add_milestone", f"{project}: {title}")
    core.save(db)
    return m


@mcp.tool()
def complete_milestone(project: str, milestone_id: str) -> dict:
    """Mark a project milestone done."""
    db = core.load()
    m = core.set_milestone(db, project, milestone_id, done=True)
    core.log_activity(db, "agent", "complete_milestone", m["title"])
    core.save(db)
    return m


@mcp.tool()
def add_project_update(project: str, text: str, health: str | None = None,
                       author: str = "agent") -> dict:
    """Post a status update to a project's log; optionally set health
    (green|amber|red) at the same time. Use this after reviewing a project."""
    db = core.load()
    u = core.add_project_update(db, project, text, author=author, health=health)
    core.log_activity(db, author, "project_update", f"{project}: {text[:80]}")
    core.save(db)
    return u


@mcp.tool()
def add_comment(task_id: str, text: str, author: str = "agent") -> dict:
    """Add a comment to a task — progress notes, context, what you did."""
    db = core.load()
    c = core.add_comment(db, task_id, text, author=author)
    core.save(db)
    return c


@mcp.tool()
def add_link(kind: str, target_id: str, url: str, title: str = "") -> dict:
    """Attach a link to a 'project' or 'task' — e.g. a Google Drive file you
    found with your Drive tools, a doc, a dashboard. kind: project|task.
    For projects, target_id may be the project name."""
    db = core.load()
    link = core.add_link(db, kind, target_id, url, title=title)
    core.log_activity(db, "agent", "add_link", f"{kind} {target_id}: {title or url}")
    core.save(db)
    return link


# ── People / 1:1 prep ─────────────────────────────────────────────────────────
@mcp.tool()
def get_person_prep(person: str) -> dict:
    """1:1 preparation pack for a person (name or id): open talking points,
    what you're waiting on them for, follow-ups, and other open items."""
    return core.get_person_prep(core.load(), person)


@mcp.tool()
def add_talking_point(person: str, text: str, author: str = "agent") -> dict:
    """Add a talking point to raise in the next 1:1 with this person."""
    db = core.load()
    tp = core.add_talking_point(db, person, text, author=author)
    core.save(db)
    return tp


# ── Outbox: email via the agent bridge ────────────────────────────────────────
@mcp.tool()
def get_pending_emails() -> list[dict]:
    """Emails the human queued in the cockpit, waiting for an agent with Gmail
    access to send. Workflow: send each via your Gmail tool, then call
    mark_email_sent(email_id)."""
    return core.list_outbox(core.load(), status="queued")


@mcp.tool()
def queue_email(to: str, subject: str, body: str, cc: str = "",
                created_by: str = "agent",
                related_task_id: str | None = None,
                related_project: str | None = None) -> dict:
    """Draft an email into the shared outbox (status=queued). Use this when
    composing on the human's behalf so they can review it in the cockpit before
    it is sent — or send immediately yourself if they asked you to."""
    db = core.load()
    m = core.queue_email(db, to, subject, body, cc=cc, created_by=created_by,
                         related_task_id=related_task_id,
                         related_project=related_project)
    core.log_activity(db, created_by, "queue_email", f"to {to}: {subject}")
    core.save(db)
    return m


@mcp.tool()
def mark_email_sent(email_id: str, via: str = "gmail") -> dict:
    """Mark an outbox email as sent AFTER you have actually sent it
    (e.g. with your Gmail tool). Records timestamp and channel."""
    db = core.load()
    m = core.mark_email(db, email_id, "sent", via=via)
    core.log_activity(db, "agent", "email_sent", f"to {m['to']}: {m['subject']}")
    core.save(db)
    return m


# ── Activity ──────────────────────────────────────────────────────────────────
@mcp.tool()
def get_activity(limit: int = 20) -> list[dict]:
    """Recent activity log — what humans and agents have done in the cockpit."""
    return core.load().get("activity", [])[:limit]


@mcp.tool()
def log_action(action: str, detail: str = "", actor: str = "agent") -> dict:
    """Record something you did outside the store (sent an email, filed a doc
    in Drive, booked a meeting) so the human sees it in the activity feed."""
    db = core.load()
    entry = core.log_activity(db, actor, action, detail)
    core.save(db)
    return entry


# ── Reference resource ───────────────────────────────────────────────────────
@mcp.resource("cadence://schema")
def schema() -> str:
    """The controlled vocabularies agents should use."""
    return (
        f"item types: {', '.join(core.ITEM_TYPES)}\n"
        f"priorities: {', '.join(core.PRIORITIES)}\n"
        f"project statuses: {', '.join(core.PROJECT_STATUSES)}\n"
        f"decision statuses: {', '.join(core.DECISION_STATUSES)}\n"
        "dates are ISO 'YYYY-MM-DD'. Prefer to_inbox=true so the human triages."
    )


if __name__ == "__main__":
    mcp.run()
