#!/usr/bin/env python3
"""
Cadence Agent Sweep — lightweight change-detection loop for Kobe/Hermes.

Designed to run every 5-10 minutes. Detects meaningful changes in Cadence
since the last run using hash-based comparison. If nothing changed: exits
silently without triggering an LLM pass. If changes detected: writes a
compact payload JSON for Kobe to consume.

State files (Hermes-compatible):
  ~/.hermes/state/cadence_agent_sweep_state.json   cursor + item hashes
  ~/.hermes/state/cadence_agent_sweep.lock          process lock
  ~/.hermes/state/cadence_agent_sweep_payload.json  latest payload (Kobe clears after reading)

Usage:
  python cadence_agent_sweep.py                   normal sweep
  python cadence_agent_sweep.py --force           force payload even if nothing changed
  python cadence_agent_sweep.py --mode morning    morning executive review data
  python cadence_agent_sweep.py --mode evening    evening executive review data
  python cadence_agent_sweep.py --dry-run         print payload, no writes

Exit codes:
  0  payload written (or --dry-run output)
  2  nothing changed, no payload written
  1  error
"""

from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any

# ── Bridge import (handles running from any directory) ────────────────────────
_here = Path(__file__).parent.resolve()
if str(_here) not in sys.path:
    sys.path.insert(0, str(_here))
import cadence_bridge as bridge

# ── State paths (fall back to script dir if ~/.hermes doesn't exist yet) ──────
_hermes_state = Path.home() / ".hermes" / "state"
_hermes_state.mkdir(parents=True, exist_ok=True)
STATE_FILE   = _hermes_state / "cadence_agent_sweep_state.json"
LOCK_FILE    = _hermes_state / "cadence_agent_sweep.lock"
PAYLOAD_FILE = _hermes_state / "cadence_agent_sweep_payload.json"


# ── State helpers ─────────────────────────────────────────────────────────────

def _load_state() -> dict:
    try:
        return json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else {}
    except Exception:
        return {}


def _save_state(state: dict) -> None:
    STATE_FILE.write_text(json.dumps(state, indent=2, default=str))


def _now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def _today() -> str:
    return dt.date.today().isoformat()


def _day_offset(days: int) -> str:
    return (dt.date.today() + dt.timedelta(days=days)).isoformat()


# ── Process lock (prevents parallel sweep runs) ───────────────────────────────

class _Lock:
    def __init__(self) -> None:
        self._f = None

    def __enter__(self) -> "_Lock":
        self._f = open(LOCK_FILE, "w")
        try:
            fcntl.flock(self._f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self._f.close()
            self._f = None
            raise RuntimeError("Another sweep is already running — skipping this tick")
        return self

    def __exit__(self, *_) -> None:
        if self._f:
            fcntl.flock(self._f, fcntl.LOCK_UN)
            self._f.close()
            try:
                LOCK_FILE.unlink(missing_ok=True)
            except Exception:
                pass


# ── Hash (detects meaningful change, ignores noise like updated_at jitter) ────

def _hash_work_item(item: dict) -> str:
    key = {k: item.get(k) for k in (
        "title", "type", "priority", "due_date", "done", "inboxed",
        "project_id", "person_id", "notes", "source", "updated_at",
    )}
    return hashlib.sha256(json.dumps(key, sort_keys=True).encode()).hexdigest()[:16]


# ── Cadence queries ───────────────────────────────────────────────────────────

def _sel(table: str, q: str, limit: int = 50) -> list[dict]:
    try:
        result = bridge.select(table, q, limit=limit)
        return result if isinstance(result, list) else []
    except Exception:
        return []


def _inbox() -> list[dict]:
    return _sel("work_items",
                "select=*&inboxed=eq.true&done=eq.false&deleted_at=is.null&order=created_at.asc",
                limit=50)


def _updated_since(cursor: str) -> list[dict]:
    return _sel("work_items",
                f"select=*&done=eq.false&deleted_at=is.null&updated_at=gt.{cursor}&order=updated_at.asc",
                limit=100)


def _overdue() -> list[dict]:
    return _sel("work_items",
                f"select=*&done=eq.false&deleted_at=is.null&due_date=lt.{_today()}&order=due_date.asc",
                limit=30)


def _due_today() -> list[dict]:
    return _sel("work_items",
                f"select=*&done=eq.false&deleted_at=is.null&due_date=eq.{_today()}&order=priority.desc",
                limit=30)


def _due_this_week() -> list[dict]:
    return _sel("work_items",
                f"select=*&done=eq.false&deleted_at=is.null&due_date=gte.{_today()}&due_date=lte.{_day_offset(7)}&order=due_date.asc",
                limit=30)


def _high_priority() -> list[dict]:
    return _sel("work_items",
                "select=*&priority=eq.high&done=eq.false&deleted_at=is.null&order=due_date.asc.nullslast",
                limit=30)


def _agent_items() -> list[dict]:
    return _sel("work_items",
                "select=*&source=eq.agent%3Akobe&done=eq.false&deleted_at=is.null&order=updated_at.desc",
                limit=30)


def _stale_queue(hours: int = 24) -> list[dict]:
    cutoff = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=hours)).isoformat()
    return _sel("agent_control_events",
                f"select=*&status=eq.processing&claimed_at=lt.{cutoff}&deleted_at=is.null",
                limit=20)


def _pending_queue(limit: int = 50) -> list[dict]:
    return _sel("agent_control_events",
                "select=*&status=in.(pending,processing)&deleted_at=is.null&order=created_at.asc",
                limit=limit)


def _completed_since(cursor: str) -> list[dict]:
    return _sel("work_items",
                f"select=id,title,type,done,completed_at,project_id,person_id&done=eq.true&deleted_at=is.null&updated_at=gt.{cursor}&order=updated_at.desc",
                limit=30)


def _active_projects() -> list[dict]:
    return _sel("projects",
                "select=id,name,status,health,target_date,next_action,updated_at&status=eq.active&deleted_at=is.null&order=name.asc",
                limit=20)


def _at_risk_projects() -> list[dict]:
    return _sel("projects",
                "select=*&status=eq.active&health=in.(amber,red)&deleted_at=is.null",
                limit=10)


def _stale_decisions() -> list[dict]:
    cutoff = _day_offset(-7)
    return _sel("decisions",
                f"select=*&status=eq.pending&deleted_at=is.null&created_at=lt.{cutoff}&order=created_at.asc",
                limit=10)


def _all_pending_decisions() -> list[dict]:
    return _sel("decisions",
                "select=*&status=eq.pending&deleted_at=is.null&order=due_date.asc.nullslast",
                limit=20)


def _activity_since(cursor: str) -> list[dict]:
    return _sel("activity",
                f"select=actor,action,detail,created_at&created_at=gt.{cursor}&order=created_at.asc",
                limit=50)


# ── Event upsert ──────────────────────────────────────────────────────────────

def _ensure_event(owner_id: str, entity_id: str, entity_type: str,
                  event_type: str, priority: str,
                  payload: dict, idem_key: str) -> None:
    try:
        bridge.insert("agent_control_events", {
            "owner_id": owner_id,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "event_type": event_type,
            "priority": priority,
            "status": "pending",
            "idempotency_key": idem_key,
            "payload": payload,
        })
    except Exception:
        pass  # unique constraint = already queued, fine


# ── Compact payload builder ───────────────────────────────────────────────────

def _slim(item: dict) -> dict:
    return {k: item.get(k) for k in (
        "id", "title", "type", "priority", "due_date", "done", "inboxed",
        "source", "project_id", "person_id", "notes", "updated_at",
    )}


def _build_sweep_payload(
    inbox: list[dict],
    updated: list[dict],
    overdue: list[dict],
    due_today: list[dict],
    high_pri: list[dict],
    agent_items: list[dict],
    stale_queue: list[dict],
    pending_queue: list[dict],
) -> dict:
    seen: set[str] = set()

    def dedup(items: list[dict]) -> list[dict]:
        out = []
        for i in items:
            if (iid := i.get("id")) and iid not in seen:
                seen.add(iid)
                out.append(_slim(i))
        return out

    return {
        "mode": "sweep",
        "generated_at": _now_iso(),
        "today": _today(),
        "summary": {
            "inbox_count":       len(inbox),
            "overdue_count":     len(overdue),
            "due_today_count":   len(due_today),
            "updated_count":     len(updated),
            "agent_items_count": len(agent_items),
            "stale_queue_count": len(stale_queue),
            "pending_queue_count": len(pending_queue),
        },
        "inbox":                    dedup(inbox),
        "overdue":                  dedup(overdue),
        "due_today":                dedup(due_today),
        "updated_since_last_sweep": dedup(updated),
        "high_priority":            dedup(high_pri),
        "agent_items":              dedup(agent_items),
        "stale_queue_events":       stale_queue,
        "pending_queue_events":     pending_queue,
    }


def _build_morning_payload(cursor: str | None) -> dict:
    overdue       = _overdue()
    due_today     = _due_today()
    due_week      = _due_this_week()
    high_pri      = _high_priority()
    at_risk_proj  = _at_risk_projects()
    stale_dec     = _stale_decisions()
    inbox         = _inbox()
    agent_items   = _agent_items()
    pending_q     = _pending_queue(limit=20)

    return {
        "mode": "morning_review",
        "generated_at": _now_iso(),
        "today": _today(),
        "week_end": _day_offset(7),
        "inbox": [_slim(i) for i in inbox],
        "overdue": [_slim(i) for i in overdue],
        "due_today": [_slim(i) for i in due_today],
        "due_this_week": [_slim(i) for i in due_week],
        "high_priority": [_slim(i) for i in high_pri],
        "at_risk_projects": at_risk_proj,
        "stale_decisions": stale_dec,
        "agent_items": [_slim(i) for i in agent_items],
        "pending_queue_events": pending_q,
        "summary": {
            "inbox_count":        len(inbox),
            "overdue_count":      len(overdue),
            "due_today_count":    len(due_today),
            "due_week_count":     len(due_week),
            "at_risk_proj_count": len(at_risk_proj),
            "stale_dec_count":    len(stale_dec),
        },
    }


def _build_evening_payload(cursor: str | None) -> dict:
    since = cursor or _day_offset(-1)

    completed     = _completed_since(since)
    updated       = _updated_since(since) if cursor else []
    overdue       = _overdue()
    due_tomorrow  = _sel("work_items",
                         f"select=*&done=eq.false&deleted_at=is.null&due_date=eq.{_day_offset(1)}&order=priority.desc",
                         limit=20)
    due_week      = _due_this_week()
    at_risk_proj  = _at_risk_projects()
    pending_dec   = _all_pending_decisions()
    inbox         = _inbox()
    activity      = _activity_since(since)
    pending_q     = _pending_queue(limit=20)

    # Items that didn't move: open high-priority items not updated since yesterday
    stale_cutoff  = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=20)).isoformat()
    not_moved     = _sel("work_items",
                         f"select=*&done=eq.false&deleted_at=is.null&priority=in.(high,medium)&updated_at=lt.{stale_cutoff}&order=priority.desc",
                         limit=20)

    return {
        "mode": "evening_review",
        "generated_at": _now_iso(),
        "today": _today(),
        "tomorrow": _day_offset(1),
        "since": since,
        "completed_today": [_slim(i) for i in completed],
        "updated_today": [_slim(i) for i in updated],
        "not_moved_today": [_slim(i) for i in not_moved],
        "overdue": [_slim(i) for i in overdue],
        "due_tomorrow": [_slim(i) for i in due_tomorrow],
        "due_this_week": [_slim(i) for i in due_week],
        "at_risk_projects": at_risk_proj,
        "pending_decisions": pending_dec,
        "inbox_backlog": [_slim(i) for i in inbox],
        "activity_today": activity,
        "pending_queue_events": pending_q,
        "summary": {
            "completed_count":   len(completed),
            "not_moved_count":   len(not_moved),
            "overdue_count":     len(overdue),
            "due_tomorrow_count": len(due_tomorrow),
            "pending_dec_count": len(pending_dec),
            "activity_count":    len(activity),
        },
    }


# ── Main sweep ────────────────────────────────────────────────────────────────

def run_sweep(force: bool = False, dry_run: bool = False) -> int:
    try:
        with _Lock():
            state       = _load_state()
            cursor      = state.get("last_cursor")
            last_hashes = state.get("item_hashes", {})

            inbox       = _inbox()
            overdue     = _overdue()
            due_today   = _due_today()
            high_pri    = _high_priority()
            agent_items = _agent_items()
            updated     = _updated_since(cursor) if cursor else []
            stale_q     = _stale_queue()
            pending_q   = _pending_queue()

            # Compute hashes for all candidate items
            all_items: dict[str, dict] = {}
            for lst in (inbox, overdue, due_today, high_pri, agent_items, updated):
                for i in lst:
                    all_items[i["id"]] = i

            new_hashes   = {id: _hash_work_item(item) for id, item in all_items.items()}
            changed_ids  = {id for id, h in new_hashes.items() if last_hashes.get(id) != h}
            has_inbox    = bool(inbox)
            has_overdue  = bool(overdue)
            has_stale_q  = bool(stale_q)

            has_change = bool(changed_ids or has_inbox or has_overdue or has_stale_q or not cursor)

            if not has_change and not force:
                if not dry_run:
                    _save_state({**state, "last_cursor": _now_iso()})
                return 2  # nothing to do — exit silently

            payload = _build_sweep_payload(
                inbox, updated, overdue, due_today, high_pri, agent_items, stale_q, pending_q,
            )

            if dry_run:
                print(json.dumps(payload, indent=2, default=str))
                return 0

            # Write payload for Kobe
            PAYLOAD_FILE.write_text(json.dumps(payload, indent=2, default=str))

            # Enqueue agent_control_events for changed/new items (idempotent)
            try:
                owner_id = bridge.discover_owner_id()
                today = _today()
                for id, item in all_items.items():
                    if id not in changed_ids and id in last_hashes:
                        continue  # unchanged item already known
                    h = new_hashes[id]
                    due = item.get("due_date") or ""
                    event_type = (
                        "overdue"    if due and due < today else
                        "due"        if due == today else
                        "updated"    if id in {i["id"] for i in updated} else
                        "created"
                    )
                    _ensure_event(
                        owner_id=owner_id,
                        entity_id=id,
                        entity_type="work_item",
                        event_type=event_type,
                        priority=item.get("priority", "medium"),
                        payload=_slim(item),
                        idem_key=f"wi:{id}:{h}",
                    )
            except Exception as e:
                print(f"[cadence_sweep] Warning: could not write agent_control_events: {e}", file=sys.stderr)

            # Persist state
            _save_state({
                **state,
                "last_cursor": _now_iso(),
                "item_hashes": {**last_hashes, **new_hashes},
            })

            s = payload["summary"]
            print(f"[cadence_sweep] payload → {PAYLOAD_FILE}")
            print(f"  inbox={s['inbox_count']} overdue={s['overdue_count']} "
                  f"due_today={s['due_today_count']} updated={s['updated_count']} "
                  f"changed_items={len(changed_ids)}")
            return 0

    except RuntimeError as e:
        print(f"[cadence_sweep] {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"[cadence_sweep] Error: {e}", file=sys.stderr)
        return 1


def run_review(mode: str, dry_run: bool = False) -> int:
    try:
        state  = _load_state()
        cursor = state.get("last_cursor")

        if mode == "morning":
            payload = _build_morning_payload(cursor)
        elif mode == "evening":
            payload = _build_evening_payload(cursor)
        else:
            print(f"[cadence_sweep] Unknown mode: {mode}", file=sys.stderr)
            return 1

        if dry_run:
            print(json.dumps(payload, indent=2, default=str))
            return 0

        PAYLOAD_FILE.write_text(json.dumps(payload, indent=2, default=str))
        print(f"[cadence_sweep] {mode} review payload → {PAYLOAD_FILE}")
        return 0

    except Exception as e:
        print(f"[cadence_sweep] Error in {mode} review: {e}", file=sys.stderr)
        return 1


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    p = argparse.ArgumentParser(description="Cadence Agent Sweep")
    p.add_argument("--mode", choices=["sweep", "morning", "evening"], default="sweep",
                   help="sweep=change detection (default), morning=morning review, evening=evening review")
    p.add_argument("--force", action="store_true",
                   help="Force payload even if nothing changed (sweep mode only)")
    p.add_argument("--dry-run", action="store_true",
                   help="Print payload to stdout without writing files or creating events")
    args = p.parse_args()

    if args.mode == "sweep":
        sys.exit(run_sweep(force=args.force, dry_run=args.dry_run))
    else:
        sys.exit(run_review(mode=args.mode, dry_run=args.dry_run))


if __name__ == "__main__":
    main()
