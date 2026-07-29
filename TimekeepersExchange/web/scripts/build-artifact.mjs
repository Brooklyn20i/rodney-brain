// Bundles dist/ into a single self-contained HTML page for hosting contexts
// that disallow external requests (strict CSP, no CDN, no separate assets).
// Fonts are embedded as woff2 data URIs so the editorial serif never silently
// falls back. Output: dist/timekeepers-exchange.html
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const assets = join(root, 'dist', 'assets')
const fontDir = process.env.FONT_DIR ?? join(root, 'fonts')

const pick = (ext) => {
  const f = readdirSync(assets).filter((n) => n.endsWith(ext))
  if (f.length !== 1) throw new Error(`expected exactly one ${ext} in dist/assets, found ${f.length}`)
  return readFileSync(join(assets, f[0]), 'utf8')
}

const b64 = (name) => readFileSync(join(fontDir, name)).toString('base64')

const css = pick('.css')
const js = pick('.js')

const fontFaces = `
@font-face{font-family:'Fraunces';font-style:normal;font-weight:400 600;font-display:swap;
  src:url(data:font/woff2;base64,${b64('fraunces.woff2')}) format('woff2')}
@font-face{font-family:'Inter';font-style:normal;font-weight:400 700;font-display:swap;
  src:url(data:font/woff2;base64,${b64('inter.woff2')}) format('woff2')}
/* This product commits to a single warm-ivory identity rather than following the
   viewer's OS theme; pin the scheme so form controls don't render with dark UA
   styling on top of a light ground. */
:root{color-scheme:light}
html{background:#f6f3ec}
`

const out = `<title>The Timekeeper's Exchange — Verified offers for exceptional watches</title>
<style>${fontFaces}</style>
<style>${css}</style>
<div id="root"></div>
<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>
`

const dest = join(root, 'dist', 'timekeepers-exchange.html')
writeFileSync(dest, out)
console.log(`${dest} — ${(out.length / 1024).toFixed(0)} KB`)
