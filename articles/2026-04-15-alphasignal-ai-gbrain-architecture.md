# How GBrain Works, and How to Actually Wire It Into Your Agents
**Date:** 2026-04-15
**Source:** https://x.com/AlphaSignalAI/status/2044461541232148986
**Type:** X Article
**Stance:** Reference
**Tags:** #AI #Agents #Memory #Infrastructure #GBrain #Postgres #KnowledgeGraph #OpenSource

## Summary
AlphaSignal AI breaks down GBrain — Garry Tan's open-sourced production AI infrastructure: 17,888 pages, 4,383 people dossiers, 723 companies, 21 autonomous cron jobs built in 12 days. Three-layer architecture: git-backed Markdown repo as system of record, Postgres/pgvector retrieval layer, and modifiable Markdown skills. Search pipeline: intent classification → query expansion → parallel vector/keyword search → RRF fusion → compiled truth boost → dedup. Claims 94.7% P@1 on 29-page synthetic benchmark. MIT licensed, TypeScript, runs on Bun. 5,400+ GitHub stars in first 24 hours.

## Why It Matters
This is the most detailed production implementation of the "agent memory" architecture that Akshay, Santiago, and Harrison Chase have all been theorising about. Tan actually built it at scale — 13 years of calendar data, 280+ meeting transcripts. The "compiled truth + timeline" knowledge model (current best understanding above the divider, append-only evidence below) is a concrete pattern worth evaluating. The three-layer architecture (storage/retrieval/skills) maps to the same taxonomy Guri Singh described for Claude Skills (knowledge/behaviour/integration). Key limitation: the agentic features (dream cycle, autonomous entity promotion) depend on frontier models and aren't fully autonomous yet.

## Key Quotes / Data Points
- 17,888 pages, 4,383 people dossiers, 723 companies in production
- 21 autonomous cron jobs created in 12 days
- 5,400+ GitHub stars in first 24 hours
- PGLite boots in 2 seconds, zero config — recommended up to ~1,000 files
- 94.7% P@1 on 29-page synthetic benchmark (production 17,888-page benchmark not yet public)
- "Thin harness, fat skills" architecture philosophy
- Compiled truth + timeline knowledge model: rewrite above, append-only below
- Requires Claude Opus 4.6 or GPT-5.4
- Fail-improve loop: every LLM fallback logged, better patterns auto-generated
- 30+ MCP tools over stdio
- Known issues: MCP race conditions, benchmark scope gap, dream cycle not fully autonomous

## My Take
[Space for personal notes]

---

## Full Source
*Complete original content archived below for reference.*

AlphaSignal AI (@AlphaSignalAI) — Apr 15, 2026:

@garrytan open-sourced his production AI infrastructure: 17,888 pages, 4,383 people dossiers, 723 companies. Here's the architecture.

Garry Tan (President & CEO @ycombinator) made public 17,888 pages of his brain. His production system consists of 4,383 people dossiers, 723 companies, 21 autonomous cron jobs created within a span of 12 days. In the first 24 hours this was able to collect over 5,400+ GitHub stars.

It's a personal knowledge layer for AI agents. By default, all agents are stateless, that is each session starts fresh. GBrain provides a structured, searchable long-term memory for each session using an embedded Postgres database.

MIT licensed. TypeScript, runs on Bun. v0.10.1.

Three-layer architecture:
Brain Repo: git-backed Markdown files (one per person/company/project/idea). Tan's instance: 13 years of calendar data, 280+ meeting transcripts.
Retrieval Layer: Postgres with pgvector. PGLite (embedded WASM, boots in 2s) default. Supabase migration for >1,000 files.
Skills Layer: 25 Markdown skill files organised by RESOLVER.md. Companion to GStack (coding-focused).

Knowledge model: compiled truth (above divider, rewritable) + timeline (below, append-only). Entity enrichment tiered: stub → promoted based on interactions.
Search pipeline (6 steps): intent classifier (regex, zero-latency) → multi-query expansion (Claude Haiku) → parallel retrieval (HNSW cosine + tsvector) → RRF fusion → compiled truth boost + cosine re-scoring → 4-layer dedup.
P@1: 94.7% on 29-page synthetic corpus. Production 17,888-page benchmark not yet public.
Setup paths: Agent (paste URL, auto-install), Standalone CLI (clone/install/init/import/query), MCP (Claude Code, Cursor, Windsurf).
Limitations: dream cycle not fully autonomous, frontier model required, benchmark scope gap, MCP race conditions.
AlphaSignal verdict: Worth Watching. Retrieval layer production-engineered. Agentic features model-dependent.
GitHub: https://github.com/garrytan/gbrain
