#!/usr/bin/env python3
"""MCP wrapper for live Cadence Supabase access.

This exposes the owner-aware `cadence_bridge.py` operations as Hermes-native MCP
 tools. It does not store credentials; the bridge reads public config from MCP env
and the agent password from macOS Keychain.
"""

from __future__ import annotations

from datetime import date, timedelta
from mcp.server.fastmcp import FastMCP

import cadence_bridge as bridge

mcp = FastMCP("cadence")


@mcp.tool()
def probe() -> dict:
    """Read-only check: confirms grant visibility and counts without dumping row contents."""
    try:
        counts: dict[str, int | str] = {}
        grants = bridge.select(
            "cadence_agent_access",
            "select=owner_user_id,can_read,can_write,revoked_at&revoked_at=is.null",
            limit=10,
        )
        writable = [g for g in grants if isinstance(g, dict) and g.get("can_write")] if isinstance(grants, list) else []
        for table in ["work_items", "projects", "people", "decisions", "outbox"]:
            rows = bridge.select(table, "select=id", limit=1000)
            counts[table] = len(rows) if isinstance(rows, list) else "?"
        return {
            "ok": True,
            "active_grants": len(grants) if isinstance(grants, list) else "?",
            "writable_grants": len(writable),
            "visible_counts": counts,
        }
    except bridge.CadenceBridgeError as e:
        return {"error": str(e)}


@mcp.tool()
def list_open_work_items(limit: int = 50) -> list[dict]:
    """List open Cadence work items visible to the Kobe agent."""
    try:
        return bridge.select(
            "work_items",
            "select=*&done=eq.false&deleted_at=is.null&order=created_at.asc",
            limit=limit,
        )
    except bridge.CadenceBridgeError as e:
        return [{"error": str(e)}]


@mcp.tool()
def list_inbox(limit: int = 50) -> list[dict]:
    """List untriaged inbox items."""
    try:
        return bridge.select(
            "work_items",
            "select=*&inboxed=eq.true&done=eq.false&deleted_at=is.null&order=created_at.asc",
            limit=limit,
        )
    except bridge.CadenceBridgeError as e:
        return [{"error": str(e)}]


@mcp.tool()
def list_projects(limit: int = 50) -> list[dict]:
    """List active Cadence projects."""
    try:
        return bridge.select(
            "projects",
            "select=*&status=eq.active&deleted_at=is.null&order=created_at.asc",
            limit=limit,
        )
    except bridge.CadenceBridgeError as e:
        return [{"error": str(e)}]


@mcp.tool()
def list_people(limit: int = 100) -> list[dict]:
    """List Cadence people records."""
    try:
        return bridge.select("people", "select=*&deleted_at=is.null&order=name.asc", limit=limit)
    except bridge.CadenceBridgeError as e:
        return [{"error": str(e)}]


@mcp.tool()
def list_decisions(status: str = "pending", limit: int = 50) -> list[dict]:
    """List Cadence decisions. status may be pending, decided, deferred, or all."""
    try:
        q = "select=*&deleted_at=is.null&order=created_at.asc"
        if status != "all":
            q = f"select=*&status=eq.{status}&deleted_at=is.null&order=created_at.asc"
        return bridge.select("decisions", q, limit=limit)
    except bridge.CadenceBridgeError as e:
        return [{"error": str(e)}]


@mcp.tool()
def add_inbox_item(
    title: str,
    type: str = "task",
    priority: str = "medium",
    due_date: str | None = None,
    notes: str = "",
) -> dict:
    """Add a work item to Rodney's Cadence inbox for triage."""
    try:
        row = {
            "owner_id": bridge.discover_owner_id(),
            "title": title,
            "type": type,
            "priority": priority,
            "due_date": due_date,
            "notes": notes,
            "inboxed": True,
            "source": "agent:kobe",
            "done": False,
        }
        row = {k: v for k, v in row.items() if v is not None}
        res = bridge.insert("work_items", row)
        return res[0] if isinstance(res, list) and res else res
    except bridge.CadenceBridgeError as e:
        return {"error": str(e)}


@mcp.tool()
def complete_work_item(item_id: str) -> dict:
    """Mark a work item complete."""
    try:
        import datetime as dt

        res = bridge.patch_row(
            "work_items",
            item_id,
            {"done": True, "completed_at": dt.datetime.now(dt.UTC).isoformat()},
        )
        return res[0] if isinstance(res, list) and res else res
    except bridge.CadenceBridgeError as e:
        return {"error": str(e)}


@mcp.tool()
def add_activity(action: str, detail: str = "", actor: str = "agent:kobe") -> dict:
    """Record an activity entry in Rodney's Cadence activity log."""
    try:
        row = {
            "owner_id": bridge.discover_owner_id(),
            "actor": actor,
            "action": action,
            "detail": detail,
        }
        res = bridge.insert("activity", row)
        return res[0] if isinstance(res, list) and res else res
    except bridge.CadenceBridgeError as e:
        return {"error": str(e)}


@mcp.tool()
def update_work_item(
    item_id: str,
    title: str | None = None,
    type: str | None = None,
    priority: str | None = None,
    due_date: str | None = None,
    person_id: str | None = None,
    project_id: str | None = None,
    notes: str | None = None,
    done: bool | None = None,
    inboxed: bool | None = None,
) -> dict:
    """Update fields on an existing Cadence work item. Only provided (non-None) fields are changed."""
    try:
        patch: dict = {}
        if title is not None: patch["title"] = title
        if type is not None: patch["type"] = type
        if priority is not None: patch["priority"] = priority
        if due_date is not None: patch["due_date"] = due_date
        if person_id is not None: patch["person_id"] = person_id
        if project_id is not None: patch["project_id"] = project_id
        if notes is not None: patch["notes"] = notes
        if done is not None: patch["done"] = done
        if inboxed is not None: patch["inboxed"] = inboxed
        if not patch:
            return {"error": "No fields provided to update"}
        return bridge.patch_row("work_items", item_id, patch)
    except bridge.CadenceBridgeError as e:
        return {"error": str(e)}


@mcp.tool()
def add_decision(
    title: str,
    context: str = "",
    due_date: str | None = None,
) -> dict:
    """Add a decision to Rodney's Cadence decisions log."""
    try:
        row = {
            "owner_id": bridge.discover_owner_id(),
            "title": title,
            "context": context,
            "status": "pending",
            "due_date": due_date,
            "outcome": "",
        }
        return bridge.insert("decisions", row)
    except bridge.CadenceBridgeError as e:
        return {"error": str(e)}


@mcp.tool()
def update_decision(
    decision_id: str,
    status: str | None = None,
    outcome: str | None = None,
    context: str | None = None,
    due_date: str | None = None,
) -> dict:
    """Update a Cadence decision — set status to 'decided', 'deferred', or 'pending' and record the outcome."""
    try:
        patch: dict = {}
        if status is not None: patch["status"] = status
        if outcome is not None: patch["outcome"] = outcome
        if context is not None: patch["context"] = context
        if due_date is not None: patch["due_date"] = due_date
        if not patch:
            return {"error": "No fields provided to update"}
        return bridge.patch_row("decisions", decision_id, patch)
    except bridge.CadenceBridgeError as e:
        return {"error": str(e)}


@mcp.tool()
def list_overdue_items(limit: int = 50) -> list[dict]:
    """List open work items with a past due date."""
    try:
        import datetime as dt
        today = dt.date.today().isoformat()
        return bridge.select(
            "work_items",
            f"select=*&done=eq.false&deleted_at=is.null&due_date=lt.{today}&order=due_date.asc",
            limit=limit,
        )
    except bridge.CadenceBridgeError as e:
        return [{"error": str(e)}]


@mcp.tool()
def list_waiting_items(limit: int = 50) -> list[dict]:
    """List open 'waitingFor' work items."""
    try:
        return bridge.select(
            "work_items",
            "select=*&type=eq.waitingFor&done=eq.false&deleted_at=is.null&order=created_at.asc",
            limit=limit,
        )
    except bridge.CadenceBridgeError as e:
        return [{"error": str(e)}]


@mcp.tool()
def triage_inbox_item(
    item_id: str,
    person_id: str | None = None,
    project_id: str | None = None,
    due_date: str | None = None,
    priority: str | None = None,
) -> dict:
    """File an inbox item by assigning person, project or due date — removes it from the triage queue."""
    try:
        patch: dict = {"inboxed": False}
        if person_id is not None: patch["person_id"] = person_id
        if project_id is not None: patch["project_id"] = project_id
        if due_date is not None: patch["due_date"] = due_date
        if priority is not None: patch["priority"] = priority
        return bridge.patch_row("work_items", item_id, patch)
    except bridge.CadenceBridgeError as e:
        return {"error": str(e)}


# ── Context-assembly tools ─────────────────────────────────────────────────────

@mcp.tool()
def get_person_brief(person_name: str) -> dict:
    """Assemble everything Kobe needs about a person: tasks, talking points, recent meeting notes.
    Matches by name (case-insensitive, partial match). Returns structured context bundle."""
    try:
        people = bridge.select(
            "people",
            f"select=*&name=ilike.*{person_name}*&deleted_at=is.null&order=name.asc",
            limit=5,
        )
        if not isinstance(people, list) or not people:
            return {"error": f"No person found matching '{person_name}'"}
        person = people[0]
        pid = person["id"]

        tasks = bridge.select(
            "work_items",
            f"select=*&person_id=eq.{pid}&done=eq.false&deleted_at=is.null&order=updated_at.desc",
            limit=15,
        )
        talking_points = bridge.select(
            "talking_points",
            f"select=*&person_id=eq.{pid}&done=eq.false&deleted_at=is.null",
            limit=20,
        )
        # Meeting notes use folder like __mtg__<person_id> — match by id substring
        meeting_notes = bridge.select(
            "notes",
            f"select=id,title,body,updated_at,folder&folder=ilike.*{pid}*&deleted_at=is.null&order=updated_at.desc",
            limit=3,
        )
        return {
            "person": person,
            "open_tasks": tasks if isinstance(tasks, list) else [],
            "talking_points": talking_points if isinstance(talking_points, list) else [],
            "recent_meeting_notes": meeting_notes if isinstance(meeting_notes, list) else [],
            "match_note": f"Matched '{person['name']}'" + (f" (also found: {[p['name'] for p in people[1:]]})" if len(people) > 1 else ""),
        }
    except Exception as e:
        return {"error": str(e)}


@mcp.tool()
def get_project_status(project_name: str) -> dict:
    """Assemble full project status: health, open items, milestones, risks, days since last update."""
    try:
        projects = bridge.select(
            "projects",
            f"select=*&name=ilike.*{project_name}*&deleted_at=is.null&order=name.asc",
            limit=5,
        )
        if not isinstance(projects, list) or not projects:
            return {"error": f"No project found matching '{project_name}'"}
        project = projects[0]
        pid = project["id"]

        open_items = bridge.select(
            "work_items",
            f"select=*&project_id=eq.{pid}&done=eq.false&deleted_at=is.null&order=priority.desc",
            limit=20,
        )
        milestones = bridge.select(
            "milestones",
            f"select=*&project_id=eq.{pid}&done=eq.false&deleted_at=is.null&order=due_date.asc",
            limit=10,
        )
        updates = bridge.select(
            "project_updates",
            f"select=*&project_id=eq.{pid}&deleted_at=is.null&order=created_at.desc",
            limit=1,
        )
        raid = bridge.select(
            "raid_items",
            f"select=*&project_id=eq.{pid}&status=eq.open&deleted_at=is.null",
            limit=10,
        )

        latest_update = (updates[0] if isinstance(updates, list) and updates else None)
        days_since_update = None
        if latest_update and latest_update.get("created_at"):
            try:
                last = date.fromisoformat(latest_update["created_at"][:10])
                days_since_update = (date.today() - last).days
            except ValueError:
                pass

        return {
            "project": project,
            "health": project.get("health"),
            "days_since_update": days_since_update,
            "open_items": open_items if isinstance(open_items, list) else [],
            "open_milestones": milestones if isinstance(milestones, list) else [],
            "open_risks": raid if isinstance(raid, list) else [],
            "latest_update": latest_update,
            "match_note": f"Matched '{project['name']}'" + (f" (also found: {[p['name'] for p in projects[1:]]})" if len(projects) > 1 else ""),
        }
    except Exception as e:
        return {"error": str(e)}


@mcp.tool()
def get_morning_brief() -> dict:
    """Produce a proactive daily summary: overdue items, stale decisions, at-risk projects,
    neglected people (no meeting note in 14+ days), and today's tasks."""
    try:
        today = date.today()
        today_str = today.isoformat()
        stale_cutoff = (today - timedelta(days=7)).isoformat()
        neglect_cutoff = (today - timedelta(days=14)).isoformat()

        overdue = bridge.select(
            "work_items",
            f"select=*&done=eq.false&deleted_at=is.null&due_date=lt.{today_str}&order=due_date.asc",
            limit=20,
        )
        due_today = bridge.select(
            "work_items",
            f"select=*&done=eq.false&deleted_at=is.null&due_date=eq.{today_str}&order=priority.desc",
            limit=20,
        )
        stale_decisions = bridge.select(
            "decisions",
            f"select=*&status=eq.pending&deleted_at=is.null&created_at=lt.{stale_cutoff}&order=created_at.asc",
            limit=10,
        )
        at_risk_projects = bridge.select(
            "projects",
            f"select=*&status=eq.active&health=in.(amber,red)&deleted_at=is.null",
            limit=10,
        )
        # Find people with no meeting note updated in 14+ days
        all_people = bridge.select("people", "select=id,name&deleted_at=is.null&order=name.asc", limit=100)
        recent_notes = bridge.select(
            "notes",
            f"select=folder,updated_at&folder=ilike.*__mtg__*&updated_at=gte.{neglect_cutoff}&deleted_at=is.null",
            limit=200,
        )
        recent_person_ids = set()
        if isinstance(recent_notes, list):
            for n in recent_notes:
                folder = n.get("folder", "")
                # folder format is __mtg__<person_id> — extract the uuid portion
                parts = folder.split("__mtg__")
                if len(parts) > 1 and parts[1]:
                    recent_person_ids.add(parts[1].strip())

        neglected_people = []
        if isinstance(all_people, list):
            neglected_people = [p for p in all_people if p["id"] not in recent_person_ids]

        return {
            "date": today_str,
            "overdue_items": overdue if isinstance(overdue, list) else [],
            "due_today": due_today if isinstance(due_today, list) else [],
            "stale_decisions": stale_decisions if isinstance(stale_decisions, list) else [],
            "at_risk_projects": at_risk_projects if isinstance(at_risk_projects, list) else [],
            "neglected_people": neglected_people[:10],
        }
    except Exception as e:
        return {"error": str(e)}


@mcp.tool()
def search_all(query: str) -> list[dict]:
    """Search across work items, notes, decisions, project updates, and people by keyword.
    Returns up to 20 results ranked by relevance (title match scores higher than body match)."""
    try:
        q = query.replace("*", "").replace("'", "")  # basic sanitisation
        results: list[dict] = []

        def fetch(table: str, filter_str: str, score_key: str | None = None) -> None:
            try:
                rows = bridge.select(table, filter_str, limit=10)
                if isinstance(rows, list):
                    for r in rows:
                        r["_table"] = table
                        title_field = r.get("title") or r.get("name") or r.get("text") or ""
                        r["_score"] = 2 if q.lower() in title_field.lower() else 1
                        results.append(r)
            except Exception:
                pass

        fetch("work_items",      f"select=id,title,type,priority,done,due_date,person_id,project_id&deleted_at=is.null&or=(title.ilike.*{q}*,notes.ilike.*{q}*)")
        fetch("notes",           f"select=id,title,folder,updated_at&deleted_at=is.null&or=(title.ilike.*{q}*,body.ilike.*{q}*)")
        fetch("decisions",       f"select=id,title,status,context,outcome&deleted_at=is.null&or=(title.ilike.*{q}*,context.ilike.*{q}*,outcome.ilike.*{q}*)")
        fetch("project_updates", f"select=id,project_id,text,created_at&deleted_at=is.null&text=ilike.*{q}*")
        fetch("people",          f"select=id,name,role,email&deleted_at=is.null&or=(name.ilike.*{q}*,notes.ilike.*{q}*)")

        results.sort(key=lambda r: r.get("_score", 0), reverse=True)
        return results[:20]
    except Exception as e:
        return [{"error": str(e)}]


@mcp.tool()
def get_week_ahead() -> dict:
    """Return everything due in the next 7 days: tasks, decisions, and projects with upcoming target dates."""
    try:
        today = date.today()
        week_end = (today + timedelta(days=7)).isoformat()
        today_str = today.isoformat()

        items = bridge.select(
            "work_items",
            f"select=*&done=eq.false&deleted_at=is.null&due_date=gte.{today_str}&due_date=lte.{week_end}&order=due_date.asc",
            limit=50,
        )
        decisions = bridge.select(
            "decisions",
            f"select=*&status=eq.pending&deleted_at=is.null&due_date=gte.{today_str}&due_date=lte.{week_end}&order=due_date.asc",
            limit=20,
        )
        projects = bridge.select(
            "projects",
            f"select=*&status=eq.active&deleted_at=is.null&target_date=gte.{today_str}&target_date=lte.{week_end}&order=target_date.asc",
            limit=10,
        )

        # Group items by due date
        by_day: dict[str, list] = {}
        for item in (items if isinstance(items, list) else []):
            d = item.get("due_date", "")[:10]
            by_day.setdefault(d, []).append(item)

        return {
            "week_start": today_str,
            "week_end": week_end,
            "items_by_day": by_day,
            "upcoming_decisions": decisions if isinstance(decisions, list) else [],
            "projects_due": projects if isinstance(projects, list) else [],
        }
    except Exception as e:
        return {"error": str(e)}


@mcp.tool()
def get_stale_items(days: int = 7) -> list[dict]:
    """List open work items that have not been updated in the given number of days.
    Useful for surfacing things that are quietly going nowhere."""
    try:
        cutoff = (date.today() - timedelta(days=days)).isoformat()
        return bridge.select(
            "work_items",
            f"select=*&done=eq.false&deleted_at=is.null&updated_at=lt.{cutoff}&order=updated_at.asc",
            limit=30,
        )
    except Exception as e:
        return [{"error": str(e)}]


@mcp.tool()
def write_kobe_note(title: str, content: str, folder: str = "__kobe__") -> dict:
    """Write a note into Cadence on Kobe's behalf. Use folder='__kobe__' for briefings and
    general output, '__kobe__research' for research notes, or '__mtg__<person_id>' to file
    a meeting note under a specific person. These notes appear in the Kobe tab, not Notes."""
    try:
        row = {
            "owner_id": bridge.discover_owner_id(),
            "title": title,
            "body": content,
            "folder": folder,
        }
        res = bridge.insert("notes", row)
        return res[0] if isinstance(res, list) and res else res
    except Exception as e:
        return {"error": str(e)}


@mcp.tool()
def check_inbox(since_iso: str | None = None) -> list[dict]:
    """Read messages Rodney has sent to Kobe from within Cadence.
    Pass since_iso (ISO 8601 timestamp) to fetch only messages newer than your last check.
    Poll this every ~30 seconds to pick up new messages promptly."""
    try:
        q = "select=id,title,body,created_at&folder=eq.__kobe_inbox__&order=created_at.asc"
        if since_iso:
            q += f"&created_at=gt.{since_iso}"
        return bridge.select("notes", q, limit=20)
    except Exception as e:
        return [{"error": str(e)}]


@mcp.tool()
def reply_to_chat(response_text: str) -> dict:
    """Write a reply into the Cadence chat panel. Rodney will see it instantly via Realtime.
    Use markdown for formatting — Cadence renders it as rich text."""
    try:
        row = {
            "owner_id": bridge.discover_owner_id(),
            "title": "Kobe",
            "body": response_text,
            "folder": "__kobe_reply__",
        }
        res = bridge.insert("notes", row)
        return res[0] if isinstance(res, list) and res else res
    except Exception as e:
        return {"error": str(e)}


if __name__ == "__main__":
    mcp.run()
