"""
Cadence MCP server — the agent cockpit interface.

Exposes Cadence as Model Context Protocol tools so any MCP-capable agent
(Hermes, Claude, etc.) can read and drive the same store the human uses.

Run it:
    pip install "mcp[cli]"
    python cadence_mcp.py            # stdio transport

Point it at a shared store and version every change:
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

Every tool reads the latest store from disk, mutates, and writes back, so a
human editing via the Streamlit cockpit and an agent calling these tools stay
in sync. No external services are contacted.
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
