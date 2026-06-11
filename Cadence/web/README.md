# Cadence web app

React + TypeScript + Vite, talking to Supabase (auth + Postgres + realtime).
This is the rebuilt web client — the work-PC/browser front-end of Cadence.

## Run locally
```bash
cd Cadence/web
cp .env.example .env      # fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev               # http://localhost:5173
```

## Build
```bash
npm run build             # type-checks then builds to dist/
```

## Architecture
- `src/lib/supabase.ts` — the Supabase client (keys from env).
- `src/lib/types.ts` — TS types mirroring the Postgres schema.
- `src/lib/store.tsx` — `CadenceProvider` / `useCadence()`: auth, loads all of
  your data, subscribes to realtime, and exposes `insert/update/remove/reload`.
- `src/lib/util.ts` — dates + the prioritisation used across clients.
- `src/components/` — shell (Sidebar, Login) and shared bits (tags, due labels).
- `src/screens/` — one file per screen. **Today** is live; the rest are being
  ported onto the backend.

Data is server-authoritative: the client holds an in-memory copy kept fresh by
Supabase realtime, so every device sees the same state. Screenshots/OCR are not
part of this store — they stay on-device.
