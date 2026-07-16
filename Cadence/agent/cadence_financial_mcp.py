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

import re
import urllib.parse
from datetime import date

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
        for table in ["properties", "loans", "monthly_metrics", "investment_holdings", "investment_income", "decisions", "liquidity_buckets"]:
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


_INVESTMENT_INCOME_KINDS = {"dividend", "distribution", "interest"}
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_CURRENCY_RE = re.compile(r"^[A-Z]{3}$")


def _money(value: float | int | None, field: str, required: bool = True) -> tuple[float | None, str | None]:
    if value is None:
        return (None, f"{field} is required") if required else (None, None)
    try:
        out = round(float(value), 2)
    except (TypeError, ValueError):
        return None, f"{field} must be a number"
    if out < 0:
        return None, f"{field} must be nonnegative"
    return out, None


@mcp.tool()
def list_investment_income(
    start_date: str | None = None,
    end_date: str | None = None,
    income_kind: str = "all",
    limit: int = 100,
) -> list[dict]:
    """Investment income/dividends, newest first. Optional start_date/end_date are YYYY-MM-DD; income_kind is dividend/distribution/interest/all."""
    try:
        kind = (income_kind or "all").lower()
        if kind != "all" and kind not in _INVESTMENT_INCOME_KINDS:
            return [{"error": "income_kind must be dividend, distribution, interest, or all"}]
        q = "select=*&deleted_at=is.null"
        if start_date:
            q += f"&payment_date=gte.{urllib.parse.quote(start_date)}"
        if end_date:
            q += f"&payment_date=lte.{urllib.parse.quote(end_date)}"
        if kind != "all":
            q += f"&income_kind=eq.{kind}"
        q += "&order=payment_date.desc,created_at.desc"
        return bridge.select("investment_income", q, limit=limit)
    except bridge.FinancialBridgeError as e:
        return [{"error": str(e)}]


@mcp.tool()
def log_investment_income(
    payment_date: str,
    ticker: str,
    income_kind: str,
    currency: str,
    gross_amount: float,
    withholding_tax: float = 0,
    franking_credit: float = 0,
    net_amount: float | None = None,
    amount_aud: float | None = None,
    entity_id: str | None = None,
    holding_id: str | None = None,
    source: str = "",
    external_ref: str = "",
    notes: str = "",
) -> dict:
    """Log first-class investment income. Derives net_amount from gross-withholding when omitted; AUD amount defaults only for AUD currency; nonblank external_ref is idempotent."""
    try:
        if not _DATE_RE.match(payment_date or ""):
            return {"error": "payment_date must be YYYY-MM-DD"}
        try:
            date.fromisoformat(payment_date)
        except ValueError:
            return {"error": "payment_date must be a valid YYYY-MM-DD date"}
        kind = (income_kind or "").lower().strip()
        if kind not in _INVESTMENT_INCOME_KINDS:
            return {"error": "income_kind must be dividend, distribution, or interest"}
        curr = (currency or "").upper().strip()
        if not _CURRENCY_RE.match(curr):
            return {"error": "currency must be a 3-letter ISO code"}
        gross, err = _money(gross_amount, "gross_amount")
        if err:
            return {"error": err}
        withholding, err = _money(withholding_tax, "withholding_tax")
        if err:
            return {"error": err}
        franking, err = _money(franking_credit, "franking_credit")
        if err:
            return {"error": err}
        assert gross is not None and withholding is not None and franking is not None
        if withholding > gross:
            return {"error": "withholding_tax cannot exceed gross_amount"}
        if net_amount is None:
            net = round(gross - withholding, 2)
        else:
            net, err = _money(net_amount, "net_amount")
            if err:
                return {"error": err}
        aud = amount_aud
        if aud is None and curr == "AUD":
            aud = net
        elif aud is None:
            return {"error": "amount_aud is required when currency is not AUD"}
        aud_value, err = _money(aud, "amount_aud")
        if err:
            return {"error": err}
        if curr == "AUD" and aud_value != net:
            return {"error": "amount_aud must equal net_amount when currency is AUD"}

        owner_id = bridge.discover_owner_id()
        ref = (external_ref or "").strip()
        owner_filter = urllib.parse.quote(owner_id, safe="")
        ref_filter = urllib.parse.quote(ref, safe="")
        if ref:
            existing = bridge.select(
                "investment_income",
                f"select=*&owner_id=eq.{owner_filter}&external_ref=eq.{ref_filter}&deleted_at=is.null",
                limit=1,
            )
            if isinstance(existing, list) and existing:
                result = _first(existing)
                return result if isinstance(result, dict) else {"error": "Unexpected investment_income response"}

        row = {
            "owner_id": owner_id,
            "entity_id": entity_id,
            "holding_id": holding_id,
            "payment_date": payment_date,
            "ticker": (ticker or "").upper().strip(),
            "income_kind": kind,
            "currency": curr,
            "gross_amount": gross,
            "withholding_tax": withholding,
            "franking_credit": franking,
            "net_amount": net,
            "amount_aud": aud_value,
            "source": source.strip(),
            "external_ref": ref,
            "notes": notes.strip(),
        }
        if not row["ticker"]:
            return {"error": "ticker is required"}
        try:
            inserted = _first(bridge.insert("investment_income", row))
            return inserted if isinstance(inserted, dict) else {"error": "Unexpected investment_income response"}
        except bridge.FinancialBridgeError:
            if ref:
                existing = bridge.select(
                    "investment_income",
                    f"select=*&owner_id=eq.{owner_filter}&external_ref=eq.{ref_filter}&deleted_at=is.null",
                    limit=1,
                )
                if isinstance(existing, list) and existing:
                    result = _first(existing)
                    return result if isinstance(result, dict) else {"error": "Unexpected investment_income response"}
            raise
    except bridge.FinancialBridgeError as e:
        return {"error": str(e)}


@mcp.tool()
def list_liquidity_buckets() -> list[dict]:
    """Protected-liquidity and deployable-capital buckets with amounts and rules."""
    try:
        return bridge.select("liquidity_buckets", "select=*&deleted_at=is.null", limit=50)
    except bridge.FinancialBridgeError as e:
        return [{"error": str(e)}]


# ── Budget (macro cashflow plan, multi-currency, AU financial year) ──────────

_BUDGET_PER_YEAR = {"weekly": 52, "fortnightly": 26, "monthly": 12, "quarterly": 4, "annual": 1}
_BUDGET_FREQS = set(_BUDGET_PER_YEAR) | {"one_off"}


def _fy_months(fy_start: int) -> list[str]:
    out = []
    for i in range(12):
        mi = 6 + i
        out.append(f"{fy_start + mi // 12}-{mi % 12 + 1:02d}")
    return out


def _fx_map(rows: list[dict]) -> dict:
    m = {r["currency"].upper(): float(r.get("rate_to_aud", 1)) for r in rows if not r.get("deleted_at")}
    m["AUD"] = 1.0
    return m


def _month_aud(line: dict, month: str, fx: dict) -> float:
    if not line.get("active", True):
        return 0.0
    start, end, freq = line.get("start_month"), line.get("end_month"), line.get("frequency", "monthly")
    if start and month < start:
        return 0.0
    if end and month > end:
        return 0.0
    amt = float(line.get("amount", 0))
    if freq == "one_off":
        native = amt if start == month else 0.0
    else:
        native = amt * _BUDGET_PER_YEAR.get(freq, 12) / 12
    return native * fx.get((line.get("currency") or "AUD").upper(), 1.0)


@mcp.tool()
def get_budget(fy_start_year: int | None = None) -> dict:
    """Rodney's macro budget: recurring income and payments with per-line
    currency and frequency, converted to an AUD base, summarised for the
    Australian financial year (1 Jul -> 30 Jun). Pass fy_start_year (e.g. 2025
    for FY25-26); defaults to the current FY. Returns the raw lines, a
    month-by-month AUD breakdown, and the annual totals."""
    try:
        lines = bridge.select("budget_lines", "select=*&deleted_at=is.null&order=sort_order", limit=300)
        fx = _fx_map(bridge.select("budget_fx_rates", "select=*&deleted_at=is.null", limit=50))
        if fy_start_year is None:
            from datetime import date

            t = date.today()
            fy_start_year = t.year if t.month >= 7 else t.year - 1
        months = []
        tot_in = tot_out = 0.0
        for mo in _fy_months(fy_start_year):
            inc = sum(_month_aud(l, mo, fx) for l in lines if l.get("kind") == "income")
            exp = sum(_month_aud(l, mo, fx) for l in lines if l.get("kind") == "expense")
            tot_in += inc
            tot_out += exp
            months.append({"month": mo, "income_aud": round(inc, 2), "payments_aud": round(exp, 2), "free_cash_aud": round(inc - exp, 2)})
        return {
            "fy_start_year": fy_start_year,
            "currency_base": "AUD",
            "fx_rates": fx,
            "lines": lines,
            "months": months,
            "fy_income_aud": round(tot_in, 2),
            "fy_payments_aud": round(tot_out, 2),
            "fy_free_cash_aud": round(tot_in - tot_out, 2),
            "savings_rate": round((tot_in - tot_out) / tot_in, 4) if tot_in > 0 else 0,
        }
    except bridge.FinancialBridgeError as e:
        return {"error": str(e)}


@mcp.tool()
def add_budget_line(
    kind: str,
    label: str,
    amount: float,
    frequency: str = "monthly",
    category: str = "",
    currency: str = "AUD",
    start_month: str | None = None,
    end_month: str | None = None,
) -> dict:
    """Add a budget line. kind is 'income' or 'expense'; frequency is
    weekly/fortnightly/monthly/quarterly/annual/one_off; currency is a 3-letter
    code (AUD base; set its rate with set_fx_rate); category is a grouping key
    (e.g. 'salary', 'mortgage'). start_month/end_month ('YYYY-MM') limit the
    line to a window — a one_off lands its whole amount in start_month. amount
    is always positive."""
    try:
        if kind not in ("income", "expense"):
            return {"error": "kind must be 'income' or 'expense'"}
        if frequency not in _BUDGET_FREQS:
            return {"error": f"frequency must be one of {', '.join(sorted(_BUDGET_FREQS))}"}
        row = {
            "owner_id": bridge.discover_owner_id(),
            "kind": kind,
            "category": category or ("other_income" if kind == "income" else "other_expense"),
            "label": label,
            "amount": amount,
            "currency": (currency or "AUD").upper(),
            "frequency": frequency,
            "start_month": start_month,
            "end_month": end_month,
            "active": True,
        }
        return _first(bridge.insert("budget_lines", row))
    except bridge.FinancialBridgeError as e:
        return {"error": str(e)}


@mcp.tool()
def update_budget_line(line_id: str, patch: dict) -> dict:
    """Update a budget line. Updatable: kind, category, label, amount, currency,
    frequency, start_month, end_month, active, sort_order, notes."""
    try:
        allowed = {"kind", "category", "label", "amount", "currency", "frequency",
                   "start_month", "end_month", "active", "sort_order", "notes"}
        clean = {k: v for k, v in patch.items() if k in allowed}
        if not clean:
            return {"error": "no updatable fields provided"}
        return _first(bridge.patch_row("budget_lines", line_id, clean))
    except bridge.FinancialBridgeError as e:
        return {"error": str(e)}


@mcp.tool()
def set_fx_rate(currency: str, rate_to_aud: float) -> dict:
    """Set the AUD conversion rate for a currency (e.g. currency='EUR',
    rate_to_aud=1.64 means 1 EUR = 1.64 AUD). Upserts one row per currency."""
    try:
        row = {"owner_id": bridge.discover_owner_id(), "currency": currency.upper(), "rate_to_aud": rate_to_aud}
        return _first(bridge.upsert("budget_fx_rates", row, on_conflict="owner_id,currency"))
    except bridge.FinancialBridgeError as e:
        return {"error": str(e)}


@mcp.tool()
def add_budget_category(kind: str, label: str) -> dict:
    """Add a custom budget category (extends the dropdown lists). kind is
    'income' or 'expense'; label is a human name like 'Consulting income'."""
    try:
        if kind not in ("income", "expense"):
            return {"error": "kind must be 'income' or 'expense'"}
        import re

        key = re.sub(r"[^a-z0-9]+", "_", label.strip().lower()).strip("_") or "custom"
        row = {"owner_id": bridge.discover_owner_id(), "kind": kind, "key": key, "label": label.strip()}
        return _first(bridge.insert("budget_categories", row))
    except bridge.FinancialBridgeError as e:
        return {"error": str(e)}


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
