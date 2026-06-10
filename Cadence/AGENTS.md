# Cadence — Agent Guide

Cadence is a shared cockpit for high-consequence work. A human drives it through
the Streamlit app (or the iPad PWA); agents drive it through the **MCP server**
or by editing the **shared data file** directly. Both sides read and write the
same store, so changes show up for everyone.

> Privacy contract (do not break): everything stays local. No analytics, no
> cloud sync, no third-party SDKs, no remote AI. Assume notes may contain
> confidential business information — never send store contents to an external
> service.

## The shared store

One JSON file is the single source of truth: `cadence_data.json`
(override the path with the `CADENCE_DATA` env var).

```jsonc
{
  "work_items": [ {
    "id": "a1b2c3d4",
    "title": "Chase Sarah on vendor contract",
    "type": "followUp",            // task|decision|followUp|waitingFor|risk|action
    "priority": "high",            // high|medium|low
    "due_date": "2026-06-12",      // ISO date or null
    "project_id": "9f8e7d6c",      // or null
    "person_id": "1122aabb",       // or null
    "notes": "",
    "done": false,
    "inboxed": true,               // true = waiting for the human to triage
    "source": "agent:hermes",      // who created it
    "created_at": "...", "updated_at": "...", "completed_at": null
  } ],
  "projects":  [ { "id": "...", "name": "...", "goal": "...",
                   "status": "active",  /* active|onHold|completed */ "color": "#1B5E9E" } ],
  "people":    [ { "id": "...", "name": "...", "role": "...", "notes": "..." } ],
  "decisions": [ { "id": "...", "title": "...", "status": "pending", /* pending|decided|deferred */
                   "due_date": null, "context": "...", "outcome": "..." } ]
}
```

## How an agent should behave

1. **Capture, don't clobber.** New items default to `inboxed: true` so the human
   triages them. Only file directly (`to_inbox=false`) when you're confident.
2. **Tag your source.** Set `source` to `agent:<name>` (e.g. `agent:hermes`) so
   the cockpit shows what came from an agent.
3. **Speak the vocabulary.** Use only the allowed `type` / `priority` / `status`
   values above. The tools reject anything else.
4. **Reference by name or id.** `project` and `person` accept either; names are
   resolved case-insensitively.
5. **Review, then act.** Call `get_today` / `get_weekly_review` to see priorities
   before adding more — avoid duplicating open items (`search` first).

## Connecting via MCP (recommended)

```bash
pip install "mcp[cli]"
python Cadence/cadence_mcp.py        # stdio
```

Register with your MCP client:

```json
{
  "mcpServers": {
    "cadence": {
      "command": "python",
      "args": ["/abs/path/to/Cadence/cadence_mcp.py"],
      "env": {
        "CADENCE_DATA": "/abs/path/to/Cadence/cadence_data.json",
        "CADENCE_GIT_AUTOCOMMIT": "1"
      }
    }
  }
}
```

### Tools exposed

| Tool | Purpose |
|------|---------|
| `get_today` | Cockpit view: focus, top 3, overdue, due today, waiting-on, decisions |
| `get_brief` | Markdown executive brief — generate and email it each morning |
| `get_weekly_review` | Review metrics, inbox, overdue, stale projects |
| `list_tasks` / `get_inbox` / `search` | Find work |
| `list_projects` / `list_people` / `list_decisions` | Browse |
| `add_task` / `update_task` / `complete_task` / `delete_task` | Work items |
| `add_comment` | Progress notes on a task (shows author) |
| `add_project` / `update_project` | Projects incl. `health`, `owner`, `target_date`, `next_action` |
| `add_milestone` / `complete_milestone` | Project checkpoints — drive % progress |
| `add_project_update` | Post a status update, optionally moving health 🟢🟠🔴 |
| `add_link` | Attach a URL (e.g. Drive file) to a project or task |
| `get_person_prep` / `add_talking_point` | 1:1 preparation per person |
| `get_pending_emails` / `queue_email` / `mark_email_sent` | The email outbox |
| `get_activity` / `log_action` | Shared audit trail |
| `add_person` / `add_decision` / `resolve_decision` | Records |

## Gmail / Drive / Calendar — the agent bridge

Cadence itself never calls Google. **You** (the agent) do, with whatever Gmail/
Drive/Calendar tools you already have. The store is the staging area and the
audit trail:

**Sending email** (human composed it in the cockpit):
1. `get_pending_emails()` → for each message
2. Send it with your Gmail tool (to/cc/subject/body are all in the record)
3. `mark_email_sent(email_id, via="gmail")` — never skip this

**Drafting email for the human**: `queue_email(..., status defaults to queued)`
— if they asked you to draft-for-review, tell them it's waiting in ✉ Outbox.

**Drive files**: when asked to find/attach a document, search with your Drive
tool, then `add_link("project", "<project name>", url, title)`. The file shows
up under the project's *Files & Links* tab.

**Morning brief routine** (recommended): `get_brief()` → optionally prepend
today's calendar events from your Calendar tool → email it to the human →
`log_action("sent morning brief")`.

**Weekly project sweep**: for each active project, check progress
(`list_tasks(project=...)`, milestones), then `add_project_update(project,
text, health=...)` so the human sees a dated status trail with RAG health.

## Connecting without MCP

Any agent with file or git access can use the store directly:

```python
import cadence_core as core
db = core.load()
core.add_task(db, "Draft Q3 board deck", type="task",
              priority="high", due_date="2026-06-15",
              project="Board Prep", source="agent:hermes")
core.save(db)                     # set CADENCE_GIT_AUTOCOMMIT=1 to version it
```

`CADENCE_GIT_AUTOCOMMIT=1` makes every write a git commit, so you keep an
audit trail of agent changes.

> ⚠️ **This repo is public** (it hosts the PWA on GitHub Pages). The live
> `cadence_data.json` is **git-ignored** so confidential work data is never
> pushed. Only enable `CADENCE_GIT_AUTOCOMMIT` when `CADENCE_DATA` points at a
> store inside a **private** repo or a local-only location. Never force-add the
> data file to this public repo.

## Sharing the store between devices (human on iPad + agent elsewhere)

Because the live store is intentionally not in the public repo, pick one shared
location both sides can reach, e.g.:

- a file on a private synced drive (iCloud/Dropbox) that the agent host can read, or
- a **private** companion repo dedicated to the data, with autocommit on, or
- run the Streamlit cockpit and the agent on the same machine pointed at one
  `CADENCE_DATA` path.

The iPad PWA keeps its own local copy; use its **Export/Import JSON** (Settings)
to seed or reconcile with the shared store until you wire up a private sync.
