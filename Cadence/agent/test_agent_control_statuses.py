"""Regression tests for agent_control_events terminal status semantics."""

from __future__ import annotations

import importlib
import pathlib
import sys
import types

import cadence_bridge as bridge


# The MCP package is not required for these unit tests; the decorators are identity.
if "mcp.server.fastmcp" not in sys.modules:
    mcp_mod = types.ModuleType("mcp")
    server_mod = types.ModuleType("mcp.server")
    fastmcp_mod = types.ModuleType("mcp.server.fastmcp")

    class FastMCP:  # pragma: no cover - trivial test shim
        def __init__(self, *_args, **_kwargs):
            pass

        def tool(self):
            return lambda fn: fn

        def run(self):
            pass

    fastmcp_mod.FastMCP = FastMCP
    sys.modules.setdefault("mcp", mcp_mod)
    sys.modules.setdefault("mcp.server", server_mod)
    sys.modules.setdefault("mcp.server.fastmcp", fastmcp_mod)

mcp = importlib.import_module("cadence_supabase_mcp")


def _capture_patch(monkeypatch):
    calls: list[tuple[str, str, dict]] = []

    def fake_select(table, query, limit=None):
        assert table == "agent_control_events"
        assert query == "select=payload&id=eq.evt-1"
        assert limit == 1
        return [{"payload": {"existing": "kept"}}]

    def fake_patch_row(table, row_id, patch):
        calls.append((table, row_id, patch))
        return {"id": row_id, **patch}

    monkeypatch.setattr(bridge, "select", fake_select)
    monkeypatch.setattr(bridge, "patch_row", fake_patch_row)
    return calls


def test_resolve_agent_event_requires_approval_is_not_recorded_as_failure(monkeypatch):
    calls = _capture_patch(monkeypatch)

    result = mcp.resolve_agent_event(
        "evt-1",
        outcome="requires_approval",
        summary="Needs Rodney's explicit approval before taking the action.",
    )

    assert result["status"] == "requires_approval"
    assert len(calls) == 1
    _table, _row_id, patch = calls[0]
    assert patch["status"] == "requires_approval"
    assert "processed_at" in patch
    assert "failed_at" not in patch
    assert "error" not in patch
    assert patch["payload"] == {
        "existing": "kept",
        "control_outcome": "requires_approval",
        "outcome_summary": "Needs Rodney's explicit approval before taking the action.",
    }


def test_refuse_agent_event_safely_is_not_recorded_as_failure(monkeypatch):
    calls = _capture_patch(monkeypatch)

    result = mcp.refuse_agent_event_safely(
        "evt-1",
        reason="The requested action was not authorised and was safely stopped.",
    )

    assert result["status"] == "refused_safely"
    _table, _row_id, patch = calls[0]
    assert patch["status"] == "refused_safely"
    assert "processed_at" in patch
    assert "failed_at" not in patch
    assert "error" not in patch
    assert patch["payload"]["control_outcome"] == "refused_safely"
    assert patch["payload"]["outcome_summary"] == "The requested action was not authorised and was safely stopped."


def test_block_agent_event_authorization_is_not_recorded_as_failure(monkeypatch):
    calls = _capture_patch(monkeypatch)

    result = mcp.block_agent_event_authorization(
        "evt-1",
        reason="Kobe does not have authority to take this operation.",
    )

    assert result["status"] == "blocked_authorization"
    _table, _row_id, patch = calls[0]
    assert patch["status"] == "blocked_authorization"
    assert "processed_at" in patch
    assert "failed_at" not in patch
    assert "error" not in patch
    assert patch["payload"]["control_outcome"] == "blocked_authorization"
    assert patch["payload"]["outcome_summary"] == "Kobe does not have authority to take this operation."


def test_fail_agent_event_remains_reserved_for_technical_failures(monkeypatch):
    calls: list[tuple[str, str, dict]] = []

    def fake_patch_row(table, row_id, patch):
        calls.append((table, row_id, patch))
        return {"id": row_id, **patch}

    monkeypatch.setattr(bridge, "patch_row", fake_patch_row)

    result = mcp.fail_agent_event("evt-1", "Supabase timeout")

    assert result["status"] == "failed"
    _table, _row_id, patch = calls[0]
    assert patch["status"] == "failed"
    assert patch["error"] == "Supabase timeout"
    assert "failed_at" in patch
    assert "processed_at" not in patch


def test_agent_control_event_status_constraint_includes_safety_outcomes_without_backfill():
    cadence_dir = pathlib.Path(__file__).resolve().parents[1]
    migration = cadence_dir / "backend" / "migrations" / "0052_agent_control_event_status_outcomes.sql"

    sql = migration.read_text()

    assert "requires_approval" in sql
    assert "blocked_authorization" in sql
    assert "refused_safely" in sql
    assert "update public.agent_control_events" not in sql.lower()
