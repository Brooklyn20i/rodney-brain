# LLM Knowledge Bases — Andrej Karpathy (@karpathy)

**Date:** 2026-04-12
**Source:** https://x.com/karpathy/status/2039805659525644595
**Type:** X Post (Long-form)
**Tags:** #AI #KnowledgeManagement #LLM #PKM #Obsidian #DigitalBrain

## Summary

Karpathy describes a personal workflow where LLMs act as the engine of a living knowledge base. Raw documents are ingested into a directory, an LLM compiles them into a structured markdown wiki (viewed in Obsidian), and the same LLM handles Q&A, linting, and incremental enrichment — all without needing complex RAG pipelines. The system compounds: every query and exploration gets filed back in, making the knowledge base smarter over time.

## Why It Matters

This is directly relevant to any leader trying to synthesise large volumes of information into actionable insight. The core idea — that an LLM can maintain a structured knowledge base so you never have to — applies immediately to anyone managing research across AI, strategy, and innovation. It validates the approach of storing summaries as markdown files, which compounds in value as the library grows.

## Key Quotes / Data Points

- "A large fraction of my recent token throughput is going less into manipulating code, and more into manipulating knowledge"
- Wiki at ~100 articles and ~400K words — Q&A works without fancy RAG at this scale
- 19.5M views, 55K likes, 100K bookmarks — one of the most-saved posts in recent AI discourse
- "You rarely ever write or edit the wiki manually, it's the domain of the LLM"
- "I think there is room here for an incredible new product instead of a hacky collection of scripts"

## Karpathy's Stack (Quick Reference)

| Component | Tool / Approach |
|-----------|----------------|
| Raw data ingest | Articles, papers, repos, images in `raw/` directory |
| Wiki compiler | LLM incrementally builds `.md` files with backlinks |
| IDE / Frontend | Obsidian |
| Web clipping | Obsidian Web Clipper extension |
| Q&A | LLM agent queries against the wiki |
| Output formats | Markdown, Marp slides, matplotlib images |
| Linting | LLM health checks for consistency and gaps |
| Search | Vibe-coded naive search engine with web UI |

## My Take

[Space for personal notes]

---

## Full Source

*Complete original content archived below for reference.*

**LLM Knowledge Bases**
@karpathy · April 2, 2026 · 1:42 PM · 19.5M Views · 55K Likes · 100K Bookmarks

Something I'm finding very useful recently: using LLMs to build personal knowledge bases for various topics of research interest. In this way, a large fraction of my recent token throughput is going less into manipulating code, and more into manipulating knowledge (stored as markdown and images). The latest LLMs are quite good at it. So:

**Data ingest:** I index source documents (articles, papers, repos, datasets, images, etc.) into a raw/ directory, then I use an LLM to incrementally "compile" a wiki, which is just a collection of .md files in a directory structure. The wiki includes summaries of all the data in raw/, backlinks, and then it categorizes data into concepts, writes articles for them, and links them all. To convert web articles into .md files I like to use the Obsidian Web Clipper extension, and then I also use a hotkey to download all the related images to local so that my LLM can easily reference them.

**IDE:** I use Obsidian as the IDE "frontend" where I can view the raw data, the compiled wiki, and the derived visualizations. Important to note that the LLM writes and maintains all of the data of the wiki, I rarely touch it directly.

**Q&A:** Where things get interesting is that once your wiki is big enough (e.g. mine on some recent research is ~100 articles and ~400K words), you can ask your LLM agent all kinds of complex questions against the wiki, and it will go off, research the answers, etc. I thought I had to reach for fancy RAG, but the LLM has been pretty good about auto-maintaining index files and brief summaries of all the documents and it reads all the important related data fairly easily at this ~small scale.

**Output:** Instead of getting answers in text/terminal, I like to have it render markdown files for me, or slide shows (Marp format), or matplotlib images, all of which I then view again in Obsidian. Often, I end up "filing" the outputs back into the wiki to enhance it for further queries. So my own explorations and queries always "add up" in the knowledge base.

**Linting:** I've run some LLM "health checks" over the wiki to e.g. find inconsistent data, impute missing data (with web searchers), find interesting connections for new article candidates, etc., to incrementally clean up the wiki and enhance its overall data integrity.

**Extra tools:** I find myself developing additional tools to process the data, e.g. I vibe coded a small and naive search engine over the wiki, which I both use directly (in a web ui), but more often I want to hand it off to an LLM via CLI as a tool for larger queries.

**Further explorations:** As the repo grows, the natural desire is to also think about synthetic data generation + finetuning to have your LLM "know" the data in its weights instead of just context windows.

**TLDR:** raw data from a given number of sources is collected, then compiled by an LLM into a .md wiki, then operated on by various CLIs by the LLM to do Q&A and to incrementally enhance the wiki, and all of it viewable in Obsidian. You rarely ever write or edit the wiki manually, it's the domain of the LLM. I think there is room here for an incredible new product instead of a hacky collection of scripts.
