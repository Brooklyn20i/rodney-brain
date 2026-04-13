# Your Harness, Your Memory — Harrison Chase (@hwchase17)

**Date:** 2026-04-11
**Source:** https://x.com/hwchase17/status/2042978500567609738
**Type:** X Article (Long-form)
**Stance:** Aligned
**Tags:** #AI #Agents #Memory #AgentHarness #OpenSource #LangChain #LockIn #Architecture

## Summary

Harrison Chase (CEO, LangChain) argues that agent harnesses — the scaffolding layer that orchestrates agent behaviour — are not going away, and are intimately tied to agent memory. If you use a closed harness (especially behind a proprietary API), you surrender control of your agent's memory to a third party. Memory is where the true competitive moat in agentic AI lives — it's what allows agents to get better over time and creates user lock-in. The solution: open harnesses with open memory, model-agnostic and self-hostable. LangChain's answer is Deep Agents.

## Why It Matters

This is a foundational architectural argument for anyone building or procuring agentic systems. The core thesis — that memory is the moat, not the model — has direct implications for enterprise AI architecture decisions. Choosing a closed harness (e.g. Claude Managed Agents, OpenAI's Responses API) means yielding long-term memory ownership to the model provider. For enterprises, this is a vendor lock-in decision that compounds over time as agents accumulate institutional memory. The open vs. closed harness question is the enterprise AI architecture question of 2026.

## Key Quotes / Data Points

- "Managing context IS the harness" — Sarah Wooders, CTO Letta
- "Claude Code has 512k lines of code. That code is the harness. Even the makers of the best model in the world are investing heavily in the harness"
- "Without memory, your agents are easily replicable by anyone who has access to the same tools. With memory, you build up a proprietary dataset."
- "If you use a closed harness, especially if it's behind an API, you don't own your memory."
- Anthropic's Claude Managed Agents cited as example of putting everything behind a locked API
- "Memory (and therefore harnesses) should be separate from model providers."
- Views: 1.7M | Likes: 3,500 | Reposts: 591 | Bookmarks: 9,900

## My Take

[Space for personal notes]

---

## Full Source

*Complete original content archived below for reference.*

**Author:** Harrison Chase (@hwchase17) | **Date:** 11 April 2026 | **Source:** https://x.com/hwchase17/status/2042978500567609738

**Title:** Your harness, your memory

Agent harnesses are becoming the dominant way to build agents, and they are not going anywhere. These harnesses are intimately tied to agent memory. If you used a closed harness – especially if it's behind a proprietary API – you are choosing to yield control of your agent's memory to a third party. Memory is incredibly important to creating good and sticky agentic experiences. This creates incredible lock in. Memory – and therefor harnesses – should be open, so that you own your own memory.

### Agent Harnesses are how you build agents, and they're not going anywhere

The "best" way to build agentic systems has changed dramatically over the past three years. When Claude and GPT-4 first came out, models weren't great at coding and reasoning — so to do interesting things, you needed to create complex prompt chains (LangChain). Then the models got a little better, and could create more complex flows (LangGraph). Then they got a lot better, and that gave rise to a new type of scaffolding — agent harnesses.

Examples of agent harnesses include Claude Code, Deep Agents, Pi (powers OpenClaw), OpenCode, Codex, Letta Code, and many more.

💡 Agent harnesses are not going away.

There is sometimes sentiment that models will absorb more and more of the scaffolding. This is not going to happen. Claude Code has 512k lines of code. That code is the harness. Even the makers of the best model in the world are investing heavily in the harness.

### Harnesses are tied to memory

Sarah Wooders wrote a great blog on why "memory isn't a plugin (it's the harness)":

> Asking to plug memory into an agent harness is like asking to plug driving into a car. Managing context IS the harness.

Memory is just a form of context. Short term memory (messages in the conversation, large tool call outputs) and long term memory (things like AGENTS.md or CLAUDE.md) are all managed by the harness.

### If you don't own your harness, you don't own your memory

💡 If you use a closed harness, especially if it's behind an API, you don't own your memory.

**Mildly bad:** Stateful API (OpenAI Responses API, Anthropic server side computer use) — you yield some short-term memory control to the model provider.

**Bad:** Closed harness (Claude Agent SDK) — limited control of how memories are surfaced and stored.

**Worst:** The whole harness, including long-term memory, is behind an API. Zero ownership or visibility. You can't inspect it, port it, or use it outside that platform.

When people say "models will absorb more and more of the harness" — this is what they really mean. More and more of the harness goes behind an API of the model provider. This is incredibly alarming — memory becomes locked into a single platform, a single model provider.

Anthropic launched Claude Managed Agents. This puts literally everything behind an API, locked into their platform.

Why are they doing this? Because memory is important, and it creates lock-in they don't get from the model alone.

### Memory is important, and it creates lock in

Memory is what allows agents to get better over time, learning from experiences and user preferences.

💡 Without memory, your agents are easily replicable by anyone who has access to the same tools.

With memory, you build up a proprietary dataset — a dataset of user interactions and preferences. This is where the true competitive moat comes from.

It's been relatively easy to switch model providers to date. They have similar APIs. But as soon as there is any state associated, it's much harder to switch. Because this memory matters. And you don't want to lose it.

### Open Memory, Open Harnesses

Memory needs to be opened, owned by whomever is developing the agentic experience. It allows you to move between models, tweak memories, inspect them, and ultimately control the agent's behaviour.

This is why LangChain is building Deep Agents:
- Open source
- Model agnostic
- Uses open standards (agents.md and skills)
- Has plugins to Mongo, Postgres, Redis and others for storing memories
- Deployable via LangSmith Deployment (self hostable, any cloud, bring your own database)

In order to own your memory, you need to be using an Open Harness.
