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
npm run typecheck         # TypeScript only
npm run build             # type-checks then builds to dist/
npm run build:docs        # type-checks then builds the GitHub Pages bundle to ../../docs
```

Before deployment, run `npm run typecheck`, `npm run build`, then
`npm run build:docs` and commit the resulting `docs/` bundle. If the live GitHub
Pages app looks different from source, rebuild `docs/` from this package and
commit the result with the source change.

## Auth
Cadence uses Supabase Auth with email + password in the web client. The login
screen asks for the email at runtime; do not hardcode a personal email address
or any secret in source. Browser builds may include the Supabase anon key, but
never include a service-role key, password, token, or `.env` file.

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
