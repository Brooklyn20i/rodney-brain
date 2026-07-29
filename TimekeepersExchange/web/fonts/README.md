# Vendored webfonts

Latin-subset woff2 files, vendored so `scripts/build-artifact.mjs` can embed them
as data URIs for hosting contexts that block external requests (strict CSP, no CDN).

| File | Family | Licence |
|---|---|---|
| `fraunces.woff2` | Fraunces (variable, wght 400–600) | SIL Open Font License 1.1 |
| `inter.woff2` | Inter (variable, wght 400–700) | SIL Open Font License 1.1 |

Both are redistributed from Google Fonts. The OFL permits bundling and embedding;
the fonts are not sold on their own and are not renamed. Full licence text:
<https://openfontlicense.org>.

The normal `npm run dev` / `npm run build` path loads these families from Google
Fonts via `index.html` and does not use these files.
