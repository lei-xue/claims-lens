// Static, crawlable pages for every CARC/RARC explanation, plus sitemap.xml.
// Runs before `vite build`; output goes to public/ so Vite copies it into dist/.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const SITE = 'https://claims.leixue.dev'
const OUT = 'public/codes'
const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const carc = JSON.parse(readFileSync('public/data/carc.json', 'utf8'))
const rarc = JSON.parse(readFileSync('public/data/rarc.json', 'utf8'))
const file = (kind, code) => `${kind}-${code.toLowerCase()}.html`

const page = ({ title, description, path, body }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${SITE}${path}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Claims Lens" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${SITE}${path}" />
<meta property="og:image" content="${SITE}/og.jpg" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<style>
body{margin:0;font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1f2933;background:#f7f8fa}
main{max-width:760px;margin:0 auto;padding:32px 20px 64px}
a{color:#0f766e}
header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:28px}
header a.brand{font-weight:700;color:#1f2933;text-decoration:none}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:20px 22px;margin-top:16px}
h1{font-size:28px;line-height:1.2;margin:0 0 8px}
.code{font-family:ui-monospace,monospace;background:#f3f4f6;padding:2px 8px;border-radius:4px;color:#52606d}
.muted{color:#52606d}
li{margin:6px 0}
table{width:100%;border-collapse:collapse;font-size:15px}td{padding:8px 6px;border-top:1px solid #e5e7eb;vertical-align:top}
</style>
</head>
<body><main>
<header><a class="brand" href="/">Claims Lens</a><a href="/codes/">All denial codes</a></header>
${body}
<p class="muted" style="margin-top:32px;font-size:14px">Plain-language explanation written for Claims Lens and reviewed against the official definition. Official wording: <a href="https://x12.org/codes">X12 code lists</a>. Not legal or billing advice.</p>
</main></body></html>
`

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const urls = [`${SITE}/`, `${SITE}/codes/`]

for (const c of carc) {
  const path = `/codes/${file('carc', c.code)}`
  const title = `CARC ${c.code}: ${c.title} — what it means and how to fix it`
  writeFileSync(`${OUT}/${file('carc', c.code)}`, page({
    title, description: c.plain, path,
    body: `<p class="muted">Claim adjustment reason code · ${esc(c.category)}${c.stop ? ' · retired' : ''}</p>
<h1><span class="code">${esc(c.code)}</span> ${esc(c.title)}</h1>
<p>${esc(c.plain)}</p>
<div class="card"><h2>Common causes</h2><ul>${(c.causes || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
<div class="card"><h2>What to do</h2><ol>${(c.fix || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
<p class="muted">Usually handled by: ${esc(c.owner)} · Appeal: ${esc(c.appeal)}${c.groups?.length ? ` · Usually paired with group code ${esc(c.groups.join(', '))}` : ''}</p></div>
<p><a href="/">Work denials like this one in Claims Lens →</a></p>`,
  }))
  urls.push(SITE + path)
}
for (const r of rarc) {
  const path = `/codes/${file('rarc', r.code)}`
  writeFileSync(`${OUT}/${file('rarc', r.code)}`, page({
    title: `RARC ${r.code}: ${r.title} — remark code explained`, description: r.plain, path,
    body: `<p class="muted">Remittance advice remark code · ${esc(r.category)}${r.stop ? ' · retired' : ''}</p>
<h1><span class="code">${esc(r.code)}</span> ${esc(r.title)}</h1>
<p>${esc(r.plain)}</p>
<div class="card"><h2>Next step</h2><p>${esc(r.action)}</p></div>`,
  }))
  urls.push(SITE + path)
}
const row = (kind, c) => `<tr><td><a class="code" href="/codes/${file(kind, c.code)}">${esc(c.code)}</a></td><td><a href="/codes/${file(kind, c.code)}">${esc(c.title)}</a><br><span class="muted">${esc(c.plain)}</span></td></tr>`
writeFileSync(`${OUT}/index.html`, page({
  title: 'Denial codes explained: every CARC and RARC in plain English — Claims Lens',
  description: `All ${carc.length} claim adjustment reason codes (CARC) and ${rarc.length} remittance advice remark codes (RARC) explained in plain English, with common causes and what to do next.`,
  path: '/codes/',
  body: `<h1>Denial codes in plain English</h1>
<p>Every claim adjustment reason code (CARC) and remittance advice remark code (RARC) that appears on an 835 remittance, with what it means, common causes and the next step.</p>
<div class="card"><h2>Claim adjustment reason codes (${carc.length})</h2><table>${carc.map((c) => row('carc', c)).join('')}</table></div>
<div class="card"><h2>Remittance advice remark codes (${rarc.length})</h2><table>${rarc.map((r) => row('rarc', r)).join('')}</table></div>`,
}))
const today = new Date().toISOString().slice(0, 10)
writeFileSync('public/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`)
console.log(`prerendered ${carc.length} CARC + ${rarc.length} RARC pages, sitemap with ${urls.length} urls`)
