"""Hermetic tests for Cadence Financial watches MCP support."""

from __future__ import annotations

import importlib
import sys
import types

import cadence_financial_bridge as bridge

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

mcp = importlib.import_module("cadence_financial_mcp")


def test_bridge_allows_watches_table():
    assert "watches" in bridge.TABLES


def test_list_watches_filters_collection_role_status_and_orders(monkeypatch):
    calls = []

    def fake_select(table, query, limit=None):
        calls.append((table, query, limit))
        return [{"id": "w-1"}]

    monkeypatch.setattr(bridge, "select", fake_select)

    rows = mcp.list_watches(collection_role="rotation", status="owned", limit=25)

    assert rows == [{"id": "w-1"}]
    assert calls == [
        (
            "watches",
            "select=*&deleted_at=is.null&collection_role=eq.rotation&ownership_status=eq.owned&order=brand.asc,model.asc",
            25,
        )
    ]


def test_list_watches_validates_filters():
    assert "collection_role must be" in mcp.list_watches(collection_role="grail")[0]["error"]
    assert "status must be" in mcp.list_watches(status="missing")[0]["error"]


def test_upsert_watch_validates_required_enums_currency_and_money(monkeypatch):
    monkeypatch.setattr(bridge, "discover_owner_id", lambda: "owner-123")

    assert "brand is required" in mcp.upsert_watch(brand="", model="Tank")["error"]
    assert "collection_role must be" in mcp.upsert_watch(brand="Cartier", model="Tank", collection_role="grail")["error"]
    assert "ownership_status must be" in mcp.upsert_watch(brand="Cartier", model="Tank", ownership_status="lost")["error"]
    assert "full_set_status must be" in mcp.upsert_watch(brand="Cartier", model="Tank", full_set_status="box")["error"]
    assert "currency" in mcp.upsert_watch(brand="A", model="B", currency="audx")["error"]
    assert "AUD" in mcp.upsert_watch(brand="A", model="B", currency="USD")["error"]
    assert "purchase_price must be nonnegative" in mcp.upsert_watch(brand="Cartier", model="Tank", purchase_price=-1)["error"]


def test_upsert_watch_inserts_normalized_owned_piece(monkeypatch):
    inserted = []

    monkeypatch.setattr(bridge, "discover_owner_id", lambda: "owner-123")
    monkeypatch.setattr(bridge, "select", lambda *_args, **_kwargs: [])

    def fake_insert(table, row):
        inserted.append((table, row))
        return [{"id": "w-1", **row}]

    monkeypatch.setattr(bridge, "insert", fake_insert)

    out = mcp.upsert_watch(
        brand=" omega ",
        model="Speedmaster",
        reference="310.30.42",
        nickname="Moonwatch",
        year=2024,
        collection_role="permanent",
        ownership_status="owned",
        currency="aud",
        purchase_price=8000,
        current_value=10000,
        valuation_source="auction comp",
        full_set_status="full",
        accessories="bracelet and cards",
        service_history="2025 pressure test",
        insurance_notes="policy scheduled",
        storage_location="secure storage",
        security_notes="location withheld",
        sentimental=True,
        external_ref="demo-speedy",
    )

    assert out["id"] == "w-1"
    assert inserted == [
        (
            "watches",
            {
                "owner_id": "owner-123",
                "brand": "omega",
                "model": "Speedmaster",
                "reference": "310.30.42",
                "nickname": "Moonwatch",
                "year": 2024,
                "collection_role": "permanent",
                "ownership_status": "owned",
                "currency": "AUD",
                "purchase_price": 8000.0,
                "purchase_date": None,
                "current_value": 10000.0,
                "value_as_of": None,
                "valuation_source": "auction comp",
                "insurance_value": None,
                "full_set_status": "full",
                "accessories": "bracelet and cards",
                "material": "",
                "dial": "",
                "service_history": "2025 pressure test",
                "provenance": "",
                "insurance_notes": "policy scheduled",
                "storage_location": "secure storage",
                "security_notes": "location withheld",
                "notes": "",
                "sentimental": True,
                "external_ref": "demo-speedy",
            },
        )
    ]


def test_upsert_watch_is_owner_scoped_idempotent_by_external_ref(monkeypatch):
    existing = {"id": "existing", "external_ref": "watch-ref"}
    calls = []
    monkeypatch.setattr(bridge, "discover_owner_id", lambda: "owner-123")

    def fake_select(table, query, limit=None):
        calls.append((table, query, limit))
        return [existing]

    monkeypatch.setattr(bridge, "select", fake_select)
    monkeypatch.setattr(bridge, "insert", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("insert should not be called")))

    out = mcp.upsert_watch(brand="Cartier", model="Tank", external_ref=" watch-ref ")

    assert out == existing
    assert calls == [
        (
            "watches",
            "select=*&owner_id=eq.owner-123&external_ref=eq.watch-ref&deleted_at=is.null",
            1,
        )
    ]


def test_upsert_watch_recovers_from_external_ref_race(monkeypatch):
    existing = {"id": "existing", "external_ref": "watch-ref"}
    selects = []
    monkeypatch.setattr(bridge, "discover_owner_id", lambda: "owner-123")

    def fake_select(*_args, **_kwargs):
        selects.append(1)
        return [] if len(selects) == 1 else [existing]

    monkeypatch.setattr(bridge, "select", fake_select)
    monkeypatch.setattr(bridge, "insert", lambda *_args, **_kwargs: (_ for _ in ()).throw(bridge.FinancialBridgeError("duplicate external_ref")))

    out = mcp.upsert_watch(brand="Cartier", model="Tank", external_ref="watch-ref")

    assert out == existing
    assert len(selects) == 2
