// Builds a CSP-safe copy of the app for hosts that forbid inline scripts
// (script-src 'self'). Assets stay as separate files; only the fonts are
// inlined, as data URIs inside a <style> block (style-src allows
// 'unsafe-inline', font-src allows data:).
//
// Usage: node scripts/build-hosted.mjs <destination-dir>
// Expects `vite build --base=./` to have produced dist/ first.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const dest = process.argv[2]
if (!dest) throw new Error('usage: build-hosted.mjs <destination-dir>')

const b64 = (n) => readFileSync(join(root, 'fonts', n)).toString('base64')
const fontStyle = `<style>
@font-face{font-family:'Fraunces';font-style:normal;font-weight:400 600;font-display:swap;src:url(data:font/woff2;base64,${b64('fraunces.woff2')}) format('woff2')}
@font-face{font-family:'Inter';font-style:normal;font-weight:400 700;font-display:swap;src:url(data:font/woff2;base64,${b64('inter.woff2')}) format('woff2')}
:root{color-scheme:light}html{background:#f6f3ec}
</style>`

let html = readFileSync(join(dist, 'index.html'), 'utf8')
// Drop the Google Fonts links — external hosts are blocked by CSP — and
// substitute the embedded faces.
html = html
  .replace(/\s*<link rel="preconnect"[^>]*>/g, '')
  .replace(/\s*<link href="https:\/\/fonts\.googleapis\.com[^>]*>/g, '')
  .replace('</head>', `  ${fontStyle}\n  </head>`)

if (!html.includes('@font-face')) throw new Error('font injection failed')
if (/<script(?![^>]*\bsrc=)/.test(html)) throw new Error('inline script present — would be blocked by CSP')

rmSync(dest, { recursive: true, force: true })
mkdirSync(join(dest, 'assets'), { recursive: true })
writeFileSync(join(dest, 'index.html'), html)
for (const f of readdirSync(join(dist, 'assets'))) {
  copyFileSync(join(dist, 'assets', f), join(dest, 'assets', f))
}
console.log(`wrote ${dest} (index.html + ${readdirSync(join(dest, 'assets')).length} assets, no inline scripts)`)
