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


# ── agent_messages_query — Kobe/Ace cross-agent isolation ────────────────────


def test_agent_messages_query_defaults_to_kobe_thread():
    """The unread poll must scope to Kobe's own thread so it can never consume
    an Ace turn (recipient_key='agent:ace') from the shared agent_messages table.
    The colon must be URL-encoded (%3A) for PostgREST, like source=for%3Akobe."""
    q = cadence_bridge.agent_messages_query()

    assert "recipient_key=eq.agent%3Akobe" in q
    assert "agent:ace" not in q
    assert "deleted_at=is.null" in q


def test_agent_messages_query_scopes_unread_poll_to_kobe():
    """A status='unread' poll stays recipient-scoped to Kobe."""
    q = cadence_bridge.agent_messages_query(status="unread")

    assert "recipient_key=eq.agent%3Akobe" in q
    assert "status=eq.unread" in q


def test_agent_messages_query_all_recipients_opt_out():
    """Passing an opt-out sentinel inspects across recipients (no recipient
    filter), preserving the ability to review the whole thread history."""
    for sentinel in (None, "all", "*", ""):
        q = cadence_bridge.agent_messages_query(status=None, recipient_key=sentinel)
        assert "recipient_key=" not in q


def test_agent_messages_query_encodes_since_and_custom_recipient():
    """since_iso timestamps (with ':' and '+') and any explicit recipient_key
    are URL-encoded so the PostgREST filter is well-formed."""
    q = cadence_bridge.agent_messages_query(
        since_iso="2026-07-10T04:00:00+00:00", recipient_key="agent:ace"
    )

    assert "recipient_key=eq.agent%3Aace" in q
    assert "created_at=gt.2026-07-10T04%3A00%3A00%2B00%3A00" in q
