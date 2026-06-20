"""
⚠️  LEGACY — LOCAL JSON PROTOTYPE — DO NOT USE FOR LIVE OPERATIONS
    The live Cadence system is Supabase-backed. Use Cadence/agent/ for agent
    access and Cadence/web/ for the UI. This file is archived for reference only.

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
HEALTH_STATUSES = ("green", "amber", "red")
EMAIL_STATUSES = ("draft", "queued", "sent", "cancelled")

EMPTY_DB: dict[str, list] = {"work_items": [], "projects": [], "people": [],
                             "decisions": [], "outbox": [], "activity": []}


# ── IO ────────────────────────────────────────────────────────────────────────
def load() -> dict[str, Any]:
    """Read the shared store. Always returns a well-formed, migrated dict."""
    if DATA_FILE.exists():
        try:
            data = json.loads(DATA_FILE.read_text())
            for key in EMPTY_DB:
                data.setdefault(key, [])
            return _migrate(data)
        except Exception:
            pass
    return json.loads(json.dumps(EMPTY_DB))


def _migrate(data: dict) -> dict:
    """Fill defaults so records written by older versions keep working."""
    for p in data["projects"]:
        p.setdefault("health", "green")
        p.setdefault("owner", "")
        p.setdefault("target_date", None)
        p.setdefault("next_action", "")
        p.setdefault("milestones", [])
        p.setdefault("updates", [])
        p.setdefault("links", [])
    for w in data["work_items"]:
        w.setdefault("comments", [])
        w.setdefault("links", [])
    for p in data["people"]:
        p.setdefault("email", "")
        p.setdefault("talking_points", [])
    return data


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


def add_project(db, name, goal="", status="active", color="#1B5E9E",
                owner="", target_date=None, next_action="", health="green") -> dict:
    _validate(status, PROJECT_STATUSES, "status")
    _validate(health, HEALTH_STATUSES, "health")
    item = {"id": new_id(), "name": name.strip(), "goal": goal, "status": status,
            "color": color, "owner": owner, "target_date": target_date or None,
            "next_action": next_action, "health": health,
            "milestones": [], "updates": [], "links": [],
            "created_at": now_iso()}
    db["projects"].append(item)
    return item


def update_project(db, project, **fields) -> dict:
    pid = _resolve_project(db, project)
    p = next((x for x in db["projects"] if x["id"] == pid), None)
    if not p:
        raise ValueError(f"No project matching {project!r}")
    if "status" in fields:
        _validate(fields["status"], PROJECT_STATUSES, "status")
    if "health" in fields:
        _validate(fields["health"], HEALTH_STATUSES, "health")
    for k, v in fields.items():
        if k in ("name", "goal", "status", "color", "owner",
                 "target_date", "next_action", "health"):
            p[k] = v
    return p


def add_milestone(db, project, title, due_date=None) -> dict:
    pid = _resolve_project(db, project)
    p = next((x for x in db["projects"] if x["id"] == pid), None)
    if not p:
        raise ValueError(f"No project matching {project!r}")
    m = {"id": new_id(), "title": title.strip(), "due_date": due_date or None,
         "done": False, "created_at": now_iso()}
    p["milestones"].append(m)
    return m


def set_milestone(db, project, milestone_id, done=True) -> dict:
    pid = _resolve_project(db, project)
    p = next((x for x in db["projects"] if x["id"] == pid), None)
    if not p:
        raise ValueError(f"No project matching {project!r}")
    m = next((x for x in p["milestones"] if x["id"] == milestone_id), None)
    if not m:
        raise ValueError(f"No milestone with id {milestone_id!r}")
    m["done"] = done
    return m


def add_project_update(db, project, text, author="human", health=None) -> dict:
    """Post a status update to a project; optionally move its health at the same time."""
    pid = _resolve_project(db, project)
    p = next((x for x in db["projects"] if x["id"] == pid), None)
    if not p:
        raise ValueError(f"No project matching {project!r}")
    if health:
        _validate(health, HEALTH_STATUSES, "health")
        p["health"] = health
    u = {"id": new_id(), "date": today_str(), "text": text.strip(),
         "author": author, "health": p.get("health", "green"), "created_at": now_iso()}
    p["updates"].insert(0, u)
    return u


def project_progress(db, project_id) -> int:
    """Percent complete: milestones if any, else work items."""
    p = next((x for x in db["projects"] if x["id"] == project_id), None)
    if not p:
        return 0
    ms = p.get("milestones", [])
    if ms:
        return round(100 * sum(1 for m in ms if m.get("done")) / len(ms))
    items = [w for w in db["work_items"] if w.get("project_id") == project_id]
    if not items:
        return 0
    return round(100 * sum(1 for w in items if w.get("done")) / len(items))


def add_link(db, kind, target_id, url, title="") -> dict:
    """Attach a link (Drive file, doc, anything) to a 'project' or 'task'."""
    coll = db["projects"] if kind == "project" else db["work_items"]
    rec = next((x for x in coll if x["id"] == target_id), None)
    if rec is None and kind == "project":
        pid = _resolve_project(db, target_id)
        rec = next((x for x in coll if x["id"] == pid), None)
    if rec is None:
        raise ValueError(f"No {kind} matching {target_id!r}")
    link = {"id": new_id(), "url": url, "title": title or url, "added_at": now_iso()}
    rec.setdefault("links", []).append(link)
    return link


def add_comment(db, task_id, text, author="human") -> dict:
    w = next((x for x in db["work_items"] if x["id"] == task_id), None)
    if not w:
        raise ValueError(f"No task with id {task_id!r}")
    c = {"id": new_id(), "text": text.strip(), "author": author, "created_at": now_iso()}
    w.setdefault("comments", []).append(c)
    w["updated_at"] = now_iso()
    return c


def add_talking_point(db, person, text, author="human") -> dict:
    pid = _resolve_person(db, person)
    p = next((x for x in db["people"] if x["id"] == pid), None)
    if not p:
        raise ValueError(f"No person matching {person!r}")
    tp = {"id": new_id(), "text": text.strip(), "done": False,
          "author": author, "created_at": now_iso()}
    p.setdefault("talking_points", []).append(tp)
    return tp


def resolve_talking_point(db, person, point_id, done=True) -> dict:
    pid = _resolve_person(db, person)
    p = next((x for x in db["people"] if x["id"] == pid), None)
    if not p:
        raise ValueError(f"No person matching {person!r}")
    tp = next((x for x in p.get("talking_points", []) if x["id"] == point_id), None)
    if not tp:
        raise ValueError(f"No talking point with id {point_id!r}")
    tp["done"] = done
    return tp


def get_person_prep(db, person) -> dict:
    """Everything you need before a 1:1: open items + talking points."""
    pid = _resolve_person(db, person)
    p = next((x for x in db["people"] if x["id"] == pid), None)
    if not p:
        raise ValueError(f"No person matching {person!r}")
    open_items = [enrich(db, w) for w in db["work_items"]
                  if w.get("person_id") == pid and not w.get("done")]
    return {
        "person": {k: p[k] for k in ("id", "name", "role", "email", "notes")},
        "talking_points": [t for t in p.get("talking_points", []) if not t.get("done")],
        "waiting_on_them": [w for w in open_items if w["type"] == "waitingFor"],
        "follow_ups": [w for w in open_items if w["type"] == "followUp"],
        "other_open_items": [w for w in open_items
                             if w["type"] not in ("waitingFor", "followUp")],
    }


# ── Outbox: cockpit queues email, an agent with Gmail access sends it ─────────
def queue_email(db, to, subject, body, cc="", status="queued",
                created_by="human", related_task_id=None, related_project=None) -> dict:
    _validate(status, EMAIL_STATUSES, "status")
    msg = {"id": new_id(), "to": to.strip(), "cc": cc.strip(), "subject": subject.strip(),
           "body": body, "status": status,
           "related_task_id": related_task_id,
           "related_project_id": _resolve_project(db, related_project),
           "created_by": created_by, "created_at": now_iso(),
           "sent_at": None, "sent_via": None}
    db["outbox"].append(msg)
    return msg


def list_outbox(db, status=None) -> list[dict]:
    msgs = db.get("outbox", [])
    if status:
        msgs = [m for m in msgs if m.get("status") == status]
    return sorted(msgs, key=lambda m: m.get("created_at", ""), reverse=True)


def mark_email(db, email_id, status, via="") -> dict:
    _validate(status, EMAIL_STATUSES, "status")
    m = next((x for x in db.get("outbox", []) if x["id"] == email_id), None)
    if not m:
        raise ValueError(f"No outbox message with id {email_id!r}")
    m["status"] = status
    if status == "sent":
        m["sent_at"] = now_iso()
        m["sent_via"] = via or "agent"
    return m


# ── Activity log: the audit trail both sides can read ────────────────────────
def log_activity(db, actor, action, detail="") -> dict:
    entry = {"id": new_id(), "ts": now_iso(), "actor": actor,
             "action": action, "detail": detail}
    db.setdefault("activity", []).insert(0, entry)
    del db["activity"][200:]
    return entry


# ── Executive brief ───────────────────────────────────────────────────────────
_HEALTH_ICON = {"green": "🟢", "amber": "🟠", "red": "🔴"}


def generate_brief(db) -> str:
    """Markdown daily brief: copy it, or have an agent email it to you."""
    t = get_today(db)
    lines = [f"# Executive Brief — {datetime.now().strftime('%A %d %B %Y')}", ""]
    if t["focus"]:
        lines += [f"**Suggested focus:** {t['focus']['title']}", ""]

    lines.append("## Top 3 priorities")
    for w in t["top3"]:
        due = f", due {w['due_date']}" if w.get("due_date") else ""
        lines.append(f"1. {w['title']}  _({w['type']}, {w['priority']}{due})_")
    if not t["top3"]:
        lines.append("_Nothing open._")

    if t["overdue"]:
        lines.append("\n## ⚠ Overdue")
        for w in t["overdue"]:
            lines.append(f"- {w['title']} (due {w['due_date']})")

    if t["due_today"]:
        lines.append("\n## Due today")
        for w in t["due_today"]:
            lines.append(f"- {w['title']}")

    if t["waiting_on_others"]:
        lines.append("\n## Waiting on others")
        for w in t["waiting_on_others"]:
            who = f" — {w['person']}" if w.get("person") else ""
            lines.append(f"- {w['title']}{who}")

    if t["decisions_needed"]:
        lines.append("\n## Decisions needed")
        for d in t["decisions_needed"]:
            due = f" (due {d['due_date']})" if d.get("due_date") else ""
            lines.append(f"- {d['title']}{due}")

    active = [p for p in db["projects"] if p.get("status") == "active"]
    if active:
        lines.append("\n## Projects")
        for p in active:
            icon = _HEALTH_ICON.get(p.get("health", "green"), "🟢")
            pct = project_progress(db, p["id"])
            nxt = f" — next: {p['next_action']}" if p.get("next_action") else ""
            tgt = f", target {p['target_date']}" if p.get("target_date") else ""
            lines.append(f"- {icon} **{p['name']}** ({pct}%{tgt}){nxt}")

    queued = len(list_outbox(db, status="queued"))
    if queued:
        lines.append(f"\n_{queued} email(s) queued in the outbox awaiting send._")
    if t["inbox_count"]:
        lines.append(f"\n_{t['inbox_count']} item(s) in the inbox to triage._")
    return "\n".join(lines)


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
