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


@mcp.tool()
def list_open_work_items(limit: int = 50) -> list[dict]:
    """List open Cadence work items visible to the Kobe agent."""
    return bridge.select(
        "work_items",
        "select=*&done=eq.false&deleted_at=is.null&order=created_at.asc",
        limit=limit,
    )


@mcp.tool()
def list_inbox(limit: int = 50) -> list[dict]:
    """List untriaged inbox items."""
    return bridge.select(
        "work_items",
        "select=*&inboxed=eq.true&done=eq.false&deleted_at=is.null&order=created_at.asc",
        limit=limit,
    )


@mcp.tool()
def list_projects(limit: int = 50) -> list[dict]:
    """List active Cadence projects."""
    return bridge.select(
        "projects",
        "select=*&status=eq.active&deleted_at=is.null&order=created_at.asc",
        limit=limit,
    )


@mcp.tool()
def list_people(limit: int = 100) -> list[dict]:
    """List Cadence people records."""
    return bridge.select("people", "select=*&deleted_at=is.null&order=name.asc", limit=limit)


@mcp.tool()
def list_decisions(status: str = "pending", limit: int = 50) -> list[dict]:
    """List Cadence decisions. status may be pending, decided, deferred, or all."""
    q = "select=*&deleted_at=is.null&order=created_at.asc"
    if status != "all":
        q = f"select=*&status=eq.{status}&deleted_at=is.null&order=created_at.asc"
    return bridge.select("decisions", q, limit=limit)


@mcp.tool()
def add_inbox_item(
    title: str,
    type: str = "task",
    priority: str = "medium",
    due_date: str | None = None,
    notes: str = "",
) -> dict:
    """Add a work item to Rodney's Cadence inbox for triage."""
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


@mcp.tool()
def complete_work_item(item_id: str) -> dict:
    """Mark a work item complete."""
    import datetime as dt

    res = bridge.patch_row(
        "work_items",
        item_id,
        {"done": True, "completed_at": dt.datetime.now(dt.UTC).isoformat()},
    )
    return res[0] if isinstance(res, list) and res else res


@mcp.tool()
def add_activity(action: str, detail: str = "", actor: str = "agent:kobe") -> dict:
    """Record an activity entry in Rodney's Cadence activity log."""
    row = {
        "owner_id": bridge.discover_owner_id(),
        "actor": actor,
        "action": action,
        "detail": detail,
    }
    res = bridge.insert("activity", row)
    return res[0] if isinstance(res, list) and res else res


if __name__ == "__main__":
    mcp.run()
