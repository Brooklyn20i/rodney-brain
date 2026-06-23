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
def list_agent_messages(status: str | None = None, since_iso: str | None = None, limit: int = 50) -> list[dict]:
    """Read messages from the Cadence in-app chat.
    status: filter by 'unread', 'processing', 'processed', 'failed' — omit for all.
    since_iso: ISO 8601 timestamp — returns only messages created after this time.
    Messages where sender_type='user' are from Rodney; sender_type='agent' are Kobe's own replies.
    Poll with status='unread' on a ~30s loop to pick up new messages promptly."""
    try:
        q = "select=*&deleted_at=is.null&order=created_at.asc"
        if status:
            q += f"&status=eq.{status}"
        if since_iso:
            q += f"&created_at=gt.{since_iso}"
        return bridge.select("agent_messages", q, limit=limit)
    except Exception as e:
        return [{"error": str(e)}]


@mcp.tool()
def mark_agent_message_processed(message_id: str) -> dict:
    """Mark a user message as processed after Kobe has replied.
    Call this after send_agent_message() so the message doesn't get re-processed on the next poll."""
    try:
        from datetime import datetime, timezone
        return bridge.patch_row("agent_messages", message_id, {
            "status": "processed",
            "processed_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        return {"error": str(e)}


@mcp.tool()
def send_agent_message(
    body: str,
    linked_work_item_id: str | None = None,
    linked_project_id: str | None = None,
    linked_person_id: str | None = None,
) -> dict:
    """Send a reply from Kobe to Rodney in the Cadence in-app chat.
    body: the response text — markdown supported, rendered as rich HTML in the chat panel.
    Rodney sees the reply instantly via Supabase Realtime (no page refresh needed).
    Optionally link to a work item, project, or person to add context chips below the message."""
    try:
        row: dict = {
            "owner_id": bridge.discover_owner_id(),
            "sender_type": "agent",
            "recipient_type": "user",
            "recipient_key": "user",
            "body": body,
            "status": "processed",
        }
        if linked_work_item_id:
            row["linked_work_item_id"] = linked_work_item_id
        if linked_project_id:
            row["linked_project_id"] = linked_project_id
        if linked_person_id:
            row["linked_person_id"] = linked_person_id
        res = bridge.insert("agent_messages", row)
        return res[0] if isinstance(res, list) and res else res
    except Exception as e:
        return {"error": str(e)}


# ── Agent queue (agent_control_events) ───────────────────────────────────────

@mcp.tool()
def list_tasks_for_kobe(limit: int = 50) -> list[dict]:
    """List open tasks Rodney has assigned to Kobe via the 'For Kobe' tab in Cadence.
    These are non-urgent tasks Rodney wants Kobe to action independently.
    After completing one, mark it done via update_work_item(id, done=True)."""
    try:
        return bridge.select(
            "work_items",
            "select=*&source=eq.for%3Akobe&done=eq.false&deleted_at=is.null&order=created_at.asc",
            limit=limit,
        )
    except Exception as e:
        return [{"error": str(e)}]


@mcp.tool()
def list_agent_queue(status: str = "pending", limit: int = 50) -> list[dict]:
    """List agent_control_events by status.
    status: 'pending' (not yet started), 'processing' (in flight), 'processed', 'failed', 'ignored'
    — use 'pending' on your normal triage loop to find what needs action next."""
    try:
        q = f"select=*&deleted_at=is.null&order=created_at.asc"
        if status != "all":
            q += f"&status=eq.{status}"
        return bridge.select("agent_control_events", q, limit=limit)
    except Exception as e:
        return [{"error": str(e)}]


@mcp.tool()
def claim_agent_event(event_id: str) -> dict:
    """Claim an agent_control_event before working on it (sets status=processing, claimed_at=now).
    Always claim before acting to prevent duplicate processing if the sweep fires again mid-flight."""
    try:
        from datetime import datetime, timezone
        return bridge.patch_row("agent_control_events", event_id, {
            "status": "processing",
            "claimed_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        return {"error": str(e)}


@mcp.tool()
def complete_agent_event(event_id: str, summary: str = "") -> dict:
    """Mark an agent_control_event as processed after Kobe has acted on it.
    summary: brief note on what was done (stored in payload for audit trail)."""
    try:
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        patch: dict = {"status": "processed", "processed_at": now}
        if summary:
            existing = bridge.select("agent_control_events", f"select=payload&id=eq.{event_id}", limit=1)
            old_payload = (existing[0].get("payload") or {}) if isinstance(existing, list) and existing else {}
            patch["payload"] = {**old_payload, "kobe_summary": summary}
        return bridge.patch_row("agent_control_events", event_id, patch)
    except Exception as e:
        return {"error": str(e)}


@mcp.tool()
def fail_agent_event(event_id: str, error: str) -> dict:
    """Mark an agent_control_event as failed. error: brief description of what went wrong."""
    try:
        from datetime import datetime, timezone
        return bridge.patch_row("agent_control_events", event_id, {
            "status": "failed",
            "failed_at": datetime.now(timezone.utc).isoformat(),
            "error": error,
        })
    except Exception as e:
        return {"error": str(e)}


@mcp.tool()
def ignore_agent_event(event_id: str, reason: str = "") -> dict:
    """Mark an agent_control_event as ignored (no action needed). Use when an item is
    already handled, irrelevant, or superseded by a newer event for the same entity."""
    try:
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        patch: dict = {"status": "ignored", "processed_at": now}
        if reason:
            existing = bridge.select("agent_control_events", f"select=payload&id=eq.{event_id}", limit=1)
            old_payload = (existing[0].get("payload") or {}) if isinstance(existing, list) and existing else {}
            patch["payload"] = {**old_payload, "ignore_reason": reason}
        return bridge.patch_row("agent_control_events", event_id, patch)
    except Exception as e:
        return {"error": str(e)}


@mcp.tool()
def create_agent_event(
    entity_type: str,
    entity_id: str,
    event_type: str,
    priority: str = "medium",
    payload: dict | None = None,
) -> dict:
    """Manually create an agent_control_event — use when Kobe spots something that warrants
    later review but isn't in the automated sweep output. Idempotent: same entity_id +
    event_type won't create a duplicate if already pending.
    entity_type: work_item | project | person | decision | note
    event_type: created | updated | due | overdue | blocked | needs_review | needs_rodney | stale"""
    try:
        import hashlib, json as _json
        idem_key = f"manual:{entity_type}:{entity_id}:{event_type}"
        row = {
            "owner_id":       bridge.discover_owner_id(),
            "entity_type":    entity_type,
            "entity_id":      entity_id,
            "event_type":     event_type,
            "priority":       priority,
            "status":         "pending",
            "idempotency_key": idem_key,
            "payload":        payload or {},
        }
        res = bridge.insert("agent_control_events", row)
        return res[0] if isinstance(res, list) and res else res
    except Exception as e:
        return {"error": str(e)}


# ── Evening executive review ──────────────────────────────────────────────────

@mcp.tool()
def get_evening_review() -> dict:
    """Produce an end-of-day executive review: what moved, what didn't, what's blocked,
    what needs Rodney tomorrow, and hygiene issues. Counterpart to get_morning_brief()."""
    try:
        today = date.today()
        today_str = today.isoformat()
        tomorrow_str = (today + timedelta(days=1)).isoformat()
        week_end = (today + timedelta(days=7)).isoformat()
        since_morning = (
            __import__("datetime").datetime.combine(today, __import__("datetime").time(6, 0))
            .isoformat() + "Z"
        )
        # stale_cutoff unused here — kept for future blocking detection
        # stale_cutoff = (today - timedelta(days=1)).isoformat()

        # What moved today
        completed_today = bridge.select(
            "work_items",
            f"select=id,title,type,priority,project_id,person_id&done=eq.true&deleted_at=is.null&updated_at=gte.{since_morning}&order=updated_at.desc",
            limit=30,
        )

        # What did not move (open, medium+, not touched since this morning)
        not_moved = bridge.select(
            "work_items",
            f"select=id,title,type,priority,due_date,project_id,person_id&done=eq.false&deleted_at=is.null&priority=in.(high,medium)&updated_at=lt.{since_morning}&order=priority.desc",
            limit=20,
        )

        # Still overdue
        overdue = bridge.select(
            "work_items",
            f"select=*&done=eq.false&deleted_at=is.null&due_date=lt.{today_str}&order=due_date.asc",
            limit=20,
        )

        # Due tomorrow
        due_tomorrow = bridge.select(
            "work_items",
            f"select=*&done=eq.false&deleted_at=is.null&due_date=eq.{tomorrow_str}&order=priority.desc",
            limit=20,
        )

        # Due this week
        due_week = bridge.select(
            "work_items",
            f"select=id,title,type,priority,due_date,project_id&done=eq.false&deleted_at=is.null&due_date=gte.{tomorrow_str}&due_date=lte.{week_end}&order=due_date.asc",
            limit=30,
        )

        # Pending decisions (any age)
        pending_decisions = bridge.select(
            "decisions",
            "select=*&status=eq.pending&deleted_at=is.null&order=due_date.asc.nullslast",
            limit=15,
        )

        # At-risk projects
        at_risk_projects = bridge.select(
            "projects",
            "select=*&status=eq.active&health=in.(amber,red)&deleted_at=is.null",
            limit=10,
        )

        # Inbox backlog
        inbox_backlog = bridge.select(
            "work_items",
            "select=id,title,type,priority,inboxed&inboxed=eq.true&done=eq.false&deleted_at=is.null&order=created_at.asc",
            limit=20,
        )

        # Activity today
        activity_today = bridge.select(
            "activity",
            f"select=actor,action,detail,created_at&created_at=gte.{since_morning}&order=created_at.desc",
            limit=50,
        )

        # Hygiene: items with no due date, no project, no person (open tasks adrift)
        adrift_items = bridge.select(
            "work_items",
            "select=id,title,type,priority,created_at&done=eq.false&deleted_at=is.null&due_date=is.null&project_id=is.null&person_id=is.null&priority=eq.high",
            limit=10,
        )

        return {
            "date": today_str,
            "tomorrow": tomorrow_str,
            "completed_today":   completed_today if isinstance(completed_today, list) else [],
            "not_moved_today":   not_moved if isinstance(not_moved, list) else [],
            "overdue":           overdue if isinstance(overdue, list) else [],
            "due_tomorrow":      due_tomorrow if isinstance(due_tomorrow, list) else [],
            "due_this_week":     due_week if isinstance(due_week, list) else [],
            "pending_decisions": pending_decisions if isinstance(pending_decisions, list) else [],
            "at_risk_projects":  at_risk_projects if isinstance(at_risk_projects, list) else [],
            "inbox_backlog":     inbox_backlog if isinstance(inbox_backlog, list) else [],
            "activity_today":    activity_today if isinstance(activity_today, list) else [],
            "hygiene_adrift_high_priority": adrift_items if isinstance(adrift_items, list) else [],
            "summary": {
                "completed_count":  len(completed_today) if isinstance(completed_today, list) else 0,
                "not_moved_count":  len(not_moved) if isinstance(not_moved, list) else 0,
                "overdue_count":    len(overdue) if isinstance(overdue, list) else 0,
                "due_tomorrow_count": len(due_tomorrow) if isinstance(due_tomorrow, list) else 0,
                "pending_dec_count": len(pending_decisions) if isinstance(pending_decisions, list) else 0,
            },
        }
    except Exception as e:
        return {"error": str(e)}


if __name__ == "__main__":
    mcp.run()
