#!/usr/bin/env python3
"""MCP wrapper for live Cadence Financial Supabase access.

Exposes the owner-aware `cadence_financial_bridge.py` operations as Hermes-native
MCP tools, mirroring Cadence/agent/cadence_supabase_mcp.py and
cadence_fitness_mcp.py. It does not store credentials; the bridge reads public
config from MCP env and the agent password from macOS Keychain.

This is REAL net-worth data. Reads are broad; writes are deliberately narrow
(log decisions, post to the Kobe chat channel) and always stamped with Rodney's
owner_id so they surface in his app. It does not place trades, move money, or
mutate balances silently.

Register in Hermes with e.g.:
  hermes mcp add cadence-financial -- python3 /path/to/cadence_financial_mcp.py
"""

from __future__ import annotations

import cadence_financial_bridge as bridge
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("cadence-financial")


def _first(res):
    return res[0] if isinstance(res, list) and res else res


# ── Health / discovery ──────────────────────────────────────────────────────

@mcp.tool()
def probe() -> dict:
    """Read-only check: confirms grant visibility and counts without dumping row contents."""
    try:
        counts: dict[str, int | str] = {}
        grants = bridge.select(
            "financial_agent_access",
            "select=owner_user_id,can_read,can_write,revoked_at&revoked_at=is.null",
            limit=10,
        )
        writable = [g for g in grants if isinstance(g, dict) and g.get("can_write")] if isinstance(grants, list) else []
        for table in ["properties", "loans", "monthly_metrics", "investment_holdings", "decisions", "liquidity_buckets"]:
            rows = bridge.select(table, "select=id", limit=1000)
            counts[table] = len(rows) if isinstance(rows, list) else "?"
        return {
            "ok": True,
            "active_grants": len(grants) if isinstance(grants, list) else "?",
            "writable_grants": len(writable),
            "visible_counts": counts,
        }
    except bridge.FinancialBridgeError as e:
        return {"error": str(e)}


# ── Reading: position & performance ─────────────────────────────────────────

@mcp.tool()
def get_net_worth_snapshot() -> dict:
    """The most recent monthly_metrics row — net worth, debt, asset split for the latest period."""
    try:
        return _first(bridge.select(
            "monthly_metrics",
            "select=*&deleted_at=is.null&order=period.desc",
            limit=1,
        )) or {"net_worth": None, "note": "no monthly_metrics yet"}
    except bridge.FinancialBridgeError as e:
        return {"error": str(e)}


@mcp.tool()
def list_monthly_metrics(limit: int = 12) -> list[dict]:
    """Monthly metrics history (newest first): net worth, cash saved, debt reduction, asset marks."""
    try:
        return bridge.select(
            "monthly_metrics", "select=*&deleted_at=is.null&order=period.desc", limit=limit
        )
    except bridge.FinancialBridgeError as e:
        return [{"error": str(e)}]


@mcp.tool()
def list_properties() -> list[dict]:
    """All properties with value, rent and evidence status."""
    try:
        return bridge.select("properties", "select=*&deleted_at=is.null&order=value.desc", limit=100)
    except bridge.FinancialBridgeError as e:
        return [{"error": str(e)}]


@mcp.tool()
def list_loans() -> list[dict]:
    """All loans with balance, offset, rate and repayment."""
    try:
        return bridge.select("loans", "select=*&deleted_at=is.null", limit=100)
    except bridge.FinancialBridgeError as e:
        return [{"error": str(e)}]


@mcp.tool()
def list_investment_holdings() -> list[dict]:
    """Listed shares / crypto / other holdings with units, value and cost basis."""
    try:
        return bridge.select(
            "investment_holdings", "select=*&deleted_at=is.null&order=native_value.desc", limit=200
        )
    except bridge.FinancialBridgeError as e:
        return [{"error": str(e)}]


@mcp.tool()
def list_liquidity_buckets() -> list[dict]:
    """Protected-liquidity and deployable-capital buckets with amounts and rules."""
    try:
        return bridge.select("liquidity_buckets", "select=*&deleted_at=is.null", limit=50)
    except bridge.FinancialBridgeError as e:
        return [{"error": str(e)}]


@mcp.tool()
def get_portfolio_overview() -> dict:
    """One-call snapshot: latest net worth, properties, loans, holdings and liquidity."""
    try:
        return {
            "latest_metrics": _first(bridge.select(
                "monthly_metrics", "select=*&deleted_at=is.null&order=period.desc", limit=1
            )),
            "properties": bridge.select("properties", "select=*&deleted_at=is.null", limit=100),
            "loans": bridge.select("loans", "select=*&deleted_at=is.null", limit=100),
            "holdings": bridge.select(
                "investment_holdings", "select=*&deleted_at=is.null&order=native_value.desc", limit=200
            ),
            "liquidity": bridge.select("liquidity_buckets", "select=*&deleted_at=is.null", limit=50),
        }
    except bridge.FinancialBridgeError as e:
        return {"error": str(e)}


# ── Reading: decisions & evidence ───────────────────────────────────────────

@mcp.tool()
def list_decisions(status: str = "all", limit: int = 50) -> list[dict]:
    """Financial decisions. status: open/clarified/approved/blocked/implemented or all."""
    try:
        q = "select=*&deleted_at=is.null&order=created_at.desc"
        if status != "all":
            q = f"select=*&approval_status=eq.{status}&deleted_at=is.null&order=created_at.desc"
        return bridge.select("decisions", q, limit=limit)
    except bridge.FinancialBridgeError as e:
        return [{"error": str(e)}]


@mcp.tool()
def list_evidence(period: str | None = None, limit: int = 50) -> list[dict]:
    """Evidence register entries, optionally filtered to a period like 2026-07."""
    try:
        q = "select=*&deleted_at=is.null&order=created_at.desc"
        if period:
            q = f"select=*&period=eq.{period}&deleted_at=is.null&order=created_at.desc"
        return bridge.select("evidence_items", q, limit=limit)
    except bridge.FinancialBridgeError as e:
        return [{"error": str(e)}]


# ── Writing: decisions (narrow, deliberate) ─────────────────────────────────

@mcp.tool()
def log_decision(
    decision_area: str,
    question: str = "",
    options: str = "",
    recommended_position: str = "",
    owner_lens: str = "kobe",
    follow_up_action: str = "",
) -> dict:
    """Record a financial decision for Rodney to review. Defaults to approval_status
    'open' — Kobe proposes, Rodney approves. owner_lens: kobe/warren/dan/mckinsey/rodney."""
    try:
        row = {
            "owner_id": bridge.discover_owner_id(),
            "decision_area": decision_area,
            "question": question,
            "options": options,
            "recommended_position": recommended_position,
            "approval_status": "open",
            "owner_lens": owner_lens,
            "follow_up_action": follow_up_action,
        }
        return _first(bridge.insert("decisions", row))
    except bridge.FinancialBridgeError as e:
        return {"error": str(e)}


@mcp.tool()
def update_decision_status(decision_id: str, approval_status: str) -> dict:
    """Update a decision's status: open/clarified/approved/blocked/implemented."""
    try:
        return _first(bridge.patch_row("decisions", decision_id, {"approval_status": approval_status}))
    except bridge.FinancialBridgeError as e:
        return {"error": str(e)}


# ── Chat channel (agent_messages) ───────────────────────────────────────────

@mcp.tool()
def list_agent_messages(status: str = "unread", limit: int = 20) -> list[dict]:
    """List messages in the Kobe channel. status: unread, processed, or all."""
    try:
        q = "select=*&deleted_at=is.null&order=created_at.desc"
        if status != "all":
            q = f"select=*&status=eq.{status}&deleted_at=is.null&order=created_at.desc"
        return bridge.select("agent_messages", q, limit=limit)
    except bridge.FinancialBridgeError as e:
        return [{"error": str(e)}]


@mcp.tool()
def send_agent_message(body: str, linked_period: str | None = None) -> dict:
    """Post a message from Kobe into the app's Financial Kobe screen."""
    try:
        row = {
            "owner_id": bridge.discover_owner_id(),
            "sender_type": "agent",
            "sender_label": "Kobe",
            "body": body,
            "status": "unread",
            "linked_period": linked_period,
        }
        return _first(bridge.insert("agent_messages", row))
    except bridge.FinancialBridgeError as e:
        return {"error": str(e)}


@mcp.tool()
def mark_agent_message_processed(message_id: str) -> dict:
    """Mark a message from Rodney as processed after acting on it."""
    try:
        return _first(bridge.patch_row("agent_messages", message_id, {"status": "processed"}))
    except bridge.FinancialBridgeError as e:
        return {"error": str(e)}


if __name__ == "__main__":
    mcp.run()
