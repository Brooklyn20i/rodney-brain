"""Hermetic tests for the Cadence Life agent bridge.

No live Supabase calls are made: network/auth functions are monkeypatched.
"""

from __future__ import annotations

import json
import urllib.parse

import pytest

import cadence_life_bridge as bridge


def test_reuses_work_auth_env_and_life_schema_headers(monkeypatch):
    monkeypatch.setenv("CADENCE_SUPABASE_URL", "https://example.supabase.co/")
    monkeypatch.setenv("CADENCE_SUPABASE_ANON_KEY", "anon")
    monkeypatch.setenv("CADENCE_AGENT_EMAIL", "agent@example.com")
    monkeypatch.setattr(bridge, "agent_password", lambda email: "pw")

    calls = []

    def fake_request(method, url, headers, body=None):
        calls.append((method, url, headers, body))
        return {"access_token": "token"}

    monkeypatch.setattr(bridge, "request_json", fake_request)

    assert bridge.get_session() == ("https://example.supabase.co", "anon", "token")
    assert calls == [
        (
            "POST",
            "https://example.supabase.co/auth/v1/token?grant_type=password",
            {"apikey": "anon", "Accept": "application/json"},
            {"email": "agent@example.com", "password": "pw"},
        )
    ]
    assert bridge.rest_headers("anon", "token")["Accept-Profile"] == "life"
    assert bridge.rest_headers("anon", "token")["Content-Profile"] == "life"


def test_discovers_single_active_writable_life_owner_from_explicit_grant(monkeypatch):
    monkeypatch.delenv("CADENCE_LIFE_OWNER_ID", raising=False)
    calls = []

    def fake_select(table, query, limit=None):
        calls.append((table, query, limit))
        return [{"owner_id": "owner-123", "can_write": True}]

    monkeypatch.setattr(bridge, "select", fake_select)

    assert bridge.discover_owner_id() == "owner-123"
    assert calls == [
        (
            "life_agent_access",
            "select=owner_id,agent_user_id,can_read,can_write,revoked_at&revoked_at=is.null&can_write=eq.true",
            2,
        )
    ]


def test_discovery_fails_when_multiple_life_owners_are_visible(monkeypatch):
    monkeypatch.delenv("CADENCE_LIFE_OWNER_ID", raising=False)
    monkeypatch.setattr(
        bridge,
        "select",
        lambda *_args, **_kwargs: [{"owner_id": "owner-a"}, {"owner_id": "owner-b"}],
    )

    with pytest.raises(bridge.LifeBridgeError, match="Multiple writable Cadence Life owner grants"):
        bridge.discover_owner_id()


def test_explicit_owner_id_must_have_active_writable_life_grant(monkeypatch):
    monkeypatch.setenv("CADENCE_LIFE_OWNER_ID", "owner-123")
    calls = []

    def fake_select(table, query, limit=None):
        calls.append((table, query, limit))
        return []

    monkeypatch.setattr(bridge, "select", fake_select)

    with pytest.raises(bridge.LifeBridgeError, match="No active writable Cadence Life agent grant"):
        bridge.discover_owner_id()

    assert calls == [
        (
            "life_agent_access",
            "select=owner_id,agent_user_id,can_read,can_write,revoked_at&revoked_at=is.null&can_write=eq.true&owner_id=eq.owner-123",
            2,
        )
    ]


def test_owner_stamp_allows_only_life_tables_and_does_not_reuse_work_owner(monkeypatch):
    monkeypatch.setattr(bridge, "discover_owner_id", lambda: "life-owner")

    assert bridge.with_owner("life_items", {"title": "Renew passport"}) == {
        "title": "Renew passport",
        "owner_id": "life-owner",
    }
    assert bridge.with_owner("obligations", {"name": "Rego", "owner_id": "wrong-owner"})["owner_id"] == "life-owner"

    with pytest.raises(bridge.LifeBridgeError, match="Unknown table"):
        bridge.with_owner("work_items", {"title": "wrong domain"})


def test_create_update_soft_delete_and_complete_use_safe_postgrest_calls(monkeypatch, tmp_path):
    monkeypatch.setattr(bridge, "discover_owner_id", lambda: "life-owner")
    monkeypatch.setattr(bridge, "get_session", lambda: ("https://sb", "anon", "token"))
    calls = []

    def fake_request(method, url, headers, body=None):
        calls.append((method, url, headers, body))
        if method == "POST" and url.endswith("/rest/v1/life_items"):
            return [{"id": "item-1", **body}]
        if method == "PATCH":
            return [{"id": "patched", **(body or {})}]
        if method == "GET" and "/rest/v1/obligations?" in url:
            return [{"id": "ob-1", "owner_id": "life-owner"}]
        if url.endswith("/rest/v1/rpc/complete_obligation"):
            return {"ok": True, "history": {"owner_id": "life-owner"}}
        return []

    monkeypatch.setattr(bridge, "request_json", fake_request)

    payload = tmp_path / "payload.json"
    payload.write_text(json.dumps({"title": "Book dentist", "status": "open"}))

    created = bridge.create_row("life_items", bridge.load_json_file(str(payload)))
    updated = bridge.update_row("life_items", "item-1", {"notes": "done"})
    with pytest.raises(bridge.LifeBridgeError, match="owner_id cannot be changed"):
        bridge.update_row("life_items", "item-1", {"owner_id": "wrong-owner"})
    deleted = bridge.soft_delete("obligations", "ob-1")
    completed = bridge.complete_obligation("ob-1", "2026-01-31", "2026-02-01")

    assert created[0]["owner_id"] == "life-owner"
    assert updated == [{"id": "patched", "notes": "done"}]
    assert "deleted_at" in deleted[0]
    assert completed["ok"] is True
    assert calls[0][0:2] == ("POST", "https://sb/rest/v1/life_items")
    assert calls[0][3]["owner_id"] == "life-owner"
    assert calls[1][0] == "PATCH"
    assert "id=eq.item-1" in urllib.parse.unquote(calls[1][1])
    assert "owner_id=eq.life-owner" in urllib.parse.unquote(calls[1][1])
    assert calls[2][0] == "PATCH"
    assert "id=eq.ob-1" in urllib.parse.unquote(calls[2][1])
    assert "owner_id=eq.life-owner" in urllib.parse.unquote(calls[2][1])
    assert calls[3][0] == "GET"
    assert "id=eq.ob-1" in urllib.parse.unquote(calls[3][1])
    assert "owner_id=eq.life-owner" in urllib.parse.unquote(calls[3][1])
    assert calls[4][0:2] == ("POST", "https://sb/rest/v1/rpc/complete_obligation")
    assert calls[4][3] == {
        "p_obligation_id": "ob-1",
        "p_expected_due": "2026-01-31",
        "p_today": "2026-02-01",
    }


def test_list_and_get_scope_to_non_deleted_rows_under_discovered_owner(monkeypatch):
    calls = []
    monkeypatch.setattr(bridge, "get_session", lambda: ("https://sb", "anon", "token"))
    monkeypatch.setattr(bridge, "discover_owner_id", lambda: "life-owner")

    def fake_request(method, url, headers, body=None):
        calls.append((method, url, headers, body))
        return []

    monkeypatch.setattr(bridge, "request_json", fake_request)

    bridge.list_rows("life_items", "owner_id=eq.attacker&order=due_date.asc", limit=25)
    bridge.get_row("obligations", "ob-1")

    assert "deleted_at=is.null" in calls[0][1]
    assert "owner_id=eq.life-owner" in calls[0][1]
    assert "owner_id=eq.attacker" in calls[0][1]
    assert "limit=25" in calls[0][1]
    assert "id=eq.ob-1" in urllib.parse.unquote(calls[1][1])
    assert "owner_id=eq.life-owner" in calls[1][1]
    assert "deleted_at=is.null" in calls[1][1]


def test_complete_obligation_fails_closed_before_rpc_without_single_writable_grant(monkeypatch):
    monkeypatch.setattr(bridge, "get_session", lambda: ("https://sb", "anon", "token"))
    monkeypatch.setattr(bridge, "discover_owner_id", lambda: (_ for _ in ()).throw(bridge.LifeBridgeError("grant closed")))
    monkeypatch.setattr(bridge, "request_json", lambda *_args, **_kwargs: pytest.fail("RPC should not be called"))

    with pytest.raises(bridge.LifeBridgeError, match="grant closed"):
        bridge.complete_obligation("ob-1", "2026-01-31", "2026-02-01")


def test_complete_obligation_rejects_id_outside_selected_owner_before_rpc(monkeypatch):
    monkeypatch.setattr(bridge, "get_session", lambda: ("https://sb", "anon", "token"))
    monkeypatch.setattr(bridge, "discover_owner_id", lambda: "selected-owner")
    monkeypatch.setattr(bridge, "get_row", lambda table, row_id: [])
    monkeypatch.setattr(bridge, "request_json", lambda *_args, **_kwargs: pytest.fail("RPC should not be called"))

    with pytest.raises(bridge.LifeBridgeError, match="selected Life owner"):
        bridge.complete_obligation("other-owner-obligation", "2026-01-31", "2026-02-01")
