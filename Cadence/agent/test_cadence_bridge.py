"""Regression tests for cadence_bridge scoping helpers.

These tests are hermetic: they monkeypatch owner/workspace discovery so no
network call or live Supabase access is ever made.
"""

import cadence_bridge


def _stub_discovery(monkeypatch):
    """Force deterministic owner/workspace ids without touching the network."""
    monkeypatch.setattr(cadence_bridge, "discover_owner_id", lambda: "owner-123")
    monkeypatch.setattr(cadence_bridge, "discover_workspace_id", lambda: "workspace-456")


def test_agent_messages_is_owner_scoped_not_workspace_scoped(monkeypatch):
    """`public.agent_messages` has no workspace_id column (migration 0020).

    Regression for PGRST204 "Could not find the 'workspace_id' column of
    'agent_messages'": with_owner_workspace() must add owner_id but must never
    inject workspace_id for agent_messages.
    """
    _stub_discovery(monkeypatch)

    out = cadence_bridge.with_owner_workspace("agent_messages", {"body": "hi"})

    assert out["owner_id"] == "owner-123"
    assert "workspace_id" not in out


def test_agent_control_events_is_owner_scoped_not_workspace_scoped(monkeypatch):
    """`public.agent_control_events` has no workspace_id column (migration 0021).

    Confirmed by a read-only live-schema probe (selecting workspace_id returns
    a PGRST missing-column error). with_owner_workspace() must add owner_id but
    must never inject workspace_id for agent_control_events.
    """
    _stub_discovery(monkeypatch)

    out = cadence_bridge.with_owner_workspace(
        "agent_control_events", {"entity_type": "work_item"}
    )

    assert out["owner_id"] == "owner-123"
    assert "workspace_id" not in out


def test_work_items_still_receives_workspace_id(monkeypatch):
    """Workspace-scoped tables must keep getting workspace_id."""
    _stub_discovery(monkeypatch)

    out = cadence_bridge.with_owner_workspace("work_items", {"title": "x"})

    assert out["owner_id"] == "owner-123"
    assert out["workspace_id"] == "workspace-456"
