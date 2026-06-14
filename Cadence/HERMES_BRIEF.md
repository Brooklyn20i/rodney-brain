# Cadence — Agent Brief for Hermes

Cadence is Rodney's personal executive operating system. It stores his work items,
projects, people, decisions, notes, and outbox in a Supabase Postgres database.
Your job as Hermes is to read from it, create items, update statuses, and keep
it organised on Rodney's behalf.

---

## Connection

| | |
|---|---|
| **Supabase URL** | `https://uimjzehrykeebocphdna.supabase.co` |
| **User email** | `rbalech@gmail.com` |

---

## Authentication — dedicated Kobe login

Kobe uses a dedicated Cadence account, not Rodney's personal login:

| | |
|---|---|
| **Email** | `kobe-agent@cadence.app` |
| **Password** | Stored locally in macOS Keychain only. Never paste into chat, docs, repo, or logs. |

The proper access model is `Cadence/backend/migrations/0003_kobe_agent.sql`:

- Rodney remains the `owner_id` on all rows.
- `cadence_agent_access` grants the Kobe account access to Rodney's workspace.
- RLS permits Kobe to read/write Rodney-authorised rows only while that grant is active.
- Access is revoked by setting `revoked_at` on the grant.

Sign in to get a JWT (refresh on 401):
```http
POST https://uimjzehrykeebocphdna.supabase.co/auth/v1/token?grant_type=password
Content-Type: application/json
apikey: sb_publishable_QIu9g9ULRa-spgzHUJWSqQ_cVKMv9sr

{ "email": "kobe-agent@cadence.app", "password": "<from local Keychain only>" }
```

Response contains `access_token`. Use it as Bearer on every subsequent request:
```
apikey: sb_publishable_QIu9g9ULRa-spgzHUJWSqQ_cVKMv9sr
Authorization: Bearer ***
```

## IMPORTANT — owner_id on every INSERT

Kobe writes into Rodney's workspace. On every INSERT, pass `owner_id` equal to the
`owner_user_id` from the active `cadence_agent_access` grant:

```json
{
  "owner_id": "<owner_user_id from cadence_agent_access>",
  "title": "...",
  ...
}
```

The local bridge discovers this automatically from `cadence_agent_access` where possible.

---

## Base URL for all data

```
https://uimjzehrykeebocphdna.supabase.co/rest/v1/{table}
```

Always include `Content-Type: application/json` on POST/PATCH.
Add `Prefer: return=representation` to get the created/updated row back.

---

## Tables & Schemas

### `work_items` — the main task/action list
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | auto-generated |
| `owner_id` | uuid | auto-set by RLS |
| `title` | text | required |
| `type` | enum | `task` `decision` `followUp` `waitingFor` `risk` `action` |
| `priority` | enum | `high` `medium` `low` |
| `due_date` | date \| null | ISO string `YYYY-MM-DD` |
| `project_id` | uuid \| null | FK → projects |
| `person_id` | uuid \| null | FK → people |
| `notes` | text | |
| `done` | bool | false = open |
| `inboxed` | bool | true = appears in Inbox for processing |
| `source` | text | e.g. `hermes`, `capture`, `manual` |
| `completed_at` | timestamp \| null | set when marking done |
| `deleted_at` | timestamp \| null | soft-delete — set to now to delete |

### `projects`
| Column | Type | Notes |
|---|---|---|
| `name` | text | |
| `goal` | text | one-line goal |
| `status` | enum | `active` `onHold` `completed` |
| `health` | enum | `green` `amber` `red` |
| `owner` | text | person's name string |
| `target_date` | date \| null | |
| `next_action` | text | |
| `color` | text | hex colour |

### `people`
| Column | Type | Notes |
|---|---|---|
| `name` | text | |
| `role` | text | |
| `email` | text | |
| `notes` | text | |

### `decisions`
| Column | Type | Notes |
|---|---|---|
| `title` | text | |
| `status` | enum | `pending` `decided` `deferred` |
| `due_date` | date \| null | |
| `context` | text | background / options |
| `outcome` | text | filled when decided |

### `notes`
| Column | Type | Notes |
|---|---|---|
| `title` | text | |
| `body` | text | markdown |

### `outbox` (emails queued for sending)
| Column | Type | Notes |
|---|---|---|
| `to` | text | |
| `cc` | text | |
| `subject` | text | |
| `body` | text | plain text or markdown |
| `status` | enum | `draft` `queued` `sent` `cancelled` |
| `related_project_id` | uuid \| null | |
| `related_work_item_id` | uuid \| null | |
| `created_by` | text | e.g. `hermes` |

### `milestones`
| Column | Type |
|---|---|
| `project_id` | uuid |
| `title` | text |
| `due_date` | date \| null |
| `done` | bool |

### `project_updates`
| Column | Type |
|---|---|
| `project_id` | uuid |
| `text` | text |
| `health` | enum `green` `amber` `red` \| null |
| `author` | text |

### `talking_points` (items to discuss with a person)
| Column | Type |
|---|---|
| `person_id` | uuid |
| `text` | text |
| `done` | bool |
| `author` | text |

### `activity` (append-only log)
| Column | Type |
|---|---|
| `actor` | text | e.g. `hermes` |
| `action` | text | e.g. `create_item` |
| `detail` | text | human-readable note |

---

## Common Operations

### List all open work items
```http
GET /rest/v1/work_items?done=eq.false&deleted_at=is.null&order=created_at.asc
```

### List inbox (unprocessed)
```http
GET /rest/v1/work_items?inboxed=eq.true&done=eq.false&deleted_at=is.null
```

### Create a work item (lands in inbox)
```http
POST /rest/v1/work_items
Prefer: return=representation

{
  "title": "Chase contract from Legal",
  "type": "waitingFor",
  "priority": "high",
  "due_date": "2026-06-20",
  "inboxed": true,
  "source": "hermes",
  "notes": ""
}
```

### Mark an item done
```http
PATCH /rest/v1/work_items?id=eq.<uuid>

{ "done": true, "completed_at": "2026-06-13T10:00:00Z" }
```

### Soft-delete (never hard delete)
```http
PATCH /rest/v1/work_items?id=eq.<uuid>

{ "deleted_at": "2026-06-13T10:00:00Z" }
```

### List active projects
```http
GET /rest/v1/projects?status=eq.active&deleted_at=is.null
```

### Create a decision (pending)
```http
POST /rest/v1/decisions
Prefer: return=representation

{
  "title": "Approve Q3 budget proposal",
  "status": "pending",
  "context": "Finance sent the draft. Decision needed by end of June.",
  "outcome": ""
}
```

### Queue an email in outbox
```http
POST /rest/v1/outbox
Prefer: return=representation

{
  "to": "someone@example.com",
  "subject": "Follow up on contract",
  "body": "Hi, just following up on the contract we discussed...",
  "status": "queued",
  "created_by": "hermes"
}
```

### Log your activity (do this after meaningful actions)
```http
POST /rest/v1/activity

{
  "actor": "hermes",
  "action": "create_item",
  "detail": "Created 3 follow-up items from board meeting notes"
}
```

---

## Key Rules

1. **Never hard-delete rows** — always soft-delete by setting `deleted_at` to the current ISO timestamp.
2. **Items land in Inbox when `inboxed: true`** — use this when creating items Rodney should review/triage.
3. **Set `source: "hermes"`** on everything you create so Rodney knows where it came from.
4. **Log your activity** in the `activity` table after significant operations.
5. **Waiting-on items** use `type: "waitingFor"` and should have `person_id` set if you know who.
6. **All timestamps** are ISO 8601 UTC strings.
7. **Row-level security is on** — the JWT scopes you to Rodney's data only. You cannot see or touch anyone else's data.

---

## What Rodney uses Cadence for

- **Today screen** — high-priority focus items + overdue + waiting on others + pending decisions
- **Inbox** — new items that haven't been triaged yet
- **Projects** — active work streams with health, milestones, and status updates
- **People** — contact list + waiting-for items + talking points per person
- **Decisions** — pending choices that need to be made
- **Notes** — markdown notes
- **Outbox** — emails queued for Rodney to review and send
- **Capture** — text extracted from screenshots, processed into inbox items
- **Weekly Review** — structured checklist review of all commitments

The most useful things you can do: create items when Rodney asks, update statuses,
query what's open/overdue, and queue emails in the outbox for his review.
