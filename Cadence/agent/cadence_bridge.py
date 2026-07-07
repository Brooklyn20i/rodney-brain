#!/usr/bin/env python3
"""
Cadence Supabase bridge for Kobe/Hermes.

Purpose:
- Give the agent a narrow, auditable CLI for reading/writing Cadence live data.
- Keep secrets out of chat, repo, logs, and prompts.

Secret handling:
- Preferred: macOS Keychain entries, read at runtime with `security`.
- Fallback: environment variables for non-secret/public values only.
- This script never prints tokens/passwords/keys.

Required configuration:
  CADENCE_SUPABASE_URL              public project URL
  CADENCE_SUPABASE_ANON_KEY         public anon/publishable key
  CADENCE_AGENT_EMAIL               dedicated agent account email
  CADENCE_OWNER_ID                  optional; otherwise discovered from active grant

Password options, in this order:
  1. macOS Keychain generic password:
       service: cadence-agent-password
       account: $CADENCE_AGENT_EMAIL
  2. CADENCE_AGENT_PASSWORD env var (discouraged; use only temporary shells)

Important:
- Requires the proper shared-access RLS migration (`cadence_agent_access`).
- Writes include Rodney's owner_id so they appear in Rodney's Cadence workspace.
- Do not use Rodney's personal login here.
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
from typing import Any

TABLES = [
    "projects", "milestones", "project_updates", "people", "talking_points",
    "work_items", "comments", "decisions", "notes", "outbox", "links", "activity",
    "cadence_agent_access", "agent_messages", "agent_control_events",
]


class CadenceBridgeError(Exception):
    """Raised by bridge library functions on recoverable errors."""


def fail(msg: str, code: int = 2) -> None:
    """CLI entry point: print error and exit. Library code raises CadenceBridgeError instead."""
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
    pw = keychain_password("cadence-agent-password", email)
    if pw:
        return pw
    pw = os.environ.get("CADENCE_AGENT_PASSWORD")
    if pw:
        return pw
    raise CadenceBridgeError(
        "No Cadence agent password found. Add it to macOS Keychain with service "
        "cadence-agent-password and account equal to CADENCE_AGENT_EMAIL."
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
        raise CadenceBridgeError(f"HTTP {e.code} from {url}: {detail}")
    except urllib.error.URLError as e:
        raise CadenceBridgeError(f"Network error contacting {url}: {e.reason}")
    except json.JSONDecodeError as e:
        raise CadenceBridgeError(f"Invalid JSON response from {url}: {e}")


def get_session() -> tuple[str, str, str]:
    base = (env("CADENCE_SUPABASE_URL") or "").rstrip("/")
    anon = env("CADENCE_SUPABASE_ANON_KEY") or ""
    email = env("CADENCE_AGENT_EMAIL") or ""
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
        raise CadenceBridgeError("Supabase login did not return an access token")
    return base, anon, token


def rest_headers(anon: str, token: str) -> dict[str, str]:
    return {
        "apikey": anon,
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def select(table: str, query: str = "", limit: int | None = None) -> Any:
    if table not in TABLES:
        raise CadenceBridgeError(f"Unknown table {table!r}. Allowed: {', '.join(TABLES)}")
    base, anon, token = get_session()
    params = query.lstrip("?")
    if limit is not None:
        params = (params + "&" if params else "") + f"limit={limit}"
    url = f"{base}/rest/v1/{table}" + (f"?{params}" if params else "")
    return request_json("GET", url, rest_headers(anon, token))


def _active_writable_grants(limit: int = 2) -> list[dict[str, Any]]:
    """Return active writable grants across legacy and live schema variants.

    The original migration used `owner_user_id`; the live Cadence Work project
    currently exposes `owner_id`. Keep the bridge compatible with both instead
    of requiring a DB migration just to keep Kobe operational.
    """
    queries = [
        "select=owner_id,agent_user_id,can_write,revoked_at&revoked_at=is.null&can_write=eq.true",
        "select=owner_user_id,agent_user_id,can_write,revoked_at&revoked_at=is.null&can_write=eq.true",
    ]
    last_error: Exception | None = None
    for query in queries:
        try:
            grants = select("cadence_agent_access", query, limit=limit)
        except CadenceBridgeError as e:
            last_error = e
            continue
        if isinstance(grants, list):
            return [g for g in grants if isinstance(g, dict)]
    if last_error:
        raise last_error
    return []


def _owner_id_from_grant(grant: dict[str, Any]) -> str | None:
    owner_id = grant.get("owner_id") or grant.get("owner_user_id")
    return str(owner_id) if owner_id else None


def discover_owner_id() -> str:
    explicit = os.environ.get("CADENCE_OWNER_ID")
    if explicit:
        return explicit
    grants = _active_writable_grants(limit=2)
    if not grants:
        raise CadenceBridgeError(
            "No active writable Cadence agent grant visible. Insert the Rodney -> Kobe grant, "
            "or set CADENCE_OWNER_ID."
        )
    if len(grants) > 1:
        raise CadenceBridgeError("Multiple writable Cadence owner grants visible. Set CADENCE_OWNER_ID explicitly.")
    owner_id = _owner_id_from_grant(grants[0])
    if not owner_id:
        raise CadenceBridgeError("Active Cadence grant did not include owner_id/owner_user_id")
    return owner_id


def discover_workspace_id() -> str | None:
    explicit = os.environ.get("CADENCE_WORKSPACE_ID")
    if explicit:
        return explicit
    rows = select(
        "projects",
        "select=workspace_id&workspace_id=not.is.null&deleted_at=is.null&order=updated_at.desc",
        limit=20,
    )
    if not isinstance(rows, list):
        return None
    workspace_ids = sorted({str(r.get("workspace_id")) for r in rows if isinstance(r, dict) and r.get("workspace_id")})
    if not workspace_ids:
        return None
    if len(workspace_ids) > 1:
        raise CadenceBridgeError("Multiple Cadence workspaces visible. Set CADENCE_WORKSPACE_ID explicitly.")
    return workspace_ids[0]


WORKSPACE_SCOPED_TABLES = {
    "projects", "milestones", "project_updates", "people", "talking_points",
    "work_items", "comments", "decisions", "notes", "outbox", "links", "activity",
    "agent_messages", "agent_control_events",
}


def with_owner_workspace(table: str, row: dict[str, Any]) -> dict[str, Any]:
    out = dict(row)
    if "owner_id" not in out:
        out["owner_id"] = discover_owner_id()
    if table in WORKSPACE_SCOPED_TABLES and "workspace_id" not in out:
        workspace_id = discover_workspace_id()
        if workspace_id:
            out["workspace_id"] = workspace_id
    return out


def insert(table: str, row: dict[str, Any]) -> Any:
    if table not in TABLES:
        raise CadenceBridgeError(f"Unknown table {table!r}. Allowed: {', '.join(TABLES)}")
    base, anon, token = get_session()
    headers = {**rest_headers(anon, token), "Prefer": "return=representation"}
    url = f"{base}/rest/v1/{table}"
    return request_json("POST", url, headers, with_owner_workspace(table, row))


def patch_row(table: str, row_id: str, patch: dict[str, Any]) -> Any:
    if table not in TABLES:
        raise CadenceBridgeError(f"Unknown table {table!r}. Allowed: {', '.join(TABLES)}")
    base, anon, token = get_session()
    headers = {**rest_headers(anon, token), "Prefer": "return=representation"}
    row_filter = urllib.parse.quote(f"eq.{row_id}", safe=".=:-_")
    url = f"{base}/rest/v1/{table}?id={row_filter}"
    return request_json("PATCH", url, headers, patch)


def cmd_status(_: argparse.Namespace) -> None:
    print("Cadence bridge configured values:")
    for name in ["CADENCE_SUPABASE_URL", "CADENCE_SUPABASE_ANON_KEY", "CADENCE_AGENT_EMAIL", "CADENCE_OWNER_ID"]:
        print(f"- {name}: {'set' if os.environ.get(name) else 'missing'}")
    email = os.environ.get("CADENCE_AGENT_EMAIL") or ""
    has_pw = bool(email and keychain_password("cadence-agent-password", email)) or bool(os.environ.get("CADENCE_AGENT_PASSWORD"))
    print(f"- agent password: {'available' if has_pw else 'missing'}")


def cmd_probe(_: argparse.Namespace) -> None:
    # Read only. Confirms auth and RLS visibility without dumping sensitive row data.
    try:
        counts: dict[str, int | str] = {}
        grants = _active_writable_grants(limit=10)
        writable_grants = [g for g in grants if isinstance(g, dict) and g.get("can_write")] if isinstance(grants, list) else []
        for t in ["work_items", "projects", "people", "decisions", "outbox"]:
            rows = select(t, "select=id", limit=1000)
            counts[t] = len(rows) if isinstance(rows, list) else "?"
        print(json.dumps({
            "ok": True,
            "active_grants": len(grants) if isinstance(grants, list) else "?",
            "writable_grants": len(writable_grants),
            "visible_counts": counts,
        }, indent=2))
    except CadenceBridgeError as e:
        fail(str(e))


def cmd_list(args: argparse.Namespace) -> None:
    try:
        rows = select(args.table, args.query or "", limit=args.limit)
        print(json.dumps(rows, indent=2, ensure_ascii=False))
    except CadenceBridgeError as e:
        fail(str(e))


def cmd_add_inbox(args: argparse.Namespace) -> None:
    try:
        row = {
            "owner_id": discover_owner_id(),
            "title": args.title,
            "type": args.type,
            "priority": args.priority,
            "due_date": args.due_date,
            "notes": args.notes or "",
            "inboxed": True,
            "source": "agent:kobe",
            "done": False,
        }
        row = {k: v for k, v in row.items() if v is not None}
        res = insert("work_items", row)
        print(json.dumps(res, indent=2, ensure_ascii=False))
    except CadenceBridgeError as e:
        fail(str(e))


def cmd_complete(args: argparse.Namespace) -> None:
    try:
        res = patch_row("work_items", args.id, {"done": True, "completed_at": dt.datetime.now(dt.UTC).isoformat()})
        print(json.dumps(res, indent=2, ensure_ascii=False))
    except CadenceBridgeError as e:
        fail(str(e))


def main() -> None:
    p = argparse.ArgumentParser(description="Cadence Supabase bridge for Kobe/Hermes")
    sub = p.add_subparsers(required=True)

    s = sub.add_parser("status", help="check local configuration; no network call")
    s.set_defaults(func=cmd_status)

    s = sub.add_parser("probe", help="read-only auth/RLS visibility check")
    s.set_defaults(func=cmd_probe)

    s = sub.add_parser("list", help="list rows from a table")
    s.add_argument("table", choices=TABLES)
    s.add_argument("--query", default="", help="PostgREST query string, e.g. 'done=eq.false&select=*'")
    s.add_argument("--limit", type=int, default=20)
    s.set_defaults(func=cmd_list)

    s = sub.add_parser("add-inbox", help="add a work item to Rodney/Kobe triage inbox")
    s.add_argument("title")
    s.add_argument("--type", default="task", choices=["task", "decision", "followUp", "waitingFor", "risk", "action"])
    s.add_argument("--priority", default="medium", choices=["high", "medium", "low"])
    s.add_argument("--due-date")
    s.add_argument("--notes", default="")
    s.set_defaults(func=cmd_add_inbox)

    s = sub.add_parser("complete", help="mark a work item complete")
    s.add_argument("id")
    s.set_defaults(func=cmd_complete)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
