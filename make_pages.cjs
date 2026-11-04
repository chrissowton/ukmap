/* Which Places? — a page for every measure, so search engines (and people) can find them.
   Run after build_data.py:   node make_pages.cjs
   Writes m/<measure>.html (what it means, the source, every area ranked, links into the interactive site),
   m/index.html (every measure, by topic), sitemap.xml and robots.txt. Pages are plain HTML: no scripts needed. */
const fs = require("fs"), vm = require("vm"), path = require("path");
const DIR = __dirname;
const read = (f) => fs.readFileSync(path.join(DIR, f), "utf8");

// ---- the measures, from filters.js ----
const ctx = { window: {}, console };
ctx.window.window = ctx.window;
vm.createContext(ctx);
vm.runInContext(read("filters.js"), ctx);
vm.runInContext(read("measures.js"), ctx);   // the local measures added in release 1.1
const { FILTERS, SOURCES, SITE, FILTER_GROUPS, THEMES } = ctx.window;
const BASE = (SITE.url || "https://chrissowton.github.io/ukmap/").replace(/\/?$/, "/");

// ---- number formats, the same as the site's (taken from app.js) ----
const app = read("app.js");
const grab = (name) => { const i = app.indexOf(`function ${name}(`); let d = 0, j = app.indexOf("{", i); for (let k = j; k < app.length; k++) { if (app[k] === "{") d++; else if (app[k] === "}" && --d === 0) return app.slice(i, k + 1); } };
const unitsSrc = app.slice(app.indexOf("const UNITS = {"), app.indexOf("};", app.indexOf("const UNITS = {")) + 2);
const d3 = { format: () => (v) => Math.round(v).toLocaleString("en-GB") };
const fmtCtx = { d3 }; vm.createContext(fmtCtx);
vm.runInContext(`${grab("compact")}\n${unitsSrc}\n${grab("fmt")}\n${grab("fmtShort")}\nthis.fmt = fmt; this.fmtShort = fmtShort; this.UNITS = UNITS;`, fmtCtx);
const { fmt } = fmtCtx;

// ---- the data ----
const rows = JSON.parse(read("areas.json")).filter((r) => r.sovereign);
let TS = {}, TSY = [];
try { const t = JSON.parse(read("timeseries.json")); TS = t.series || {}; TSY = t.years || []; } catch (e) { /* no time series */ }
function span(key) {
  const s = TS[key]; if (!s) return null;
  let lo = Infinity, hi = -Infinity;
  for (const arr of Object.values(s)) arr.forEach((v, i) => { if (v != null) { lo = Math.min(lo, i); hi = Math.max(hi, i); } });
  return lo === Infinity ? null : [TSY[0] + lo, TSY[0] + hi];
}
function yearLabel(f) {
  if (f.yearText) return f.yearText;
  if (typeof f.year === "number") return String(f.year);
  if (!f.year) return "";
  const ys = rows.map((r) => r[f.year]).filter((y) => typeof y === "number");
  if (!ys.length) return "";
  const c = new Map(); ys.forEach((y) => c.set(y, (c.get(y) || 0) + 1));
  const [mode, n] = [...c].sort((a, b) => b[1] - a[1])[0];
  return n / ys.length >= 0.8 ? String(mode) : `mostly ${mode}`;
}
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const slug = (s) => s.toLowerCase().replace(/₂/g, "2").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);

const measures = FILTERS.filter((f) => f.type === "range" && !f.target && !f.hidden && !String(f.key).startsWith("__"));
const used = new Set();
measures.forEach((f) => { let s = slug(f.label); if (used.has(s)) s = slug(f.label + "-" + f.key); used.add(s); f.slug = s; });
const themeOf = new Map();
for (const t of THEMES || []) for (const g of t.groups) themeOf.set(g, t.label);

const CSS = `:root{--bg:#f7f5f0;--surface:#fff;--ink:#1d2a30;--muted:#5b6b72;--line:#e2ddd2;--accent:#0f6674;--bar:#d08a2e}
@media (prefers-color-scheme:dark){:root{--bg:#10191e;--surface:#16242b;--ink:#e8eef0;--muted:#9fb0b6;--line:#2a3b43;--accent:#6cc1d2;--bar:#e0a95a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 "IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:var(--accent)}header{padding:14px 20px;border-bottom:1px solid var(--line);background:var(--surface)}header a{color:var(--ink);text-decoration:none;font-weight:700;font-size:20px}
header a b{color:#e0a000}main{max-width:900px;margin:0 auto;padding:20px 16px 60px}h1{font-size:30px;line-height:1.2;margin:8px 0}
.lead{font-size:18px;color:var(--ink)}.crumbs{font-size:13px;color:var(--muted)}.facts{display:grid;grid-template-columns:140px 1fr;gap:6px 14px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:16px 0}
.facts dt{color:var(--muted);font-weight:600}.facts dd{margin:0}.go{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}.go a{display:inline-block;padding:9px 14px;border-radius:9px;border:1px solid var(--line);background:var(--surface);text-decoration:none;font-weight:600}
.go a.main{background:var(--accent);color:#fff;border-color:var(--accent)}table{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--line);border-radius:12px;overflow:hidden;font-size:15px}
th,td{padding:6px 10px;border-bottom:1px solid var(--line);text-align:left}th{color:var(--muted);font-size:13px}td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}td.r{color:var(--muted);width:44px}
.bar{height:10px;border-radius:3px;background:var(--bar);min-width:2px}td.b{width:35%}h2{margin-top:32px}ul.rel{columns:2;padding-left:18px}@media (max-width:600px){ul.rel{columns:1}.facts{grid-template-columns:1fr}td.b{display:none}}
footer{font-size:13px;color:var(--muted);margin-top:40px}.grp{margin:22px 0}.grp h2{font-size:18px;margin:0 0 6px}.grp ul{columns:2;padding-left:18px;margin:0}@media (max-width:600px){.grp ul{columns:1}}`;

function page({ title, desc, canonical, body, jsonld }) {
  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${canonical}"><meta property="og:type" content="website">
<link rel="icon" href="../icon-192.png">${jsonld ? `\n<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ""}
<style>${CSS}</style></head><body>
<header><a href="../index.html">Which Places<b>?</b></a></header>
<main>${body}
<footer>Which Places? is a free, open-source map for exploring data about every local authority in the UK. Figures are as published by each source; see <a href="../index.html">the site</a>'s Sources &amp; methods for every licence.</footer>
</main></body></html>
`;
}

fs.mkdirSync(path.join(DIR, "m"), { recursive: true });
let n = 0;
for (const f of measures) {
  const S = SOURCES[f.source] || {};
  const vals = rows.filter((r) => typeof r[f.key] === "number").map((r) => ({ r, v: r[f.key] }));
  if (vals.length < 5) continue;
  const asc = f.format === "rank";
  vals.sort((a, b) => (asc ? a.v - b.v : b.v - a.v));
  const yl = yearLabel(f), sp = span(f.key);
  const max = Math.max(...vals.map((d) => Math.abs(d.v))) || 1;
  const sorted = vals.map((d) => d.v).sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
  const top = vals[0], bottom = vals[vals.length - 1];
  const theme = themeOf.get(f.group) || "";
  const url = `${BASE}m/${f.slug}.html`;
  const desc = `${f.label} for every UK local authority${yl ? ` (${yl})` : ""}: ${f.info || ""} Highest: ${top.r.name}. Lowest: ${bottom.r.name}. Map, ranking${sp ? ", trends since " + sp[0] : ""} and data to download.`.replace(/\s+/g, " ").slice(0, 300);
  const links = [
    [`../index.html?c=${f.key}`, "Open the map", "main"],
    [`../index.html?v=rank&rk=${f.key}`, "Every area ranked"],
    ...(sp ? [[`../index.html?v=trends&tk=${f.key}`, `Change over time (${sp[0]}–${sp[1]})`], [`../index.html?v=trends&tk=${f.key}&tt=race`, "Bar chart race"]] : []),
    [`../index.html?v=compare&cy=${f.key}`, "Compare with another measure"],
  ];
  const related = measures.filter((g) => g.group === f.group && g !== f).slice(0, 12);
  const body = `<p class="crumbs"><a href="index.html">All measures</a>${theme ? ` › ${esc(theme)}` : ""} › ${esc(f.group)}</p>
<h1>${esc(f.label)} by local authority</h1>
<p class="lead">${esc(f.info || "")}</p>
<div class="go">${links.map(([h, t, c]) => `<a href="${h}"${c ? ` class="${c}"` : ""}>${esc(t)}</a>`).join("")}</div>
<dl class="facts">
<dt>Highest</dt><dd>${esc(top.r.name)}: ${esc(fmt(f, top.v))}</dd>
<dt>Lowest</dt><dd>${esc(bottom.r.name)}: ${esc(fmt(f, bottom.v))}</dd>
<dt>The middle area</dt><dd>${esc(fmt(f, med))} (half the areas are above this, half below)</dd>
<dt>Areas with data</dt><dd>${vals.length} of ${rows.length}</dd>
<dt>Year</dt><dd>${esc(yl || "latest")}${sp ? `; every year from ${sp[0]} to ${sp[1]} on the site` : ""}</dd>
<dt>Source</dt><dd>${S.url && S.url !== "#" ? `<a href="${esc(S.url)}" rel="noopener">${esc(S.name)}</a>` : esc(S.name || "")}${S.licence ? ` (${esc(S.licence)})` : ""}</dd>
</dl>
<h2>Every area ranked</h2>
<table><thead><tr><th>#</th><th>Area</th><th>${esc(f.label)}</th><th class="b"></th></tr></thead><tbody>
${vals.map((d, i) => `<tr><td class="r">${i + 1}</td><td>${esc(d.r.name)}</td><td class="n">${esc(fmt(f, d.v))}</td><td class="b"><div class="bar" style="width:${Math.max(0.5, (100 * Math.abs(d.v)) / max).toFixed(1)}%"></div></td></tr>`).join("\n")}
</tbody></table>
${related.length ? `<h2>Related measures</h2><ul class="rel">${related.map((g) => `<li><a href="${g.slug}.html">${esc(g.label)}</a></li>`).join("")}</ul>` : ""}`;
  const jsonld = {
    "@context": "https://schema.org", "@type": "Dataset", name: `${f.label} by local authority`, description: (f.info || f.label).slice(0, 4900), url,
    isAccessibleForFree: true, spatialCoverage: "United Kingdom", ...(sp ? { temporalCoverage: `${sp[0]}/${sp[1]}` } : yl && /^\d{4}$/.test(yl) ? { temporalCoverage: yl } : {}),
    creator: { "@type": "Organization", name: S.name || "Which Places?", ...(S.url && S.url !== "#" ? { url: S.url } : {}) },
    ...(S.licence && /CC BY/.test(S.licence) ? { license: `https://creativecommons.org/licenses/${/SA/.test(S.licence) ? "by-sa" : "by"}/4.0/` } : {}),
  };
  fs.writeFileSync(path.join(DIR, "m", f.slug + ".html"), page({ title: `${f.label} by local authority${yl ? ` (${yl})` : ""} – map and ranking | Which Places?`, desc, canonical: url, body, jsonld }));
  n++;
}
// the index of every measure, by topic
const groups = (FILTER_GROUPS || []).filter((g) => measures.some((f) => f.group === g && fs.existsSync(path.join(DIR, "m", f.slug + ".html"))));
const idxBody = `<h1>Every measure</h1><p class="lead">${n} measures for every local authority in the UK: what each one means, where it comes from, and every area ranked. Open any of them on the interactive map.</p>
${groups.map((g) => `<section class="grp"><h2>${esc(g)}</h2><ul>${measures.filter((f) => f.group === g && fs.existsSync(path.join(DIR, "m", f.slug + ".html"))).map((f) => `<li><a href="${f.slug}.html">${esc(f.label)}</a></li>`).join("")}</ul></section>`).join("\n")}`;
fs.writeFileSync(path.join(DIR, "m", "index.html"), page({ title: "Every measure, by local authority – Which Places?", desc: `${n} measures for every UK local authority: population, age and more, with sources.`, canonical: `${BASE}m/`, body: idxBody }));
// sitemap and robots
const today = new Date().toISOString().slice(0, 10);
const urls = [BASE, `${BASE}m/`, `${BASE}whatsnew.html`, ...measures.filter((f) => fs.existsSync(path.join(DIR, "m", f.slug + ".html"))).map((f) => `${BASE}m/${f.slug}.html`)];
fs.writeFileSync(path.join(DIR, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join("\n")}\n</urlset>\n`);
fs.writeFileSync(path.join(DIR, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${BASE}sitemap.xml\n`);
// remove pages for measures that no longer exist
const keep = new Set(["index.html", ...measures.map((f) => f.slug + ".html")]);
for (const file of fs.readdirSync(path.join(DIR, "m"))) if (!keep.has(file)) fs.unlinkSync(path.join(DIR, "m", file));
console.log(`${n} measure pages, m/index.html, sitemap.xml (${urls.length} addresses), robots.txt`);
