# Rodney Brain — Web App

A private AI Brain interface over the markdown knowledge base in this repository.

## Features

- **Library view** — browse all notes as cards with metadata
- **Search** — keyword search across titles, tags, and content
- **Note viewer** — read full note content in a modal
- **Ask My Brain** — ask a question; the app finds relevant notes and answers using Claude

## Setup

### 1. Prerequisites

- Node.js 18+
- An Anthropic API key (for Ask My Brain; library and search work without it)

### 2. Install dependencies

```bash
cd app
npm install
```

### 3. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and add your Anthropic API key:

```
ANTHROPIC_API_KEY=sk-ant-...
```

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Build for production

```bash
npm run build
npm start
```

## Architecture

```
app/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── notes/route.ts   # GET /api/notes?q=query
│   │   │   └── ask/route.ts     # POST /api/ask { question }
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx             # Main UI
│   ├── components/
│   │   ├── NoteCard.tsx
│   │   ├── NoteModal.tsx
│   │   └── AskBrain.tsx
│   └── lib/
│       ├── types.ts
│       └── markdown-loader.ts   # Reads ../articles/*.md (read-only)
└── ...config files
```

## Content source

Notes are read at runtime from `../articles/` relative to this app directory.
**The original markdown files are never modified.**

Any generated outputs (e.g. future digest exports) go to `../generated/`.
