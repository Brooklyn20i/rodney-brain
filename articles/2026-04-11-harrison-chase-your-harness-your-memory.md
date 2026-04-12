# Your Harness, Your Memory — Harrison Chase (@hwchase17)

**Date:** 2026-04-11
**Source:** https://x.com/hwchase17/status/2042978500567609738
**Type:** X Article (Long-form)
**Tags:** #AgentHarness #Memory #AI #LangChain #OpenSource #Agents

## Summary

Harrison Chase (LangChain founder) argues that agent harnesses — the scaffolding around LLMs — are not going away, and that memory is structurally inseparable from the harness. The critical insight: if your harness is closed (behind a proprietary API), you don't own your memory. As model providers build managed agent platforms, they are deliberately creating memory lock-in. The solution is open harnesses and open memory stores that you control.

## Why It Matters

This is one of the most strategically important posts in the AI infrastructure space in 2026. For any organisation building on top of AI platforms, the question of who owns your agent's memory is the question of who owns your competitive moat. The race to closed managed agents is a race to lock enterprises into platforms. The decision on harness architecture made today determines your optionality in 3 years.

## Key Quotes / Data Points

- "If you use a closed harness, especially if it's behind an API, you don't own your memory."
- "Without memory, your agents are easily replicable by anyone who has access to the same tools."
- "This is incredibly alarming — it means that memory will become locked into a single platform."
- Claude Code has 512k lines of code — the harness is massive, not the model
- 1M views, 7K bookmarks — one of the most-saved AI infrastructure posts of 2026
- Anthropic's Claude Managed Agents explicitly named as example of lock-in risk

## My Take

[Space for personal notes]

---

## Full Source

*Complete original content archived below for reference.*

**Your harness, your memory**

Agent harnesses are becoming the dominant way to build agents, and they are not going anywhere. These harnesses are intimately tied to agent memory. If you used a closed harness – especially if it's behind a proprietary API – you are choosing to yield control of your agent's memory to a third party. Memory is incredibly important to creating good and sticky agentic experiences. This creates incredible lock in. Memory – and therefore harnesses – should be open, so that you own your own memory.

**Agent Harnesses are not going away**

The "best" way to build agentic systems has changed dramatically over the past three years. When Claude first came out, models weren't that good and so you needed a lot of complex chains (LangChain). Then models got better, giving rise to agent harnesses. Claude Code has 512k lines of code. That code is the harness. Even the makers of the best model in the world are investing heavily in it.

**Harnesses are tied to memory**

Memory is just a form of context — short term memory (messages in the conversation), large tool call results, and long term memory (user preferences, facts learned over time) — all managed by the harness, not the model.

**If you don't own your harness, you don't own your memory**

- **Mildly bad:** Stateful APIs (OpenAI's Responses API, Anthropic's server side compute) — you yield some control
- **Bad:** Closed harnesses (Claude Agent SDK) — you yield more
- **Worst:** Whole harness including long term memory behind an API — zero ownership or visibility into memory

Model providers are incredibly incentivized to do this. Anthropic launched Claude Managed Agents — putting literally everything behind an API, locked into their platform.

**Memory creates lock-in**

Without memory, your agents are easily replicable by anyone who has access to the same tools. With memory, you build up a proprietary dataset of user interactions and preferences. That is your moat. As soon as there is state associated, it's much harder to switch.

**Open Memory, Open Harnesses**

Memory (and therefore harnesses) should be separate from model providers. Deep Agents: open source, model agnostic, uses open standards (agents.md, skills), plugins to Mongo/Postgres/Redis for memory, self-hostable.

**In order to own your memory, you need to be using an Open Harness.**

Source: https://x.com/hwchase17/status/2042978500567609738
