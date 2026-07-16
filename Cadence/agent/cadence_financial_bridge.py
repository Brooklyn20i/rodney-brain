#!/usr/bin/env python3
"""
Cadence Financial Supabase bridge for Kobe/Hermes.

Financial data now lives in the `financial` Postgres schema of the SAME Supabase
project as Cadence Work and Cadence Fitness (they were merged into one unified
app + one project -- see Cadence/AGENTS.md "The unified super app").
CADENCE_FINANCIAL_SUPABASE_URL / CADENCE_FINANCIAL_SUPABASE_ANON_KEY should be
set to the exact same values as Cadence Work's cadence_bridge.py; the only thing
that makes this bridge "Financial" is the `financial` schema profile header sent
on every request (see rest_headers()) and the `financial_agent_access` grant
table living in that schema.

Purpose:
- Give the agent a narrow, auditable CLI for reading/writing financial data.
- Keep secrets out of chat, repo, logs, and prompts.

Secret handling:
- Preferred: macOS Keychain entries, read at runtime with `security`.
- Fallback: environment variables for non-secret/public values only.
- This script never prints tokens/passwords/keys.

Required configuration:
  CADENCE_FINANCIAL_SUPABASE_URL       public project URL (same project as Work)
  CADENCE_FINANCIAL_SUPABASE_ANON_KEY  public anon/publishable key (same as Work)
  CADENCE_FINANCIAL_AGENT_EMAIL        dedicated agent account email
  CADENCE_FINANCIAL_OWNER_ID           optional; otherwise discovered from active grant

Password options, in this order:
  1. macOS Keychain generic password:
       service: cadence-financial-agent-password
       account: $CADENCE_FINANCIAL_AGENT_EMAIL
  2. CADENCE_FINANCIAL_AGENT_PASSWORD env var (discouraged; use only temporary shells)

Important:
- Requires Cadence/backend/migrations/0022_financial_schema.sql (the `financial`
  schema + tables) and 0024_financial_agent_access.sql (the
  financial_agent_access grant table + RLS agent path).
- Writes include Rodney's owner_id so they appear in Rodney's app.
- This is real net-worth data. Do not use Rodney's personal login here.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

TABLES = [
    "entities", "properties", "loans", "investment_holdings",
    "investment_transactions", "investment_income", "monthly_metrics", "evidence_items",
    "decisions", "liquidity_buckets", "allocation_policies", "risk_policies",
    "goals", "insurance_policies", "estate_items", "property_ledger",
    "budget_lines", "budget_categories", "budget_fx_rates",
    "agent_messages", "financial_agent_access",
]

KEYCHAIN_SERVICE = "cadence-financial-agent-password"


class FinancialBridgeError(Exception):
    """Raised by bridge library functions on recoverable errors."""


def fail(msg: str, code: int = 2) -> None:
    """CLI entry point: print error and exit. Library code raises FinancialBridgeError instead."""
    print(f"ERROR: {msg}", file=sys.stderr)
    raise SystemExit(code)


def env(name: str, required: bool = True) -> str | None:
    val = os.environ.get(name)
    if required and not val:
        fail(f"Missing required environment variable: {name}")
    return val


def keychain_password(service: str, account: str) -> str | None:
    try:
        out = subprocess.check_output(
            ["security", "find-generic-password", "-s", service, "-a", account, "-w"],
            stderr=subprocess.DEVNULL,
            text=True,
        )
        return out.strip() or None
    except Exception:
        return None


def agent_password(email: str) -> str:
    pw = keychain_password(KEYCHAIN_SERVICE, email)
    if pw:
        return pw
    pw = os.environ.get("CADENCE_FINANCIAL_AGENT_PASSWORD")
    if pw:
        return pw
    raise FinancialBridgeError(
        "No Cadence Financial agent password found. Add it to macOS Keychain with service "
        f"{KEYCHAIN_SERVICE} and account equal to CADENCE_FINANCIAL_AGENT_EMAIL."
    )


def request_json(method: str, url: str, headers: dict[str, str], body: Any = None) -> Any:
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers = {**headers, "Content-Type": "application/json"}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:1000]
        raise FinancialBridgeError(f"HTTP {e.code} from {url}: {detail}")
    except urllib.error.URLError as e:
        raise FinancialBridgeError(f"Network error contacting {url}: {e.reason}")
    except json.JSONDecodeError as e:
        raise FinancialBridgeError(f"Invalid JSON response from {url}: {e}")


def get_session() -> tuple[str, str, str]:
    base = (env("CADENCE_FINANCIAL_SUPABASE_URL") or "").rstrip("/")
    anon = env("CADENCE_FINANCIAL_SUPABASE_ANON_KEY") or ""
    email = env("CADENCE_FINANCIAL_AGENT_EMAIL") or ""
    pw = agent_password(email)
    auth_url = f"{base}/auth/v1/token?grant_type=password"
    res = request_json(
        "POST",
        auth_url,
        {"apikey": anon, "Accept": "application/json"},
        {"email": email, "password": pw},
    )
    token = res.get("access_token") if isinstance(res, dict) else None
    if not token:
        raise FinancialBridgeError("Supabase login did not return an access token")
    return base, anon, token


def rest_headers(anon: str, token: str) -> dict[str, str]:
    # Financial tables live in the `financial` Postgres schema of the shared
    # Cadence Work Supabase project (not `public`) -- PostgREST selects the
    # schema via these profile headers: Accept-Profile for reads,
    # Content-Profile for writes. Sending both on every request is harmless.
    return {
        "apikey": anon,
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Accept-Profile": "financial",
        "Content-Profile": "financial",
    }


def select(table: str, query: str = "", limit: int | None = None) -> Any:
    if table not in TABLES:
        raise FinancialBridgeError(f"Unknown table {table!r}. Allowed: {', '.join(TABLES)}")
    base, anon, token = get_session()
    params = query.lstrip("?")
    if limit is not None:
        params = (params + "&" if params else "") + f"limit={limit}"
    url = f"{base}/rest/v1/{table}" + (f"?{params}" if params else "")
    return request_json("GET", url, rest_headers(anon, token))


def discover_owner_id() -> str:
    explicit = os.environ.get("CADENCE_FINANCIAL_OWNER_ID")
    if explicit:
        return explicit
    grants = select(
        "financial_agent_access",
        "select=owner_user_id,can_read,can_write,revoked_at&revoked_at=is.null&can_write=eq.true",
        limit=2,
    )
    if not isinstance(grants, list) or not grants:
        raise FinancialBridgeError(
            "No active writable Cadence Financial agent grant visible. Run the "
            "0024_financial_agent_access.sql migration and insert the Rodney -> Kobe grant, "
            "or set CADENCE_FINANCIAL_OWNER_ID."
        )
    if len(grants) > 1:
        raise FinancialBridgeError(
            "Multiple writable Cadence Financial owner grants visible. Set CADENCE_FINANCIAL_OWNER_ID explicitly."
        )
    owner_id = grants[0].get("owner_user_id")
    if not owner_id:
        raise FinancialBridgeError("Active Cadence Financial grant did not include owner_user_id")
    return str(owner_id)


def insert(table: str, row: dict[str, Any]) -> Any:
    if table not in TABLES:
        raise FinancialBridgeError(f"Unknown table {table!r}. Allowed: {', '.join(TABLES)}")
    base, anon, token = get_session()
    headers = {**rest_headers(anon, token), "Prefer": "return=representation"}
    url = f"{base}/rest/v1/{table}"
    return request_json("POST", url, headers, row)


def upsert(table: str, row: dict[str, Any], on_conflict: str) -> Any:
    """Insert-or-update on a unique constraint (e.g. owner_id,period monthly metrics)."""
    if table not in TABLES:
        raise FinancialBridgeError(f"Unknown table {table!r}. Allowed: {', '.join(TABLES)}")
    base, anon, token = get_session()
    headers = {
        **rest_headers(anon, token),
        "Prefer": "return=representation,resolution=merge-duplicates",
    }
    url = f"{base}/rest/v1/{table}?on_conflict={urllib.parse.quote(on_conflict)}"
    return request_json("POST", url, headers, row)


def patch_row(table: str, row_id: str, patch: dict[str, Any]) -> Any:
    if table not in TABLES:
        raise FinancialBridgeError(f"Unknown table {table!r}. Allowed: {', '.join(TABLES)}")
    base, anon, token = get_session()
    headers = {**rest_headers(anon, token), "Prefer": "return=representation"}
    row_filter = urllib.parse.quote(f"eq.{row_id}", safe=".=:-_")
    url = f"{base}/rest/v1/{table}?id={row_filter}"
    return request_json("PATCH", url, headers, patch)


def cmd_status(_: argparse.Namespace) -> None:
    print("Cadence Financial bridge configured values:")
    for name in [
        "CADENCE_FINANCIAL_SUPABASE_URL",
        "CADENCE_FINANCIAL_SUPABASE_ANON_KEY",
        "CADENCE_FINANCIAL_AGENT_EMAIL",
        "CADENCE_FINANCIAL_OWNER_ID",
    ]:
        print(f"- {name}: {'set' if os.environ.get(name) else 'missing'}")
    email = os.environ.get("CADENCE_FINANCIAL_AGENT_EMAIL") or ""
    has_pw = bool(email and keychain_password(KEYCHAIN_SERVICE, email)) or bool(
        os.environ.get("CADENCE_FINANCIAL_AGENT_PASSWORD")
    )
    print(f"- agent password: {'available' if has_pw else 'missing'}")


def cmd_probe(_: argparse.Namespace) -> None:
    # Read only. Confirms auth and RLS visibility without dumping sensitive row data.
    try:
        counts: dict[str, int | str] = {}
        grants = select(
            "financial_agent_access",
            "select=owner_user_id,can_read,can_write,revoked_at&revoked_at=is.null",
            limit=10,
        )
        writable = [g for g in grants if isinstance(g, dict) and g.get("can_write")] if isinstance(grants, list) else []
        for t in ["properties", "loans", "monthly_metrics", "investment_holdings", "investment_income", "decisions", "liquidity_buckets"]:
            rows = select(t, "select=id", limit=1000)
            counts[t] = len(rows) if isinstance(rows, list) else "?"
        print(json.dumps({
            "ok": True,
            "active_grants": len(grants) if isinstance(grants, list) else "?",
            "writable_grants": len(writable),
            "visible_counts": counts,
        }, indent=2))
    except FinancialBridgeError as e:
        fail(str(e))


def cmd_list(args: argparse.Namespace) -> None:
    try:
        rows = select(args.table, args.query or "", limit=args.limit)
        print(json.dumps(rows, indent=2, ensure_ascii=False))
    except FinancialBridgeError as e:
        fail(str(e))


def main() -> None:
    p = argparse.ArgumentParser(description="Cadence Financial Supabase bridge for Kobe/Hermes")
    sub = p.add_subparsers(required=True)

    s = sub.add_parser("status", help="check local configuration; no network call")
    s.set_defaults(func=cmd_status)

    s = sub.add_parser("probe", help="read-only auth/RLS visibility check")
    s.set_defaults(func=cmd_probe)

    s = sub.add_parser("list", help="list rows from an allowed table")
    s.add_argument("table")
    s.add_argument("--query", default="", help="PostgREST filter string, e.g. select=*&period=eq.2026-07")
    s.add_argument("--limit", type=int, default=50)
    s.set_defaults(func=cmd_list)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
