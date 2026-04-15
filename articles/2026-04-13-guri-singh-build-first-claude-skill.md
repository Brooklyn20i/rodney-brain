# Build Your First Claude Skill in 10 Minutes
**Date:** 2026-04-13
**Source:** https://x.com/heygurisingh/status/2043772077073965264
**Type:** X Article
**Stance:** Aligned
**Tags:** #Claude #Skills #Prompting #Automation #MCP

## Summary
Full course on building Claude Skills — the Anthropic feature that lets you teach Claude custom behaviours. Key architecture: a Skill is just a folder with a SKILL.md file containing YAML frontmatter (metadata) and markdown instructions (playbook). Covers the trigger problem (Claude undertriggers Skills when descriptions are weak), three failure modes (silent, hijacker, drifter), and the skill-creator meta-tool. Important taxonomy: Projects = what to know, Skills = how to behave, MCP = live access.

## Why It Matters
The Projects/Skills/MCP distinction maps to agent architecture: knowledge layer → behaviour layer → integration layer. The trigger problem — agents being conservative about activating capabilities — is directly relevant to enterprise agent deployment. The description formula ("what it does + when to use it + key trigger phrases") is immediately actionable. The meta-skill (skill-creator) that builds Skills through conversation demonstrates self-improving tooling.

## Key Quotes / Data Points
- "Most people think Skills require coding. They don't. A Skill is a folder with a markdown file."
- Three rules: kebab-case folder name, exactly SKILL.md (case-sensitive), one level deep
- Description formula: what it does + when to use it + key trigger phrases
- Three failure modes: Silent (never fires), Hijacker (fires on wrong requests), Drifter (fires but wrong output)
- "Claude has a tendency to undertrigger Skills. It's conservative about loading them."
- Skill-creator meta-tool builds Skills via conversation in ~5 minutes
- Target: 8+ out of 10 test prompts firing correctly
- 14.2K views, 85 bookmarks

## My Take
[Space for personal notes]

---

## Full Source
*Complete original content archived below for reference.*

Guri Singh (@heygurisingh) — Apr 13, 2026:

I want to build my first Claude Skill in 10 minutes (full course)

I have combined every resource I have found to create a full course on building your first Claude Skill. In less than 10 minutes you'll have built a working Skill and installed it.

Module 1: What a Skill Actually Is — A folder on your computer with SKILL.md inside. Three rules: kebab-case folder, exact SKILL.md filename, one level deep. Projects = knowledge base (what to know). Skills = instruction manual (how to behave). MCP = connection layer (live data access).

Module 2: Anatomy of SKILL.md — YAML frontmatter (name, description required; allowed-tools, disable-model-invocation, user-invocable optional) + markdown body (overview, when to use, steps, output format, examples).

Module 3: Build Your First Skill Live — Email Drafter example with voice rules, structure (hook/context/ask/sign-off), 150 word max, no-fluff constraints.

Module 4: The Trigger Problem — Claude undertriggers Skills. Description formula: what it does + when to use it + key trigger phrases. Three failure modes: Silent (never fires — description too vague), Hijacker (fires on wrong requests — description too broad), Drifter (fires but wrong output — ambiguous instructions). NOT-FOR clauses prevent hijacking.

Module 5: Shipping It — Install in ~/.claude/skills/ for personal, .claude/skills/ for project-specific. Claude.ai requires zip upload (Pro/Max/Team/Enterprise). Test battery: 10 prompts, 6 should trigger, 4 shouldn't. Target 8+/10. Skill-creator meta-tool builds Skills via conversation in ~5 minutes. Maintenance: weekly fix repeated corrections, monthly remove stale instructions.
