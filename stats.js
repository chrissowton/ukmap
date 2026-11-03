/* Statistics toolkit: the techniques in GCSE and A-level geography, worked through with the countries on the map.
   Summary statistics and a dispersion diagram · Spearman's rank (worked table + significance) · Chi-squared · Lorenz curve and Gini.
   Each one shows its working and can be downloaded as a spreadsheet (CSV). */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  let W;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const S = { tab: "summary", a: "", b: "", sample: "all", n: 15, seed: 1, group: "region", lor: "", weight: true };
  const r2 = (x, d = 2) => (Number.isFinite(x) ? (+x.toFixed(d)).toLocaleString("en-GB", { maximumFractionDigits: d }) : "–");
  const num = (f, v) => (typeof v === "number" ? W.fmtShort(f, v) : "–");
  // precise enough to see why two countries have different ranks
  const prec = (v) => (typeof v !== "number" ? "–" : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-GB") : (+v.toPrecision(4)).toLocaleString("en-GB", { maximumFractionDigits: 4 }));
  const lc = (t) => (/^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);

  // ---------- Critical values ----------
  // Spearman's rank, two-tailed (Zar 1972): n -> [0.05, 0.01]
  const SP_CRIT = { 5: [1.000, null], 6: [0.886, 1.000], 7: [0.786, 0.929], 8: [0.738, 0.881], 9: [0.700, 0.833], 10: [0.648, 0.794], 11: [0.618, 0.755], 12: [0.587, 0.727],
    13: [0.560, 0.703], 14: [0.538, 0.679], 15: [0.521, 0.654], 16: [0.503, 0.635], 17: [0.485, 0.615], 18: [0.472, 0.600], 19: [0.460, 0.584], 20: [0.447, 0.570],
    21: [0.435, 0.556], 22: [0.425, 0.544], 23: [0.415, 0.532], 24: [0.406, 0.521], 25: [0.398, 0.511], 26: [0.390, 0.501], 27: [0.382, 0.491], 28: [0.375, 0.483],
    29: [0.368, 0.475], 30: [0.362, 0.467] };
  const CHI_CRIT = [null, [3.841, 6.635], [5.991, 9.210], [7.815, 11.345], [9.488, 13.277], [11.070, 15.086], [12.592, 16.812], [14.067, 18.475], [15.507, 20.090], [16.919, 21.666], [18.307, 23.209],
    [19.675, 24.725], [21.026, 26.217], [22.362, 27.688], [23.685, 29.141], [24.996, 30.578], [26.296, 32.000], [27.587, 33.409], [28.869, 34.805], [30.144, 36.191], [31.410, 37.566]];
  // normal distribution, for Spearman's rank with more than 30 countries
  function normP2(z) { // two-tailed p
    const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return 2 * p;
  }

  // ---------- Helpers ----------
  function rankDesc(vals) {
    // rank 1 = highest; ties share the average rank (as taught)
    const idx = vals.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
    const r = new Array(vals.length); let i = 0;
    while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; i = j + 1; }
    return r;
  }
  function rng(seed) { let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }
  function sampleOf(list) {
    if (S.sample === "all" || list.length <= S.n) return list;
    if (S.sample === "top") return list.slice().sort((a, b) => b.x - a.x).slice(0, S.n);
    const r = rng(S.seed), a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, S.n);
  }
  const defaultA = () => W.cs?.f.key || W.colourKey() || "gdp_per_capita";
  function defaultB(a) {
    const pairs = { gdp_per_capita: "life_expectancy", life_expectancy: "gdp_per_capita", fertility: "gdp_per_capita", co2_per_capita: "gdp_per_capita" };
    return pairs[a] || (a === "life_expectancy" ? "gdp_per_capita" : "life_expectancy");
  }
  const csvDl = (rows, name) => {
    const q = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const b = new Blob(["﻿" + rows.map((r) => r.map(q).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const scope = () => `${W.matches.length} areas${W.lastEval.act.length ? " that match your filters" : ""}${W.state.year ? `, ${W.state.year}` : ""}`;
  // an (i) button with a plain-words explanation, shown on hover, focus or tap
  const info = (t) => `<button type="button" class="stx-i" data-tip="${esc(t)}" aria-label="What this means: ${esc(t)}">i</button>`;
  // amber or red when a number stands out
  const flag = (lvl) => (lvl === 2 ? ' class="stx-red"' : lvl === 1 ? ' class="stx-amber"' : "");
  const pick = (id, key) => `<select id="${id}" class="stx-sel" data-pick>${W.measureOptions(key)}</select>`;

  // ---------- 1. Summary statistics and dispersion ----------
  function summary() {
    const f = W.F[S.a];
    const rows = W.matches.filter((r) => typeof r[f.key] === "number").map((r) => ({ r, x: r[f.key] }));
    if (rows.length < 3) return { html: `<p>Not enough areas with data on ${esc(f.label)}.</p>` };
    const v = rows.map((d) => d.x).sort((a, b) => a - b), n = v.length;
    const mean = d3.mean(v), med = d3.quantileSorted(v, 0.5), q1 = d3.quantileSorted(v, 0.25), q3 = d3.quantileSorted(v, 0.75), sd = d3.deviation(v);
    const cv = mean > 0 ? sd / mean : null, iqrRel = med > 0 ? (q3 - q1) / med : null, ratio = v[0] > 0 ? v[n - 1] / v[0] : null;
    const skew = mean && med ? Math.abs(mean - med) / Math.abs(med || 1) : 0;
    // how much it stands out: 0 normal, 1 amber, 2 red
    const lvCV = cv == null ? 0 : cv >= 1 ? 2 : cv >= 0.5 ? 1 : 0;
    const lvIQR = iqrRel == null ? 0 : iqrRel >= 1 ? 2 : iqrRel >= 0.5 ? 1 : 0;
    const lvRange = ratio == null ? 0 : ratio >= 100 ? 2 : ratio >= 10 ? 1 : 0;
    const lvSkew = skew >= 0.5 ? 2 : skew >= 0.2 ? 1 : 0;
    const lowName = rows.find((d) => d.x === v[0]).r.name, highName = rows.find((d) => d.x === v[n - 1]).r.name;
    const stats = [
      ["Number of areas", "", n, 0, "How many areas are in the sum: the ones on the map with data for this measure."],
      ["Mean (average)", "x̄ = Σx ÷ n", prec(mean), lvSkew, "Add up every area's value and divide by the number of areas. A few very high or very low areas can pull it a long way." + (lvSkew ? " Here it is well away from the median, so a few areas are pulling it." : "")],
      ["Median (middle value)", "", prec(med), 0, "Put the areas in order: the median is the one in the middle. Half are above it and half below. It isn't pulled by extreme areas."],
      ["Lowest", "", `${num(f, v[0])} (${lowName})`, 0, "The smallest value on the map."],
      ["Highest", "", `${num(f, v[n - 1])} (${highName})`, 0, "The largest value on the map."],
      ["Range", "highest − lowest", prec(v[n - 1] - v[0]), lvRange, "The gap between the highest and lowest areas. Easy to work out, but it depends on just two areas." + (ratio ? ` The highest is ${ratio >= 10 ? "about " + Math.round(ratio).toLocaleString("en-GB") + " times" : r2(ratio, 1) + " times"} the lowest.` : "")],
      ["Lower quartile (Q1)", "", prec(q1), 0, "A quarter of the areas are below this value."],
      ["Upper quartile (Q3)", "", prec(q3), 0, "A quarter of the areas are above this value."],
      ["Interquartile range (IQR)", "Q3 − Q1", prec(q3 - q1), lvIQR, "The spread of the middle half of the areas. It ignores the extremes, so it's a fair measure when a few areas are very different." + (iqrRel != null ? ` Here it is ${r2(iqrRel * 100, 0)}% of the median.` : "")],
      ["Standard deviation", "σ = √(Σ(x − x̄)² ÷ (n − 1))", prec(sd), lvCV, "The typical distance of an area from the mean. Bigger means the areas are more spread out. It uses every area, so extremes push it up."],
      ["Coefficient of variation", "σ ÷ x̄ × 100", cv == null ? "–" : r2(cv * 100, 1) + "%", lvCV, "The standard deviation as a percentage of the mean, so you can compare spread between measures with different units. Under 50% is fairly even; 50–100% varies a lot; over 100% varies hugely."],
    ];
    const plain = [];
    plain.push(`The typical (median) area has <b>${esc(num(f, med))}</b>; the middle half of areas have between ${esc(num(f, q1))} and ${esc(num(f, q3))}.`);
    if (lvCV || lvRange) plain.push(`Areas are ${lvCV === 2 || lvRange === 2 ? "<b class=\"stx-redt\">very unequal</b>" : "<b class=\"stx-ambert\">quite unequal</b>"} on this measure${ratio && ratio >= 10 ? `: ${esc(highName)} has about ${Math.round(ratio).toLocaleString("en-GB")} times as much as ${esc(lowName)}` : ""}.`);
    else plain.push(`Areas are <b>fairly similar</b> on this measure.`);
    if (lvSkew) plain.push(`The mean (${esc(num(f, mean))}) is ${mean > med ? "higher" : "lower"} than the median, so a few areas with ${mean > med ? "very high" : "very low"} values are pulling it ${mean > med ? "up" : "down"}: the median is the better “typical” value here.`);
    const groups = d3.rollups(rows, (g) => { const s = g.map((d) => d.x).sort((a, b) => a - b); const m = d3.mean(s), sdv = s.length > 1 ? d3.deviation(s) : 0; return { n: s.length, mean: m, med: d3.quantileSorted(s, 0.5), iqr: d3.quantileSorted(s, 0.75) - d3.quantileSorted(s, 0.25), cv: m > 0 ? sdv / m : null }; }, (d) => d.r.region || "Other")
      .sort((a, b) => b[1].med - a[1].med);
    const cvLv = (c) => (c == null ? 0 : c >= 1 ? 2 : c >= 0.5 ? 1 : 0);
    const html = `<div class="stx-res stx-plain">${plain.map((t) => `<p>${t}</p>`).join("")}</div>
      <div class="stx-two"><table class="stx-t stx-sumt">${stats.map(([k, fm, val, lv, tip]) => `<tr><th>${k} ${info(tip)}${fm ? `<small class="stx-fm">${esc(fm)}</small>` : ""}</th><td${flag(lv)}>${esc(val)}</td></tr>`).join("")}</table>
      <div>${dispersionSVG(f, rows, { mean, med, q1, q3 })}<p class="hint">Dispersion diagram: each dot is an area (hover to see which). Dashed lines: quartiles; solid: median; ▲ mean.${f.scale === "log" ? " Log scale." : ""}</p>
      <p class="stx-key"><span class="stx-amber">Amber</span> varies a lot (or the mean is being pulled) · <span class="stx-red">Red</span> varies hugely (for example the highest is over 100 times the lowest) ${info("Coefficient of variation and standard deviation: amber from 50%, red from 100%. Interquartile range: amber when it's at least half the median, red when it's bigger than the median. Range: amber when the highest is 10 times the lowest, red at 100 times. Mean: amber when it's 20% away from the median, red at 50%.")}</p></div></div>
      <h4>By region <span class="stx-hint">Click a heading to sort</span></h4><table class="stx-t stx-wide stx-num stx-sort"><thead><tr><th>Region</th><th>n</th><th>Mean</th><th>Median</th><th>IQR</th><th>Coefficient of variation ${info("How unequal the areas in that region are: the standard deviation as a % of the mean.")}</th></tr></thead><tbody>
      ${groups.map(([k, g]) => `<tr><td>${esc(k)}</td><td data-v="${g.n}">${g.n}</td><td data-v="${g.mean}">${num(f, g.mean)}</td><td data-v="${g.med}">${num(f, g.med)}</td><td data-v="${g.iqr}"${flag(g.med > 0 ? (g.iqr / g.med >= 1 ? 2 : g.iqr / g.med >= 0.5 ? 1 : 0) : 0)}>${num(f, g.iqr)}</td><td data-v="${g.cv ?? -1}"${flag(cvLv(g.cv))}>${g.cv == null ? "–" : r2(g.cv * 100, 0) + "%"}</td></tr>`).join("")}</tbody></table>
      <p class="hint">Mean or median? The median is better when a few areas are far from the rest (it isn't pulled by them). The IQR is the spread of the middle half; the standard deviation uses every area.</p>`;
    const csv = [["Area", "Region", f.label], ...rows.map((d) => [d.r.name, d.r.region, d.x]), [], ...stats.map(([k, , val]) => [k, String(val)])];
    return { html, csv, name: `summary-${f.key}.csv` };
  }
  function dispersionSVG(f, rows, m) {
    const Wd = 360, H = 190, pl = 12, pr = 12, base = H - 34;
    const ext = d3.extent(rows, (d) => d.x);
    const x = (f.scale === "log" && ext[0] > 0 ? d3.scaleLog() : d3.scaleLinear()).domain(ext).range([pl, Wd - pr]).nice();
    // stack dots in narrow bins
    const bins = new Map(); const r = rows.length > 120 ? 2.6 : 3.4;
    const dots = rows.slice().sort((a, b) => a.x - b.x).map((d) => { const bx = Math.round(x(d.x) / (r * 2)); const k = (bins.get(bx) || 0) + 1; bins.set(bx, k); return { cx: bx * r * 2, cy: base - r - (k - 1) * r * 2, d }; });
    // a log scale: just the powers of ten, so the labels don't run into each other
    const ticks = f.scale === "log" && ext[0] > 0 ? x.ticks().filter((t) => Math.abs(Math.log10(t) - Math.round(Math.log10(t))) < 1e-9) : x.ticks(5);
    const vl = (v, dash, label) => `<line x1="${x(v)}" x2="${x(v)}" y1="8" y2="${base}" stroke="var(--accent)" stroke-width="1.4" ${dash ? 'stroke-dasharray="4 3"' : ""}/><text x="${x(v)}" y="8" font-size="10" text-anchor="middle" fill="var(--muted)">${label}</text>`;
    return `<svg class="stx-svg" viewBox="0 0 ${Wd} ${H}" role="img" aria-label="Dispersion diagram">
      ${vl(m.q1, true, "Q1")}${vl(m.q3, true, "Q3")}${vl(m.med, false, "median")}
      ${dots.map((p) => `<circle cx="${p.cx}" cy="${Math.max(10, p.cy)}" r="${r - 0.4}" fill="var(--match)" stroke="var(--surface)" stroke-width=".6"><title>${esc(p.d.r.name)}: ${esc(num(f, p.d.x))}</title></circle>`).join("")}
      <line x1="${pl}" x2="${Wd - pr}" y1="${base}" y2="${base}" stroke="var(--ink)"/>
      <path d="M${x(m.mean)},${base + 2} l5,9 h-10z" fill="var(--ink)"/>
      ${ticks.map((t) => `<text x="${x(t)}" y="${base + 24}" font-size="10.5" text-anchor="middle" fill="var(--muted)">${esc(W.fmtShort(f, t))}</text>`).join("")}
    </svg>`;
  }

  // ---------- 2. Spearman's rank ----------
  function spearman() {
    const fa = W.F[S.a], fb = W.F[S.b];
    let list = W.matches.filter((r) => typeof r[fa.key] === "number" && typeof r[fb.key] === "number").map((r) => ({ r, x: r[fa.key], y: r[fb.key] }));
    const all = list.length;
    list = sampleOf(list).sort((a, b) => a.r.name.localeCompare(b.r.name));
    const n = list.length;
    if (n < 5) return { html: `<p>Spearman's rank needs at least 5 areas with data on both. There are ${n}.</p>` };
    const rx = rankDesc(list.map((d) => d.x)), ry = rankDesc(list.map((d) => d.y));
    list.forEach((d, i) => { d.rx = rx[i]; d.ry = ry[i]; d.d = rx[i] - ry[i]; d.d2 = d.d * d.d; });
    const sum = d3.sum(list, (d) => d.d2), rs = 1 - (6 * sum) / (n ** 3 - n);
    let sig;
    if (n <= 30) {
      const [c5, c1] = SP_CRIT[n];
      const a = Math.abs(rs);
      sig = { text: c1 && a >= c1 ? "significant at the 0.01 level (99% confidence)" : a >= c5 ? "significant at the 0.05 level (95% confidence)" : "not significant: it could have happened by chance",
        crit: `Critical values for n = ${n}: ${c5.toFixed(3)} (0.05), ${c1 ? c1.toFixed(3) : "n/a"} (0.01).`, ok: a >= c5 };
    } else {
      const z = rs * Math.sqrt(n - 1), p = normP2(z);
      sig = { text: p < 0.01 ? "significant at the 0.01 level (99% confidence)" : p < 0.05 ? "significant at the 0.05 level (95% confidence)" : "not significant: it could have happened by chance",
        crit: `With more than 30 areas, z = rs × √(n − 1) = ${r2(z, 2)}, p ≈ ${p < 0.0001 ? "< 0.0001" : r2(p, 4)}.`, ok: p < 0.05 };
    }
    const strength = Math.abs(rs) >= 0.8 ? "very strong" : Math.abs(rs) >= 0.6 ? "strong" : Math.abs(rs) >= 0.4 ? "moderate" : Math.abs(rs) >= 0.2 ? "weak" : "very weak or no";
    const dir = rs > 0 ? "positive" : "negative";
    const html = `<div class="stx-res ${sig.ok ? "ok" : "no"}"><b>rs = ${r2(rs, 3)}</b> ${info("rs runs from −1 to +1. Near +1: areas high on one are high on the other. Near −1: high on one, low on the other. Near 0: no link. Significant means it's unlikely to be down to chance.")}: a ${strength} ${dir} correlation, ${sig.text}.
        <small>${sig.crit}</small></div>
      <p class="stx-formula">${info("Spearman's rank puts the areas in order twice, once for each measure, and checks whether the two orders agree. d is the difference between an area's two ranks, Σd² adds up those differences squared, and n is the number of areas. +1 means the orders match exactly, −1 means one is the reverse of the other, 0 means no link.")} rs = 1 − <span class="frac"><span>6Σd²</span><span>n³ − n</span></span> = 1 − <span class="frac"><span>6 × ${r2(sum, 2)}</span><span>${n}³ − ${n}</span></span> = 1 − <span class="frac"><span>${r2(6 * sum, 2)}</span><span>${(n ** 3 - n).toLocaleString()}</span></span> = <b>${r2(rs, 3)}</b></p>
      <p class="hint">Null hypothesis: there is no relationship between ${esc(lc(fa.label))} and ${esc(lc(fb.label))}. ${sig.ok ? "Reject it." : "Accept it."} Rank 1 = highest; tied values share the average rank. ${n < all ? `Using ${n} of ${all} areas (${S.sample === "random" ? "a random sample" : "the top " + n}).` : ""}</p>
      <p class="stx-hint">Click a heading to sort. Big d² values (amber, red) are the areas that break the pattern.</p>
      <div class="stx-scroll"><table class="stx-t stx-wide stx-num stx-sort"><thead><tr><th>Area</th><th>${esc(fa.short || fa.label)}</th><th>Rank</th><th>${esc(fb.short || fb.label)}</th><th>Rank</th><th>d ${info("The difference between the area's two ranks.")}</th><th>d² ${info("d squared, so that negative differences count too.")}</th></tr></thead><tbody>
      ${list.map((d) => `<tr><td>${esc(d.r.name)}</td><td data-v="${d.x}">${prec(d.x)}</td><td data-v="${d.rx}">${r2(d.rx, 1)}</td><td data-v="${d.y}">${prec(d.y)}</td><td data-v="${d.ry}">${r2(d.ry, 1)}</td><td data-v="${d.d}">${r2(d.d, 1)}</td><td data-v="${d.d2}"${flag(Math.abs(d.d) >= n / 2 ? 2 : Math.abs(d.d) >= n / 4 ? 1 : 0)}>${r2(d.d2, 2)}</td></tr>`).join("")}</tbody>
      <tfoot><tr class="stx-sum"><td colspan="6">Σd²</td><td>${r2(sum, 2)}</td></tr></tfoot></table></div>
      <p class="hint">A correlation doesn't show that one thing causes the other. <a href="https://en.wikipedia.org/wiki/Spearman%27s_rank_correlation_coefficient" target="_blank" rel="noopener">More about Spearman's rank ↗</a></p>`;
    const csv = [["Area", fa.label, "Rank", fb.label, "Rank", "d", "d squared"], ...list.map((d) => [d.r.name, d.x, d.rx, d.y, d.ry, d.d, d.d2]), [],
      ["Sum of d squared", sum], ["n", n], ["rs", +rs.toFixed(4)], ["Result", `${strength} ${dir} correlation, ${sig.text}`], [sig.crit]];
    return { html, csv, name: `spearman-${fa.key}-${fb.key}.csv` };
  }

  // ---------- 3. Chi-squared ----------
  // are the countries that match the filters spread across the groups as you'd expect from the number of countries in each?
  function chi() {
    const gf = W.F[S.group];
    const all = W.pool(), m = new Set(W.matches.map((r) => r.iso3));
    if (!W.lastEval.act.length || m.size === all.length) return { html: `<p>Chi-squared tests whether the areas that match your filters are spread across ${esc(gf.label.toLowerCase())}s as you'd expect by chance.</p><p><b>Add a filter first</b>, for example “Landlocked” or “Fertility rate above 4”.</p>` };
    const grp = (r) => { const v = r[gf.key]; return Array.isArray(v) ? v[0] : v; };
    const tot = d3.rollup(all, (v) => v.length, grp), obs = d3.rollup(all.filter((r) => m.has(r.iso3)), (v) => v.length, grp);
    const keys = (gf.order || [...tot.keys()].sort()).filter((k) => k != null && tot.get(k));
    const N = d3.sum(keys, (k) => tot.get(k)), M = d3.sum(keys, (k) => obs.get(k) || 0);
    const rows = keys.map((k) => { const O = obs.get(k) || 0, E = (M * tot.get(k)) / N; return { k, n: tot.get(k), O, E, c: (O - E) ** 2 / E }; });
    const x2 = d3.sum(rows, (r) => r.c), df = rows.length - 1, crit = CHI_CRIT[df];
    const lowE = rows.filter((r) => r.E < 5).length;
    const sig = crit ? (x2 >= crit[1] ? "significant at the 0.01 level (99% confidence)" : x2 >= crit[0] ? "significant at the 0.05 level (95% confidence)" : "not significant: the spread could be down to chance") : "";
    const html = `<div class="stx-res ${crit && x2 >= crit[0] ? "ok" : "no"}"><b>χ² = ${r2(x2, 2)}</b> with ${df} degrees of freedom ${info("Degrees of freedom = number of groups − 1. Compare χ² with the critical value for that number: if χ² is bigger, the pattern is significant.")}: ${sig}.
        <small>${crit ? `Critical values: ${crit[0]} (0.05), ${crit[1]} (0.01).` : ""}</small></div>
      <p class="stx-formula">${info("Chi-squared compares what you see (O, observed: the matching areas in each group) with what you'd expect (E) if they were spread out in proportion to the size of each group. The bigger the gaps, the bigger χ² and the less likely the pattern is down to chance.")} χ² = Σ <span class="frac"><span>(O − E)²</span><span>E</span></span>, where E = ${M} matching areas × (areas in the group ÷ ${N})</p>
      <p class="hint">Null hypothesis: the ${M} matching areas are spread across the groups in proportion to the number of areas in each.${lowE ? ` <b>Careful:</b> ${lowE} group${lowE > 1 ? "s have" : " has"} an expected value under 5, which makes the test less reliable. Try fewer, bigger groups.` : ""}</p>
      <p class="stx-hint">Click a heading to sort. Amber and red: the groups that add most to χ².</p>
      <table class="stx-t stx-wide stx-num stx-sort"><thead><tr><th>${esc(gf.label)}</th><th>All areas</th><th>Observed (O) ${info("How many of the matching areas are in this group.")}</th><th>Expected (E) ${info("How many you'd expect if the matching areas were spread in proportion to the size of each group.")}</th><th>O − E ${info("Positive: more than expected. Negative: fewer.")}</th><th>(O − E)² ÷ E</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${esc(r.k)}</td><td data-v="${r.n}">${r.n}</td><td data-v="${r.O}">${r.O}</td><td data-v="${r.E}">${r2(r.E, 2)}</td><td data-v="${r.O - r.E}">${r2(r.O - r.E, 2)}</td><td data-v="${r.c}"${flag(r.c >= 6.635 ? 2 : r.c >= 3.841 ? 1 : 0)}>${r2(r.c, 3)}</td></tr>`).join("")}</tbody>
      <tfoot><tr class="stx-sum"><td colspan="5">χ²</td><td>${r2(x2, 3)}</td></tr></tfoot></table>
      <p class="hint">Which groups have many more (or fewer) than expected? They're the ones to explain.</p>`;
    const csv = [[gf.label, "All areas", "Observed", "Expected", "O-E", "(O-E)^2/E"], ...rows.map((r) => [r.k, r.n, r.O, +r.E.toFixed(3), +(r.O - r.E).toFixed(3), +r.c.toFixed(4)]), [], ["Chi-squared", +x2.toFixed(4)], ["Degrees of freedom", df], ["Result", sig]];
    return { html, csv, name: `chi-squared-${gf.key}.csv` };
  }

  // ---------- 4. Lorenz curve and Gini ----------
  function lorenz() {
    const f = W.F[S.lor];
    const perPerson = /per person|per capita|_per_capita|per head/i.test(f.label + " " + f.key + " " + (f.unit || ""));
    const weight = S.weight && perPerson;
    let rows = W.matches.filter((r) => typeof r[f.key] === "number" && r[f.key] >= 0 && (!weight || r.population > 0))
      .map((r) => ({ r, v: r[f.key], w: weight ? r.population : 1 }));
    if (rows.length < 5) return { html: `<p>Not enough areas with data on ${esc(f.label)}.</p>` };
    rows.sort((a, b) => a.v - b.v);
    const Wt = d3.sum(rows, (d) => d.w), T = d3.sum(rows, (d) => d.v * d.w);
    let cw = 0, ct = 0; const pts = [[0, 0]];
    rows.forEach((d) => { cw += d.w; ct += d.v * d.w; d.cx = cw / Wt; d.cy = ct / T; pts.push([d.cx, d.cy]); });
    let g = 0; for (let i = 1; i < pts.length; i++) g += (pts[i][0] - pts[i - 1][0]) * (pts[i][1] + pts[i - 1][1]);
    const gini = 1 - g;
    const at = (p) => { const i = pts.findIndex((q) => q[0] >= p); if (i <= 0) return 0; const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + ((p - x0) / (x1 - x0)) * (y1 - y0); };
    const bottomHalf = at(0.5), top10 = 1 - at(0.9);
    const unitW = weight ? "people" : "areas";
    const Sz = 300, P = 34, sx = (v) => P + v * (Sz - P - 8), sy = (v) => Sz - P - v * (Sz - P - 8);
    const svg = `<svg class="stx-svg" viewBox="-14 0 ${Sz + 34} ${Sz}" role="img" aria-label="Lorenz curve">
      <text transform="translate(-4 ${sy(0.5)}) rotate(-90)" font-size="10.5" text-anchor="middle" fill="var(--ink)">Share of total ${esc(lc(f.short || f.label).replace(/ ?(per person|\/person)$/i, ""))}</text>
      <path d="M${sx(0)},${sy(0)} ${pts.map((p) => `L${sx(p[0])},${sy(p[1])}`).join(" ")} L${sx(1)},${sy(1)} Z" fill="color-mix(in srgb, var(--match) 30%, transparent)"/>
      <line x1="${sx(0)}" y1="${sy(0)}" x2="${sx(1)}" y2="${sy(1)}" stroke="var(--muted)" stroke-dasharray="4 3"/>
      <path d="M${pts.map((p) => `${sx(p[0])},${sy(p[1])}`).join(" L")}" fill="none" stroke="var(--accent)" stroke-width="2"/>
      <rect x="${sx(0)}" y="${sy(1)}" width="${sx(1) - sx(0)}" height="${sy(0) - sy(1)}" fill="none" stroke="var(--ink)" stroke-width=".8"/>
      ${[0, 0.25, 0.5, 0.75, 1].map((t) => `<text x="${sx(t)}" y="${Sz - P + 15}" font-size="10" text-anchor="middle" fill="var(--muted)">${t * 100}%</text><text x="${P - 5}" y="${sy(t) + 3}" font-size="10" text-anchor="end" fill="var(--muted)">${t * 100}%</text>`).join("")}
      <text x="${sx(0.5)}" y="${Sz - 3}" font-size="10.5" text-anchor="middle" fill="var(--ink)">Share of ${unitW} (poorest first)</text>
      <text x="${sx(0.62)}" y="${sy(0.55)}" font-size="10" fill="var(--muted)" transform="rotate(-45 ${sx(0.62)} ${sy(0.55)})">line of equality</text>
    </svg>`;
    const html = `<div class="stx-res"><b>Gini coefficient = ${r2(gini, 3)}</b> ${info("The Gini coefficient measures how unevenly something is shared. 0: every area has the same. 1: one area has all of it. Below 0.3 is fairly even; above 0.5 is very uneven.")} (0 = everyone the same, 1 = one ${weight ? "person" : "area"} has it all).
        <small>The ${weight ? "half of the UK's people in the lowest areas" : "bottom half of areas"} have ${r2(bottomHalf * 100, 1)}% of the total; the top 10% have ${r2(top10 * 100, 1)}%.</small></div>
      <div class="stx-two">${svg}<div><p class="hint">The further the curve sags below the line of equality, the more unequal the share. The Gini coefficient is the shaded area ÷ the whole triangle under the line.</p>
      ${perPerson ? `<label class="tog"><input type="checkbox" id="stxW" ${S.weight ? "checked" : ""}> Weight by population (each person counts, not each area)</label>` : `<p class="hint">Each area counts once.</p>`}
      <p class="hint">This compares ${weight ? "areas' averages, weighted by population" : "areas"}: it doesn't show inequality <i>inside</i> areas (for that, look at each area's own Gini index).</p></div></div>`;
    const csv = [["Area", f.label, weight ? "Population" : "Weight", "Cumulative share of " + unitW, "Cumulative share of total"], ...rows.map((d) => [d.r.name, d.v, d.w, +d.cx.toFixed(5), +d.cy.toFixed(5)]), [], ["Gini coefficient", +gini.toFixed(4)]];
    return { html, csv, name: `lorenz-${f.key}.csv` };
  }

  // ---------- Panel ----------
  const TABS = [["summary", "Summary & spread"], ["spearman", "Spearman's rank"], ["chi", "Chi-squared"], ["lorenz", "Lorenz & Gini"]];
  function controls() {
    if (S.tab === "summary") return `<label class="fld">Measure ${pick("stxA", S.a)}</label>`;
    if (S.tab === "spearman") return `<label class="fld">First measure ${pick("stxA", S.a)}</label><label class="fld">Second measure ${pick("stxB", S.b)}</label>
      <label class="fld">Areas <select id="stxSample" class="stx-sel"><option value="all" ${S.sample === "all" ? "selected" : ""}>All on the map</option><option value="random" ${S.sample === "random" ? "selected" : ""}>A random sample</option><option value="top" ${S.sample === "top" ? "selected" : ""}>The top ones (first measure)</option></select></label>
      ${S.sample !== "all" ? `<label class="fld">How many <select id="stxN" class="stx-sel">${[10, 12, 15, 20, 25, 30].map((n) => `<option ${n === S.n ? "selected" : ""}>${n}</option>`).join("")}</select></label>${S.sample === "random" ? `<button type="button" class="ghost" id="stxRe">New sample</button>` : ""}` : ""}`;
    if (S.tab === "chi") {
      const cats = W.FILTERS.filter((f) => f.type === "cat" && !f.target && !f.hidden && (f.order || f.options || []).length >= 2 && (f.order || f.options || []).length <= 8);
      return `<label class="fld">Groups <select id="stxG" class="stx-sel">${cats.map((f) => `<option value="${f.key}" ${f.key === S.group ? "selected" : ""}>${esc(f.label)}</option>`).join("")}</select></label>`;
    }
    return `<label class="fld">Measure ${pick("stxL", S.lor)}</label>`;
  }
  function render() {
    const el = $("#stxCard"); if (!el || el.hidden) return;
    S.a = W.F[S.a] ? S.a : defaultA(); S.b = W.F[S.b] ? S.b : defaultB(S.a); S.lor = W.F[S.lor] ? S.lor : (W.F.gdp_per_capita ? "gdp_per_capita" : S.a);
    const res = { summary, spearman, chi, lorenz }[S.tab]();
    el.innerHTML = `<div class="dsc-head"><h2>📊 Statistics</h2><button type="button" class="iconbtn" id="stxX" aria-label="Close">×</button></div>
      <p class="hint stx-scope">Using the ${esc(scope())}. Change the filters to change the areas.</p>
      <div class="seg stx-tabs" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" data-t="${k}" aria-selected="${S.tab === k}">${l}</button>`).join("")}</div>
      <div class="stx-ctl">${controls()}</div>
      <div class="stx-body">${res.html}</div>
      ${res.csv ? `<div class="dsc-row"><button type="button" class="ghost" id="stxCsv">Download the working (CSV, opens in Excel)</button></div>` : ""}`;
    $("#stxX").onclick = close;
    el.querySelectorAll(".stx-tabs button").forEach((b) => (b.onclick = () => { S.tab = b.dataset.t; render(); }));
    const on = (id, fn) => { const x = $("#" + id); if (x) x.onchange = (e) => { fn(e.target); render(); }; };
    on("stxA", (t) => { S.a = t.value; if (S.b === S.a) S.b = defaultB(S.a); });
    on("stxB", (t) => (S.b = t.value));
    on("stxL", (t) => (S.lor = t.value));
    on("stxG", (t) => (S.group = t.value));
    on("stxSample", (t) => (S.sample = t.value));
    on("stxN", (t) => (S.n = +t.value));
    on("stxW", (t) => (S.weight = t.checked));
    if ($("#stxRe")) $("#stxRe").onclick = () => { S.seed++; render(); };
    sortable(el);
    if ($("#stxCsv")) $("#stxCsv").onclick = () => csvDl(res.csv.concat([[], [window.WV?.currentSource?.() || ""]]), res.name);
  }
  // click a column heading to sort by it (again to reverse)
  function sortable(root) {
    root.querySelectorAll("table.stx-sort").forEach((t) => {
      const ths = [...t.querySelectorAll("thead th")], body = t.tBodies[0];
      ths.forEach((th, i) => {
        th.classList.add("stx-sh"); th.tabIndex = 0; th.title = "Sort by this column";
        const go = (e) => {
          if (e.target.closest(".stx-i")) return;
          const dir = th.dataset.dir === "desc" ? "asc" : "desc";
          ths.forEach((h) => { delete h.dataset.dir; });
          th.dataset.dir = dir;
          const val = (tr) => { const td = tr.cells[i]; return td.dataset.v != null ? +td.dataset.v : td.textContent.trim(); };
          const rows = [...body.rows].sort((a, b) => { const x = val(a), y = val(b); const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y)); return dir === "asc" ? c : -c; });
          rows.forEach((r) => body.appendChild(r));
        };
        th.onclick = go; th.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(e); } };
      });
    });
  }
  // the (i) explanations
  let tipEl = null;
  function showTip(b) {
    if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "stx-tip"; tipEl.setAttribute("role", "tooltip"); document.body.appendChild(tipEl); }
    tipEl.textContent = b.dataset.tip; tipEl.hidden = false;
    const r = b.getBoundingClientRect(), w = Math.min(300, window.innerWidth - 16);
    tipEl.style.width = w + "px";
    tipEl.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px";
    const h = tipEl.offsetHeight;
    tipEl.style.top = (r.bottom + h + 8 < window.innerHeight ? r.bottom + 6 : r.top - h - 6) + "px";
  }
  const hideTip = () => { if (tipEl) tipEl.hidden = true; };
  document.addEventListener("mouseover", (e) => { const b = e.target.closest?.(".stx-i"); if (b) showTip(b); else if (tipEl && !tipEl.hidden && !e.target.closest?.(".stx-tip")) hideTip(); });
  document.addEventListener("focusin", (e) => { const b = e.target.closest?.(".stx-i"); if (b) showTip(b); });
  document.addEventListener("click", (e) => { const b = e.target.closest?.(".stx-i"); if (b) { e.stopPropagation(); showTip(b); } else hideTip(); }, true);
  document.addEventListener("scroll", hideTip, true);

  function open(tab) {
    let el = $("#stxCard");
    if (!el) { el = document.createElement("div"); el.id = "stxCard"; el.className = "card dsc stx"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Statistics"); document.body.appendChild(el); }
    if (typeof tab === "string") S.tab = tab;
    el.hidden = false; render();
  }
  function close() { const el = $("#stxCard"); if (el) el.hidden = true; }
  function init() {
    W = window.WC;
    const tools = $("#cpLearn");
    if (tools) {
      const b = document.createElement("button");
      b.type = "button"; b.id = "stxBtn"; b.className = "cp-tool"; b.title = "Summary statistics, Spearman's rank, chi-squared, Lorenz curve: worked through with the areas on the map";
      b.innerHTML = `<span class="cp-ic" aria-hidden="true">📊</span>Statistics`;
      b.onclick = () => open();
      const d = $("#dscBtn"); d ? d.after(b) : tools.prepend(b);
    }
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  }
  window.WST = { init, open, refresh: render, _t: { rankDesc, SP_CRIT, normP2 } };
})();
