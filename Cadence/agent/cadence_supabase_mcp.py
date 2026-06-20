#!/usr/bin/env python3
"""MCP wrapper for live Cadence Supabase access.

This exposes the owner-aware `cadence_bridge.py` operations as Hermes-native MCP
 tools. It does not store credentials; the bridge reads public config from MCP env
and the agent password from macOS Keychain.
"""

from __future__ import annotations

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


if __name__ == "__main__":
    mcp.run()
