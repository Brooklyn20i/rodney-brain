# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repository Is

**Rodney's Brain** is a personal knowledge base — a curated collection of article summaries on AI, leadership, technology, and commercial transformation. It is a pure data repository with no build system, tests, or executable code. All content is structured markdown, version-controlled via git, and designed to be maintained by LLM agents ("Computer").

Articles are ingested automatically from a Gmail capture system (any email forwarded with "brain food" in the subject) and land as structured markdown files in `articles/`. `INDEX.md` is the master catalog, auto-maintained by Computer. A `concepts/` directory is planned but not yet created — it will hold weekly synthesis pages.

## Repository Structure

```
articles/     — Individual article summaries with full source text archived
concepts/     — (Planned) Weekly cross-article synthesis pages
INDEX.md      — Master catalog: table of all articles with date, title, author, type, tags, and doc link
README.md     — System overview and recovery instructions
```

## Article File Conventions

**Filename format:** `YYYY-MM-DD-{author-slug}-{title-slug}.md`

**Required frontmatter (in this order):**
```markdown
**Date:** YYYY-MM-DD
**Source:** URL to original post/article
**Type:** X Post | X Article | Article | etc.
**Stance:** Aligned | Reference
**Tags:** #Tag1 #Tag2 ...
```

**Required sections (in this order):**
1. `## Summary` — factual précis of what the author said
2. `## Why It Matters` — relevance to Rodney's context (AI transformation in large enterprise/MD-level leadership)
3. `## Key Quotes / Data Points` — verbatim quotes and stats, bulleted
4. `## My Take` — Rodney's own annotation (only add if the owner has provided text; never fabricate this)
5. `## Full Source` — complete original content archived verbatim

Optional: Quick-reference tables between Key Quotes and My Take where useful (e.g. a model's four-layer breakdown).

**Stance values:**
- `Aligned` — directly supports or reinforces Rodney's worldview
- `Reference` — useful reference material, not necessarily aligned

## INDEX.md Conventions

The catalog table columns are: `Date | Title | Author | Type | Tags | Doc`

- `Doc` links use relative paths: `[article](articles/filename.md)`
- Newer entries are appended below the `---` footer line (the table is currently split across two sections due to append-only growth)
- The Concept Pages table and Emerging Themes/Open Questions sections are updated weekly

When adding a new article, append a row to the catalog table in INDEX.md and update the `Last updated:` date in the header.

## Deduplication

Duplicate articles exist in `articles/` (e.g. `-v2` variants). When deduplicating:
- Keep the version with the most complete content (longer file, more sections)
- Remove the lesser version entirely
- Consolidate the INDEX.md row to point to the kept file
- Commit message prefix: `Dedup:`

## Commit Message Conventions

From the git history, commits follow these prefixes:
- `Add:` — new article(s)
- `Dedup:` — removing duplicate articles
- `Update:` — amendments to existing articles (e.g. adding a My Take annotation)

Batch additions use a single commit: `Add: {N} new articles ({comma-separated author names})`
