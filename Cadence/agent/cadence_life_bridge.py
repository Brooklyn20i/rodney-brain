#!/usr/bin/env python3
"""
Cadence Life Supabase bridge for Kobe/Hermes.

Life data lives in the `life` Postgres schema of the same Supabase project as
Cadence Work. This bridge deliberately reuses Work auth configuration and sends
PostgREST schema profile headers for `life` on every table/RPC request.

Required configuration (same auth as Cadence Work):
  CADENCE_SUPABASE_URL       public project URL
  CADENCE_SUPABASE_ANON_KEY  public anon/publishable key
  CADENCE_AGENT_EMAIL        dedicated Kobe/Hermes agent account email
  CADENCE_LIFE_OWNER_ID      optional; otherwise discovered from explicit
                             life.life_agent_access writable grants

Password options, in this order:
  1. macOS Keychain generic password:
       service: cadence-agent-password
       account: $CADENCE_AGENT_EMAIL
  2. CADENCE_AGENT_PASSWORD env var (discouraged; use only temporary shells)

Important:
- Requires migrations 0049, 0050 and 0051_life_agent_access.sql.
- Never use a service_role key here. The bridge logs in as the agent user and
  relies on normal RLS plus explicit Life-domain grants.
- Create/update payloads are read from JSON files so sensitive notes do not end
  up in shell history.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

TABLES = ["life_items", "obligations", "life_agent_access"]
DATA_TABLES = {"life_items", "obligations"}
KEYCHAIN_SERVICE = "cadence-agent-password"
GRANT_SELECT = "select=owner_id,agent_user_id,can_read,can_write,revoked_at&revoked_at=is.null&can_write=eq.true"


class LifeBridgeError(Exception):
    """Raised by bridge library functions on recoverable errors."""


def fail(msg: str, code: int = 2) -> None:
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
    pw = os.environ.get("CADENCE_AGENT_PASSWORD")
    if pw:
        return pw
    raise LifeBridgeError(
        "No Cadence agent password found. Add it to macOS Keychain with service "
        f"{KEYCHAIN_SERVICE} and account equal to CADENCE_AGENT_EMAIL."
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
        raise LifeBridgeError(f"HTTP {e.code} from {url}: {detail}")
    except urllib.error.URLError as e:
        raise LifeBridgeError(f"Network error contacting {url}: {e.reason}")
    except json.JSONDecodeError as e:
        raise LifeBridgeError(f"Invalid JSON response from {url}: {e}")


def get_session() -> tuple[str, str, str]:
    base = (env("CADENCE_SUPABASE_URL") or "").rstrip("/")
    anon = env("CADENCE_SUPABASE_ANON_KEY") or ""
    email = env("CADENCE_AGENT_EMAIL") or ""
    pw = agent_password(email)
    res = request_json(
        "POST",
        f"{base}/auth/v1/token?grant_type=password",
        {"apikey": anon, "Accept": "application/json"},
        {"email": email, "password": pw},
    )
    token = res.get("access_token") if isinstance(res, dict) else None
    if not token:
        raise LifeBridgeError("Supabase login did not return an access token")
    return base, anon, token


def rest_headers(anon: str, token: str) -> dict[str, str]:
    return {
        "apikey": anon,
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Accept-Profile": "life",
        "Content-Profile": "life",
    }


def _require_table(table: str) -> None:
    if table not in TABLES:
        raise LifeBridgeError(f"Unknown table {table!r}. Allowed: {', '.join(TABLES)}")


def _require_data_table(table: str) -> None:
    if table not in DATA_TABLES:
        raise LifeBridgeError(
            f"Unknown table {table!r}. CRUD is limited to Life data tables: "
            f"{', '.join(sorted(DATA_TABLES))}"
        )


def _filter_eq(column: str, value: str) -> str:
    return f"{column}={urllib.parse.quote('eq.' + value, safe='.=:-_')}"


def _append_param(params: str, param: str) -> str:
    return (params + "&" if params else "") + param


def select(table: str, query: str = "", limit: int | None = None) -> Any:
    _require_table(table)
    base, anon, token = get_session()
    params = query.lstrip("?")
    if limit is not None:
        params = (params + "&" if params else "") + f"limit={limit}"
    url = f"{base}/rest/v1/{table}" + (f"?{params}" if params else "")
    return request_json("GET", url, rest_headers(anon, token))


def discover_owner_id() -> str:
    explicit = os.environ.get("CADENCE_LIFE_OWNER_ID")
    query = GRANT_SELECT
    if explicit:
        query = _append_param(query, _filter_eq("owner_id", explicit))
    grants = select("life_agent_access", query, limit=2)
    if not isinstance(grants, list) or not grants:
        raise LifeBridgeError(
            "No active writable Cadence Life agent grant visible. Apply 0051_life_agent_access.sql "
            "and insert the Rodney -> Kobe Life grant, or set CADENCE_LIFE_OWNER_ID to a granted owner."
        )
    if len(grants) > 1:
        raise LifeBridgeError("Multiple writable Cadence Life owner grants visible. Set CADENCE_LIFE_OWNER_ID explicitly.")
    owner_id = grants[0].get("owner_id") if isinstance(grants[0], dict) else None
    if not owner_id:
        raise LifeBridgeError("Active Cadence Life grant did not include owner_id")
    if explicit and str(owner_id) != explicit:
        raise LifeBridgeError("Active Cadence Life grant did not match CADENCE_LIFE_OWNER_ID")
    return str(owner_id)


def with_owner(table: str, row: dict[str, Any]) -> dict[str, Any]:
    _require_data_table(table)
    out = dict(row)
    out["owner_id"] = discover_owner_id()
    return out


def create_row(table: str, row: dict[str, Any]) -> Any:
    _require_data_table(table)
    base, anon, token = get_session()
    headers = {**rest_headers(anon, token), "Prefer": "return=representation"}
    return request_json("POST", f"{base}/rest/v1/{table}", headers, with_owner(table, row))


def update_row(table: str, row_id: str, patch: dict[str, Any]) -> Any:
    _require_data_table(table)
    if "owner_id" in patch:
        raise LifeBridgeError("owner_id cannot be changed through the Cadence Life bridge")
    base, anon, token = get_session()
    headers = {**rest_headers(anon, token), "Prefer": "return=representation"}
    params = _append_param(_filter_eq("id", row_id), _filter_eq("owner_id", discover_owner_id()))
    url = f"{base}/rest/v1/{table}?{params}"
    return request_json("PATCH", url, headers, patch)


def soft_delete(table: str, row_id: str) -> Any:
    _require_data_table(table)
    return update_row(table, row_id, {"deleted_at": dt.datetime.now(dt.timezone.utc).isoformat()})


def complete_obligation(obligation_id: str, expected_due: str, today: str) -> Any:
    selected_owner_id = discover_owner_id()
    obligations = get_row("obligations", obligation_id)
    if (
        not isinstance(obligations, list)
        or len(obligations) != 1
        or not isinstance(obligations[0], dict)
        or str(obligations[0].get("owner_id")) != selected_owner_id
    ):
        raise LifeBridgeError("Obligation is unavailable under the selected Life owner")
    base, anon, token = get_session()
    headers = {**rest_headers(anon, token), "Prefer": "return=representation"}
    return request_json(
        "POST",
        f"{base}/rest/v1/rpc/complete_obligation",
        headers,
        {"p_obligation_id": obligation_id, "p_expected_due": expected_due, "p_today": today},
    )


def list_rows(table: str, query: str = "", limit: int = 50) -> Any:
    _require_table(table)
    params = query.lstrip("?")
    if table in DATA_TABLES:
        if "deleted_at=" not in params:
            params = _append_param(params, "deleted_at=is.null")
        params = _append_param(params, _filter_eq("owner_id", discover_owner_id()))
    if "select=" not in params:
        params = "select=*" + ("&" + params if params else "")
    return select(table, params, limit=limit)


def get_row(table: str, row_id: str) -> Any:
    _require_table(table)
    q = f"select=*&{_filter_eq('id', row_id)}"
    if table in DATA_TABLES:
        q += "&deleted_at=is.null"
        q += f"&{_filter_eq('owner_id', discover_owner_id())}"
    return select(table, q, limit=1)


def load_json_file(path: str) -> dict[str, Any]:
    try:
        data = json.loads(Path(path).read_text())
    except OSError as e:
        raise LifeBridgeError(f"Could not read JSON file {path}: {e}")
    except json.JSONDecodeError as e:
        raise LifeBridgeError(f"Invalid JSON file {path}: {e}")
    if not isinstance(data, dict):
        raise LifeBridgeError("JSON payload file must contain one object")
    return data


def _bounded_limit(value: str) -> int:
    parsed = int(value)
    if parsed < 1 or parsed > 200:
        raise argparse.ArgumentTypeError("limit must be between 1 and 200")
    return parsed


def cmd_status(_: argparse.Namespace) -> None:
    print("Cadence Life bridge configured values:")
    for name in ["CADENCE_SUPABASE_URL", "CADENCE_SUPABASE_ANON_KEY", "CADENCE_AGENT_EMAIL", "CADENCE_LIFE_OWNER_ID"]:
        print(f"- {name}: {'set' if os.environ.get(name) else 'missing'}")
    email = os.environ.get("CADENCE_AGENT_EMAIL") or ""
    has_pw = bool(email and keychain_password(KEYCHAIN_SERVICE, email)) or bool(os.environ.get("CADENCE_AGENT_PASSWORD"))
    print(f"- agent password: {'available' if has_pw else 'missing'}")


def cmd_probe(_: argparse.Namespace) -> None:
    grants = select(
        "life_agent_access",
        "select=owner_id,agent_user_id,can_read,can_write,revoked_at&revoked_at=is.null",
        limit=10,
    )
    writable = [g for g in grants if isinstance(g, dict) and g.get("can_write")] if isinstance(grants, list) else []
    counts: dict[str, int | str] = {}
    for table in ["life_items", "obligations"]:
        rows = list_rows(table, "select=id", limit=200)
        counts[table] = len(rows) if isinstance(rows, list) else "?"
    print(json.dumps({"ok": True, "active_grants": len(grants) if isinstance(grants, list) else "?", "writable_grants": len(writable), "visible_counts": counts}, indent=2))


def cmd_list(args: argparse.Namespace) -> None:
    print(json.dumps(list_rows(args.table, args.query or "", args.limit), indent=2, ensure_ascii=False))


def cmd_get(args: argparse.Namespace) -> None:
    print(json.dumps(get_row(args.table, args.id), indent=2, ensure_ascii=False))


def cmd_create(args: argparse.Namespace) -> None:
    print(json.dumps(create_row(args.table, load_json_file(args.json_file)), indent=2, ensure_ascii=False))


def cmd_update(args: argparse.Namespace) -> None:
    print(json.dumps(update_row(args.table, args.id, load_json_file(args.json_file)), indent=2, ensure_ascii=False))


def cmd_delete(args: argparse.Namespace) -> None:
    print(json.dumps(soft_delete(args.table, args.id), indent=2, ensure_ascii=False))


def cmd_complete(args: argparse.Namespace) -> None:
    print(json.dumps(complete_obligation(args.id, args.expected_due, args.today), indent=2, ensure_ascii=False))


def main() -> None:
    p = argparse.ArgumentParser(description="Cadence Life Supabase bridge for Kobe/Hermes")
    sub = p.add_subparsers(required=True)

    s = sub.add_parser("status", help="check local configuration; no network call")
    s.set_defaults(func=cmd_status)

    s = sub.add_parser("probe", help="read-only auth/RLS visibility check")
    s.set_defaults(func=cmd_probe)

    s = sub.add_parser("list", help="list rows from an allowed Life table")
    s.add_argument("table", choices=TABLES)
    s.add_argument("--query", default="", help="PostgREST filter string, e.g. 'status=eq.open&order=due_date.asc'")
    s.add_argument("--limit", type=_bounded_limit, default=50)
    s.set_defaults(func=cmd_list)

    s = sub.add_parser("get", help="get one row by id")
    s.add_argument("table", choices=TABLES)
    s.add_argument("id")
    s.set_defaults(func=cmd_get)

    s = sub.add_parser("create", help="create life_items/obligations row from JSON file")
    s.add_argument("table", choices=sorted(DATA_TABLES))
    s.add_argument("--json-file", required=True)
    s.set_defaults(func=cmd_create)

    s = sub.add_parser("update", help="patch life_items/obligations row from JSON file")
    s.add_argument("table", choices=sorted(DATA_TABLES))
    s.add_argument("id")
    s.add_argument("--json-file", required=True)
    s.set_defaults(func=cmd_update)

    s = sub.add_parser("delete", help="soft-delete a life item or obligation; generated completion history is retained")
    s.add_argument("table", choices=sorted(DATA_TABLES))
    s.add_argument("id")
    s.set_defaults(func=cmd_delete)

    s = sub.add_parser("complete", help="complete a recurring obligation cycle through the atomic RPC")
    s.add_argument("id", help="obligation id")
    s.add_argument("--expected-due", required=True, help="YYYY-MM-DD current due date / idempotency key")
    s.add_argument("--today", required=True, help="YYYY-MM-DD caller-local today")
    s.set_defaults(func=cmd_complete)

    args = p.parse_args()
    try:
        args.func(args)
    except LifeBridgeError as e:
        fail(str(e))


if __name__ == "__main__":
    main()
