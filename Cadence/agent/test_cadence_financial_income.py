"""Hermetic tests for Cadence Financial investment income MCP support."""

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


def test_bridge_allows_investment_income_table():
    assert "investment_income" in bridge.TABLES


def test_list_investment_income_filters_and_orders(monkeypatch):
    calls = []

    def fake_select(table, query, limit=None):
        calls.append((table, query, limit))
        return [{"id": "ii-1"}]

    monkeypatch.setattr(bridge, "select", fake_select)

    rows = mcp.list_investment_income(start_date="2026-07-01", end_date="2026-07-31", income_kind="dividend", limit=25)

    assert rows == [{"id": "ii-1"}]
    assert calls == [
        (
            "investment_income",
            "select=*&deleted_at=is.null&payment_date=gte.2026-07-01&payment_date=lte.2026-07-31&income_kind=eq.dividend&order=payment_date.desc,created_at.desc",
            25,
        )
    ]


def test_log_investment_income_derives_net_defaults_aud_and_inserts(monkeypatch):
    inserted = []

    monkeypatch.setattr(bridge, "discover_owner_id", lambda: "owner-123")
    monkeypatch.setattr(bridge, "select", lambda *_args, **_kwargs: [])

    def fake_insert(table, row):
        inserted.append((table, row))
        return [{"id": "ii-1", **row}]

    monkeypatch.setattr(bridge, "insert", fake_insert)

    out = mcp.log_investment_income(
        payment_date="2026-07-16",
        ticker="wire",
        income_kind="dividend",
        currency="aud",
        gross_amount=491.34,
        withholding_tax=0,
        external_ref="stake-wire-2026-07-16",
    )

    assert out["id"] == "ii-1"
    assert inserted == [
        (
            "investment_income",
            {
                "owner_id": "owner-123",
                "entity_id": None,
                "holding_id": None,
                "payment_date": "2026-07-16",
                "ticker": "WIRE",
                "income_kind": "dividend",
                "currency": "AUD",
                "gross_amount": 491.34,
                "withholding_tax": 0,
                "franking_credit": 0,
                "net_amount": 491.34,
                "amount_aud": 491.34,
                "source": "",
                "external_ref": "stake-wire-2026-07-16",
                "notes": "",
            },
        )
    ]


def test_log_investment_income_is_idempotent_by_owner_and_external_ref(monkeypatch):
    existing = {"id": "existing", "external_ref": "stake-ref"}
    calls = []
    monkeypatch.setattr(bridge, "discover_owner_id", lambda: "owner-123")

    def fake_select(table, query, limit=None):
        calls.append((table, query, limit))
        return [existing]

    monkeypatch.setattr(bridge, "select", fake_select)

    def fail_insert(*_args, **_kwargs):  # pragma: no cover - should not be called
        raise AssertionError("insert should not be called for existing external_ref")

    monkeypatch.setattr(bridge, "insert", fail_insert)

    out = mcp.log_investment_income(
        payment_date="2026-07-16",
        ticker="WIRE",
        income_kind="dividend",
        currency="AUD",
        gross_amount=491.34,
        external_ref="  stake-ref  ",
    )

    assert out == existing
    assert calls == [
        (
            "investment_income",
            "select=*&owner_id=eq.owner-123&external_ref=eq.stake-ref&deleted_at=is.null",
            1,
        )
    ]


def test_log_investment_income_recovers_from_external_ref_race(monkeypatch):
    existing = {"id": "existing", "external_ref": "stake-ref"}
    selects = []
    monkeypatch.setattr(bridge, "discover_owner_id", lambda: "owner-123")

    def fake_select(*_args, **_kwargs):
        selects.append(1)
        return [] if len(selects) == 1 else [existing]

    monkeypatch.setattr(bridge, "select", fake_select)
    monkeypatch.setattr(
        bridge,
        "insert",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(bridge.FinancialBridgeError("duplicate external_ref")),
    )

    out = mcp.log_investment_income(
        payment_date="2026-07-16",
        ticker="WIRE",
        income_kind="dividend",
        currency="AUD",
        gross_amount=491.34,
        external_ref="stake-ref",
    )

    assert out == existing
    assert len(selects) == 2


def test_log_investment_income_validates_kind_currency_and_foreign_aud_amount(monkeypatch):
    monkeypatch.setattr(bridge, "discover_owner_id", lambda: "owner-123")

    assert "income_kind must be" in mcp.log_investment_income("2026-07-16", "WIRE", "bonus", "AUD", 1)["error"]
    assert "currency must be" in mcp.log_investment_income("2026-07-16", "WIRE", "dividend", "AU", 1)["error"]
    assert "amount_aud is required" in mcp.log_investment_income("2026-07-16", "WIRE", "dividend", "USD", 1)["error"]
    assert "must equal net_amount" in mcp.log_investment_income(
        "2026-07-16", "WIRE", "dividend", "AUD", 10, net_amount=10, amount_aud=0
    )["error"]


def test_log_investment_income_rejects_impossible_date_and_negative_net(monkeypatch):
    monkeypatch.setattr(bridge, "discover_owner_id", lambda: "owner-123")

    impossible = mcp.log_investment_income("2026-99-99", "WIRE", "dividend", "AUD", 1)
    negative_net = mcp.log_investment_income("2026-07-16", "WIRE", "dividend", "AUD", 10, net_amount=-1)

    assert impossible == {"error": "payment_date must be a valid YYYY-MM-DD date"}
    assert negative_net == {"error": "net_amount must be nonnegative"}
