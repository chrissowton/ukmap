/* Which Countries? — country factfiles: a print-ready summary of every measure for one country,
   compared with its continent and the world. Print / save as PDF, or download as a Word file. */
(function () {
  "use strict";

  // Document colours are fixed (light) so factfiles look the same whatever theme the viewer uses
  const INK = "#15232a", MUTED = "#5a6b73", LINE = "#d3dce0", LAND = "#dde4e7", OCEAN = "#eef3f5", ACCENT = "#0d5f70", WARM = "#e39508";
  const GROUP_COLOURS = {
    Development: "#3463c9", Population: "#0e8f83", Health: "#c93a57", Gender: "#8547c7", "Work & money": "#a86a0c",
    Trade: "#2a7f8f", "Global links": "#1f7fb8", Refugees: "#cc5a17", Cities: "#4c55c9", Culture: "#b23e8e",
    Tourism: "#c2407a", Technology: "#5b4fd1", Politics: "#5d6478", "UN & treaties": "#2f7a52", Military: "#7d5d3b",
    Sport: "#a88300", Geography: "#4f7590", Climate: "#d0582e", "Energy & resources": "#8a6a16", Environment: "#3c8a22", SDGs: "#19689c",
  };
  const REGION_NAME = { Americas: "Americas", Africa: "Africa", Asia: "Asia", Europe: "Europe", Oceania: "Oceania" };
  const DOCX_URL = (window.SITE && window.SITE.docxUrl) || "https://cdn.jsdelivr.net/npm/docx@9.5.1/dist/index.iife.js";
  const $ = (s) => document.querySelector(s);
  let currentIso = null;

  // ---------- Comparisons ----------
  // Medians, not averages: a few very large or very small countries pull averages a long way.
  const statCache = new Map();
  function stats(f) {
    if (statCache.has(f.key)) return statCache.get(f.key);
    const { rows, latest } = window.WC;
    const pts = rows.filter((r) => r.sovereign).map((r) => ({ r, v: latest(r, f.key) })).filter((p) => typeof p.v === "number");
    const sorted = pts.map((p) => p.v).sort((a, b) => a - b);
    const byRegion = {};
    pts.forEach((p) => (byRegion[p.r.region] ||= []).push(p.v));
    const regionMedian = {};
    for (const [reg, vs] of Object.entries(byRegion)) if (vs.length >= 3) regionMedian[reg] = d3.median(vs);
    const st = { n: sorted.length, sorted, median: d3.median(sorted), min: sorted[0], max: sorted[sorted.length - 1], regionMedian };
    statCache.set(f.key, st);
    return st;
  }
  function rankOf(f, v) {
    const st = stats(f);
    if (typeof v !== "number" || !st.n) return null;
    return st.sorted.filter((x) => x > v).length + 1;
  }
  const ordinal = (n) => n + (["th", "st", "nd", "rd"][((n % 100) - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");

  // UNDP publishes its own world rankings for these; use them so the factfile matches UNDP
  const OFFICIAL_RANK = { hdi: "hdi_rank" };

  // ---------- Which measures go in ----------
  function measuresFor(group) {
    const { FILTERS } = window.WC;
    return FILTERS.filter((f) => f.group === group && !f.hidden && !f.target);
  }
  function factValue(f, r) {
    const { latest } = window.WC;
    const v = latest(r, f.key);
    if (f.type === "bool") return v == null ? null : v ? "Yes" : "No";
    if (Array.isArray(v)) return v.length ? v.join(", ") : "None";
    return v ?? null;
  }
  function tableRows(group, r) {
    const { fmtShort, latest, latestYear, UNITS } = window.WC;
    const out = [], missing = [];
    for (const f of measuresFor(group)) {
      if (f.type !== "range") continue;
      const v = latest(r, f.key);
      if (typeof v !== "number") { missing.push(f.label); continue; }
      const st = stats(f);
      const regMed = st.regionMedian[r.region];
      const isRank = f.format === "rank";
      const unit = (UNITS[f.format] || "").trim();
      out.push({
        f, v, unit,
        value: fmtShort(f, v),
        year: String(latestYear(r, f) || ""),
        rank: isRank ? "" : OFFICIAL_RANK[f.key] && r[OFFICIAL_RANK[f.key]] ? r[OFFICIAL_RANK[f.key]] : rankOf(f, v),
        n: OFFICIAL_RANK[f.key] && r[OFFICIAL_RANK[f.key]] ? d3.max(window.WC.rows, (x) => x[OFFICIAL_RANK[f.key]]) : st.n,
        // a median of world ranks means nothing, so leave those blank
        regMed: regMed == null || isRank ? "" : fmtShort(f, regMed),
        worldMed: st.median == null || isRank ? "" : fmtShort(f, st.median),
        regMedRaw: isRank ? null : regMed, worldMedRaw: isRank ? null : st.median,
      });
    }
    return { out, missing };
  }
  function facts(group, r) {
    return measuresFor(group).filter((f) => f.type !== "range")
      .map((f) => [f.label, factValue(f, r)]).filter(([, v]) => v != null && v !== "");
  }

  // ---------- Maps ----------
  function polygonsOf(feature) {
    const g = feature.geometry;
    return g.type === "MultiPolygon" ? g.coordinates.map((c) => ({ type: "Polygon", coordinates: c })) : [g];
  }
  function outlineMap(iso, w, h) {
    const { geo, byIso, cities } = window.WC;
    const mine = geo.filter((d) => d.rec && d.rec.iso3 === iso);
    const r = byIso.get(iso);
    let polys = mine.flatMap(polygonsOf);
    let centre;
    if (polys.length) {
      const main = polys.reduce((a, b) => (d3.geoArea(b) > d3.geoArea(a) ? b : a));
      centre = d3.geoCentroid(main);
      // leave out far-away islands and territories so the main shape fills the map
      polys = polys.filter((p) => d3.geoDistance(d3.geoCentroid(p), centre) < 0.32);
    } else {
      centre = r.latlng && r.latlng.length === 2 ? [r.latlng[1], r.latlng[0]] : [0, 0];
    }
    const minView = d3.geoCircle().center(centre).radius(1.2)();
    const projection = d3.geoAzimuthalEqualArea().rotate([-centre[0], -centre[1]]).clipAngle(90)
      .fitExtent([[16, 16], [w - 16, h - 16]], { type: "FeatureCollection", features: [...polys.map((p) => ({ type: "Feature", geometry: p })), { type: "Feature", geometry: minView }] });
    const path = d3.geoPath(projection);
    const grat = d3.geoGraticule().step([5, 5])();
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="IBM Plex Sans, Arial, sans-serif">
      <defs><clipPath id="ffclip"><rect width="${w}" height="${h}" rx="8"/></clipPath></defs>
      <g clip-path="url(#ffclip)"><rect width="${w}" height="${h}" fill="${OCEAN}"/>
      <path d="${path(grat) || ""}" fill="none" stroke="#d6e1e6" stroke-width="0.6"/>`;
    for (const d of geo) {
      const p = path(d);
      if (!p || (d.rec && d.rec.iso3 === iso)) continue;
      svg += `<path d="${p}" fill="${LAND}" stroke="#ffffff" stroke-width="0.8"/>`;
    }
    for (const d of mine) svg += `<path d="${path(d) || ""}" fill="${ACCENT}" stroke="#ffffff" stroke-width="0.8"/>`;
    // countries too small to show on the map get a ring instead
    if (!polys.length || d3.sum(polys, (p) => path.area(p)) < 60) {
      const c = projection(centre);
      if (c) svg += `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="14" fill="${ACCENT}" fill-opacity=".18" stroke="${ACCENT}" stroke-width="2.5"/>`;
    }
    // neighbour names
    const placed = [];
    const clear = (x, y, tw) => !placed.some(([a, b, c]) => Math.abs(a - x) < (c + tw) / 2 + 4 && Math.abs(b - y) < 13);
    for (const [niso] of r.borders_list || []) {
      const nf = geo.filter((d) => d.rec && d.rec.iso3 === niso).flatMap(polygonsOf);
      if (!nf.length) continue;
      const big = nf.reduce((a, b) => (path.area(b) > path.area(a) ? b : a));
      const [x, y] = path.centroid(big);
      const name = byIso.get(niso).name, tw = name.length * 5.6;
      if (Number.isNaN(x) || x < tw / 2 || x > w - tw / 2 || y < 12 || y > h - 8 || !clear(x, y, tw)) continue;
      placed.push([x, y, tw]);
      svg += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-size="10" fill="${MUTED}" font-style="italic">${escX(name)}</text>`;
    }
    // capital and largest cities
    const cs = cities.filter((c) => c.iso3 === iso);
    const pick = [...cs.filter((c) => c.city_capital).slice(0, 1), ...cs.filter((c) => !c.city_capital).slice(0, 4)];
    const boxes = placed.map(([x, y, tw]) => [x - tw / 2, y - 9, x + tw / 2, y + 4]);
    for (const c of pick) {
      const pt = projection([c.lon, c.lat]);
      if (!pt || pt[0] < 4 || pt[0] > w - 4 || pt[1] < 4 || pt[1] > h - 4) continue;
      const tw = c.name.length * (c.city_capital ? 6.6 : 6);
      let left = pt[0] + tw + 10 > w;
      const box = (l) => (l ? [pt[0] - 8 - tw, pt[1] - 7, pt[0] - 6, pt[1] + 6] : [pt[0] + 6, pt[1] - 7, pt[0] + 8 + tw, pt[1] + 6]);
      const hits = (b) => boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
      let showLabel = true;
      if (hits(box(left))) { if (!hits(box(!left)) && (left ? pt[0] + tw + 10 <= w : pt[0] - tw - 10 >= 0)) left = !left; else showLabel = c.city_capital; }
      if (showLabel) boxes.push(box(left));
      svg += c.city_capital
        ? `<rect x="${(pt[0] - 4).toFixed(1)}" y="${(pt[1] - 4).toFixed(1)}" width="8" height="8" fill="#ffffff" stroke="${INK}" stroke-width="1.6"/>`
        : `<circle cx="${pt[0].toFixed(1)}" cy="${pt[1].toFixed(1)}" r="3" fill="#ffffff" stroke="${INK}" stroke-width="1.3"/>`;
      if (showLabel) svg += `<text x="${(pt[0] + (left ? -7 : 7)).toFixed(1)}" y="${(pt[1] + 3.5).toFixed(1)}" text-anchor="${left ? "end" : "start"}" font-size="${c.city_capital ? 11.5 : 10}" font-weight="${c.city_capital ? 700 : 500}" fill="${INK}" stroke="#ffffff" stroke-width="3" paint-order="stroke">${escX(c.name)}</text>`;
    }
    svg += `</g><rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="8" fill="none" stroke="${LINE}"/></svg>`;
    return svg;
  }
  function locatorMap(iso, w, h) {
    const { geo, byIso } = window.WC;
    const projection = d3.geoEqualEarth().fitExtent([[4, 4], [w - 4, h - 4]], { type: "Sphere" });
    const path = d3.geoPath(projection);
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
      <path d="${path({ type: "Sphere" })}" fill="${OCEAN}" stroke="${LINE}"/>`;
    for (const d of geo) svg += `<path d="${path(d) || ""}" fill="${d.rec && d.rec.iso3 === iso ? ACCENT : LAND}" stroke="none"/>`;
    const r = byIso.get(iso);
    const mine = geo.filter((d) => d.rec && d.rec.iso3 === iso).flatMap(polygonsOf);
    const c = mine.length ? d3.geoCentroid(mine.reduce((a, b) => (d3.geoArea(b) > d3.geoArea(a) ? b : a))) : r.latlng ? [r.latlng[1], r.latlng[0]] : null;
    const pt = c && projection(c);
    if (pt) svg += `<circle cx="${pt[0].toFixed(1)}" cy="${pt[1].toFixed(1)}" r="7" fill="none" stroke="${WARM}" stroke-width="2"/>`;
    return svg + `</svg>`;
  }
  function strip(f, row, colour) {
    const st = stats(f);
    const W = 104, H = 14;
    let lo = st.min, hi = st.max;
    const log = f.scale === "log" && lo > 0;
    if (f.scale === "log" && !(lo > 0)) lo = st.sorted.find((x) => x > 0) || 1;
    const t = (v) => (log ? Math.log10(Math.max(v, lo)) : v);
    const x = (v) => (hi === lo ? W / 2 : 4 + ((t(v) - t(lo)) / (t(hi) - t(lo))) * (W - 8));
    const cx = (v) => Math.min(W - 4, Math.max(4, x(v))).toFixed(1);
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
      <line x1="4" y1="7" x2="${W - 4}" y2="7" stroke="${LINE}" stroke-width="2" stroke-linecap="round"/>
      ${row.worldMedRaw != null ? `<line x1="${cx(row.worldMedRaw)}" y1="2" x2="${cx(row.worldMedRaw)}" y2="12" stroke="${MUTED}" stroke-width="1.6"/>` : ""}
      ${row.regMedRaw != null ? `<line x1="${cx(row.regMedRaw)}" y1="3.5" x2="${cx(row.regMedRaw)}" y2="10.5" stroke="${colour}" stroke-width="1.6" stroke-opacity=".55"/>` : ""}
      <circle cx="${cx(row.v)}" cy="7" r="4.2" fill="${colour}" stroke="#ffffff" stroke-width="1.2"/></svg>`;
  }
  const escX = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---------- The document ----------
  function keyFacts(r) {
    const { byIso, F, fmt, latest, cities } = window.WC;
    const cs = cities.filter((c) => c.iso3 === r.iso3);
    const cap = cs.find((c) => c.city_capital), big = cs[0];
    const nb = r.borders_list || [];
    const hdi = latest(r, "hdi"), hdiRank = r.hdi_rank;
    const list = [
      ["Capital", r.capital || "—"],
      big && (!cap || big.name !== cap.name) ? ["Largest city", big.name] : null,
      ["Continent", `${r.region}${r.subregion ? ` (${r.subregion})` : ""}`],
      ["Area", r.area_km2 ? d3.format(",")(Math.round(r.area_km2)) + " km²" : null],
      ["Population", latest(r, "population") ? d3.format(",")(latest(r, "population")) : null],
      ["Official languages", (r.official_languages || []).join(", ") || null],
      ["Currency", (r.currencies || []).join(", ") || null],
      ["Government", latest(r, "regime") || null],
      ["Income group", r.income_group || null],
      ["Human Development Index", hdi != null ? `${hdi.toFixed(3)}${hdiRank ? ` (${ordinal(hdiRank)} in the world)` : ""}` : null],
      ["Main climate", r.main_climate || null],
      ["Neighbours", nb.length ? nb.map(([i]) => byIso.get(i)?.name || i).join(", ") : "None (no land borders)"],
      ["Member of", (r.groups || []).join(", ") || null],
      ["Drives on the", r.driving_side ? r.driving_side.toLowerCase() : null],
    ].filter((x) => x && x[1]);
    void F; void fmt;
    return list;
  }
  function glance(r) {
    const { F, fmt, latest } = window.WC;
    return ["population", "gdp_per_capita", "life_expectancy", "hdi", "urban_pct", "co2_per_capita"].map((k) => {
      const f = F[k], v = latest(r, k);
      if (!f || typeof v !== "number") return null;
      const st = stats(f);
      // the HDI tile uses UNDP's own world ranking, as in the key facts
      const official = k === "hdi" && r.hdi_rank;
      const maxRank = official ? d3.max(window.WC.rows, (x) => x.hdi_rank) : null;
      return { label: f.label, value: fmt(f, v), med: st.median != null ? fmt(f, st.median) : "", rank: official ? r.hdi_rank : rankOf(f, v), n: official ? maxRank : st.n };
    }).filter(Boolean);
  }
  function extras(r) {
    const { byIso, cities, flows } = window.WC;
    const out = [];
    const name = (i) => byIso.get(i)?.name || i;
    const nb = r.borders_list || [];
    if (nb.length) out.push({ title: "Land borders", colour: GROUP_COLOURS.Geography, note: `About ${d3.format(",")(r.border_km)} km in total, measured on the map (approximate).`, rows: nb.map(([i, km]) => [name(i), d3.format(",")(km) + " km"]) });
    const cs = cities.filter((c) => c.iso3 === r.iso3).slice(0, 8);
    if (cs.length) out.push({ title: "Largest cities", colour: GROUP_COLOURS.Cities, note: "People living in the city itself, not its suburbs.", rows: cs.map((c) => [c.name + (c.city_capital ? " (capital)" : ""), d3.format(",")(c.city_population)]) });
    if ((r.climate_list || []).length) out.push({ title: "Climate zones", colour: GROUP_COLOURS.Climate, note: "Share of land in each Köppen climate zone (1976–2000 climate).", rows: r.climate_list.map(([n, p]) => [n, p + "%"]) });
    if ((r.minerals_list || []).length) out.push({ title: "Mining", colour: GROUP_COLOURS["Energy & resources"], note: "Share of world mine production, 2025 estimates (USGS).", rows: r.minerals_list.map(([m, p]) => [m.charAt(0).toUpperCase() + m.slice(1), p < 1 ? "under 1%" : Math.round(p) + "%"]) });
    const inn = flows.filter((f) => f[1] === r.iso3).sort((a, b) => b[2] - a[2]).slice(0, 6);
    const outF = flows.filter((f) => f[0] === r.iso3).sort((a, b) => b[2] - a[2]).slice(0, 6);
    if (inn.length) out.push({ title: "Refugees hosted: where they come from", colour: GROUP_COLOURS.Refugees, note: "Largest groups, end of 2025 (UNHCR).", rows: inn.map((f) => [name(f[0]), d3.format(",")(f[2])]) });
    if (outF.length) out.push({ title: "Refugees from here: where they live", colour: GROUP_COLOURS.Refugees, note: "Largest groups, end of 2025 (UNHCR).", rows: outF.map((f) => [name(f[1]), d3.format(",")(f[2])]) });
    const tj = r.treaties_joined;
    if (tj) {
      const all = window.WC.F.treaties_joined.options;
      out.push({ title: "UN treaties", colour: GROUP_COLOURS["UN & treaties"], note: "Joined (ratified or acceded) as of October 2026.", rows: all.map((t) => [t, tj.includes(t) ? "✓ Joined" : "✗ Not joined"]) });
    }
    return out;
  }

  // ---------- Changes over time and population structure (charts drawn by views.js) ----------
  const TREND_KEYS = ["population", "life_expectancy", "fertility", "gdp_per_capita", "hdi", "urban_pct", "co2_per_capita", "internet"];
  const LINE_COLOURS = { ink: INK, muted: MUTED, line: LINE, accent: ACCENT, region: "#8a4b00" };
  const PYR_COLOURS = { ink: INK, muted: MUTED, line: LINE, male: "#2a78d6", female: "#eb6834" };
  function trendCards(r) {
    const { F, TS, TS_YEARS, fmtShort } = window.WC;
    if (!window.WV) return [];
    return TREND_KEYS.map((k) => {
      const f = F[k], s = TS[k]?.[r.iso3];
      if (!f || !s) return null;
      const svg = window.WV.lineChartSVG(r.iso3, k, { w: 240, h: 118, colours: LINE_COLOURS, fs: 9, l: 38 });
      if (!svg) return null;
      const idx = s.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0);
      const a = idx[0], b = idx[idx.length - 1];
      return { f, svg, from: `${TS_YEARS[a]}: ${fmtShort(f, s[a])}`, to: `${TS_YEARS[b]}: ${fmtShort(f, s[b])}` };
    }).filter(Boolean);
  }
  function pyramidInfo(r) {
    const P = window.WV?.pyramids;
    const d = P?.data?.[r.iso3];
    if (!d) return null;
    const yrs = Object.keys(d).map(Number).sort((x, y) => x - y);
    const latest = yrs[yrs.length - 1];
    const base = yrs.includes(1990) && latest - 1990 >= 15 ? 1990 : yrs[0];
    return { latest, base, svg: window.WV.pyramidSVG(d[latest], P.ages, { w: 300, h: 220, compare: base !== latest ? d[base] : null, colours: PYR_COLOURS }) };
  }
  function popFacts(r) {
    const { F, fmt, latest } = window.WC;
    const out = [];
    const dtm = latest(r, "dtm_stage");
    if (dtm) out.push(["Demographic transition", dtm]);
    ["birth_rate", "death_rate", "natural_increase", "median_age", "pct_under15", "pct_over65"].forEach((k) => {
      const v = latest(r, k);
      if (typeof v === "number" && F[k]) out.push([F[k].label, fmt(F[k], v)]);
    });
    return out;
  }
  function changesHTML(r) {
    const { esc } = window.WC;
    const cards = trendCards(r), pyr = pyramidInfo(r), pf = popFacts(r);
    if (!cards.length && !pyr) return "";
    let h = `<h2 class="ff-theme">Changes over time</h2>`;
    if (cards.length) h += `<section class="ff-trends"><div class="ff-tgrid">${cards.map((c) => `<figure><figcaption><b>${esc(c.f.label)}</b><span>${esc(c.from)} → ${esc(c.to)}</span></figcaption>${c.svg}</figure>`).join("")}</div>
      <p class="ff-lkey"><span class="lk"><span class="lkl" style="border-color:${ACCENT}"></span>${esc(r.name)}</span><span class="lk"><span class="lkl dash" style="border-color:${MUTED}"></span>World median</span><span class="lk"><span class="lkl dot" style="border-color:#8a4b00"></span>${esc(REGION_NAME[r.region] || r.region)} median</span></p></section>`;
    if (pyr || pf.length) h += `<section class="ff-pop" style="--gc:${GROUP_COLOURS.Population}">${pyr ? `<figure>${pyr.svg}<figcaption>Population by age and sex, ${pyr.latest} (bars)${pyr.base !== pyr.latest ? ` and ${pyr.base} (outline). Each bar is the share of the whole population.` : ""}</figcaption></figure>` : ""}
      <div><h3>Population structure</h3><dl class="ff-facts">${pf.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
      <p class="ff-note">The demographic transition stage is a simple guide worked out from birth and death rates: stage 1 high births and deaths; 2 births high, deaths falling; 3 births falling; 4 both low; 5 more deaths than births.</p></div></section>`;
    return h;
  }

  // ---------- Physical geography ----------
  function physRows(r) {
    const n0 = (v) => d3.format(",")(Math.round(v));
    const out = [];
    const add = (k, v) => { if (v != null && v !== "" && !(Array.isArray(v) && !v.length)) out.push([k, Array.isArray(v) ? v.join(", ") : String(v)]); };
    add("Highest point", r.highest_m != null ? `${r.highest_point ? r.highest_point + ", " : ""}${n0(r.highest_m)} m` : null);
    add("Lowest point", r.lowest_m != null ? `${r.lowest_point ? r.lowest_point + ", " : ""}${n0(r.lowest_m)} m` : null);
    add("Average height", r.mean_elevation_m != null ? `${n0(r.mean_elevation_m)} m` : null);
    add("Coastline", r.coastline_km ? `${n0(r.coastline_km)} km` : r.coastline_km === 0 ? "None (landlocked)" : null);
    add("Coast on", r.seas);
    add("Mountain ranges", r.ranges);
    add("Deserts", r.deserts);
    add("Major rivers", (r.rivers || []).slice(0, 8));
    add("Lakes", (r.lakes || []).slice(0, 6));
    add("Drains into", r.drains_to);
    add("Tectonic plates", r.plates);
    add("Plate boundaries", r.margins);
    add("Volcanoes", r.volcanoes ? `${r.volcanoes}${r.volcanoes_active ? ` (${r.volcanoes_active} erupted since 1900)` : ""}` : null);
    add("Earthquakes since 1900", r.quakes ? `${n0(r.quakes)} of magnitude 6 or more${r.quake_max ? `; largest ${r.quake_max.toFixed(1)} in ${r.quake_max_year}` : ""}` : null);
    add("Biomes", (r.biome_list || []).filter(([, p]) => p >= 5).map(([b, p]) => `${b} ${p}%`));
    add("Ice cover", r.glacier_pct ? `${r.glacier_pct}% of the land` : null);
    add("Land use", r.agri_land_pct != null ? `farmland ${r.agri_land_pct}%, forest ${r.forest_land_pct ?? "?"}%` : null);
    add("Natural hazards", r.hazards);
    return out;
  }
  function physHTML(r) {
    const { esc } = window.WC;
    const rows = physRows(r);
    if (!rows.length) return "";
    const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
    return `<h2 class="ff-theme">Physical geography</h2><section class="ff-group" style="--gc:${GROUP_COLOURS.Geography}">
      ${r.terrain ? `<p class="ff-terrain"><b>Terrain:</b> ${esc(cap(r.terrain))}.</p>` : ""}
      <dl class="ff-facts ff-phys">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
      ${r.climate_text ? `<p class="ff-terrain"><b>Climate:</b> ${esc(cap(r.climate_text))}.</p>` : ""}
      <p class="ff-missing">Sources: CIA World Factbook, Natural Earth, Smithsonian Global Volcanism Program, USGS, PB2002 plate model. Biomes are worked out from climate zones.</p></section>`;
  }

  function buildHTML(iso) {
    const { byIso, esc, F } = window.WC;
    const r = byIso.get(iso);
    const regionName = REGION_NAME[r.region] || r.region;
    const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const used = new Set();
    let h = `<header class="ff-head">
        <div><div class="ff-eyebrow">Country factfile</div>
        <h1><span class="ff-flag">${r.flag || ""}</span>${esc(r.name)}</h1>
        <p class="ff-sub">${esc([r.capital && "Capital: " + r.capital, r.subregion || r.region].filter(Boolean).join(" · "))}${r.sovereign ? "" : " · Territory or partially recognised state"}</p></div>
        <div class="ff-brand">Which Countries?<span>${today}</span></div>
      </header>
      <section class="ff-top">
        <figure class="ff-map">${outlineMap(iso, 420, 330)}<figcaption>${esc(r.name)} and its neighbours. ■ capital · ● largest cities</figcaption></figure>
        <div class="ff-side">
          <figure class="ff-locator">${locatorMap(iso, 240, 124)}</figure>
          <dl class="ff-keys">${keyFacts(r).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
        </div>
      </section>
      <section class="ff-glance">${glance(r).map((g) => `<div class="ff-tile"><div class="ff-tl">${esc(g.label)}</div><div class="ff-tv">${esc(g.value)}</div><div class="ff-tm">World median ${esc(g.med)}${g.rank ? ` · ${ordinal(g.rank)} of ${g.n}` : ""}</div></div>`).join("")}</section>
      <section class="ff-howto"><b>How to read the tables.</b> <b>Rank</b>: position among ${stats(F.population).n} countries, where 1st is the highest value (not always the best). <b>Median</b>: the middle country, so half are higher and half lower. Medians are used rather than averages because a few very large or very small countries pull averages a long way.
        <span class="ff-legend"><svg viewBox="0 0 120 14" width="120" height="14" aria-hidden="true"><line x1="4" y1="7" x2="116" y2="7" stroke="${LINE}" stroke-width="2"/><line x1="40" y1="2" x2="40" y2="12" stroke="${MUTED}" stroke-width="1.6"/><line x1="64" y1="3.5" x2="64" y2="10.5" stroke="${ACCENT}" stroke-opacity=".55" stroke-width="1.6"/><circle cx="88" cy="7" r="4.2" fill="${ACCENT}"/></svg>
        lowest to highest country · <span class="k k1"></span>world median · <span class="k k2"></span>${esc(regionName)} median · <span class="k k3"></span>${esc(r.name)}</span></section>`;
    for (const t of window.THEMES) {
      if (hidden.has(t.id)) continue;
      let th = "";
      for (const g of t.groups) {
        const fs = facts(g, r);
        const { out, missing } = tableRows(g, r);
        if (!fs.length && !out.length) continue;
        const col = GROUP_COLOURS[g] || ACCENT;
        measuresFor(g).forEach((f) => used.add(f.source));
        th += `<section class="ff-group" style="--gc:${col}"><h3>${esc(g)}</h3>
          ${fs.length ? `<dl class="ff-facts">${fs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}
          ${out.length ? `<table class="ff-table"><thead><tr><th>Measure</th><th class="n">${esc(r.name.length > 14 ? "Value" : r.name)}</th><th>Year</th><th class="n">Rank</th><th class="n">${esc(regionName)} median</th><th class="n">World median</th><th class="pos">Position</th></tr></thead>
            <tbody>${out.map((row) => `<tr><td>${esc(row.f.label)}${row.unit ? ` <span class="u">${esc(row.unit)}</span>` : ""}</td><td class="n v">${esc(row.value)}</td><td class="y">${esc(row.year)}</td><td class="n">${row.rank ? `${ordinal(row.rank)}<small> / ${row.n}</small>` : "—"}</td><td class="n">${esc(row.regMed)}</td><td class="n">${esc(row.worldMed)}</td><td class="pos">${strip(row.f, row, col)}</td></tr>`).join("")}</tbody></table>` : ""}
          ${missing.length ? `<p class="ff-missing">No data: ${esc(missing.join(", "))}.</p>` : ""}
        </section>`;
      }
      if (th) h += `<h2 class="ff-theme">${esc(t.label)}</h2>` + th;
    }
    const ex = hidden.has("extras") ? [] : extras(r);
    if (ex.length) h += `<h2 class="ff-theme">More detail</h2><section class="ff-extras">${ex.map((e) => `<div class="ff-box" style="--gc:${e.colour}"><h4>${esc(e.title)}</h4><table>${e.rows.map(([a, b]) => `<tr><td>${esc(a)}</td><td class="n">${esc(b)}</td></tr>`).join("")}</table><p>${esc(e.note)}</p></div>`).join("")}</section>`;
    if (!hidden.has("changes")) h += changesHTML(r);
    if (!hidden.has("physical")) h += physHTML(r);
    const S = window.SOURCES;
    h += `<footer class="ff-foot"><h4>Sources</h4><p>${[...used, "boundaries"].filter((k) => S[k]).map((k) => `${esc(S[k].name)} (${esc(S[k].licence)})`).join("; ")}.</p>
      <p>Figures are the latest available for each measure; the Year column shows which year. Countries with no data are left out of ranks and medians. Made with Which Countries?, an open-source world map, on ${today}.</p></footer>`;
    return h;
  }

  // ---------- Overlay ----------
  function countryOptions(sel) {
    const { rows } = window.WC;
    const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    const opt = (r) => `<option value="${r.iso3}" ${r.iso3 === sel ? "selected" : ""}>${window.WC.esc(r.name)}</option>`;
    return `<option value="" ${sel ? "" : "selected"} disabled>Choose a country…</option><optgroup label="Countries">${sorted.filter((r) => r.sovereign).map(opt).join("")}</optgroup>
      <optgroup label="Territories and partially recognised states">${sorted.filter((r) => !r.sovereign).map(opt).join("")}</optgroup>`;
  }
  function open(iso) {
    const el = $("#factfile");
    // factfiles always show the latest figures, whatever year the slider is on
    const st = window.WC.state;
    const year = st.year;
    if (year) window.WC.applyYear(null);
    currentIso = iso || null;
    el.hidden = false;
    document.body.classList.add("ff-open");
    el.innerHTML = `<div class="ff-bar">
        <label class="ff-pick">Factfile for <select id="ffSel">${countryOptions(currentIso)}</select></label>
        <div class="ff-actions">
          <button type="button" id="ffPrint" ${currentIso ? "" : "disabled"}>Print or save as PDF</button>
          <button type="button" id="ffWord" ${currentIso ? "" : "disabled"}>Download Word file</button>
          <button type="button" class="ff-close" id="ffClose" aria-label="Close factfile">Close</button>
        </div>
        <p class="ff-msg" id="ffMsg" aria-live="polite"></p>
      </div>
      ${currentIso ? sectionChips() : ""}
      <div class="ff-scroll"><article class="ffdoc" id="ffDoc">${currentIso ? buildHTML(currentIso) : `<div class="ff-empty"><h2>Country factfiles</h2><p>Choose a country above to see every measure on this site for it, compared with its continent and the world, with maps. You can print it, save it as a PDF, or download it as a Word file.</p></div>`}</article></div>`;
    if (year) window.WC.applyYear(year);
    if (currentIso && window.WV && !window.WV.pyramids) {
      const want = currentIso;
      window.WV.loadPyramids().then((p) => { if (p && want === currentIso && !$("#factfile").hidden) open(want); });
    }
    $("#ffSel").onchange = (e) => open(e.target.value);
    el.querySelectorAll(".secchips [data-sec]").forEach((b) => (b.onclick = () => { hidden.has(b.dataset.sec) ? hidden.delete(b.dataset.sec) : hidden.add(b.dataset.sec); const sc = el.querySelector(".ff-scroll").scrollTop; open(currentIso); el.querySelector(".ff-scroll").scrollTop = sc; }));
    el.querySelector(".secchips .allon")?.addEventListener("click", () => { hidden.clear(); open(currentIso); });
    $("#ffClose").onclick = close;
    $("#ffPrint").onclick = printIt;
    $("#ffWord").onclick = () => wordIt().catch((err) => { console.error(err); msg("Sorry, the Word file couldn't be made. Try Print or save as PDF instead."); });
    el.querySelector(".ff-scroll").scrollTop = 0;
  }
  // Sections people can leave out (✕ to remove, + to add back); everything is in to start with
  const hidden = new Set();
  function sectionList() {
    return window.THEMES.map((t) => [t.id, t.label]).concat([["extras", "More detail"], ["changes", "Changes over time"], ["physical", "Physical geography"]]);
  }
  function sectionChips() {
    const esc = window.WC.esc;
    return `<div class="secchips" role="group" aria-label="Sections to include"><span class="sclab">Include:</span>${sectionList().map(([id, label]) => hidden.has(id)
      ? `<button type="button" class="secchip off" data-sec="${id}" title="Add ${esc(label)} back">+ ${esc(label)}</button>`
      : `<button type="button" class="secchip" data-sec="${id}" title="Leave ${esc(label)} out">${esc(label)} <span aria-hidden="true">✕</span></button>`).join("")}${hidden.size ? `<button type="button" class="linkbtn allon">Put everything back</button>` : ""}</div>`;
  }
  function close() {
    $("#factfile").hidden = true;
    document.body.classList.remove("ff-open");
  }
  function msg(t) { const m = $("#ffMsg"); if (m) m.textContent = t; }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#factfile").hidden) close(); });

  function printIt() {
    const r = window.WC.byIso.get(currentIso);
    const old = document.title;
    document.title = `${r.name} factfile`; // becomes the suggested PDF file name
    msg("In the print window, choose “Save as PDF” as the printer to make a PDF.");
    setTimeout(() => { window.print(); document.title = old; }, 50);
  }

  // ---------- Word ----------
  function loadDocx() {
    if (window.docx) return Promise.resolve(window.docx);
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = DOCX_URL;
      s.onload = () => (window.docx ? resolve(window.docx) : reject(new Error("docx did not load")));
      s.onerror = () => reject(new Error("docx did not load"));
      document.head.appendChild(s);
    });
  }
  function svgToPng(svgText, w, h, scale = 2) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = w * scale; c.height = h * scale;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => (b ? b.arrayBuffer().then((buf) => resolve(new Uint8Array(buf))) : reject(new Error("png"))), "image/png");
      };
      img.onerror = reject;
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText);
    });
  }
  async function wordIt() {
    msg("Making the Word file…");
    const D = await loadDocx();
    if (window.WV) await window.WV.loadPyramids();
    const st = window.WC.state, year = st.year;
    if (year) window.WC.applyYear(null);
    try {
      const blob = await makeDocx(D, currentIso);
      const r = window.WC.byIso.get(currentIso);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${r.name} factfile.docx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      msg("Word file downloaded.");
    } finally {
      if (year) window.WC.applyYear(year);
    }
  }
  async function makeDocx(D, iso) {
    const { byIso, F } = window.WC;
    const r = byIso.get(iso);
    const regionName = REGION_NAME[r.region] || r.region;
    const FONT = "Calibri";
    const hex = (c) => c.replace("#", "");
    const tint = (c, a) => { // mix a colour with white
      const n = parseInt(hex(c), 16), R = n >> 16, G = (n >> 8) & 255, B = n & 255;
      const m = (x) => Math.round(x * a + 255 * (1 - a)).toString(16).padStart(2, "0");
      return m(R) + m(G) + m(B);
    };
    const T = (text, o = {}) => new D.TextRun({ text: String(text), font: FONT, size: o.size || 18, bold: o.bold, color: o.color || hex(INK), italics: o.italics });
    const P = (runs, o = {}) => new D.Paragraph({ children: Array.isArray(runs) ? runs : [runs], spacing: { after: o.after ?? 60, before: o.before ?? 0 }, alignment: o.align, keepNext: o.keepNext });
    const noBorders = { top: { style: D.BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: D.BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: D.BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: D.BorderStyle.NONE, size: 0, color: "FFFFFF" }, insideHorizontal: { style: D.BorderStyle.NONE, size: 0, color: "FFFFFF" }, insideVertical: { style: D.BorderStyle.NONE, size: 0, color: "FFFFFF" } };
    const lineBorders = (c) => ({ top: { style: D.BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: D.BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: D.BorderStyle.NONE, size: 0, color: "FFFFFF" }, insideVertical: { style: D.BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: D.BorderStyle.SINGLE, size: 4, color: c }, insideHorizontal: { style: D.BorderStyle.SINGLE, size: 2, color: hex(LINE) } });
    const cell = (children, o = {}) => new D.TableCell({ children: Array.isArray(children) ? children : [children], width: o.w ? { size: o.w, type: D.WidthType.DXA } : undefined, shading: o.fill ? { type: D.ShadingType.CLEAR, color: "auto", fill: o.fill } : undefined, margins: { top: 50, bottom: 50, left: 80, right: 80 }, verticalAlign: o.vAlign });
    const right = D.AlignmentType.RIGHT;
    const W = 10466; // A4 width minus margins, in twentieths of a point

    const [mapPng, locPng] = await Promise.all([svgToPng(outlineMap(iso, 420, 330), 420, 330), svgToPng(locatorMap(iso, 240, 124), 240, 124)]);
    const body = [];
    const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    body.push(P(T("COUNTRY FACTFILE", { size: 16, bold: true, color: hex(ACCENT) }), { after: 0 }));
    body.push(P(T(r.name, { size: 52, bold: true }), { after: 40 }));
    body.push(P(T([r.capital && "Capital: " + r.capital, r.subregion || r.region].filter(Boolean).join(" · ") + `   ·   Which Countries?, ${today}`, { size: 18, color: hex(MUTED) }), { after: 160 }));
    const keys = keyFacts(r);
    body.push(new D.Table({
      width: { size: W, type: D.WidthType.DXA }, borders: noBorders, columnWidths: [5300, W - 5300],
      rows: [new D.TableRow({ children: [
        cell([P(new D.ImageRun({ type: "png", data: mapPng, transformation: { width: 336, height: 264 } })), P(T(`${r.name} and its neighbours. ■ capital · ● largest cities`, { size: 14, color: hex(MUTED), italics: true }))], { w: 5300 }),
        cell([P(new D.ImageRun({ type: "png", data: locPng, transformation: { width: 220, height: 114 } }), { after: 100 }),
          ...keys.map(([k, v]) => P([T(k + ": ", { bold: true, size: 17 }), T(v, { size: 17 })], { after: 30 }))], { w: W - 5300 }),
      ] })],
    }));
    const gl = glance(r);
    body.push(P(T(""), { after: 80 }));
    body.push(new D.Table({
      width: { size: W, type: D.WidthType.DXA }, borders: noBorders, columnWidths: gl.map(() => Math.floor(W / gl.length)),
      rows: [new D.TableRow({ children: gl.map((g) => cell([P(T(g.label, { size: 14, color: hex(MUTED) }), { after: 0 }), P(T(g.value, { size: 28, bold: true }), { after: 0 }), P(T(`World median ${g.med}${g.rank ? ` · ${ordinal(g.rank)} of ${g.n}` : ""}`, { size: 13, color: hex(MUTED) }), { after: 0 })], { fill: "EEF3F5", w: Math.floor(W / gl.length) })) })],
    }));
    body.push(P([T("How to read the tables. ", { bold: true, size: 15, color: hex(MUTED) }), T(`Rank is the position among countries with data, where 1st is the highest value (not always the best). A median is the middle country: half are higher and half lower. Medians are used rather than averages because a few very large or very small countries pull averages a long way.`, { size: 15, color: hex(MUTED) })], { before: 120, after: 120 }));

    const used = new Set();
    const colW = [3400, 1500, 900, 1050, 1800, W - 3400 - 1500 - 900 - 1050 - 1800];
    for (const t of window.THEMES) {
      if (hidden.has(t.id)) continue;
      let started = false;
      for (const g of t.groups) {
        const fs = facts(g, r);
        const { out, missing } = tableRows(g, r);
        if (!fs.length && !out.length) continue;
        measuresFor(g).forEach((f) => used.add(f.source));
        if (!started) { body.push(new D.Paragraph({ children: [T(t.label, { size: 30, bold: true, color: hex(ACCENT) })], spacing: { before: 240, after: 80 }, keepNext: true, border: { bottom: { style: D.BorderStyle.SINGLE, size: 6, color: hex(ACCENT), space: 2 } } })); started = true; }
        const col = GROUP_COLOURS[g] || ACCENT;
        body.push(P(T(g, { size: 24, bold: true, color: hex(col) }), { before: 140, after: 60, keepNext: true }));
        fs.forEach(([k, v]) => body.push(P([T(k + ": ", { bold: true }), T(v)], { after: 30, keepNext: !!out.length })));
        if (out.length) {
          const head = ["Measure", "Value", "Year", "Rank", `${regionName} median`, "World median"];
          body.push(new D.Table({
            width: { size: W, type: D.WidthType.DXA }, columnWidths: colW, borders: lineBorders(hex(col)),
            rows: [
              new D.TableRow({ tableHeader: true, children: head.map((hd, i) => cell(P(T(hd, { bold: true, size: 16, color: hex(INK) }), { after: 0, align: i && i !== 2 ? right : undefined }), { fill: tint(col, 0.18), w: colW[i] })) }),
              ...out.map((row) => new D.TableRow({ cantSplit: true, children: [
                cell(P([T(row.f.label, { size: 16 }), ...(row.unit ? [T("  " + row.unit, { size: 13, color: hex(MUTED) })] : [])], { after: 0 }), { w: colW[0] }),
                cell(P(T(row.value, { size: 16, bold: true }), { after: 0, align: right }), { w: colW[1] }),
                cell(P(T(row.year, { size: 14, color: hex(MUTED) }), { after: 0 }), { w: colW[2] }),
                cell(P(T(row.rank ? `${ordinal(row.rank)} / ${row.n}` : "—", { size: 15 }), { after: 0, align: right }), { w: colW[3] }),
                cell(P(T(row.regMed, { size: 15 }), { after: 0, align: right }), { w: colW[4] }),
                cell(P(T(row.worldMed, { size: 15 }), { after: 0, align: right }), { w: colW[5] }),
              ] })),
            ],
          }));
        }
        if (missing.length) body.push(P(T(`No data: ${missing.join(", ")}.`, { size: 14, italics: true, color: hex(MUTED) }), { before: 40 }));
      }
    }
    const ex = hidden.has("extras") ? [] : extras(r);
    if (ex.length) {
      body.push(new D.Paragraph({ children: [T("More detail", { size: 30, bold: true, color: hex(ACCENT) })], spacing: { before: 240, after: 80 }, keepNext: true, border: { bottom: { style: D.BorderStyle.SINGLE, size: 6, color: hex(ACCENT), space: 2 } } }));
      for (const e of ex) {
        body.push(P(T(e.title, { size: 22, bold: true, color: hex(e.colour) }), { before: 120, after: 40, keepNext: true }));
        body.push(new D.Table({
          width: { size: 6000, type: D.WidthType.DXA }, columnWidths: [3800, 2200], borders: lineBorders(hex(e.colour)),
          rows: e.rows.map(([a, b]) => new D.TableRow({ cantSplit: true, children: [cell(P(T(a, { size: 16 }), { after: 0 }), { w: 3800 }), cell(P(T(b, { size: 16 }), { after: 0, align: right }), { w: 2200 })] })),
        }));
        body.push(P(T(e.note, { size: 14, italics: true, color: hex(MUTED) }), { before: 40 }));
      }
    }
    // Changes over time: small line charts and the population pyramid
    const cards = trendCards(r), pyr = pyramidInfo(r), pf = popFacts(r);
    if ((cards.length || pyr) && !hidden.has("changes")) {
      body.push(new D.Paragraph({ children: [T("Changes over time", { size: 30, bold: true, color: hex(ACCENT) })], spacing: { before: 240, after: 80 }, keepNext: true, border: { bottom: { style: D.BorderStyle.SINGLE, size: 6, color: hex(ACCENT), space: 2 } } }));
      const pngs = await Promise.all(cards.map((c) => svgToPng(c.svg, 240, 118)));
      const cw = Math.floor(W / 4);
      const trows = [];
      for (let i = 0; i < cards.length; i += 4) {
        trows.push(new D.TableRow({ cantSplit: true, children: [0, 1, 2, 3].map((j) => {
          const c = cards[i + j];
          return cell(c ? [P(T(c.f.label, { size: 15, bold: true }), { after: 0 }), P(T(`${c.from} → ${c.to}`, { size: 12, color: hex(MUTED) }), { after: 20 }),
            P(new D.ImageRun({ type: "png", data: pngs[i + j], transformation: { width: 160, height: 79 } }), { after: 0 })] : [P(T(""))], { w: cw });
        }) }));
      }
      if (trows.length) {
        body.push(new D.Table({ width: { size: W, type: D.WidthType.DXA }, borders: noBorders, columnWidths: [cw, cw, cw, cw], rows: trows }));
        body.push(P([T("━ ", { color: hex(ACCENT), bold: true }), T(r.name + "   ", { size: 14, color: hex(MUTED) }), T("‒ ‒ ", { color: hex(MUTED) }), T("World median   ", { size: 14, color: hex(MUTED) }), T("····· ", { color: "8a4b00", bold: true }), T(`${regionName} median`, { size: 14, color: hex(MUTED) })], { before: 40, after: 120 }));
      }
      if (pyr || pf.length) {
        const pyrPng = pyr ? await svgToPng(pyr.svg, 300, 220) : null;
        body.push(new D.Table({
          width: { size: W, type: D.WidthType.DXA }, borders: noBorders, columnWidths: [4600, W - 4600],
          rows: [new D.TableRow({ cantSplit: true, children: [
            cell(pyr ? [P(new D.ImageRun({ type: "png", data: pyrPng, transformation: { width: 285, height: 209 } }), { after: 20 }),
              P(T(`Population by age and sex, ${pyr.latest} (bars)${pyr.base !== pyr.latest ? ` and ${pyr.base} (outline)` : ""}. Each bar is the share of the whole population.`, { size: 13, italics: true, color: hex(MUTED) }))] : [P(T(""))], { w: 4600 }),
            cell([P(T("Population structure", { size: 22, bold: true, color: hex(GROUP_COLOURS.Population) }), { after: 60 }),
              ...pf.map(([k, v]) => P([T(k + ": ", { bold: true, size: 16 }), T(v, { size: 16 })], { after: 30 })),
              P(T("The demographic transition stage is a simple guide worked out from birth and death rates: stage 1 high births and deaths; 2 births high, deaths falling; 3 births falling; 4 both low; 5 more deaths than births.", { size: 13, italics: true, color: hex(MUTED) }), { before: 80 })], { w: W - 4600 }),
          ] })],
        }));
      }
    }
    const pr = hidden.has("physical") ? [] : physRows(r);
    if (pr.length) {
      body.push(new D.Paragraph({ children: [T("Physical geography", { size: 30, bold: true, color: hex(ACCENT) })], spacing: { before: 240, after: 80 }, keepNext: true, border: { bottom: { style: D.BorderStyle.SINGLE, size: 6, color: hex(ACCENT), space: 2 } } }));
      if (r.terrain) body.push(P([T("Terrain: ", { bold: true }), T(r.terrain.charAt(0).toUpperCase() + r.terrain.slice(1) + ".")], { after: 80 }));
      body.push(new D.Table({
        width: { size: W, type: D.WidthType.DXA }, columnWidths: [2800, W - 2800], borders: lineBorders(hex(GROUP_COLOURS.Geography)),
        rows: pr.map(([k, v]) => new D.TableRow({ cantSplit: true, children: [cell(P(T(k, { size: 16, bold: true }), { after: 0 }), { w: 2800 }), cell(P(T(v, { size: 16 }), { after: 0 }), { w: W - 2800 })] })),
      }));
      if (r.climate_text) body.push(P([T("Climate: ", { bold: true }), T(r.climate_text.charAt(0).toUpperCase() + r.climate_text.slice(1) + ".")], { before: 80 }));
    }
    const S = window.SOURCES;
    body.push(P(T("Sources", { size: 20, bold: true }), { before: 240, after: 40 }));
    body.push(P(T([...used, "boundaries"].filter((k) => S[k]).map((k) => `${S[k].name} (${S[k].licence})`).join("; ") + ".", { size: 14, color: hex(MUTED) })));
    body.push(P(T(`Figures are the latest available for each measure; the Year column shows which year. Countries with no data are left out of ranks and medians. Made with Which Countries?, an open-source world map, on ${today}.`, { size: 14, color: hex(MUTED) })));
    void F;
    const doc = new D.Document({
      creator: "Which Countries?", title: `${r.name} factfile`,
      styles: { default: { document: { run: { font: FONT, size: 18 } } } },
      sections: [{
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
        footers: { default: new D.Footer({ children: [new D.Paragraph({ alignment: right, children: [T(`${r.name} factfile · Which Countries? · page `, { size: 14, color: hex(MUTED) }), new D.TextRun({ children: [D.PageNumber.CURRENT], font: FONT, size: 14, color: hex(MUTED) })] })] }) },
        children: body,
      }],
    });
    return D.Packer.toBlob(doc);
  }

  window.openFactfile = open;
})();
