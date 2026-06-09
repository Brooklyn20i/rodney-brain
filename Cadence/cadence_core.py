"""
Cadence core — the single source of truth shared by humans and agents.

Both the Streamlit cockpit (app.py) and the MCP server (cadence_mcp.py)
import this module so they read, write, and prioritise data identically.

Data lives in ONE JSON file (cadence_data.json by default). Override the
location with the CADENCE_DATA environment variable so a hosted cockpit and
a local agent can point at the same shared store.

Nothing here calls any external service. No analytics, no remote AI.
"""

from __future__ import annotations

import json
import os
import subprocess
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Any

# ── Where the shared store lives ─────────────────────────────────────────────
DATA_FILE = Path(os.environ.get("CADENCE_DATA", Path(__file__).parent / "cadence_data.json"))

# Set CADENCE_GIT_AUTOCOMMIT=1 to commit every write, so agent and human
# changes are versioned and visible to everyone sharing the repo.
GIT_AUTOCOMMIT = os.environ.get("CADENCE_GIT_AUTOCOMMIT", "") in ("1", "true", "yes")

# ── Controlled vocabularies (keep agents and humans speaking one language) ────
ITEM_TYPES = ("task", "decision", "followUp", "waitingFor", "risk", "action")
PRIORITIES = ("high", "medium", "low")
PROJECT_STATUSES = ("active", "onHold", "completed")
DECISION_STATUSES = ("pending", "decided", "deferred")

EMPTY_DB: dict[str, list] = {"work_items": [], "projects": [], "people": [], "decisions": []}


# ── IO ────────────────────────────────────────────────────────────────────────
def load() -> dict[str, Any]:
    """Read the shared store. Always returns a well-formed dict."""
    if DATA_FILE.exists():
        try:
            data = json.loads(DATA_FILE.read_text())
            for key in EMPTY_DB:
                data.setdefault(key, [])
            return data
        except Exception:
            pass
    return json.loads(json.dumps(EMPTY_DB))


def save(db: dict[str, Any]) -> None:
    """Write the shared store atomically, optionally git-committing."""
    db.setdefault("meta", {})
    db["meta"]["updated_at"] = datetime.now().isoformat()
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = DATA_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(db, indent=2))
    tmp.replace(DATA_FILE)
    if GIT_AUTOCOMMIT:
        _git_commit()


def _git_commit() -> None:
    """Best-effort commit of the data file. Never raises."""
    try:
        repo = DATA_FILE.resolve().parent
        subprocess.run(["git", "-C", str(repo), "add", str(DATA_FILE)],
                       check=False, capture_output=True)
        subprocess.run(["git", "-C", str(repo), "commit", "-m",
                        f"cadence: update store {datetime.now().isoformat(timespec='seconds')}"],
                       check=False, capture_output=True)
    except Exception:
        pass


# ── Helpers ──────────────────────────────────────────────────────────────────
def new_id() -> str:
    return str(uuid.uuid4())[:8]


def today_str() -> str:
    return date.today().isoformat()


def now_iso() -> str:
    return datetime.now().isoformat()


def is_overdue(d: str | None) -> bool:
    return bool(d and d < today_str())


def is_due_today(d: str | None) -> bool:
    return d == today_str()


def _validate(value, allowed, field):
    if value not in allowed:
        raise ValueError(f"{field} must be one of {allowed}, got {value!r}")
    return value


def _resolve_project(db, name_or_id):
    """Accept a project id OR a (case-insensitive) name. Returns id or None."""
    if not name_or_id:
        return None
    for p in db["projects"]:
        if p["id"] == name_or_id or p["name"].lower() == str(name_or_id).lower():
            return p["id"]
    return None


def _resolve_person(db, name_or_id):
    if not name_or_id:
        return None
    for p in db["people"]:
        if p["id"] == name_or_id or p["name"].lower() == str(name_or_id).lower():
            return p["id"]
    return None


# ── Prioritisation (identical for humans and agents) ─────────────────────────
def priority_score(w: dict) -> int:
    s = 0
    if is_overdue(w.get("due_date")):
        s += 100
    elif is_due_today(w.get("due_date")):
        s += 50
    s += {"high": 60, "medium": 40, "low": 20}.get(w.get("priority", "medium"), 20)
    if w.get("type") in ("decision", "risk"):
        s += 15
    return s


# ── Write operations (used by the MCP server and any agent) ──────────────────
def add_task(db, title, type="task", priority="medium", due_date=None,
             project=None, person=None, notes="", inboxed=True, source="agent") -> dict:
    _validate(type, ITEM_TYPES, "type")
    _validate(priority, PRIORITIES, "priority")
    item = {
        "id": new_id(),
        "title": title.strip(),
        "type": type,
        "priority": priority,
        "due_date": due_date or None,
        "project_id": _resolve_project(db, project),
        "person_id": _resolve_person(db, person),
        "notes": notes or "",
        "done": False,
        "inboxed": inboxed,
        "source": source,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "completed_at": None,
    }
    db["work_items"].append(item)
    return item


def update_task(db, task_id, **fields) -> dict:
    w = next((x for x in db["work_items"] if x["id"] == task_id), None)
    if not w:
        raise ValueError(f"No task with id {task_id!r}")
    if "type" in fields:
        _validate(fields["type"], ITEM_TYPES, "type")
    if "priority" in fields:
        _validate(fields["priority"], PRIORITIES, "priority")
    if "project" in fields:
        fields["project_id"] = _resolve_project(db, fields.pop("project"))
    if "person" in fields:
        fields["person_id"] = _resolve_person(db, fields.pop("person"))
    for k, v in fields.items():
        if k in w or k in ("project_id", "person_id"):
            w[k] = v
    w["updated_at"] = now_iso()
    return w


def complete_task(db, task_id) -> dict:
    w = next((x for x in db["work_items"] if x["id"] == task_id), None)
    if not w:
        raise ValueError(f"No task with id {task_id!r}")
    w["done"] = True
    w["inboxed"] = False
    w["completed_at"] = now_iso()
    w["updated_at"] = now_iso()
    return w


def delete_task(db, task_id) -> bool:
    before = len(db["work_items"])
    db["work_items"] = [x for x in db["work_items"] if x["id"] != task_id]
    return len(db["work_items"]) < before


def add_project(db, name, goal="", status="active", color="#1B5E9E") -> dict:
    _validate(status, PROJECT_STATUSES, "status")
    item = {"id": new_id(), "name": name.strip(), "goal": goal, "status": status,
            "color": color, "created_at": now_iso()}
    db["projects"].append(item)
    return item


def add_person(db, name, role="", notes="") -> dict:
    item = {"id": new_id(), "name": name.strip(), "role": role, "notes": notes,
            "created_at": now_iso()}
    db["people"].append(item)
    return item


def add_decision(db, title, context="", status="pending", due_date=None, outcome="") -> dict:
    _validate(status, DECISION_STATUSES, "status")
    item = {"id": new_id(), "title": title.strip(), "status": status,
            "due_date": due_date or None, "context": context, "outcome": outcome,
            "created_at": now_iso(), "updated_at": now_iso()}
    db["decisions"].append(item)
    return item


def resolve_decision(db, decision_id, outcome="", status="decided") -> dict:
    _validate(status, DECISION_STATUSES, "status")
    d = next((x for x in db["decisions"] if x["id"] == decision_id), None)
    if not d:
        raise ValueError(f"No decision with id {decision_id!r}")
    d["status"] = status
    if outcome:
        d["outcome"] = outcome
    d["updated_at"] = now_iso()
    return d


# ── Read / view operations ───────────────────────────────────────────────────
def _project_name(db, pid):
    p = next((x for x in db["projects"] if x["id"] == pid), None)
    return p["name"] if p else None


def _person_name(db, pid):
    p = next((x for x in db["people"] if x["id"] == pid), None)
    return p["name"] if p else None


def enrich(db, w) -> dict:
    """Return a task with human-readable project/person names attached."""
    return {**w,
            "project": _project_name(db, w.get("project_id")),
            "person": _person_name(db, w.get("person_id")),
            "overdue": is_overdue(w.get("due_date")),
            "due_today": is_due_today(w.get("due_date"))}


def list_tasks(db, status="open", type=None, project=None, person=None,
               overdue=None, due_today=None) -> list[dict]:
    items = db["work_items"]
    if status == "open":
        items = [w for w in items if not w.get("done")]
    elif status == "done":
        items = [w for w in items if w.get("done")]
    if type:
        items = [w for w in items if w.get("type") == type]
    if project:
        pid = _resolve_project(db, project)
        items = [w for w in items if w.get("project_id") == pid]
    if person:
        pid = _resolve_person(db, person)
        items = [w for w in items if w.get("person_id") == pid]
    if overdue:
        items = [w for w in items if is_overdue(w.get("due_date"))]
    if due_today:
        items = [w for w in items if is_due_today(w.get("due_date"))]
    items = sorted(items, key=priority_score, reverse=True)
    return [enrich(db, w) for w in items]


def get_today(db) -> dict:
    """The cockpit view: what matters right now, prioritised."""
    active = [w for w in db["work_items"] if not w.get("done")]
    scored = sorted(active, key=priority_score, reverse=True)
    return {
        "date": today_str(),
        "focus": enrich(db, scored[0]) if scored else None,
        "top3": [enrich(db, w) for w in scored[:3]],
        "overdue": [enrich(db, w) for w in active if is_overdue(w.get("due_date"))],
        "due_today": [enrich(db, w) for w in active
                      if is_due_today(w.get("due_date")) and w.get("type") != "waitingFor"],
        "waiting_on_others": [enrich(db, w) for w in active if w.get("type") == "waitingFor"],
        "decisions_needed": [d for d in db["decisions"] if d.get("status") == "pending"],
        "inbox_count": len([w for w in active if w.get("inboxed")]),
    }


def get_weekly_review(db) -> dict:
    active = [w for w in db["work_items"] if not w.get("done")]
    return {
        "date": today_str(),
        "metrics": {
            "inbox": len([w for w in active if w.get("inboxed")]),
            "overdue": len([w for w in active if is_overdue(w.get("due_date"))]),
            "pending_decisions": len([d for d in db["decisions"] if d.get("status") == "pending"]),
            "waiting_on_others": len([w for w in active if w.get("type") == "waitingFor"]),
            "active_projects": len([p for p in db["projects"] if p.get("status") == "active"]),
            "open_tasks": len(active),
            "completed_total": len([w for w in db["work_items"] if w.get("done")]),
        },
        "inbox": [enrich(db, w) for w in active if w.get("inboxed")],
        "overdue": [enrich(db, w) for w in active if is_overdue(w.get("due_date"))],
        "stale_projects": [p for p in db["projects"] if p.get("status") == "active"
                           and not any(w.get("project_id") == p["id"] and not w.get("done")
                                       for w in db["work_items"])],
    }


def search(db, query) -> list[dict]:
    q = query.lower().strip()
    out = []
    for w in db["work_items"]:
        if q in w.get("title", "").lower() or q in (w.get("notes") or "").lower():
            out.append({"kind": "task", **enrich(db, w)})
    for d in db["decisions"]:
        if q in d.get("title", "").lower() or q in (d.get("context") or "").lower():
            out.append({"kind": "decision", **d})
    for p in db["projects"]:
        if q in p.get("name", "").lower() or q in (p.get("goal") or "").lower():
            out.append({"kind": "project", **p})
    for p in db["people"]:
        if q in p.get("name", "").lower() or q in (p.get("role") or "").lower():
            out.append({"kind": "person", **p})
    return out
