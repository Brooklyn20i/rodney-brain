# How GBrain Works, and How to Actually Wire It Into Your Agents
**Date:** 2026-04-15
**Source:** https://x.com/alphasignalai/status/2044461541232148986?s=51
**Type:** X Post
**Stance:** Aligned
**Tags:** #ai #agents #memory #knowledge-management #retrieval

## Summary
This post breaks down Garry Tan’s "GBrain" as a three-layer system: a git-backed Markdown "Brain Repo" as the system of record, a retrieval layer built on Postgres/pgvector (with PGLite by default and a Supabase migration path), and a skills layer made of Markdown skill files that an agent reads and executes.
It describes a retrieval pipeline combining intent classification, LLM query expansion, parallel vector + keyword search, rank fusion, and dedup/boosting to prioritize "compiled truth" snippets.
The key design philosophy is "thin harness, fat skills": deterministic operations live in TypeScript, while judgment-heavy tasks live in editable skill files.
It flags limitations around model-dependence for higher-order memory workflows (dream cycles, entity enrichment), missing public benchmarks at large scale, and potential concurrency issues in MCP writes.

## Why It Matters
For senior leaders, this is a concrete blueprint for turning "AI agents" from ephemeral copilots into systems with durable, inspectable organizational memory.
The separation between deterministic infrastructure (storage, retrieval, sync) and model-driven judgment (skills) is a useful governance pattern: you can harden what must be reliable, while iterating quickly on the parts that benefit from human review and rapid change.
It also highlights a recurring transformation risk: when key workflows depend on frontier-model instruction-following, reliability and cost become strategic constraints, not implementation details.

## Key Quotes / Data Points
- "Three-layer architecture" of Brain Repo (git-backed Markdown), Retrieval Layer (Postgres + pgvector), and Skills Layer (Markdown skill files).
- Tan’s instance includes "13 years of calendar data, 280+ meeting transcripts, and 300+ captured ideas."
- Retrieval pipeline includes "Parallel retrieval" (vector + keyword) and "RRF fusion" (reciprocal rank fusion).
- "Thin harness, fat skills" philosophy: executable code for deterministic operations; the model executes judgment-dependent tasks by reading skill files.
- Limitations called out: dream-cycle gaps, frontier-model requirement ("Claude Opus 4.6 and GPT-5.4 'Thinking'"), benchmark scale gap (29 synthetic pages vs 17,888 pages), and potential MCP write race/NULL embedding issues.

## My Take
[Space for personal notes]

---

## Full Source
*Complete original content archived below for reference.*

## Repo snapshot

## Three-layer architecture
Brain Repo: A git-backed directory of Markdown files, one per person, company, project, or idea. The repo is the system of record. Edit any file manually and gbrain sync picks up the changes. Tan's own instance includes 13 years of calendar data, 280+ meeting transcripts, and 300+ captured ideas.Retrieval Layer: Postgres with pgvector. The CLI and MCP server are both generated from a single contract-first interface (src/core/operations.ts, ~30 shared operations). Two pluggable engines: PGLite (embedded Postgres 17.5 via WASM, zero config, boots in 2 seconds) is the default. For corpora over 1,000 files, gbrain migrate --to supabase moves everything to a managed Postgres instance. Migration is bidirectional.Skills Layer: 25 Markdown skill files organized by RESOLVER.md. The architecture philosophy is "thin harness, fat skills": executable TypeScript handles deterministic operations (search, embed, import, sync). The agent model handles judgment-dependent tasks by reading the skill file and executing it. Skills are plain text and modifiable without touching compiled code.GBrain is designed as a companion to GStack, Tan's earlier coding-focused agent framework. GStack handles code skills. GBrain handles everything else: memory, enrichment, ingestion, scheduling, and identity.

## The knowledge model
Every brain page follows a compiled truth + timeline pattern:
```
---
type: concept
title: Do Things That Don't Scale
tags: [startups, growth, pg-essay]
---

Paul Graham's argument that startups should do unscalable things early on.
The key insight: unscalable effort teaches you what users actually want.

---

- 2013-07-01: Published on paulgraham.com
- 2024-11-15: Referenced in batch W25 kickoff talk

```

## The search pipeline
Six steps from query to results:1. Intent classifier: zero-latency regex, no LLM call. Detects query type: entity, temporal, event, or general. Routes accordingly.
2. Multi-query expansion: Claude Haiku generates query variants to improve recall.
3. Parallel retrieval: vector search (HNSW cosine) runs alongside keyword search (tsvector).
4. RRF fusion: reciprocal rank fusion merges both result lists into a single ranked set.
5. Compiled truth boost + cosine re-scoring: entity queries get compiled truth chunks ranked higher. Temporal queries skip the boost to surface timeline dates instead.
6. 4-layer dedup: guarantees at least one compiled truth chunk per page in results.

## How to get started
Agent path (recommended). If you are already on OpenClaw or Hermes, paste one URL into your agent:
```
Retrieve and follow the instructions at:
https://raw.githubusercontent.com/garrytan/gbrain/master/INSTALL_FOR_AGENTS.md

```

```
git clone https://github.com/garrytan/gbrain.git && cd gbrain
bun install && bun link
gbrain init # PGLite boots in 2 seconds, no server needed
gbrain import ~/notes/
gbrain query "what themes show up across my notes?"

```

```

 "mcpServers": {
 "gbrain": { "command": "gbrain", "args": ["serve"] }
 }

```

## Limitations
Dream cycle implementation gap. GBrain ships a real background daemon (gbrain autopilot) that runs sync, link extraction, and embedding on a launchd/cron schedule. What it does not do is compiled truth rewriting, entity enrichment, or dream cycle consolidation. Those features live in Markdown skill files that the connected agent model interprets and executes. Whether they run, and how reliably, depends entirely on how well the model follows multi-step instructions.Frontier model hard requirement. Claude Opus 4.6 and GPT-5.4 "Thinking" are the documented working paths. Weaker models fail on the instruction-dependent features. This adds API costs before any application logic.Benchmark scope gap. PR #64's P@1 of 94.7% runs against 29 synthetic pages in-memory. Tan's production corpus is 17,888 pages. The performance curve at scale has not been publicly benchmarked.Known MCP issues. An independent code review flagged potential race conditions in concurrent MCP writes, and scenarios where NULL embeddings can overwrite valid vectors during write operations.

## Who should clone this
Clone it if you are building long-lived agents on OpenClaw or Hermes, have Claude Opus 4.6 or equivalent API access, and are comfortable with TypeScript. The system also fits investor and founder workflows that track multi-year relationships and deal history at scale.Skip it if you need production-grade persistent memory today without debugging model-dependent features, are running a weaker model, or are not on OpenClaw or Hermes. The integration path for other agent frameworks is not documented. Multi-device sync requires managing a Supabase instance.

## Practitioner implication
Developers building on OpenClaw or Hermes can now give agents structured, searchable long-term memory backed by a real database, without standing up a separate memory service.

## AlphaSignal Take
Worth Watching.The storage and retrieval layer is production-engineered: contract-first operations, pluggable engines, a built-in eval harness, 34 unit test files, and 5 E2E test files. The codebase is not a prototype. v0.10.1 shipped April 12, PR #64 closed April 14. Active maintenance.The headline agentic features sit at the boundary between code and model. Compiled truth rewriting, dream cycles, and entity enrichment are skill files the connected model interprets, not compiled algorithms. That is the "thin harness, fat skills" design choice, but it means reliability scales directly with model quality. With Opus 4.6, the behavior is documented to work. With anything weaker, it degrades.For this verdict to move to Production Ready: an executable dream cycle scheduler independent of model interpretation, a public benchmark at 10,000+ file scale, and a confirmed fix for the NULL embedding race condition in concurrent MCP writes.

## Links
- GBrain on GitHub (repo, ~30 min setup)
- INSTALL_FOR_AGENTS.md (agent install instructions, ~5 min read)
- Thin Harness, Fat Skills (architecture philosophy, ~8 min read)
