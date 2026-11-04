/* Which Places? — application code, adapted from Which Countries?. No build step; plain JavaScript + D3. */
(async function () {
  "use strict";

  // ---------- Load data ----------
  // ?v= makes browsers fetch fresh data after the site is updated (raise it in index.html too)
  const DATA_VERSION = "5";
  // the single-file version carries its data compressed, and unpacks it first
  if (window.__READY__) await window.__READY__;
  const loadJSON = (url) => fetch(url + "?v=" + DATA_VERSION).then((r) => { if (!r.ok) throw new Error(url); return r.json(); });
  const [rows, topo, cityRows, flows, timeseries, features, physical] = await Promise.all([
    window.__COUNTRIES__ || loadJSON("areas.json"),
    window.__WORLD__ || loadJSON("areas.topo.json"),
    window.__CITIES__ || [],        // cities come in a later release
    window.__FLOWS__ || [],
    window.__TIMESERIES__ || loadJSON("timeseries.json").catch(() => null),
    window.__FEATURES__ || null,
    window.__PHYSICAL__ || null,
  ]);
  // cities.json rows: [name, iso3, lat, lon, population, capital]
  const cities = cityRows.map(([name, iso3, lat, lon, pop, cap], id) => ({ id, name, iso3, lat, lon, city_population: pop, city_capital: !!cap }));
  // physical geography features (rivers, volcanoes, earthquakes…), from physical.js
  if (window.WP && physical) window.WP.load(physical);
  const itemsFor = (f) => (f.target === "city" ? cities : f.target ? (window.WP?.items(f.target) || []) : rows);

  const FILTERS = window.FILTERS;
  // survey years are stored once per source (sy_att, sy_wgm, sy_wrp): fill in each measure's year
  for (const r of rows) for (const pre of ["att", "wgm", "wrp", "ab", "pew"]) {
    const y = r["sy_" + pre];
    if (y) for (const k in r) if (k.startsWith(pre + "_") && !k.endsWith("_year") && r[k + "_year"] == null) r[k + "_year"] = y;
  }
  // ---------- Year slider: which measures have yearly data ----------
  const TS = timeseries ? timeseries.series : {};
  // survey measures are stored sparsely ([year, value, …]) to keep the file small
  // which sparse measures carry their last value forward for up to 8 years (the world site's surveys); the UK site lists none
  const SURVEY_KEYS = new Set(timeseries?.carry ?? Object.keys(timeseries?.sparse || {}));
  // yearly runs: [first year, value, value, …] (null for a missing year)
  for (const [k, byIso] of Object.entries(timeseries?.runs || {})) {
    TS[k] = {};
    for (const [iso, run] of Object.entries(byIso)) {
      const arr = new Array(timeseries.years.length).fill(null);
      for (let i = 1; i < run.length; i++) { const j = run[0] + i - 1 - timeseries.years[0]; if (j >= 0 && j < arr.length) arr[j] = run[i]; }
      TS[k][iso] = arr;
    }
  }
  for (const [k, byIso] of Object.entries(timeseries?.sparse || {})) {
    TS[k] = {};
    for (const [iso, pairs] of Object.entries(byIso)) {
      const arr = new Array(timeseries.years.length).fill(null);
      for (let i = 0; i < pairs.length; i += 2) { const j = pairs[i] - timeseries.years[0]; if (j >= 0 && j < arr.length) arr[j] = pairs[i + 1]; }
      TS[k][iso] = arr;
    }
  }
  const TS_YEARS = timeseries ? timeseries.years : [];
  const REGIMES = ["Closed autocracy", "Electoral autocracy", "Electoral democracy", "Liberal democracy"];
  // yearly series stored as numbers that stand for categories
  const CAT_TS = { regime: REGIMES, dtm_stage: (window.FILTERS.find((f) => f.key === "dtm_stage") || {}).order || [] };
  const TIME_KEYS = new Set(Object.keys(TS).concat(TS.regime ? ["democracy"] : []));
  FILTERS.forEach((f) => { if (TIME_KEYS.has(f.key)) f.time = true; });
  // First and last years with data for a reasonable number of countries (at least 20)
  const TS_SPAN = {};
  for (const [key, s] of Object.entries(TS)) {
    // survey measures count a country while its last survey still stands (up to 8 years)
    const has = SURVEY_KEYS.has(key) ? (arr, i) => arr.slice(Math.max(0, i - 8), i + 1).some((v) => v != null) : (arr, i) => arr[i] != null;
    const counts = TS_YEARS.map((_, i) => Object.values(s).filter((arr) => has(arr, i)).length);
    const first = counts.findIndex((n) => n >= 20), last = counts.length - 1 - [...counts].reverse().findIndex((n) => n >= 20);
    // don't run past the last real figure, except to carry a recent survey on to the present (2025)
    let lastReal = -1;
    for (const arr of Object.values(s)) for (let i = arr.length - 1; i > lastReal; i--) if (arr[i] != null) { lastReal = i; break; }
    const cap = Math.max(lastReal, Math.min(lastReal + 8, 2025 - TS_YEARS[0]));
    if (first >= 0) TS_SPAN[key] = [TS_YEARS[first], TS_YEARS[Math.min(last, cap)]];
  }
  const TS_EXT = {};
  for (const [key, s] of Object.entries(TS)) {
    if (CAT_TS[key]) continue;
    const all = Object.values(s).flat().filter((v) => typeof v === "number" && (key === "refugees_hosted" || key === "refugees_from" ? v > 0 : true));
    // the full span across every year and country, so a colour means the same value in every year of the player
    TS_EXT[key] = d3.extent(all);
  }
  const span = (key) => TS_SPAN[key === "democracy" ? "regime" : key] || null;
  const timeFrom = (key) => span(key)?.[0] ?? null;
  // Years the slider offers: the overlap of the active yearly filters' spans
  function sliderSpan() {
    const spans = state.filters.filter((fl) => F[fl.key].time).map((fl) => span(fl.key)).filter(Boolean);
    if (!spans.length) return null;
    const a = Math.max(...spans.map((x) => x[0])), b = Math.min(...spans.map((x) => x[1]));
    return a <= b ? [a, b] : null;
  }
  const SITE = window.SITE || {};
  const F = Object.fromEntries(FILTERS.map((f) => [f.key, f]));
  // Families: related measures shown as one menu item with a picker inside
  const FAMILIES = window.FAMILIES || [];
  const famOf = {};
  FAMILIES.forEach((fam) => fam.variants.forEach(([k, lab]) => { if (F[k]) { famOf[k] = fam; F[k].variantLabel = lab; } }));
  FAMILIES.forEach((fam) => { fam.group = F[fam.variants[0][0]].group; fam.time = fam.variants.some(([k]) => F[k]?.time); });
  const byIso = new Map(rows.map((r) => [r.iso3, r]));
  const byNum = new Map(rows.filter((r) => r.num).map((r) => [String(+r.num), r]));
  const NAME_FIX = { Kosovo: "UNK", Somaliland: "SOM", "N. Cyprus": "CYP" };

  const $ = (s) => document.querySelector(s);
  // category slug used for colour-coding, e.g. "UN & treaties" -> "un-treaties"
  const CLOCK = `<svg class="clock" viewBox="0 0 16 16" width="13" height="13" aria-label="yearly data" role="img"><circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 4.4V8l2.6 1.7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const gslug = (g) => g.toLowerCase().replace(/&/g, "").replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---------- Number formatting ----------
  function sig(v, n = 2) {
    if (v === 0) return 0;
    const p = Math.pow(10, Math.floor(Math.log10(Math.abs(v))) - n + 1);
    return Math.round(v / p) * p;
  }
  function compact(v) {
    const a = Math.abs(v);
    if (a >= 1e12) return +(v / 1e12).toPrecision(3) + "tn";
    if (a >= 1e9) return +(v / 1e9).toPrecision(3) + "bn";
    if (a >= 1e6) return +(v / 1e6).toPrecision(3) + "M";
    if (a >= 1e3) return +(v / 1e3).toPrecision(3) + "k";
    return String(+v.toPrecision(3));
  }
  const UNITS = {
    per1000: " per 1,000 people", per1000birth: " per 1,000 births", per1000women: " per 1,000 teenage girls",
    per100k: " per 100,000 births", per100kpop: " per 100,000 people", density: " people per km²", years: " years",
    permillion: " per million people", per100: " per 100 people", kwh: " per person",
    per10k: " per 10,000 people", per1000dw: " per 1,000 homes", score10: " out of 10", ratio: " times earnings", gbpw: " a week", years1: " years", tonnes: " CO₂e per person",
  };
  // Full form, used in sentences and profiles: "20 per 1,000 people"
  function fmt(f, v) {
    if (v == null || Number.isNaN(v)) return "no data";
    return fmtShort(f, v) + (UNITS[f.format] || "");
  }
  // Short form, used in chips, sliders and lists: "20"
  function fmtShort(f, v) {
    if (v == null || Number.isNaN(v)) return "no data";
    const a = Math.abs(v);
    switch (f.format) {
      case "pct": return (a < 10 && !Number.isInteger(v) ? v.toFixed(1) : Math.round(v)) + "%";
      case "people": return compact(v);
      case "usd": return "$" + compact(v);
      case "gbp": return "£" + compact(v);
      case "gbp1": return "£" + (a < 100 ? v.toFixed(1) : Math.round(v));
      case "gbpw": return "£" + Math.round(v);
      case "ratio": return (+v.toFixed(1)) + "×";
      case "years1": return v.toFixed(1);
      case "score10": return v.toFixed(2);
      case "per10k": case "per1000dw": return String(a < 10 ? +v.toFixed(1) : Math.round(v));
      case "kwhm": return d3.format(",")(Math.round(v)) + " kWh";
      case "index": return v.toFixed(2);
      case "dec1": return String(+v.toFixed(1));
      case "dec3": return v.toFixed(3);
      case "dec2": return v.toFixed(2);
      case "rank": return "#" + Math.round(v);
      case "km2": return compact(v) + " km²";
      case "tonnes": return (a < 10 ? +v.toFixed(1) : Math.round(v)) + " t";
      case "per1000": case "per1000birth": case "per1000women": return String(a < 10 ? +v.toFixed(1) : Math.round(v));
      case "density": return compact(v);
      case "per100k": case "per100kpop": case "years": return String(Math.round(v));
      case "kmlen": return d3.format(",")(Math.round(v)) + " km";
      case "temp": return (+v.toFixed(1)) + "°C";
      case "mm": return d3.format(",")(Math.round(v)) + " mm";
      case "m": return d3.format(",")(Math.round(v)) + " m";
      case "mag": return v.toFixed(1);
      case "mmyr": return (Math.abs(v) < 10 ? v.toFixed(1) : Math.round(v)) + " mm/yr";
      case "year": return String(Math.round(v));
      case "mt": return (a < 10 ? +v.toFixed(1) : d3.format(",")(Math.round(v))) + " Mt";
      case "degc": return v.toFixed(3) + "°C";
      case "twh": return compact(v) + " TWh";
      case "kwh": return compact(v) + " kWh";
      case "permillion": case "per100": return String(a < 10 ? +v.toFixed(1) : d3.format(",")(Math.round(v)));
      case "count": return d3.format(",")(Math.round(v));
      case "anom": return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1) + "°C";
      case "gha": return (+v.toFixed(a < 10 ? 2 : 1)) + " gha";
      case "earths": return (+v.toFixed(1)) + (Math.abs(v - 1) < 0.05 ? " Earth" : " Earths");
      case "kcal": return d3.format(",")(Math.round(v)) + " kcal";
      case "m3": return d3.format(",")(Math.round(v)) + " m³";
      case "ha": return compact(v) + " ha";
      default: return String(Math.round(v));
    }
  }
  function fmtFull(f, v) {
    if (v == null) return "no data";
    if (f.format === "people") return d3.format(",")(v);
    if (f.format === "usd") return "$" + d3.format(",")(v);
    if (f.format === "gbp") return "£" + d3.format(",")(Math.round(v));
    if (f.format === "km2") return d3.format(",")(Math.round(v)) + " km²";
    if (f.format === "tonnes") return v.toFixed(2) + " t";
    return fmt(f, v);
  }
  function yearLabel(f) {
    if (f.yearText) return f.yearText;
    if (typeof f.year === "number") return String(f.year);
    if (!f.year) return "";
    const ys = rows.map((r) => r[f.year]).filter((y) => typeof y === "number");
    if (!ys.length) return "";
    const counts = d3.rollup(ys, (v) => v.length, (y) => y);
    const [mode, n] = [...counts].sort((a, b) => b[1] - a[1])[0];
    return n / ys.length >= 0.8 ? String(mode) : `latest available, mostly ${mode}`;
  }
  function parseNum(f, s) {
    s = String(s).trim().toLowerCase().replace(/[$,%#\s]|km²|km2|t$/g, "");
    const m = s.match(/^(-?[\d.]+)(k|m|bn|b)?$/);
    if (!m) return null;
    const mult = { k: 1e3, m: 1e6, b: 1e9, bn: 1e9 }[m[2]] || 1;
    return parseFloat(m[1]) * mult;
  }

  // ---------- Filter domains and options ----------
  for (const f of FILTERS) {
    const vals = itemsFor(f).map((r) => r[f.key]);
    if (f.type === "range") {
      const nums = vals.filter((v) => typeof v === "number" && (f.scale !== "log" || v > 0)).sort((a, b) => a - b);
      if (f.bounds) [f.dmin, f.dmax] = f.bounds;
      else if (f.clip) { f.dmin = d3.quantileSorted(nums, 0.02); f.dmax = d3.quantileSorted(nums, 0.98); }
      else { f.dmin = nums[0]; f.dmax = nums[nums.length - 1]; }
      if (f.clip && f.step && f.scale !== "log") { f.dmin = Math.floor(f.dmin / f.step) * f.step; f.dmax = Math.ceil(f.dmax / f.step) * f.step; }
      f.toT = f.scale === "log" ? (v) => Math.log10(Math.max(v, f.dmin)) : (v) => v;
      f.fromT = f.scale === "log" ? (t) => Math.pow(10, t) : (t) => t;
      f.round = f.scale === "log" ? (v) => sig(v, 2) : (v) => Math.round(v / f.step) * f.step;
    } else if (f.type === "multi" || f.type === "cat") {
      const set = new Set();
      vals.forEach((v) => (Array.isArray(v) ? v : [v]).forEach((x) => x != null && x !== "" && set.add(x)));
      const all = [...set];
      f.options = f.order ? f.order.filter((o) => set.has(o)).concat(all.filter((o) => !f.order.includes(o)).sort()) : all.sort((a, b) => a.localeCompare(b));
    }
  }

  // ---------- State ----------
  const state = {
    filters: [],          // [{ key, min, max } | { key, values: [] } | { key, value: bool }]
    territories: false,   // include non-sovereign territories
    colourBy: "",
    sort: "",
    open: null,           // key of filter whose editor is open
    selected: null,       // iso3 of country in detail view
    starterHidden: false,
    tab: "areas",     // results list: "countries" or "cities"
    sortDir: null,        // "asc" or "desc"; null means the natural default (A–Z for names, high first for numbers)
    flow: null,           // refugee flow view: { iso, dir: "from" | "to" }
    year: null,           // year slider: null means the latest data
    view: "map",          // "map", or a chart view from views.js: "compare", "rank", "trends"
    mode: "human",        // "human" or "physical" geography
    feat: null,           // a physical feature open in the results panel: { t, i }
    mapStyle: "std",      // map colours: "std" (filters), "change" (change over time), "bi" (two measures)
    popSized: false,      // draw countries as circles sized by population
    mm: { ck: "", from: null, to: null, pct: false, bx: "", by: "" },
    classes: "",          // how the colour key is split: "" smooth, or "equal" / "quantile" / "jenks" classes
    nClasses: 5,
  };

  // Swap each country's time-enabled values for the chosen year (or back to the latest).
  const NO_LOOKBACK = new Set(["refugees_hosted", "refugees_from", "regime", "libdem"]);
  // value of a yearly measure for one country in one year (with the same 5-year look-back as the year slider)
  function tsValue(key, iso, year) {
    const s = TS[key]?.[iso];
    if (!s) return null;
    const i = year - TS_YEARS[0];
    const back = NO_LOOKBACK.has(key) ? 0 : SURVEY_KEYS.has(key) ? 8 : 4;
    for (let j = i; j >= 0 && j >= i - back; j--) if (s[j] != null) return s[j];
    return null;
  }
  function applyYear(year) {
    const keys = Object.keys(TS);
    for (const r of rows) {
      if (!r._latest) {
        r._latest = {};
        for (const k of keys.concat(["democracy"])) { r._latest[k] = r[k]; r._latest[k + "_year"] = r[k + "_year"]; }
      }
      for (const k of keys.concat(["democracy"])) {
        delete r[k]; delete r[k + "_year"];
        if (year == null) {
          if (r._latest[k] !== undefined) r[k] = r._latest[k];
          if (r._latest[k + "_year"] !== undefined) r[k + "_year"] = r._latest[k + "_year"];
        }
      }
      if (year == null) continue;
      const i = year - TS_YEARS[0];
      for (const k of keys) {
        const s = TS[k][r.iso3];
        if (!s) continue;
        // survey-based measures are not collected every year: use the most recent value up to 5 years earlier
        let j = i;
        const back = NO_LOOKBACK.has(k) ? 0 : SURVEY_KEYS.has(k) ? 8 : 4;
        while (j > 0 && j > i - back && s[j] == null) j--;
        const v = j >= 0 ? s[j] : null;
        if (v == null) continue;
        const y = TS_YEARS[j];
        if (k === "regime") { r.regime = REGIMES[v]; r.democracy = v >= 2; r.democracy_year = y; }
        else if (CAT_TS[k]) r[k] = CAT_TS[k][v];
        else r[k] = v;
        r[k + "_year"] = y;
      }
    }
  }

  function makeFilter(key, preset = {}) {
    const f = F[key];
    if (f.type === "range") {
      const init = f.initial || {};
      const fl = { key, min: preset.min ?? init.min ?? f.dmin, max: preset.max ?? init.max ?? f.dmax };
      if (preset.slice) { fl.slice = preset.slice; fl.min = f.dmin; fl.max = f.dmax; }
      return fl;
    }
    if (f.type === "bool") return { key, value: preset.value ?? true };
    return { key, values: preset.values ? [...preset.values] : [], mode: preset.mode || "any" };
  }

  // Does a filter currently restrict anything?
  function isActive(fl) {
    const f = F[fl.key];
    if (f.type === "range") return true; // even at "no limit" it keeps countries that have data
    if (f.type === "bool") return true;
    return fl.values.length > 0;
  }
  const isLimited = (fl) => { const f = F[fl.key]; return !!fl.slice || fl.min > f.dmin || fl.max < f.dmax; };
  // ---------- Slices: highest or lowest n, quartiles and quintiles ----------
  // A slice is worked out from every country (or city, or feature) with data, in the year shown:
  // { k: "top" | "bottom", n } or { k: "q", of: 4 | 5, g: [1…of] } where group 1 has the lowest values.
  // "Life expectancy" -> "life expectancy", but names with other capitals ("Human Development Index") stay as they are
  const lower = (s) => (/^[A-Z][^A-Z]*$/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
  const QNAMES = { 4: ["Lowest quarter", "Second quarter", "Third quarter", "Highest quarter"], 5: ["Lowest fifth", "Second fifth", "Middle fifth", "Fourth fifth", "Highest fifth"] };
  const sliceCache = new Map();
  // with `w` set, the slice is taken only from the countries that pass your other filters ("the 10 most populous in Africa")
  function sliceOthers(fl) {
    if (!fl.slice?.w || F[fl.key].target) return [];
    return (fl._others || state.filters).filter((x) => x !== fl && x.key !== fl.key && !x.slice && !F[x.key].target && isActive(x));
  }
  function sliceInfo(fl) {
    const others = sliceOthers(fl);
    const ck = `${fl.key}|${JSON.stringify(fl.slice)}|${JSON.stringify(others.map((o) => [o.key, o.min, o.max, o.values, o.value, o.mode]))}`;
    if (sliceCache.has(ck)) return sliceCache.get(ck);
    const f = F[fl.key];
    const items = (f.target ? itemsFor(f) : pool()).filter((r) => typeof r[fl.key] === "number" && others.every((o) => passes(r, o)))
      .sort((a, b) => a[fl.key] - b[fl.key] || String(a.name).localeCompare(String(b.name)));
    const s = fl.slice, n = items.length;
    let pick = [];
    // for ranks (1 = best), the "top" is the smallest numbers
    const best = f.format === "rank" ? "low" : "high";
    if (s.k === "top" || s.k === "bottom") {
      const k = Math.max(1, Math.min(n, Math.round(s.n) || 10));
      const high = (s.k === "top") === (best === "high");
      pick = high ? items.slice(n - k) : items.slice(0, k);
    } else if (s.k === "q") {
      const of = s.of === 5 ? 5 : 4;
      pick = items.filter((r, i) => s.g.includes(Math.min(of, Math.floor((i * of) / n) + 1)));
    }
    const vals = pick.map((r) => r[fl.key]);
    const out = { set: new Set(pick), n: pick.length, of: n, lo: d3.min(vals), hi: d3.max(vals),
      cuts: s.k === "q" ? d3.range(1, s.of === 5 ? 5 : 4).map((j) => items[Math.floor((j * n) / (s.of === 5 ? 5 : 4))]?.[fl.key]) : [] };
    sliceCache.set(ck, out);
    return out;
  }
  function sliceText(fl, short) {
    const f = F[fl.key], s = fl.slice;
    if (s.k === "top" || s.k === "bottom") {
      if (f.format === "rank") return short ? `${s.k} ${s.n}` : `in the ${s.k} ${s.n}`;
      const hi = s.k === "top";
      return short ? `${hi ? "highest" : "lowest"} ${s.n}` : `among the ${s.n} ${hi ? "highest" : "lowest"}`;
    }
    const of = s.of === 5 ? 5 : 4, g = s.g.slice().sort((x, y) => x - y);
    const word = of === 5 ? "fifth" : "quarter", words = of === 5 ? "fifths" : "quarters";
    if (short) return g.length === 1 ? QNAMES[of][g[0] - 1].toLowerCase() : `${of === 5 ? "quintiles" : "quartiles"} ${g.join(", ")}`;
    if (g.length === 1) return `in the ${QNAMES[of][g[0] - 1].toLowerCase()}`;
    const contiguous = g.every((x, i) => !i || x === g[i - 1] + 1);
    if (contiguous && g[0] === 1) return `in the lowest ${g.length === 2 ? "two" : g.length === 3 ? "three" : "four"} ${words}`;
    if (contiguous && g[g.length - 1] === of) return `in the highest ${g.length === 2 ? "two" : g.length === 3 ? "three" : "four"} ${words}`;
    return `in ${of === 5 ? "quintiles" : "quartiles"} ${g.slice(0, -1).join(", ")} and ${g[g.length - 1]} (${word} 1 is the lowest)`;
  }
  function passes(r, fl) {
    const f = F[fl.key];
    const v = r[fl.key];
    if (f.type === "range") {
      if (typeof v !== "number") return false;
      if (fl.slice) return sliceInfo(fl).set.has(r);
      // the ends of the slider mean "no limit"
      const lo = fl.min <= f.dmin ? -Infinity : fl.min, hi = fl.max >= f.dmax ? Infinity : fl.max;
      return v >= lo - 1e-9 && v <= hi + 1e-9;
    }
    if (f.type === "bool") return v === fl.value;
    if (!fl.values.length) return true;
    if (f.type === "multi") {
      if (!Array.isArray(v)) return false;
      if (fl.mode === "all") return fl.values.every((x) => v.includes(x));
      if (fl.mode === "none") return !v.some((x) => fl.values.includes(x));
      return v.some((x) => fl.values.includes(x));
    }
    return fl.values.includes(v);
  }

  const NEAR_MAP = 25;
  const expandedNear = new Set();
  const pool = () => rows.filter((r) => r.sovereign || state.territories);
  const isCity = (fl) => F[fl.key].target === "city";
  const isFeat = (fl) => { const t = F[fl.key].target; return !!t && t !== "city"; };
  const active = () => state.filters.filter((fl) => !F[fl.key].target && isActive(fl));
  const cityActive = () => state.filters.filter((fl) => isCity(fl) && isActive(fl));
  const showCities = () => state.filters.some(isCity);

  // Physical feature filters also pick out countries: "deserts bigger than X" + "rivers through 3+ countries" means
  // countries that have such a desert AND such a river. Each kind of feature with a real limit becomes a hidden
  // yes/no country filter, "__has_<kind>", worked out afresh every time.
  const featPhrases = (t) => state.filters.filter((fl) => F[fl.key].target === t && isActive(fl) && (F[fl.key].type !== "range" || isLimited(fl))).map(phrase).filter(Boolean);
  function hasF(t) {
    const key = "__has_" + t, T = window.WP.T[t];
    F[key] ||= { key, type: "bool", internal: true, group: "Geography", label: `Has a ${T.one} like this`, short: `Has a ${T.one}`, yes: `Has a matching ${T.one}`, no: `No matching ${T.one}`,
      say: (v) => {
        const ps = featPhrases(t).map((x) => (/^it /.test(x) ? x.replace(/^it /, "that ") : /^its /.test(x) ? x.replace(/^its /, "whose ") : "where " + x));
        return v ? `there is a ${T.one} ${ps.join(" and ")}` : `there is no ${T.one} like this`;
      }, info: `Areas that contain at least one of the ${T.many} picked out by your filters.`, source: "physical" };
    return key;
  }
  function featureAct() {
    const out = [];
    if (!window.WP?.loaded) return out;
    const lim = state.filters.filter((fl) => isFeat(fl) && isActive(fl) && (F[fl.key].type !== "range" || isLimited(fl)));
    for (const t of new Set(lim.map((fl) => F[fl.key].target))) {
      const its = window.WP.items(t) || [];
      if (!its.some((it) => it.iso && it.iso.length)) continue;   // features that belong to no country (trenches, plate boundaries)
      const live = state.filters.filter((fl) => F[fl.key].target === t && isActive(fl));
      const has = new Set();
      for (const it of its) if (live.every((fl) => passes(it, fl))) (it.iso || []).forEach((i) => has.add(i));
      const key = hasF(t);
      for (const r of rows) r[key] = has.has(r.iso3);
      out.push({ key, value: true, _t: t });
    }
    return out;
  }
  function evaluate() {
    sliceCache.clear();
    const act = active().concat(featureAct());
    const res = new Map();
    for (const r of pool()) {
      const fails = act.filter((fl) => !passes(r, fl));
      res.set(r.iso3, { match: fails.length === 0, near: act.length >= 2 && fails.length === 1, fails });
    }
    // Group near misses by the one filter they fail. Small groups are the interesting ones,
    // so only groups of up to NEAR_MAP countries are shaded on the map.
    const groups = new Map();
    for (const [iso, e] of res) if (e.near) {
      const key = e.fails[0].key;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(byIso.get(iso));
    }
    for (const [key, list] of groups) {
      const shade = list.length <= NEAR_MAP;
      list.forEach((r) => (res.get(r.iso3).shade = shade));
    }
    // Cities: those in matching countries that pass every city filter
    let cityList = [];
    if (showCities()) {
      const ca = cityActive();
      cityList = cities.filter((c) => { const e = res.get(c.iso3); return e && e.match && ca.every((fl) => passes(c, fl)); });
    }
    const feat = window.WP?.loaded ? window.WP.evaluate(res, act, state.filters.filter(isFeat)) : new Map();
    return { act, res, groups, cityList, feat };
  }
  window.WP?.setW({ F, isActive, passes, byIso });

  // ---------- Glossary: hover (or tap ⓘ) over key terms to see what they mean ----------
  const GL = new Map();  // lower-case term -> { term, def }
  const GL_TEXT = [];    // terms explained when they turn up in explanations
  for (const [term, def, o = {}] of window.GLOSSARY || []) {
    const e = { term, def };
    for (const t of [term, ...(o.also || [])]) {
      GL.set(t.toLowerCase(), e);
      if (!o.opt) GL_TEXT.push(t);
    }
  }
  GL_TEXT.sort((x, y) => y.length - x.length);
  const GL_RE = GL_TEXT.length ? new RegExp(`(^|[^\\p{L}\\p{N}])(${GL_TEXT.map((t) => esc(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}\\p{N}])`, "giu") : null;
  // the definition for a filter option: exact, or the start of it ("Stage 2 · …")
  function glossFor(opt) {
    const s = String(opt).toLowerCase();
    if (GL.has(s)) return GL.get(s);
    const m = s.match(/^(stage \d)/);
    return m ? GL.get(m[1]) : null;
  }
  // mark the first use of each term in some already-escaped text
  function glossify(html) {
    if (!GL_RE || !html) return html;
    const used = new Set();
    return html.replace(GL_RE, (all, pre, t) => {
      const e = GL.get(t.toLowerCase().replace(/&amp;/g, "&").replace(/&#39;/g, "'"));
      if (!e || used.has(e)) return all;
      used.add(e);
      return `${pre}<span class="gl" tabindex="0" data-gl="${esc(e.term)}">${t}</span>`;
    });
  }
  const glTerm = (opt) => { const e = glossFor(opt); return e ? `<span class="gl" data-gl="${esc(e.term)}">${esc(opt)}</span><button type="button" class="glb" data-gl="${esc(e.term)}" aria-label="What does ${esc(opt)} mean?">i</button>` : esc(opt); };
  {
    const tip = document.createElement("div");
    tip.id = "gltip"; tip.className = "gltip"; tip.setAttribute("role", "tooltip"); tip.hidden = true;
    document.body.appendChild(tip);
    let pinned = null;
    const show = (el) => {
      const e = GL.get(el.dataset.gl.toLowerCase());
      if (!e) return;
      tip.innerHTML = `<b>${esc(e.term)}</b>${esc(e.def)}`;
      tip.hidden = false;
      const r = el.getBoundingClientRect(), w = Math.min(300, innerWidth - 16);
      tip.style.width = w + "px";
      tip.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px";
      const below = r.bottom + 8 + tip.offsetHeight < innerHeight;
      tip.style.top = (below ? r.bottom + 6 : r.top - tip.offsetHeight - 6) + "px";
    };
    const hide = () => { tip.hidden = true; pinned = null; };
    document.addEventListener("pointerover", (e) => { const el = e.target.closest?.(".gl, .glb"); if (el && e.pointerType !== "touch") show(el); });
    document.addEventListener("pointerout", (e) => { const el = e.target.closest?.(".gl, .glb"); if (el && !pinned && e.pointerType !== "touch") hide(); });
    document.addEventListener("focusin", (e) => { if (e.target.matches?.(".gl, .glb")) show(e.target); });
    document.addEventListener("focusout", (e) => { if (e.target.matches?.(".gl, .glb") && !pinned) hide(); });
    document.addEventListener("click", (e) => {
      const b = e.target.closest?.(".glb, .gl[tabindex]");
      if (b) { e.preventDefault(); e.stopPropagation(); if (pinned === b) return hide(); show(b); pinned = b; return; }
      if (pinned && !tip.contains(e.target)) hide();
    }, true);
    document.addEventListener("scroll", () => { if (!tip.hidden) hide(); }, true);
  }

  // ---------- Text: chips and sentence ----------
  function joinOr(list) {
    if (list.length <= 1) return list.join("");
    if (list.length === 2) return list.join(" or ");
    if (list.length > 4) return `${list.slice(0, 3).join(", ")} or ${list.length - 3} others`;
    return list.slice(0, -1).join(", ") + " or " + list[list.length - 1];
  }
  function bound(fl) {
    const f = F[fl.key];
    const lo = fl.min > f.dmin, hi = fl.max < f.dmax;
    if (f.format === "rank") {
      if (lo && hi) return `between #${Math.round(fl.min)} and #${Math.round(fl.max)}`;
      return lo ? `#${Math.round(fl.min)} or lower` : `in the top ${Math.round(fl.max)}`;
    }
    if (lo && hi) return `between ${fmt(f, fl.min)} and ${fmt(f, fl.max)}`;
    if (lo) return `at least ${fmt(f, fl.min)}`;
    return `at most ${fmt(f, fl.max)}`;
  }
  function phrase(fl) {
    const f = F[fl.key];
    if (!isActive(fl)) return null;
    if (f.type === "range" && fl.slice) return `${lower(f.label)} is ${sliceText(fl)}${fl.slice.w && sliceOthers(fl).length ? " of those" : ""}`;
    if (f.type === "range") return isLimited(fl) ? f.say(bound(fl)) : `there is data on ${f.label}`;
    if (f.type === "bool") return f.say(fl.value);
    // optional per-value wording, e.g. "the Commonwealth", "a liberal democracy"
    const vals = fl.values.map((v) => (f.article && f.article[v]) || v);
    if (fl.mode === "none") return (f.sayNot || f.say)(joinOr(vals));
    if (fl.mode === "all") return f.say(andList(vals), vals.length > 1);
    return f.say(joinOr(vals));
  }
  function chipLabel(fl) {
    const f = F[fl.key];
    const name = f.short || f.label;
    if (f.type === "bool") return fl.value ? f.yes : f.no;
    if (f.type === "range") {
      if (fl.slice) return `${name}: ${sliceText(fl, true)}`;
      if (!isLimited(fl)) return `${name}: all`;
      const lo = fl.min > f.dmin, hi = fl.max < f.dmax;
      if (f.format === "rank" && hi && !lo) return `${name}: top ${Math.round(fl.max)}`;
      if (lo && hi) return `${name} ${fmtShort(f, fl.min)}–${fmtShort(f, fl.max)}`;
      return lo ? `${name} ≥ ${fmtShort(f, fl.min)}` : `${name} ≤ ${fmtShort(f, fl.max)}`;
    }
    if (!fl.values.length) return `${name}: choose…`;
    const sep = fl.mode === "all" ? " + " : ", ";
    const v = fl.values.length > 2 ? `${fl.values.slice(0, 2).join(sep)} +${fl.values.length - 2}` : fl.values.join(sep);
    return `${name}: ${fl.mode === "none" ? "not " : ""}${v}`;
  }
  function andList(ps) {
    return ps.length === 1 ? ps[0] : ps.slice(0, -1).join(", ") + " and " + ps[ps.length - 1];
  }
  function sentence(n, act) {
    const noun = (k) => (state.territories ? (k === 1 ? "place" : "places") : (k === 1 ? "area" : "areas"));
    const clear = `<button class="clear" id="clearAll" type="button">Clear all</button>`;
    let cityPart = "";
    if (showCities()) {
      const m = lastEval.cityList.length;
      const cp = cityActive().map(phrase);
      cityPart = `<b>${m.toLocaleString()} ${m === 1 ? "city" : "cities"}</b>${cp.length ? ` where ${esc(andList(cp))}` : ""}`;
    }
    for (const [t, list] of lastEval?.feat || []) {
      // a feature filter left at "no limit" just puts that kind of feature on the map, so it isn't described
      const asCountry = act.some((fl) => fl._t === t);
      const fp = asCountry ? [] : featPhrases(t);
      const m = list.length, T = window.WP.T[t];
      const part = `<b>${m.toLocaleString()} ${m === 1 ? T.one : T.many}</b>${fp.length ? ` where ${esc(andList(fp))}` : ""}`;
      cityPart = cityPart ? `${cityPart}; ${part}` : part;
    }
    if (!act.length) {
      if (cityPart) return `Showing ${cityPart}.${clear}`;
      return state.mode === "physical" ? `Physical geography: showing all <b>${n} ${noun(n)}</b>. Add a filter, or pick a feature such as rivers or volcanoes.` : `Showing all <b>${n} ${noun(n)}</b>. Add a filter to start asking questions.`;
    }
    const timed = act.some((fl) => F[fl.key].time), untimed = act.some((fl) => !F[fl.key].time);
    const when = state.year && timed ? `In <b>${state.year}</b>: ` : "";
    const note = state.year && untimed ? ` <span class="tnote">${timed ? "Filters without yearly data use the latest figures." : `The year slider doesn't change these filters; they use the latest figures.`}</span>` : "";
    return `${when}Showing <b>${n} ${noun(n)}</b> where ${esc(andList(act.map(phrase)))}${cityPart ? `, with ${cityPart} in them` : ""}.${note}${clear}`;
  }

  // ---------- Map ----------
  const svg = d3.select("#map");
  const gRoot = svg.append("g");
  // striped fill for near misses, so they can't be mistaken for a light shade
  const defs = svg.append("defs");
  const hatch = defs.append("pattern").attr("id", "nearHatch").attr("patternUnits", "userSpaceOnUse").attr("width", 5).attr("height", 5).attr("patternTransform", "rotate(45)");
  hatch.append("rect").attr("width", 5).attr("height", 5).attr("style", "fill: var(--land)");
  hatch.append("rect").attr("width", 2).attr("height", 5).attr("style", "fill: var(--match)");
  const gLand = gRoot.append("g");
  const gDots = gRoot.append("g");
  const gCities = gRoot.append("g");
  // map areas are joined to the data by their ONS code (held in the field "iso3", the world site's name for it)
  let geo = topojson.feature(topo, topo.objects.areas).features;
  geo.forEach((d) => { d.rec = byIso.get(d.id) || null; });
  // Islands drawn in a box nearer the mainland, as on Ordnance Survey maps (window.MAP_INSETS in filters.js).
  // Their shapes are moved before drawing; insetShift() moves any point inside them the same way.
  const INSETS = window.MAP_INSETS || [];
  const insetFor = (code) => INSETS.find((x) => x.codes.includes(code));
  const shiftCoords = (c, dx, dy) => (typeof c[0] === "number" ? [c[0] + dx, c[1] + dy] : c.map((x) => shiftCoords(x, dx, dy)));
  geo.forEach((d) => { const ins = insetFor(d.id); if (ins) d.geometry = { ...d.geometry, coordinates: shiftCoords(d.geometry.coordinates, ins.dx, ins.dy) }; });
  rows.forEach((r) => { const ins = insetFor(r.iso3); if (ins && r.latlng) r.latlng = [r.latlng[0] + ins.dy, r.latlng[1] + ins.dx]; });
  // neighbouring areas: those that share a border on the map
  const NB = new Map();
  topojson.neighbors(topo.objects.areas.geometries).forEach((list, i) => NB.set(geo[i].id, list.map((j) => geo[j].id)));
  const desk = () => document.body.classList.contains("desk");
  let lastListOrder = [];
  const insetShift = (lon, lat, code) => { const ins = code ? insetFor(code) : INSETS.find((x) => x.contains && x.contains(lon, lat)); return ins ? [lon + ins.dx, lat + ins.dy] : [lon, lat]; };
  // a Transverse Mercator centred on 2°W, like the Ordnance Survey's National Grid
  const projection = d3.geoTransverseMercator().rotate([2, -49]);
  const path = d3.geoPath(projection);
  const mainPaths = gLand.selectAll("path").data(geo).join("path").attr("data-iso", (d) => d.rec?.iso3 || "");
  // London (window.MAP_POPOUT in filters.js) drawn a second time, enlarged, in a box of its own.
  // The copies carry the same data and code, so colours, hover, clicks and highlights all work on them too.
  const POP = window.MAP_POPOUT;
  const popGeo = POP ? geo.filter((d) => d.rec && d.rec.region === POP.region) : [];
  const gPop = gLand.append("g").attr("class", "popout");
  const popFrame = gPop.append("rect").attr("class", "pframe").attr("rx", 6);
  const popInner = gPop.append("g");
  const popPaths = popInner.selectAll("path").data(popGeo).join("path").attr("data-iso", (d) => d.rec.iso3);
  const popLabel = gPop.append("text").attr("class", "plabel").text(POP ? POP.label : "");
  const popZoom = gPop.append("text").attr("class", "pzoom").attr("role", "button").attr("tabindex", 0).text("Zoom in ›");
  const paths = d3.selectAll([...mainPaths.nodes(), ...popPaths.nodes()]);
  const popCorners = POP ? { type: "Feature", geometry: { type: "MultiPoint", coordinates: POP.box } } : null;
  const onMap = new Set(geo.map((d) => d.rec?.iso3).filter(Boolean));
  let k = 1;

  let mapTopPad = 0, mapLeftPad = 0, mapBottomPad = 0;
  const narrow = () => window.matchMedia("(max-width: 760px)").matches;
  // the map is fitted to the UK plus the London box
  const fcAll = { type: "FeatureCollection", features: popCorners && popGeo.length ? [...geo, popCorners] : geo };
  // On a laptop or bigger, make the map column exactly as wide as the UK's shape needs at full height,
  // leaving the rest of the screen to the panel. Returns true if the width changed.
  let mapWSet = 0;
  function fitMapWidth() {
    if (!desk()) return false;
    const H = window.innerHeight;
    const foot = $("#mapfoot");
    const fp = foot && foot.offsetParent && !foot.classList.contains("empty") ? foot.offsetHeight + 22 : 16;
    const b = d3.geoPath(d3.geoTransverseMercator().rotate(projection.rotate()).scale(1).translate([0, 0])).bounds(fcAll);
    const ratio = (b[1][0] - b[0][0]) / (b[1][1] - b[0][1]);
    const want = Math.round((H - 16 - fp) * ratio + 40);
    const w = Math.round(Math.max(360, Math.min(want, window.innerWidth * 0.6, window.innerWidth - 540)));
    if (Math.abs(w - mapWSet) <= 3) return false;
    mapWSet = w;
    document.body.style.setProperty("--mapw", w + "px");
    return true;
  }
  function layout() {
    fitMapWidth();
    const box = $("#mapstage").getBoundingClientRect();
    const w = Math.max(320, box.width), h = Math.max(240, box.height);
    svg.attr("viewBox", `0 0 ${w} ${h}`);
    citySize = Math.max(0.45, Math.min(1, w / 1100));
    // a little room round the world, and space at the top for the quiz card when it sits there
    const foot = desk() ? $("#mapfoot") : null;
    const footPad = foot && foot.offsetParent && !foot.classList.contains("empty") ? foot.offsetHeight + 22 : 0;
    const padX = desk() ? 20 : Math.max(16, w * 0.025), top = Math.max(16, mapTopPad), bottom = Math.max(16, footPad), left = Math.max(padX, mapLeftPad);
    const fc = fcAll;
    projection.fitExtent([[left, top], [w - padX, Math.max(top + 120, h - bottom)]], fc);
    if (mapBottomPad > 0) {
      // the quiz card is open at the bottom: move the world up out of its way, shrinking it a little only if it must
      const s0 = projection.scale();
      projection.fitExtent([[left, top], [w - padX, Math.max(top + 120, h - mapBottomPad)]], fc);
      if (projection.scale() < s0 * 0.86) projection.scale(s0 * 0.86);
      // keep it centred across, and right up at the top
      const b = path.bounds(fc), t = projection.translate();
      projection.translate([t[0] + (left + w - padX) / 2 - (b[0][0] + b[1][0]) / 2, t[1] + top - b[0][1]]);
    }
    paths.attr("d", path);
    // the London box: scale the copies to fill it, then shrink the box round them
    if (popCorners && popGeo.length) {
      const [p0, p1] = POP.box.map((c) => projection(c));
      const bx = Math.min(p0[0], p1[0]), by = Math.min(p0[1], p1[1]), bw = Math.abs(p1[0] - p0[0]), bh = Math.abs(p1[1] - p0[1]);
      const [[lx0, ly0], [lx1, ly1]] = d3.geoPath(projection).bounds({ type: "FeatureCollection", features: popGeo });
      const pad = 8, head = 18, sc = Math.min((bw - 2 * pad) / (lx1 - lx0), (bh - 2 * pad - head) / (ly1 - ly0));
      const w2 = (lx1 - lx0) * sc + 2 * pad, h2 = (ly1 - ly0) * sc + 2 * pad + head;
      const x0 = bx, y0 = by + (bh - h2) / 2;
      popInner.attr("transform", `translate(${x0 + pad - lx0 * sc},${y0 + head + pad - ly0 * sc}) scale(${sc})`);
      popFrame.attr("x", x0).attr("y", y0).attr("width", w2).attr("height", h2);
      popLabel.attr("x", x0 + 8).attr("y", y0 + 14);
      popZoom.attr("x", x0 + w2 - 8).attr("y", y0 + 14);
    }
    // a box round each inset, with its name
    const frames = [...new Set(INSETS.map((x) => x.label))].map((label) => {
      const ins = { label, codes: INSETS.filter((x) => x.label === label).flatMap((x) => x.codes) };
      const fs = geo.filter((d) => ins.codes.includes(d.id));
      if (!fs.length) return null;
      const [[x0, y0], [x1, y1]] = path.bounds({ type: "FeatureCollection", features: fs });
      return { ...ins, x: x0 - 8, y: y0 - 24, w: x1 - x0 + 16, h: y1 - y0 + 32 };
    }).filter(Boolean);
    // the boxes go underneath the islands
    const fr = gLand.selectAll("g.inset").data(frames).join((en) => { const g = en.insert("g", ":first-child").attr("class", "inset"); g.append("rect"); g.append("text"); return g; });
    fr.select("rect").attr("x", (d) => d.x).attr("y", (d) => d.y).attr("width", (d) => d.w).attr("height", (d) => d.h);
    fr.select("rect").attr("rx", 6);
    fr.select("text").attr("x", (d) => d.x + 8).attr("y", (d) => d.y + 14).text((d) => d.label);
    // widen a box if its name is longer than the islands are wide
    fr.each(function (d) { const tw = this.querySelector("text").getComputedTextLength?.() || 0; if (tw + 16 > d.w) { const ex = tw + 16 - d.w; d3.select(this).select("rect").attr("x", d.x - ex / 2).attr("width", tw + 16); d3.select(this).select("text").attr("x", d.x - ex / 2 + 8); } });
    riverPaths.attr("d", path); lakePaths.attr("d", path);
    invalidatePoints();
    window.WP?.layout(Math.max(0.55, Math.min(1, w / 1100)));
    cities.forEach((c) => { delete c._pt; delete c._lpt; });
    physLabels.forEach((l) => delete l._pt);
    placeCountryLabels();
    scheduleLabels();
    zoom.extent([[0, 0], [w, h]]).translateExtent([[-w * 0.2, -h * 0.2], [w * 1.2, h * 1.2]]);
    drawDots();
    drawCities();
    window.WX?.layout(); window.WCL?.draw(); window.WCG?.draw(); window.WRG?.layout();
  }
  // the key card floats on the map on the desktop layout: when it changes size, refit the UK above it
  let footH = 0;
  new ResizeObserver(() => { const h = $("#mapfoot")?.offsetHeight || 0; if (desk() && Math.abs(h - footH) > 4) { footH = h; layout(); } }).observe($("#mapfoot"));
  const zoom = d3.zoom().scaleExtent([1, 40]).on("zoom", (e) => {
    k = e.transform.k;
    gLabels.selectAll("text").attr("font-size", (d) => d.fs / k).attr("stroke-width", 3 / k).attr("x", (d) => (d.side ? 8 / k : d.isCity ? 5 / k : 0));
    gLabels.selectAll("circle").attr("r", (d) => (d.c?.city_capital ? 3 : 2.2) / k);
    scheduleLabels();
    gRoot.attr("transform", e.transform);
    window.WX?.zoomed(e.transform.k); window.WCL?.draw(); window.WCG?.draw();
    gDots.selectAll("circle").attr("r", 4.2 / k);
    gCities.selectAll("circle").attr("r", (d) => cityR(d) / k);
    window.WP?.zoomed(e.transform);
    showUkBtn();
  });
  svg.call(zoom).on("dblclick.zoom", null);
  $("#zin").onclick = () => svg.transition().duration(250).call(zoom.scaleBy, 1.6);
  $("#zout").onclick = () => svg.transition().duration(250).call(zoom.scaleBy, 1 / 1.6);
  $("#zreset").onclick = () => svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity);
  // "Whole UK": shown whenever the map is zoomed in or an area is open; takes you back to the whole country
  const ukBtn = document.createElement("button");
  ukBtn.type = "button"; ukBtn.id = "ukBtn"; ukBtn.className = "ukbtn"; ukBtn.hidden = true;
  ukBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8.5 8 3l6 5.5M4 7.2V13h8V7.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>Whole UK`;
  ukBtn.title = "Back to the whole UK";
  $("#mapstage").appendChild(ukBtn);
  function showUkBtn() { const b = document.getElementById("ukBtn"); if (b) b.hidden = !(k > 1.02 || (desk() && state.selected)); }
  function goWholeUK() {
    if (state.selected) { state.selected = null; render(); }
    const g = $("#goTo"); if (g) g.value = "";
    svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
  }
  ukBtn.onclick = goWholeUK;
  // the London box: "Zoom in" (or a click on its empty space) zooms the main map to London
  const popGo = () => { if (POP) zoomToGroup("region", POP.region); };
  popZoom.on("click", (e) => { e.stopPropagation(); popGo(); }).on("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); popGo(); } });
  popFrame.on("click", (e) => { e.stopPropagation(); popGo(); });
  // ---------- Go to a nation or region ----------
  (function goTo() {
    const bar = $(".bar");
    if (!bar || $("#goTo")) return;
    const nations = window.NATIONS || [], regions = (window.REGIONS || []).filter((r) => !nations.includes(r));
    const lab = document.createElement("label");
    lab.className = "goto"; lab.title = "Zoom the map to a nation or region";
    lab.innerHTML = `<span>Go to</span><select id="goTo"><option value="">Zoom to a nation or region…</option><optgroup label="Nations">${nations.map((n) => `<option value="n:${esc(n)}">${esc(n)}</option>`).join("")}</optgroup><optgroup label="Regions of England">${regions.map((n) => `<option value="r:${esc(n)}">${esc(n)}</option>`).join("")}</optgroup></select>`;
    bar.appendChild(lab);
    const sel = lab.querySelector("select");
    sel.onchange = () => {
      const v = sel.value;
      if (state.view !== "map") { state.view = "map"; render(); }
      if (!v) { svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity); return; }
      const [kind, name] = [v[0], v.slice(2)];
      const fs = geo.filter((d) => d.rec && (kind === "n" ? d.rec.nation === name : d.rec.region === name) && !insetFor(d.id));
      if (fs.length) zoomTo(path.bounds({ type: "FeatureCollection", features: fs }), 0.9);
    };
  })();

  // ---------- Place names and physical features that appear as you zoom in ----------
  state.labels = true;
  const gPhys = gRoot.insert("g", () => gDots.node()).attr("class", "phys");
  // physical mode: background map and overlays under the rivers, chosen features above them
  const gBase = gRoot.insert("g", () => gPhys.node()).attr("class", "pbase");
  const gOver = gRoot.insert("g", () => gPhys.node()).attr("class", "pover");
  const gFeat = gRoot.insert("g", () => gDots.node()).attr("class", "pfeat");
  window.WP?.attach({ base: gBase, over: gOver, feat: gFeat }, projection, path, svg.node());
  const gLabels = gRoot.append("g").attr("class", "labels");
  let rivers = [], lakes = [];
  if (features) {
    rivers = topojson.feature(features.shapes, features.shapes.objects.rivers).features;
    lakes = topojson.feature(features.shapes, features.shapes.objects.lakes).features;
  }
  const riverPaths = gPhys.selectAll("path.river").data(rivers).join("path").attr("class", "river");
  const lakePaths = gPhys.selectAll("path.lake").data(lakes).join("path").attr("class", "lake");
  // Natural Earth gives each label a web-map zoom level; this map's zoom 1 is about web zoom 1.3
  const webZoom = (kk) => Math.log2(kk) + 1.3;
  const LAKE_WORD = /lake|lac|lago|reservoir|sea|ozero|loch|vodokhranilishche/i;
  const physLabels = (features ? features.labels : []).map(([name, type, lon, lat, min, elev]) => ({
    text: type === "lake" && !LAKE_WORD.test(name) ? `Lake ${name}` : type === "peak" ? `${name} ${d3.format(",")(elev)} m` : name,
    type, lon, lat, min, cls: ["ocean", "sea", "gulf", "bay", "strait", "channel", "sound", "lake", "river", "reef"].includes(type) ? "water" : type === "peak" ? "peak" : "land",
    pri: type === "ocean" ? 0 : ["sea", "gulf"].includes(type) ? 3 : type === "lake" ? 6 : type === "peak" ? 8 : 5,
  }));
  // Cities: capitals first, then by size; minimum zoom grows as cities get smaller
  const cityMinK = (c) => c.city_capital ? (c.city_population >= 5e6 ? 1.6 : c.city_population >= 1e6 ? 2.4 : 3.2)
    : c.city_population >= 1e7 ? 2.4 : c.city_population >= 3e6 ? 3.4 : c.city_population >= 1e6 ? 5 : c.city_population >= 3e5 ? 8 : 12;
  const cityLabels = cities.map((c) => ({ text: c.name, c, minK: cityMinK(c), cls: c.city_capital ? "city cap" : "city", pri: c.city_capital ? 4 : 7, pop: c.city_population }));
  let countryLabels = [];
  function placeCountryLabels() {
    countryLabels = geo.filter((d) => d.rec).map((d) => {
      // label the largest piece of the country, sized by its width on screen
      const polys = d.geometry.type === "MultiPolygon" ? d.geometry.coordinates.map((c) => ({ type: "Polygon", coordinates: c })) : [d.geometry];
      const big = polys.reduce((a, b) => (path.area(b) > path.area(a) ? b : a));
      const [[x0], [x1]] = path.bounds(big);
      const [x, y] = path.centroid(big);
      return { text: d.rec.name, x, y, width: x1 - x0, cls: "area", pri: 2, area: path.area(big) };
    }).filter((l) => !Number.isNaN(l.x));
  }
  function physPoint(l) { return l._pt || (l._pt = projection([l.lon, l.lat])); }
  function cityPoint(c) { return c._lpt || (c._lpt = projection([c.lon, c.lat])); }
  let labelTimer = 0;
  function scheduleLabels() { clearTimeout(labelTimer); labelTimer = setTimeout(updateLabels, 90); }
  function updateLabels() {
    gPhys.attr("display", state.labels && !state.flow ? null : "none");
    if (!state.labels) { gLabels.selectAll("*").remove(); return; }
    const t = d3.zoomTransform(svg.node());
    const kk = t.k, z = webZoom(kk);
    // rivers and smaller lakes appear as you zoom in
    riverPaths.attr("display", (d) => (d.properties.r <= (kk >= 10 ? 12 : kk >= 6 ? 8 : kk >= 3 ? 5 : kk >= 1.8 ? 3 : 0) ? null : "none"));
    lakePaths.attr("display", (d) => (d.properties.r <= (kk >= 4 ? 12 : kk >= 2 ? 5 : 2) ? null : "none"));
    const vb = svg.attr("viewBox").split(" ").map(Number);
    const [W, H] = [vb[2], vb[3]];
    const inView = ([x, y]) => { const sx = x * kk + t.x, sy = y * kk + t.y; return sx > -20 && sx < W + 20 && sy > -10 && sy < H + 10; };
    const cand = [];
    const physMode = state.mode === "physical" && window.WP;
    const hideTypes = physMode ? window.WP.suppressed() : new Set();
    if (physMode) for (const l of window.WP.labels(kk, inView)) cand.push(l);
    for (const l of physLabels) if (z + 0.25 >= l.min && (!state.popSized || l.cls === "water") && !hideTypes.has(l.type)) { const p = physPoint(l); if (p && inView(p)) cand.push({ ...l, x: p[0], y: p[1] }); }
    // countries drawn as circles carry their own names
    if (!state.popSized) for (const l of countryLabels) if (l.width * kk > l.text.length * 6.6 + 10 && inView([l.x, l.y])) cand.push(l);
    if (!state.flow && !state.popSized) for (const l of cityLabels) if (kk >= l.minK) { const p = cityPoint(l.c); if (p && inView(p)) cand.push({ ...l, x: p[0], y: p[1] }); }
    cand.sort((a, b) => a.pri - b.pri || (b.area || b.pop || 0) - (a.area || a.pop || 0));
    // keep labels that don't overlap ones already placed (checked in screen space)
    const SIZE = { area: 12, country: 12.5, water: 12, land: 11.5, city: 11.5, peak: 10.5, feat: 11.5 };
    const placed = [], boxes = [];
    for (const l of cand) {
      const fs = l.type === "ocean" ? 14 : SIZE[l.cls.split(" ")[0]];
      const w = l.text.length * fs * 0.56 + 6, h = fs + 3;
      const sx = l.x * kk + t.x, sy = l.y * kk + t.y;
      const isCity = l.cls.startsWith("city") || !!l.side;
      const b = isCity ? [sx + 4, sy - h / 2, sx + 6 + w, sy + h / 2] : [sx - w / 2, sy - h / 2, sx + w / 2, sy + h / 2];
      if (boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) continue;
      boxes.push(b); placed.push({ ...l, fs, isCity });
      if (placed.length >= 260) break;
    }
    const sel = gLabels.selectAll("g.lbl").data(placed, (d) => d.cls + d.text + d.x).join((en) => {
      const g = en.append("g").attr("class", (d) => "lbl " + d.cls);
      g.filter((d) => d.isCity && !d.side).append("circle");
      g.append("text");
      return g;
    });
    sel.attr("transform", (d) => `translate(${d.x},${d.y})`);
    sel.select("circle").attr("r", (d) => (d.c?.city_capital ? 3 : 2.2) / kk);
    sel.select("text").text((d) => d.text)
      .attr("x", (d) => (d.side ? 8 / kk : d.isCity ? 5 / kk : 0)).attr("dy", "0.35em")
      .attr("text-anchor", (d) => (d.isCity ? "start" : "middle"))
      .attr("font-size", (d) => d.fs / kk).attr("stroke-width", 3 / kk);
  }
  $("#zlabels").onclick = () => {
    state.labels = !state.labels;
    $("#zlabels").setAttribute("aria-pressed", String(state.labels));
    updateLabels();
  };

  let lastEval = evaluate();

  // Dots make tiny countries visible when they match.
  function drawDots() {
    const { res, act } = lastEval;
    const dots = !act.length ? [] : rows.filter((r) => {
      const e = res.get(r.iso3);
      return e && (e.match || (e.near && e.shade)) && ((r.area_km2 ?? 0) < 20 || !onMap.has(r.iso3)) && (r._pt || (r._pt = centroidFor(r)));
    });
    gDots.selectAll("circle").data(dots, (d) => d.iso3).join("circle")
      .attr("class", (d) => "dot" + (res.get(d.iso3).match ? "" : " near"))
      .attr("data-iso", (d) => d.iso3)
      .attr("r", 4.2 / k)
      .attr("transform", (d) => {
        const p = d._pt || (d._pt = centroidFor(d));
        return p ? `translate(${p[0]},${p[1]})` : "translate(-99,-99)";
      });
  }
  function centroidFor(r) {
    const feat = geo.find((g) => g.rec === r);
    if (feat) { const c = path.centroid(feat); if (!Number.isNaN(c[0])) return c; }
    const ll = r.latlng;
    return ll && ll.length === 2 ? projection([ll[1], ll[0]]) : null;
  }
  function invalidatePoints() { rows.forEach((r) => delete r._pt); }

  // City dots, sized by population
  const MAX_CITY_DOTS = 2500;
  const cityRadius = d3.scaleSqrt().domain([0, d3.max(cities, (c) => c.city_population) || 1]).range([0, 15]);
  let citySize = 1; // shrinks dots on narrow screens
  const cityR = (c) => Math.max(1.6, cityRadius(c.city_population) * citySize);
  function drawCities() {
    const list = (lastEval.cityList || []).slice(0, MAX_CITY_DOTS);
    gCities.selectAll("circle").data(list, (d) => d.id).join("circle")
      .attr("class", (d) => "city" + (d.city_capital ? " cap" : ""))
      .attr("data-city", (d) => d.id)
      .attr("r", (d) => cityR(d) / k)
      .attr("transform", (d) => {
        const p = d._pt || (d._pt = projection([d.lon, d.lat]));
        return p ? `translate(${p[0]},${p[1]})` : "translate(-99,-99)";
      });
  }

  // ---------- Colour by ----------
  const numericFilters = FILTERS.filter((f) => f.type === "range" && !f.target && !f.hidden);
  // <option>s grouped by category, for the Sort and Shade by menus
  const byLabel = (x, y) => x.label.localeCompare(y.label, "en", { numeric: true, sensitivity: "base" });
  const groupedOptions = (selected) => window.FILTER_GROUPS.map((g) => {
    const fs = numericFilters.filter((f) => f.group === g).sort(byLabel);
    return fs.length ? `<optgroup label="${esc(g)}">${fs.map((f) => `<option value="${f.key}" ${selected === f.key ? "selected" : ""}>${esc(f.label)}</option>`).join("")}</optgroup>` : "";
  }).join("");
  // Which number to shade matching countries by: the user's choice, else the last number filter added
  function colourKey() {
    if (state.colourBy === "none") return null;
    if (state.colourBy) return state.colourBy;
    const nums = active().filter((fl) => F[fl.key].type === "range");
    return nums.length ? nums[nums.length - 1].key : null;
  }
  function colourScale(matches) {
    const key = colourKey();
    if (!key) return null;
    const f = F[key];
    const vals = matches.map((r) => r[f.key]).filter((v) => typeof v === "number");
    if (vals.length < 2) return null;
    // Scale over the chosen range of the filter (so colours mean the same thing in every year);
    // an end left at "no limit" uses the actual values
    const fl = state.filters.find((x) => x.key === key);
    // for yearly measures use the range across all years, so a colour means the same value in every year
    const dataExt = f.time && TS_EXT[key] ? TS_EXT[key] : d3.extent(vals);
    let from = fl && fl.min > f.dmin ? fl.min : dataExt[0], to = fl && fl.max < f.dmax ? fl.max : dataExt[1];
    if (!fl) [from, to] = [f.dmin, f.dmax];
    if (f.scale === "log") from = Math.max(from, f.dmin);
    const ext = [f.toT(from), f.toT(to)];
    if (!(ext[1] > ext[0])) return null;
    const css = getComputedStyle(document.documentElement);
    const lo = css.getPropertyValue("--ramp-lo").trim(), hi = css.getPropertyValue("--ramp-hi").trim();
    // several steps of colour (pale yellow → orange → red-brown → dark), so changes from year to year show clearly
    const stops = [lo, css.getPropertyValue("--ramp-m1").trim() || lo, css.getPropertyValue("--ramp-m2").trim() || hi, hi];
    const interp = d3.interpolateRgbBasis(stops);
    const s = (v) => (typeof v === "number" ? interp(Math.min(1, Math.max(0, (f.toT(v) - ext[0]) / (ext[1] - ext[0])))) : null);
    s.f = f; s.ext = ext.map(f.fromT); s.lo = lo; s.hi = hi; s.grad = stops.join(", ");
    if (!state.classes) return s;
    // split into classes, the way students are taught to: equal interval, quantiles or natural breaks (Jenks)
    const n = Math.max(3, Math.min(7, state.nClasses || 5));
    const breaks = classBreaks(state.classes, vals, n, s.ext);
    if (!breaks) return s;
    const cols = d3.range(breaks.length - 1).map((i) => interp(breaks.length > 2 ? i / (breaks.length - 2) : 0.5));
    const classOf = (v) => { if (typeof v !== "number") return -1; let i = 0; while (i < breaks.length - 2 && v > breaks[i + 1]) i++; return i; };
    const c = (v) => (typeof v === "number" ? cols[classOf(v)] : null);
    Object.assign(c, s, { breaks, cols, classOf, method: state.classes,
      counts: cols.map((_, i) => vals.filter((v) => classOf(v) === i).length) });
    return c;
  }
  function classBreaks(method, vals, n, ext) {
    const v = vals.slice().sort((a, b) => a - b);
    if (v.length < n) n = Math.max(2, v.length);
    let b;
    if (method === "equal") {
      const lo = v[0], hi = v[v.length - 1];
      b = d3.range(n + 1).map((i) => lo + ((hi - lo) * i) / n);
    } else if (method === "quantile") {
      b = d3.range(n + 1).map((i) => d3.quantileSorted(v, i / n));
    } else {
      b = jenks(v, n);
    }
    b = b.filter((x, i) => i === 0 || x > b[i - 1]);
    return b.length >= 3 ? b : null;
  }
  // Fisher-Jenks natural breaks: groups that are as alike as possible inside, and as different as possible from each other
  function jenks(v, n) {
    const N = v.length, mat1 = [], mat2 = [];
    for (let i = 0; i <= N; i++) { mat1.push(new Array(n + 1).fill(0)); mat2.push(new Array(n + 1).fill(0)); }
    for (let j = 1; j <= n; j++) { mat1[1][j] = 1; mat2[1][j] = 0; for (let i = 2; i <= N; i++) mat2[i][j] = Infinity; }
    for (let l = 2; l <= N; l++) {
      let s1 = 0, s2 = 0, w = 0, vv = 0;
      for (let m = 1; m <= l; m++) {
        const i3 = l - m + 1, val = v[i3 - 1];
        s2 += val * val; s1 += val; w++;
        vv = s2 - (s1 * s1) / w;
        const i4 = i3 - 1;
        if (i4 !== 0) for (let j = 2; j <= n; j++) if (mat2[l][j] >= vv + mat2[i4][j - 1]) { mat1[l][j] = i3; mat2[l][j] = vv + mat2[i4][j - 1]; }
      }
      mat1[l][1] = 1; mat2[l][1] = vv;
    }
    const out = new Array(n + 1); out[n] = v[N - 1]; out[0] = v[0];
    let k = N;
    for (let j = n; j >= 2; j--) { const id = mat1[k][j] - 2; out[j - 1] = v[id]; k = mat1[k][j] - 1; }
    return out;
  }

  // ---------- Render ----------
  let lastCS = null, lastMatches = [];
  function render(opts = {}) {
    lastEval = evaluate();
    const { act, res } = lastEval;
    const matches = pool().filter((r) => res.get(r.iso3).match).sort((a, b) => a.name.localeCompare(b.name));
    const cs = colourScale(matches); lastCS = cs; lastMatches = matches;
    styleInfo = state.mapStyle === "change" ? changeInfo() : state.mapStyle === "bi" ? biInfo() : null;
    const inScope = (rec) => { const e = rec && res.get(rec.iso3); return e && (!act.length || e.match); };
    const clsFor = (rec) => {
      const e = rec && res.get(rec.iso3);
      if (styleInfo) return inScope(rec) && styleInfo.colour(rec.iso3) ? "styled" : "";
      // with no country filters, leave countries plain so cities stand out
      return e && act.length ? (e.match ? "match" : e.near && e.shade ? "near" : "") : "";
    };
    document.body.dataset.mode = state.mode;
    const fillFor = (rec) => {
      if (!rec) return null;
      if (styleInfo) return inScope(rec) ? styleInfo.colour(rec.iso3) : null;
      if (!cs) return null;
      const e = res.get(rec.iso3);
      return e && e.match ? cs(rec[cs.f.key]) : null;
    };
    const nbSel = new Set(state.selected ? NB.get(state.selected) || [] : []);
    paths
      .attr("class", (d) => clsFor(d.rec) + (d.rec && d.rec.iso3 === state.selected ? " sel" : nbSel.has(d.id) ? " nbr" : ""))
      .style("fill", (d) => fillFor(d.rec));
    paths.filter(".nbr").raise(); paths.filter(".sel").raise();
    showUkBtn();
    drawDots();
    drawCities();
    renderSolo();
    gDots.selectAll("circle").style("fill", (d) => fillFor(d));
    drawCarto(clsFor, fillFor);
    if (state.mode === "physical") { state.popSized = false; state.mapStyle = "std"; }
    window.WP?.draw(state, lastEval);
    gLand.attr("opacity", state.popSized && !state.flow ? 0.16 : null).style("pointer-events", state.popSized && !state.flow ? "none" : null);

    gDots.attr("display", state.flow || state.popSized ? "none" : null);
    if (typeof updateLabels === "function") scheduleLabels();
    gCities.attr("display", state.flow || state.popSized ? "none" : null);
    if (state.flow) applyFlow(); else $("#flowbar").hidden = true;

    renderTimebar();
    if (openTheme && typeof showTheme === "function") showTheme(openTheme);
    renderMapStyle();
    renderViews();
    renderModes();
    renderChips(act);
    renderCrumbs();
    $("#sentence").innerHTML = sentence(matches.length, act);
    const ca = $("#clearAll"); if (ca) ca.onclick = clearAll;
    renderLegend(cs, act);
    renderStarter(act);
    renderZero(act, matches);
    if (!opts.keepEditor) { if (state.open) renderEditor(); else $("#editor").hidden = true; }
    if (state.view !== "map") window.WV?.render();
    window.WMS?.refresh(); window.WST?.refresh(); window.WX?.refresh(); window.WCL?.draw(); window.WCG?.refresh(); window.WRG?.refresh();
    const chartList = state.view !== "map" && window.WV_H?.V?.list;
    if (state.selected) renderDetail(); else if (chartList) renderChartList(); else renderResults(matches, act, res);
    document.body.classList.toggle("pane-hidden", state.view !== "map" && !!state.paneHidden);
    saveURL();
    trackHistory();
    renderDock();
  }

  function renderChips(act) {
    const box = $("#chips");
    box.innerHTML = "";
    for (const fl of state.filters) {
      const el = document.createElement("span");
      el.className = "chip" + (state.open === fl.key ? " open" : "") + (isActive(fl) ? "" : " idle");
      el.dataset.g = gslug(F[fl.key].group);
      const clock = F[fl.key].time ? (state.year ? `<span class="yr">${CLOCK}${state.year}</span>` : `<span class="yclock" title="Has yearly data">${CLOCK}</span>`) : "";
      el.innerHTML = `<button type="button" class="lab">${esc(chipLabel(fl))}${clock}</button><button type="button" class="x" aria-label="Remove ${esc(F[fl.key].label)}">×</button>`;
      el.querySelector(".lab").onclick = () => { state.open = state.open === fl.key ? null : fl.key; render(); };
      el.querySelector(".x").onclick = () => removeFilter(fl.key);
      box.appendChild(el);
    }
  }

  // ---------- Year slider ----------
  let playing = null;
  function renderTimebar() {
    const el = $("#timebar");
    if (!TS_YEARS.length) { el.hidden = true; return; }
    el.hidden = !!state.flow || state.mode === "physical";
    const sp = sliderSpan();
    // keep the chosen year inside the span of the current filters
    if (state.year && (!sp || state.year < sp[0] || state.year > sp[1])) {
      const y = sp ? Math.min(Math.max(state.year, sp[0]), sp[1]) : null;
      state.year = y; applyYear(y);
      setTimeout(() => render(), 0);
    }
    if (!el.dataset.built) {
      el.dataset.built = "1";
      el.innerHTML = `<button type="button" class="play" id="tPlay" aria-label="Play through the years">▶</button>${window.WPL ? window.WPL.speedHTML("tSpeed") : ""}
        <div class="tmain"><div class="trow"><span class="tclock">${CLOCK}</span><span class="tyear num" id="tYear"></span><span class="ysig" id="tSig" hidden></span><span class="tavg" id="tAvg" aria-live="polite"></span><span class="tnote" id="tNote"></span>
        <button type="button" class="linkbtn" id="tLatest">Back to latest</button><button type="button" class="linkbtn tswipe" id="tSwipe" title="Compare two years side by side: drag the divider">⇆ Compare two years</button></div>
        <div class="tslide"><span class="tend num" id="tMin"></span><input type="range" id="tRange" step="1" aria-label="Year"><span class="tend num" id="tMax"></span></div>
        <p class="tsigtext pop" id="tSigText" hidden></p></div>`;
      const range = $("#tRange");
      range.oninput = () => { stopPlay(); setYear(+range.value); };
      $("#tLatest").onclick = () => { stopPlay(); setYear(null); };
      $("#tPlay").onclick = () => (playing ? stopPlay() : startPlay());
      $("#tSwipe").onclick = () => window.WX?.swipe();
      window.WPL?.bindSpeed($("#tSpeed"));
    }
    const range = $("#tRange");
    el.classList.toggle("off", !sp);
    range.disabled = !sp; $("#tPlay").disabled = !sp;
    if (sp) { range.min = sp[0]; range.max = sp[1]; range.value = state.year ?? sp[1]; $("#tMin").textContent = sp[0]; $("#tMax").textContent = sp[1]; }
    else { $("#tMin").textContent = ""; $("#tMax").textContent = ""; }
    $("#tYear").textContent = state.year ? state.year : "Latest";
    $("#tNote").textContent = !sp
      ? (state.filters.some((fl) => F[fl.key].time) ? "These filters have no years in common." : "Add a filter marked “yearly” (like population or median age) to go back in time.")
      : state.year ? "" : `Data from ${sp[0]} to ${sp[1]}. Drag or press play.`;
    $("#tLatest").hidden = !state.year;
    $("#tSwipe").hidden = !sp || state.view !== "map";
    // years with unusually big changes in the measures being played
    if (window.WPL && sp) {
      const sig = timeSig();
      window.WPL.marks(range, sig);
      window.WPL.light($("#tSig"), sig, state.year);
      const st = state.year && sig.get(state.year);
      $("#tSigText").hidden = !st;
      if (st) { $("#tSigText").textContent = st.text; $("#tSigText").className = `tsigtext l${st.level}`; $("#tNote").textContent = ""; }
    } else if (window.WPL) { window.WPL.marks(range, new Map()); window.WPL.light($("#tSig"), new Map(), null); $("#tSigText").hidden = true; }
    // the average of each measure being played, and which way it moved
    const avgKeys = sp && state.year ? [...new Set(state.filters.filter((fl) => F[fl.key].time && TS[fl.key] && !CAT_TS[fl.key]).map((fl) => fl.key).concat(colourKey() && TS[colourKey()] && !CAT_TS[colourKey()] ? [colourKey()] : []))].slice(0, 3) : [];
    const shares = sp && state.year && window.WPL ? shareFilters() : [];
    $("#tAvg").innerHTML = window.WPL ? avgKeys.map((k) => window.WPL.avgHTML(k, state.year)).join("") + shares.map((sf) => window.WPL.shareHTML(sf.short, sf.label, state.year, sf.share)).join("") : "";
    $("#tAvg").hidden = !avgKeys.length && !shares.length;
    $("#tPlay").textContent = playing ? "❚❚" : "▶";
    $("#tPlay").setAttribute("aria-label", playing ? "Pause" : "Play through the years");
    // keep the colour key clear of the year player
    $("#mapfoot")?.classList.toggle("empty", el.hidden && $("#legend").hidden);
  }
  function setYear(y) {
    state.year = y;
    applyYear(y);
    render({ keepEditor: !!state.open && document.activeElement?.id === "tRange" });
    if (state.open && document.activeElement?.id !== "tRange") renderEditor();
  }
  // yes/no and category filters with yearly data (democracy, type of government, demographic stage): the share of
  // countries that pass the filter in a year
  function shareFilters() {
    return state.filters.filter((fl) => F[fl.key].time && isActive(fl) && (fl.key === "democracy" || CAT_TS[fl.key])).map((fl) => {
      const key = fl.key === "democracy" ? "regime" : fl.key, f = F[fl.key];
      const passY = (v) => {
        if (fl.key === "democracy") return (v >= 2) === fl.value;
        const name = CAT_TS[key][v];
        if (f.type === "bool") return !!name === fl.value;
        const hit = fl.values.includes(name);
        return fl.mode === "none" ? !hit : hit;
      };
      const share = (y) => {
        let n = 0, k = 0;
        for (const r of rows) {
          if (!r.sovereign) continue;
          const v = TS[key]?.[r.iso3]?.[y - TS_YEARS[0]];
          if (v == null) continue;
          n++; if (passY(v)) k++;
        }
        return n >= 20 ? (100 * k) / n : null;
      };
      const label = phrase(fl) || f.label;
      return { id: fl.key + JSON.stringify([fl.value, fl.values, fl.mode]), label, short: fl.key === "democracy" ? (fl.value ? "Democracies" : "Not democracies") : f.short || f.label, share };
    });
  }
  function timeSig() {
    const keys = state.filters.filter((fl) => F[fl.key].time && TS[fl.key] && !CAT_TS[fl.key]).map((fl) => fl.key);
    const ck = colourKey();
    if (ck && TS[ck] && !CAT_TS[ck] && !keys.includes(ck)) keys.push(ck);
    const m = window.WPL ? window.WPL.merged(keys) : new Map();
    if (window.WPL) for (const sf of shareFilters()) for (const [y, v] of window.WPL.shareSig(sf.id, sf.label, TS_YEARS, sf.share)) {
      const cur = m.get(y);
      m.set(y, cur ? { level: Math.max(cur.level, v.level), text: cur.text + " " + v.text } : v);
    }
    return m;
  }
  function startPlay() {
    const sp = sliderSpan();
    if (!sp) return;
    const [y0, y1] = sp;
    if (!state.year || state.year >= y1) setYear(y0);
    const sig = timeSig();
    // one year at a time; it lingers on years with big changes so they can be seen
    const tick = () => {
      const now = sliderSpan();   // a filter may have been removed while playing
      if (!now || !state.year || state.year >= Math.min(y1, now[1])) return stopPlay();
      setYear(state.year + 1);
      const s = sig.get(state.year);
      playing = setTimeout(tick, (window.WPL ? window.WPL.ms(550) : 550) * (s ? (s.level === 2 ? 3 : 2) : 1));
    };
    playing = setTimeout(tick, window.WPL ? window.WPL.ms(550) : 550);
    renderTimebar();
  }
  function stopPlay() { if (playing) { clearTimeout(playing); playing = null; renderTimebar(); } }

  // ---------- Refugee flow view ----------
  let flowScale = null;
  // migrants by country of birth (UN DESA): loaded after the page has started
  let MIG = window.__MIGRATION__ || null;
  // migration data comes in a later release
  function migPairs(iso, col) { if (!MIG) return []; const yi = MIG.years.length - 1; return MIG.pairs.filter((p) => p[col] === iso && p[2 + yi] > 0).map((p) => [p[col === 0 ? 1 : 0], p[2 + yi]]).sort((a, b) => b[1] - a[1]); }
  function flowValues() {
    const { iso, dir } = state.flow;
    const vals = new Map();
    if (state.flow.kind === "mig") {
      if (!MIG) return vals;
      const yi = state.flow.y ?? MIG.years.length - 1;
      for (const p of MIG.pairs) {
        const v = p[2 + yi];
        if (!v) continue;
        if (dir === "from" && p[1] === iso) vals.set(p[0], v);
        if (dir === "to" && p[0] === iso) vals.set(p[1], v);
      }
      return vals;
    }
    for (const [o, h, n] of flows) {
      if (dir === "from" && o === iso) vals.set(h, n);
      if (dir === "to" && h === iso) vals.set(o, n);
    }
    return vals;
  }
  function applyFlow() {
    const { iso, dir } = state.flow;
    const src = byIso.get(iso);
    const vals = flowValues();
    const ext = d3.extent([...vals.values()]);
    const css = getComputedStyle(document.documentElement);
    const lo = css.getPropertyValue("--ramp-lo").trim(), hi = css.getPropertyValue("--ramp-hi").trim();
    const interp = d3.interpolateRgb(lo, hi);
    const t = (v) => (ext[0] === ext[1] ? 1 : (Math.log10(v) - Math.log10(ext[0])) / (Math.log10(ext[1]) - Math.log10(ext[0])));
    flowScale = { vals, ext, lo, hi };
    paths.attr("class", (d) => (d.rec && d.rec.iso3 === iso ? "flow-src" : ""))
      .style("fill", (d) => { const v = d.rec && vals.get(d.rec.iso3); return v ? interp(t(v)) : null; });
    const total = d3.sum([...vals.values()]);
    const bar = $("#flowbar");
    bar.hidden = false;
    const mig = state.flow.kind === "mig";
    const who = mig ? (dir === "from" ? `people born in <b>${esc(src.name)}</b>` : `migrants in <b>${esc(src.name)}</b>`) : null;
    const yi = mig && MIG ? state.flow.y ?? MIG.years.length - 1 : 0;
    bar.innerHTML = `<p>${mig
      ? (dir === "from" ? `Where ${who} live abroad: <b>${d3.format(",")(total)}</b> people in ${vals.size} areas` : `Where ${who} were born: <b>${d3.format(",")(total)}</b> people from ${vals.size} areas`)
      : dir === "from"
      ? `Where refugees from <b>${esc(src.name)}</b> live: <b>${d3.format(",")(total)}</b> people in ${vals.size} ${vals.size === 1 ? "area" : "areas"}`
      : `Where refugees in <b>${esc(src.name)}</b> come from: <b>${d3.format(",")(total)}</b> people from ${vals.size} ${vals.size === 1 ? "area" : "areas"}`}</p>
      ${mig && MIG ? `<label class="flowyr">Year <select id="flowYear">${MIG.years.map((y, i) => `<option value="${i}" ${i === yi ? "selected" : ""}>${y}</option>`).join("")}</select></label>
        <button type="button" class="ghost" id="flowFlip">${dir === "from" ? "Who lives here?" : "Where do its people live?"}</button>` : ""}
      <button type="button" class="ghost" id="flowClose">Close</button>`;
    $("#flowClose").onclick = () => { state.flow = null; render(); };
    if ($("#flowYear")) $("#flowYear").onchange = (e) => { state.flow.y = +e.target.value; render(); };
    if ($("#flowFlip")) $("#flowFlip").onclick = () => { state.flow.dir = dir === "from" ? "to" : "from"; render(); };
  }

  // ---------- Map styles: change over time, two measures at once, countries sized by population ----------
  let styleInfo = null;
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const yearlyNumeric = (f) => f && f.type === "range" && TS[f.key] && !CAT_TS[f.key] && !f.hidden && !f.target;
  // <select> options for measures, grouped by category; onlyYearly limits them to measures with yearly data
  function measureOptions(selected, onlyYearly) {
    return window.FILTER_GROUPS.map((g) => {
      const fs = numericFilters.filter((f) => f.group === g && (!onlyYearly || yearlyNumeric(f))).sort(byLabel);
      return fs.length ? `<optgroup label="${esc(g)}">${fs.map((f) => `<option value="${f.key}" ${selected === f.key ? "selected" : ""}>${esc(f.label)}${f.time && !onlyYearly ? " ◷" : ""}</option>`).join("")}</optgroup>` : "";
    }).join("");
  }
  function defaultChangeKey() {
    const ck = colourKey();
    if (ck && yearlyNumeric(F[ck])) return ck;
    const fl = state.filters.find((x) => yearlyNumeric(F[x.key]));
    return fl ? fl.key : "median_age";
  }
  function changeYears() {
    const key = state.mm.ck || defaultChangeKey();
    const sp = span(key) || [TS_YEARS[0], TS_YEARS[TS_YEARS.length - 1]];
    const to = Math.min(Math.max(state.mm.to || sp[1], sp[0]), sp[1]);
    let from = state.mm.from || Math.max(sp[0], Math.min(1990, to - 10));
    from = Math.min(Math.max(from, sp[0]), to);
    return { key, sp, from, to };
  }
  function fmtChange(f, d, pct) {
    const sign = d > 0 ? "+" : d < 0 ? "−" : "±";
    const a = Math.abs(d);
    if (pct) return `${sign}${a >= 100 ? d3.format(",")(Math.round(a)) : +a.toPrecision(2)}%`;
    if (f.format === "pct") return `${sign}${+a.toFixed(a < 10 ? 1 : 0)} points`;
    return sign + fmtShort(f, a);
  }
  function changeInfo() {
    const { key, from, to } = changeYears();
    const f = F[key];
    if (!f) return null;
    const pct = state.mm.pct;
    const vals = new Map();
    for (const r of pool()) {
      const a = tsValue(key, r.iso3, from), b = tsValue(key, r.iso3, to);
      if (a == null || b == null) continue;
      const d = pct ? (a > 0 ? ((b - a) / a) * 100 : null) : b - a;
      if (d != null && Number.isFinite(d)) vals.set(r.iso3, { a, b, d });
    }
    const abs = [...vals.values()].map((v) => Math.abs(v.d)).sort(d3.ascending);
    const m = d3.quantileSorted(abs, 0.95) || 1;
    const lo = cssVar("--div-lo"), mid = cssVar("--div-mid"), hi = cssVar("--div-hi");
    const interp = d3.scaleLinear().domain([-m, 0, m]).range([lo, mid, hi]).interpolate(d3.interpolateRgb).clamp(true);
    return {
      kind: "change", f, from, to, pct, vals, m, lo, mid, hi,
      colour: (iso) => (vals.has(iso) ? interp(vals.get(iso).d) : null),
      tip: (r) => {
        const v = vals.get(r.iso3);
        return v ? `<dl><dt>${esc(f.short || f.label)} ${from}</dt><dd>${esc(fmtShort(f, v.a))}</dd><dt>${to}</dt><dd>${esc(fmtShort(f, v.b))}</dd><dt>Change</dt><dd><b>${esc(fmtChange(f, v.d, pct))}</b></dd></dl>`
          : `<span class="st">No data on ${esc(f.label.toLowerCase())} for both years</span>`;
      },
      csv: () => [["Area", `${f.label} ${from}`, `${f.label} ${to}`, pct ? "% change" : "Change"],
        ...[...vals].map(([iso, v]) => [byIso.get(iso).name, v.a, v.b, +v.d.toFixed(3)])],
    };
  }
  const BI = ["--bi-00", "--bi-10", "--bi-20", "--bi-01", "--bi-11", "--bi-21", "--bi-02", "--bi-12", "--bi-22"];
  function biInfo() {
    const fx = F[state.mm.bx || "median_age"], fy = F[state.mm.by || "density"];
    if (!fx || !fy) return null;
    const pts = pool().filter((r) => typeof r[fx.key] === "number" && typeof r[fy.key] === "number");
    if (pts.length < 6) return null;
    const qs = (f) => { const v = pts.map((r) => r[f.key]).sort(d3.ascending); return [d3.quantileSorted(v, 1 / 3), d3.quantileSorted(v, 2 / 3)]; };
    const qx = qs(fx), qy = qs(fy);
    const third = (v, q) => (v <= q[0] ? 0 : v <= q[1] ? 1 : 2);
    const cols = BI.map(cssVar);
    const cell = new Map(pts.map((r) => [r.iso3, [third(r[fx.key], qx), third(r[fy.key], qy)]]));
    const WORD = ["lowest third", "middle third", "highest third"];
    return {
      kind: "bi", fx, fy, qx, qy, cols, cell,
      colour: (iso) => { const c = cell.get(iso); return c ? cols[c[1] * 3 + c[0]] : null; },
      tip: (r) => {
        const c = cell.get(r.iso3);
        return c ? `<dl><dt>${esc(fx.short || fx.label)}</dt><dd>${esc(fmtShort(fx, r[fx.key]))} <small>(${WORD[c[0]]})</small></dd><dt>${esc(fy.short || fy.label)}</dt><dd>${esc(fmtShort(fy, r[fy.key]))} <small>(${WORD[c[1]]})</small></dd></dl>`
          : `<span class="st">Missing data for one of the two measures</span>`;
      },
      csv: () => [["Area", fx.label, fy.label, `${fx.label} third`, `${fy.label} third`],
        ...pts.map((r) => [r.name, r[fx.key], r[fy.key], cell.get(r.iso3)[0] + 1, cell.get(r.iso3)[1] + 1])],
    };
  }

  // Countries drawn as circles sized by population (a Dorling cartogram), pushed apart so they don't overlap
  const gCarto = gRoot.insert("g", () => gDots.node()).attr("class", "carto");
  let cartoNodes = new Map(), cartoSig = "";
  function cartoLayout() {
    const vb = svg.attr("viewBox").split(" ").map(Number);
    const list = rows.filter((r) => typeof r.population === "number" && r.population > 0 && (r.sovereign || state.territories || r.population > 2e5) && (r._pt || (r._pt = centroidFor(r))));
    const sig = vb.join(",") + "|" + list.length + "|" + (state.year || "") + "|" + state.territories;
    if (sig === cartoSig) return;
    cartoSig = sig;
    const total = d3.sum(list, (r) => r.population);
    const kr = Math.sqrt((0.2 * vb[2] * vb[3]) / (Math.PI * total));
    const nodes = list.map((r) => {
      const old = cartoNodes.get(r.iso3);
      return { rec: r, r: Math.max(1.6, kr * Math.sqrt(r.population)), tx: r._pt[0], ty: r._pt[1], x: old ? old.x : r._pt[0], y: old ? old.y : r._pt[1] };
    });
    const sim = d3.forceSimulation(nodes)
      .force("x", d3.forceX((d) => d.tx).strength(0.12)).force("y", d3.forceY((d) => d.ty).strength(0.12))
      .force("c", d3.forceCollide((d) => d.r + 0.7).iterations(3)).stop();
    for (let i = 0; i < (cartoNodes.size ? 80 : 240); i++) sim.tick();
    cartoNodes = new Map(nodes.map((n) => [n.rec.iso3, n]));
  }
  // everyday short names for long country names (never codes)
  const SHORT_NAMES = { USA: "USA", GBR: "UK", ARE: "UAE", COD: "DR Congo", COG: "Congo", CAF: "C. African Rep.", KOR: "S. Korea", PRK: "N. Korea",
    BIH: "Bosnia", DOM: "Dominican Rep.", PNG: "Papua NG", SAU: "Saudi", ZAF: "S. Africa", SSD: "S. Sudan", TTO: "Trinidad", VCT: "St Vincent", MKD: "N. Macedonia" };
  function drawCarto(clsFor, fillFor) {
    if (!state.popSized || state.flow) { gCarto.selectAll("*").remove(); return; }
    cartoLayout();
    const nodes = [...cartoNodes.values()].filter((n) => n.rec.sovereign || state.territories || n.rec.population > 2e5);
    const g = gCarto.selectAll("g.cn").data(nodes, (d) => d.rec.iso3).join((en) => {
      const gg = en.append("g").attr("class", "cn");
      gg.append("circle"); gg.append("text");
      return gg;
    });
    g.attr("transform", (d) => `translate(${d.x.toFixed(1)},${d.y.toFixed(1)})`);
    g.select("circle").attr("r", (d) => d.r).attr("data-iso", (d) => d.rec.iso3)
      .attr("class", (d) => clsFor(d.rec) + (d.rec.iso3 === state.selected ? " sel" : ""))
      .style("fill", (d) => fillFor(d.rec));
    // white names on dark circles, dark names on light ones
    const darkFill = (d) => { const c = fillFor(d.rec) || (clsFor(d.rec) === "match" ? cssVar("--match") : cssVar("--land")); const l = d3.lab(c).l; return Number.isFinite(l) && l < 55; };
    const fits = (t, d) => t.length * Math.min(12, d.r * 0.55) * 0.56 < d.r * 1.8;
    const label = (d) => {
      if (d.r < 9) return "";
      const n = d.rec.name, sh = SHORT_NAMES[d.rec.iso3];
      if (fits(n, d)) return n;
      if (sh && fits(sh, d)) return sh;
      const w = n.split(" ")[0];
      return w.length >= 4 && fits(w + "…", d) ? w + "…" : "";
    };
    g.select("text").text(label)
      .attr("class", (d) => (darkFill(d) ? "lt" : null))
      .attr("font-size", (d) => Math.min(12, d.r * 0.55)).attr("dy", "0.35em");
  }

  function renderMapStyle() {
    const btn = $("#mmBtn"), card = $("#mmCard");
    if (state.mode === "physical" && window.WP?.loaded) {
      btn.hidden = !!state.flow;
      btn.setAttribute("aria-expanded", String(!card.hidden));
      const names = { landforms: "Landforms", biomes: "Biomes", climate: "Climate zones", plates: "Plates", none: "Plain" };
      btn.innerHTML = `🎨 Map style: <b>${names[window.WP.style.base]}</b>`;
      if (!card.hidden) {
        window.WP.styleCard(card, () => render());
        $("#mmClose").onclick = () => { card.hidden = true; renderMapStyle(); };
      }
      return;
    }
    const name = { std: "", change: "Change", bi: "Two measures" }[state.mapStyle];
    btn.innerHTML = `🎨 Map style${name || state.popSized ? `: <b>${[name, state.popSized ? "by population" : ""].filter(Boolean).join(", ")}</b>` : ""}`;
    btn.hidden = !!state.flow;
    btn.setAttribute("aria-expanded", String(!card.hidden));
    if (card.hidden) return;
    const st = state.mapStyle;
    let body = "";
    if (st === "change") {
      const { key, sp, from, to } = changeYears();
      const yrs = d3.range(sp[0], sp[1] + 1);
      const yo = (sel) => yrs.map((y) => `<option ${y === sel ? "selected" : ""}>${y}</option>`).join("");
      body = `<label class="fld">Measure <select id="mmCk" data-pick>${measureOptions(key, true)}</select></label>
        <div class="fld2"><label class="fld">From <select id="mmFrom">${yo(from)}</select></label><label class="fld">To <select id="mmTo">${yo(to)}</select></label></div>
        <label class="tog"><input type="checkbox" id="mmPct" ${state.mm.pct ? "checked" : ""}> Show as % change</label>
        <p class="hint">${state.filters.length ? "Only areas that match your filters are coloured. " : ""}Red: went up. Blue: went down.</p>`;
    } else if (st === "bi") {
      body = `<label class="fld">Across (colours get redder) <select id="mmBx" data-pick>${measureOptions(state.mm.bx || "median_age")}</select></label>
        <label class="fld">Up (colours get bluer) <select id="mmBy" data-pick>${measureOptions(state.mm.by || "density")}</select></label>
        <p class="hint">Each measure is split into thirds: low, middle and high. Dark purple means high on both.</p>`;
    } else {
      body = `<p class="hint">Colour shows the areas that match your filters, shaded by a number if you choose one.</p>`;
    }
    card.innerHTML = `<div class="mmhead"><h3>Map style</h3><button type="button" class="iconbtn" id="mmClose" aria-label="Close">×</button></div>
      <div class="seg" role="radiogroup" aria-label="Colour the map by">
        ${[["std", "Filters"], ["change", "Change over time"], ["bi", "Two measures"]].map(([v, l]) => `<button type="button" role="radio" aria-checked="${st === v}" data-st="${v}">${l}</button>`).join("")}
      </div>${body}
      <label class="tog"><input type="checkbox" id="mmPop" ${state.popSized ? "checked" : ""}> Size areas by population</label>`;
    card.querySelectorAll(".seg button").forEach((b) => (b.onclick = () => { state.mapStyle = b.dataset.st; if (b.dataset.st === "change" && !state.mm.ck) state.mm.ck = defaultChangeKey(); render(); }));
    $("#mmClose").onclick = () => { card.hidden = true; renderMapStyle(); };
    $("#mmPop").onchange = (e) => { state.popSized = e.target.checked; render(); };
    if ($("#mmCk")) $("#mmCk").onchange = (e) => { state.mm.ck = e.target.value; state.mm.from = state.mm.to = null; render(); };
    if ($("#mmFrom")) $("#mmFrom").onchange = (e) => { state.mm.from = +e.target.value; render(); };
    if ($("#mmTo")) $("#mmTo").onchange = (e) => { state.mm.to = +e.target.value; render(); };
    if ($("#mmPct")) $("#mmPct").onchange = (e) => { state.mm.pct = e.target.checked; render(); };
    if ($("#mmBx")) $("#mmBx").onchange = (e) => { state.mm.bx = e.target.value; render(); };
    if ($("#mmBy")) $("#mmBy").onchange = (e) => { state.mm.by = e.target.value; render(); };
  }
  $("#mmBtn").onclick = () => { $("#mmCard").hidden = !$("#mmCard").hidden; renderMapStyle(); };

  // ---------- Views: map, or a chart from views.js ----------
  document.querySelectorAll("#views button").forEach((b) => (b.onclick = () => setView(b.dataset.v)));
  function setView(v) {
    if (state.view === v) return;
    state.view = v;
    stopPlay();
    render();
  }
  function renderViews() {
    document.querySelectorAll("#views button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.v === state.view)));
    const isMap = state.view === "map";
    $("#mapwrap").hidden = !isMap;
    $("#viewwrap").hidden = isMap;
    document.body.dataset.view = state.view;
  }

  function styleLegend(si) {
    if (si.kind === "change") {
      const f = si.f;
      return `<div class="lrow"><span>${esc(f.label)}: ${si.pct ? "% change" : "change"}, ${si.from}–${si.to}</span></div>
        <div class="lrow"><span class="num">${esc(fmtChange(f, -si.m, si.pct))}</span><span class="ramp" style="background:linear-gradient(90deg, ${si.lo}, ${si.mid}, ${si.hi})"></span><span class="num">${esc(fmtChange(f, si.m, si.pct))}</span></div>
        <div class="lrow lsub"><span>went down</span><span>went up</span></div>`;
    }
    const grid = [2, 1, 0].map((y) => [0, 1, 2].map((x) => `<span style="background:${si.cols[y * 3 + x]}"></span>`).join("")).join("");
    return `<div class="bilegend"><div class="bigrid" role="img" aria-label="Key: three by three grid of colours">${grid}</div>
      <div class="bitext"><span>↑ ${esc(si.fy.short || si.fy.label)}</span><span>→ ${esc(si.fx.short || si.fx.label)}</span><small>Split into thirds. Dark = high on both.</small></div></div>`;
  }
  const CLASS_NAMES = { equal: "Equal interval", quantile: "Quantiles (same number in each)", jenks: "Natural breaks (Jenks)" };
  function rampHTML(cs) {
    const pick = `<select class="lclass" aria-label="How the key is split">${[["", "Smooth"], ["equal", "Equal interval"], ["quantile", "Quantiles"], ["jenks", "Natural breaks"]]
      .map(([v, l]) => `<option value="${v}" ${state.classes === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
    if (!cs.breaks) return `<div class="lrow"><span class="num">${fmtShort(cs.f, cs.ext[0])}</span><span class="ramp" style="background:linear-gradient(90deg, ${cs.grad})"></span><span class="num">${fmtShort(cs.f, cs.ext[1])}</span>${pick}</div>`;
    const nsel = `<select class="lncl" aria-label="Number of classes">${[3, 4, 5, 6, 7].map((n) => `<option ${n === state.nClasses ? "selected" : ""}>${n}</option>`).join("")}</select>`;
    return `<div class="lrow lclasses">${cs.cols.map((c, i) => `<span class="lcl" title="${cs.counts[i]} areas"><i style="background:${c}"></i>${fmtShort(cs.f, cs.breaks[i])}–${fmtShort(cs.f, cs.breaks[i + 1])}<b>${cs.counts[i]}</b></span>`).join("")}${pick}${nsel}</div>`;
  }
  $("#legend").addEventListener("change", (e) => {
    if (e.target.matches(".lclass")) { state.classes = e.target.value; render(); }
    if (e.target.matches(".lncl")) { state.nClasses = +e.target.value; render(); }
  });
  function renderLegend(cs, act) {
    const el = $("#legend");
    if (state.flow && flowScale) {
      el.hidden = false;
      el.innerHTML = `<div class="lrow"><span>${state.flow.kind === "mig" ? `Migrants, ${MIG ? MIG.years[state.flow.y ?? MIG.years.length - 1] : ""} (groups of 500 or more; UN DESA)` : "Refugees (groups of 100 or more)"}</span></div><div class="lrow"><span class="num">${compact(flowScale.ext[0] || 0)}</span><span class="ramp" style="background:linear-gradient(90deg, ${flowScale.lo}, ${flowScale.hi})"></span><span class="num">${compact(flowScale.ext[1] || 0)}</span></div>`;
      return;
    }
    if (styleInfo) {
      el.hidden = false;
      el.innerHTML = styleLegend(styleInfo) + (state.popSized ? `<div class="lrow"><span class="sw city"></span>Circles sized by population</div>` : "");
      return;
    }
    const physLeg = window.WP ? window.WP.legendHTML(state, lastEval) : "";
    if (state.mode === "physical") {
      let h = physLeg;
      if (cs) h += `<div class="lrow"><span>${esc(cs.f.label)}</span></div>` + rampHTML(cs);
      else if (act.length) h += `<div class="lrow"><span class="sw" style="background:var(--match)"></span>Matches every area filter</div>`;
      el.hidden = !h; el.innerHTML = h; return;
    }
    if (!act.length && !showCities() && !state.popSized) { el.hidden = true; return; }
    el.hidden = false;
    let h = state.popSized ? `<div class="lrow"><span class="sw city"></span>Circles sized by population</div>` : "";
    if (cs) {
      h += `<div class="lrow"><span>${esc(cs.f.label)}${state.year && cs.f.time ? `, ${state.year}` : ""}</span></div>` + rampHTML(cs);
    } else if (act.length) {
      h += `<div class="lrow"><span class="sw" style="background:var(--match)"></span>Matches every filter</div>`;
    }
    const anyShade = [...lastEval.groups.values()].some((g) => g.length <= NEAR_MAP);
    if (anyShade) h += `<div class="lrow"><span class="sw hatch"></span>Near miss: fails just one filter</div>`;
    if (showCities()) h += `<div class="lrow"><span class="sw city"></span>City, sized by population<span class="sw city cap"></span>Capital</div>`;
    el.innerHTML = h;
  }

  // ---------- Starter card and question of the day ----------
  const puzzles = window.PUZZLES.map((p) => ({ ...p, n: countFor(p.filters) })).filter((p) => p.n >= 1 && p.n <= 8);
  // the countries (not territories) that pass a set of preset filters, including city filters
  function matchList(presets) {
    const fls = presets.map((p) => makeFilter(p.key, p));
    const cf = fls.filter(isCity), nf = fls.filter((fl) => !isCity(fl));
    return rows.filter((r) => r.sovereign && nf.every((fl) => passes(r, fl)) &&
      (!cf.length || cities.some((c) => c.iso3 === r.iso3 && cf.every((fl) => passes(c, fl)))));
  }
  function countFor(presets) {
    const fls = presets.map((p) => makeFilter(p.key, p));
    const cf = fls.filter(isCity), nf = fls.filter((fl) => !isCity(fl));
    return rows.filter((r) => r.sovereign && nf.every((fl) => passes(r, fl)) &&
      (!cf.length || cities.some((c) => c.iso3 === r.iso3 && cf.every((fl) => passes(c, fl))))).length;
  }
  function todaysPuzzle() {
    if (!puzzles.length) return null;
    const day = Math.floor(Date.now() / 864e5);
    return puzzles[day % puzzles.length];
  }
  function applyPreset(presets) {
    state.filters = presets.map((p) => makeFilter(p.key, p));
    state.open = null; state.selected = null;
    state.tab = state.filters.some(isCity) && !state.filters.some((fl) => !isCity(fl)) ? "cities" : "areas";
    render();
  }
  function renderStarter(act) {
    const el = $("#starter");
    if (window.WQ) return window.WQ.renderCard(el);
    el.hidden = !!state.filters.length || state.starterHidden || !!state.flow || (desk() && !!state.selected);
    if (el.hidden) return;
    const pz = todaysPuzzle();
    el.innerHTML = `
      <button class="iconbtn hide" type="button" aria-label="Hide">×</button>
      <h2>Ask the map a question</h2>
      <p>Browse the themes or search above, or start from one of these.</p>
      <div class="presets">${window.STARTERS.map((s, i) => `<button type="button" data-i="${i}">${esc(s.title)}</button>`).join("")}</div>
      ${pz ? `<div class="qotd"><div class="eyebrow">Question of the day</div><p>${esc(pz.q)}</p>
        <button class="linkbtn" type="button" id="reveal">Show the filters that answer it</button></div>` : ""}`;
    el.querySelector(".hide").onclick = () => { state.starterHidden = true; render(); };
    el.querySelectorAll(".presets button").forEach((b) => (b.onclick = () => applyPreset(window.STARTERS[+b.dataset.i].filters)));
    const rv = el.querySelector("#reveal"); if (rv) rv.onclick = () => applyPreset(pz.filters);
  }

  // ---------- Zero results ----------
  function renderZero(act, matches) {
    const el = $("#zero");
    if (!act.length || matches.length || state.flow) { el.hidden = true; return; }
    const tries = act.map((fl) => {
      const rest = act.filter((x) => x !== fl);
      return { fl, n: pool().filter((r) => rest.every((x) => passes(r, x))).length };
    }).filter((t) => t.n > 0).sort((a, b) => b.n - a.n).slice(0, 3);
    el.hidden = false;
    el.innerHTML = `<h3>No areas match all ${act.length} filters</h3>
      <p>${tries.length ? "Dropping one of them would bring some back:" : "Try removing a filter."}</p>
      <ul>${tries.map((t, i) => `<li><button type="button" data-i="${i}">Remove <b>${esc(chipLabel(t.fl))}</b> → ${t.n} ${t.n === 1 ? "match" : "matches"}</button></li>`).join("")}</ul>`;
    el.querySelectorAll("button").forEach((b) => (b.onclick = () => {
      const fl = tries[+b.dataset.i].fl;
      if (fl._t) { state.filters = state.filters.filter((x) => F[x.key].target !== fl._t); render(); } else removeFilter(fl.key);
    }));
  }

  // ---------- Filter editor ----------
  function othersPass(r, key) {
    return active().every((fl) => fl.key === key || passes(r, fl));
  }
  function renderEditor() {
    // a filter only counts as "new" while its editor is first open
    state.filters.forEach((x) => { if (x.key !== state.open) delete x.fresh; });
    const fl = state.filters.find((x) => x.key === state.open);
    const el = $("#editor");
    if (!fl) { el.hidden = true; return; }
    const f = F[fl.key];
    const src = window.SOURCES[f.source];
    const year = state.year && f.time ? String(state.year) : yearLabel(f);
    const timeNote = !f.time ? (state.year ? `<br><b>Not yearly:</b> this filter uses the latest data, whatever year you pick.` : "")
      : `</p><p class="info tinfo">${CLOCK} <span><b>Yearly data from ${timeFrom(f.key)}.</b> Use the year slider under the map to see this filter in earlier years.</span>`;
    const keepSearch = el.querySelector(".optsearch")?.value || "";
    const scroll = el.querySelector(".opts")?.scrollTop || 0;
    el.hidden = false;
    el.dataset.g = gslug(f.group);
    const fam = famOf[fl.key];
    el.innerHTML = `<div class="eyebrow">${esc(f.group)}${fam ? ` · ${esc(fam.label)}` : ""}</div><header><h3>${esc(f.label)}</h3>${fl.fresh
        ? `<button type="button" class="iconbtn edtop add" id="edTop" aria-label="Add this filter" title="Add this filter">＋</button>`
        : `<button type="button" class="iconbtn edtop" id="edTop" aria-label="Remove this filter" title="Remove this filter">×</button>`}</header>
      <p class="info">${glossify(esc(f.info))} <br>Source: <a href="${src.url}" target="_blank" rel="noopener">${esc(src.name)}</a>${year ? `, ${year}` : ""}.${timeNote}</p>
      ${window.WL && !f.target ? `<details class="edmore"><summary>Find out more about ${esc(lowerL(f.label))}</summary>${window.WL.html(window.WL.measure(f), "")}</details>` : ""}
      ${famPicker(fl)}
      ${f.modes ? `<div class="seg modes" role="group" aria-label="Match">
        ${[["any", "Any of these"], ["all", "All of these"], ["none", "None of these"]].map(([m, t]) => `<button type="button" data-mode="${m}" class="${(fl.mode || "any") === m ? "on" : ""}">${t}</button>`).join("")}</div>` : ""}
      <div id="edBody"></div>
      <div class="edfoot">${fl.fresh
        ? `<button type="button" class="edadd" id="edDone">＋ Add this filter</button><button type="button" class="ghost" id="edCancel">Cancel</button>`
        : `<button type="button" class="edadd" id="edDone">✓ Done</button><button type="button" class="remove" id="edRemove">Remove this filter</button>`}</div>`;
    el.querySelectorAll(".modes button").forEach((b) => (b.onclick = () => { fl.mode = b.dataset.mode; render(); }));
    el.querySelectorAll(".fampick button").forEach((b) => (b.onclick = () => switchVariant(fl, b.dataset.key)));
    const done = () => { delete fl.fresh; state.open = null; render(); };
    $("#edDone").onclick = done;
    $("#edTop").onclick = () => (fl.fresh ? done() : removeFilter(fl.key));
    if ($("#edRemove")) $("#edRemove").onclick = () => removeFilter(fl.key);
    if ($("#edCancel")) $("#edCancel").onclick = () => removeFilter(fl.key);
    const body = $("#edBody");
    if (f.type === "range") rangeEditor(body, f, fl);
    else if (f.type === "bool") boolEditor(body, f, fl);
    else optionEditor(body, f, fl, keepSearch, scroll);
  }

  // Picker for switching between the measures in a family
  function famPicker(fl) {
    const fam = famOf[fl.key];
    if (!fam || fam.variants.length < 2) return "";
    const taken = new Set(state.filters.map((x) => x.key));
    return `<div class="fampick" role="group" aria-label="Choose a measure">${fam.variants.map(([k, lab]) =>
      `<button type="button" data-key="${k}" class="${k === fl.key ? "on" : ""}" ${k !== fl.key && taken.has(k) ? "disabled title=\"Already added\"" : ""}>${F[k].time ? CLOCK : ""}${esc(lab)}</button>`).join("")}</div>`;
  }
  function switchVariant(fl, key) {
    if (key === fl.key || state.filters.some((x) => x.key === key)) return;
    const f = F[key], old = F[fl.key];
    const nf = makeFilter(key, f.type === "multi" ? { values: fl.values.filter((v) => f.options.includes(v)), mode: fl.mode } : {});
    state.filters[state.filters.indexOf(fl)] = nf;
    if (state.colourBy === fl.key) state.colourBy = "";
    if (state.sort === fl.key) state.sort = "";
    state.open = key;
    void old;
    render();
  }

  function rangeEditor(body, f, fl) {
    const T0 = f.toT(f.dmin), T1 = f.toT(f.dmax);
    const vals = (f.target ? itemsFor(f) : pool()).map((r) => r[f.key]).filter((v) => typeof v === "number" && (f.scale !== "log" || v > 0));
    const bins = d3.bin().domain([T0, T1]).thresholds(28)(vals.map((v) => Math.min(Math.max(f.toT(v), T0), T1)));
    const maxN = d3.max(bins, (b) => b.length) || 1;
    const W = 330, H = 56;
    const x = (t) => ((t - T0) / (T1 - T0)) * W;
    const s = fl.slice;
    const mode = !s ? "range" : s.k === "q" ? "q" + (s.of === 5 ? 5 : 4) : s.k;
    const noun = f.target === "city" ? "cities" : f.target ? (window.WP?.T?.[f.target]?.many || "places") : state.territories ? "places" : "areas";
    const isRank = f.format === "rank";
    body.innerHTML = `
      <div class="seg slicemodes" role="radiogroup" aria-label="How to choose">
        ${[["range", "Range"], ["top", isRank ? "Top" : "Highest"], ["bottom", isRank ? "Bottom" : "Lowest"], ["q4", "Quartiles"], ["q5", "Quintiles"]].map(([m, t]) => `<button type="button" role="radio" data-sm="${m}" class="${mode === m ? "on" : ""}" aria-checked="${mode === m}">${t}</button>`).join("")}
      </div>
      <svg class="hist" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        ${bins.map((b) => `<rect data-a="${b.x0}" data-b="${b.x1}" x="${x(b.x0) + 0.5}" width="${Math.max(0, x(b.x1) - x(b.x0) - 1)}" y="${H - (b.length / maxN) * (H - 2)}" height="${(b.length / maxN) * (H - 2)}"></rect>`).join("")}
      </svg>
      <div class="slicebox" ${s ? "" : "hidden"}></div>
      <div class="dual" ${s ? "hidden" : ""}><div class="track"></div><div class="fill"></div>
        <input type="range" id="rLo" min="0" max="1000" step="1" aria-label="Minimum">
        <input type="range" id="rHi" min="0" max="1000" step="1" aria-label="Maximum">
      </div>
      <div class="bounds" ${s ? "hidden" : ""}>
        <label for="nLo">At least<input id="nLo" inputmode="decimal"></label>
        <label for="nHi">At most<input id="nHi" inputmode="decimal"></label>
      </div>
      ${UNITS[f.format] ? `<p class="info unit">Values are${esc(UNITS[f.format])}.</p>` : ""}`;
    const lo = $("#rLo"), hi = $("#rHi"), nLo = $("#nLo"), nHi = $("#nHi");
    // switching between a range and a slice
    body.querySelectorAll(".slicemodes button").forEach((b) => (b.onclick = () => {
      const m = b.dataset.sm;
      if (m === mode) return;
      if (m === "range") { delete fl.slice; fl.min = f.dmin; fl.max = f.dmax; }
      else if (m === "top" || m === "bottom") fl.slice = { k: m, n: s && s.n ? s.n : 10 };
      else fl.slice = { k: "q", of: m === "q5" ? 5 : 4, g: [m === "q5" ? 5 : 4] };
      render();
    }));
    if (s) {
      const info = sliceInfo(fl);
      const box = body.querySelector(".slicebox");
      if (s.k === "q") {
        const of = s.of === 5 ? 5 : 4;
        const items = (f.target ? itemsFor(f) : pool()).filter((r) => typeof r[fl.key] === "number").length;
        box.innerHTML = `<div class="qpick" role="group" aria-label="Which groups">${QNAMES[of].map((nm, i) => `<button type="button" data-g="${i + 1}" class="${s.g.includes(i + 1) ? "on" : ""}" aria-pressed="${s.g.includes(i + 1)}">${esc(nm)}</button>`).join("")}</div>
          <p class="info">${of === 5 ? "Quintiles split" : "Quartiles split"} the ${items} ${noun} with data into ${of} equal groups, from the lowest values to the highest. Tick more than one to combine them.</p>`;
        box.querySelectorAll(".qpick button").forEach((b) => (b.onclick = () => {
          const g = +b.dataset.g;
          s.g = s.g.includes(g) ? s.g.filter((x) => x !== g) : s.g.concat(g).sort((x, y) => x - y);
          if (!s.g.length) s.g = [g];
          render();
        }));
      } else {
        const QUICK = [5, 10, 20, 50];
        box.innerHTML = `<div class="topn"><label>${s.k === "top" ? (isRank ? "Top" : "Highest") : isRank ? "Bottom" : "Lowest"} <input type="number" id="sN" min="1" max="${info.of}" value="${s.n}" inputmode="numeric"></label>
          <span class="quick">${QUICK.map((q) => `<button type="button" data-n="${q}" class="${s.n === q ? "on" : ""}">${q}</button>`).join("")}</span></div>
          <p class="info">Out of the ${info.of} ${noun} with data${state.year && f.time ? ` in ${state.year}` : ""}${s.w ? " that pass your other filters" : ", whatever your other filters"}.</p>`;
        const setN = (v) => { v = Math.round(+v); if (v >= 1) { s.n = Math.min(v, info.of); render(); } };
        box.querySelector("#sN").onchange = (e) => setN(e.target.value);
        box.querySelectorAll(".quick button").forEach((b) => (b.onclick = () => setN(b.dataset.n)));
      }
      if (!f.target) {
        box.insertAdjacentHTML("beforeend", `<label class="tog slicew"><input type="checkbox" id="sW" ${s.w ? "checked" : ""}> Only among areas that pass my other filters</label>`);
        box.querySelector("#sW").onchange = (e) => { s.w = e.target.checked; render(); };
      }
      box.insertAdjacentHTML("beforeend", info.n ? `<p class="sliceres">${info.n} ${noun}: ${esc(fmtShort(f, info.lo))} to ${esc(fmtShort(f, info.hi))}</p>` : "");
      const tA = f.toT(info.lo ?? f.dmin), tB = f.toT(info.hi ?? f.dmin);
      body.querySelectorAll(".hist rect").forEach((r) => r.classList.toggle("in", +r.dataset.b >= tA && +r.dataset.a <= tB));
      return;
    }
    const toPos = (v) => Math.round(((f.toT(v) - T0) / (T1 - T0)) * 1000);
    const fromPos = (p) => {
      if (p <= 0) return f.dmin;
      if (p >= 1000) return f.dmax;
      return f.round(f.fromT(T0 + (p / 1000) * (T1 - T0)));
    };
    function sync() {
      lo.value = toPos(fl.min); hi.value = toPos(fl.max);
      nLo.value = fl.min <= f.dmin ? "no limit" : fmtShort(f, fl.min);
      nHi.value = fl.max >= f.dmax ? "no limit" : fmtShort(f, fl.max);
      const a = +lo.value / 10, b = +hi.value / 10;
      body.querySelector(".fill").style.left = a + "%";
      body.querySelector(".fill").style.width = Math.max(0, b - a) + "%";
      const tA = f.toT(fl.min), tB = f.toT(fl.max);
      body.querySelectorAll(".hist rect").forEach((r) => r.classList.toggle("in", +r.dataset.b > tA && +r.dataset.a < tB));
    }
    function commit() { updateLive(); }
    lo.oninput = () => { let p = Math.min(+lo.value, +hi.value); fl.min = fromPos(p); if (fl.min > fl.max) fl.min = fl.max; sync(); commit(); };
    hi.oninput = () => { let p = Math.max(+hi.value, +lo.value); fl.max = fromPos(p); if (fl.max < fl.min) fl.max = fl.min; sync(); commit(); };
    // keep the upper thumb reachable when both sit at the top
    lo.style.zIndex = fl.min >= f.dmax ? 3 : 2; hi.style.zIndex = 2;
    nLo.onchange = () => { const v = parseNum(f, nLo.value); if (v != null) fl.min = Math.min(Math.max(v, f.dmin), fl.max); sync(); commit(); };
    nHi.onchange = () => { const v = parseNum(f, nHi.value); if (v != null) fl.max = Math.max(Math.min(v, f.dmax), fl.min); sync(); commit(); };
    sync();
  }

  function boolEditor(body, f, fl) {
    const cnt = isFeat({ key: f.key }) ? (v) => featCount(f, (x) => x === v)
      : f.target === "city"
      ? (v) => cities.filter((c) => { const e = lastEval.res.get(c.iso3); return e && e.match && c[f.key] === v && cityActive().every((x) => x.key === f.key || passes(c, x)); }).length
      : (v) => pool().filter((r) => r[f.key] === v && othersPass(r, f.key)).length;
    body.innerHTML = `<div class="seg" role="group">
      <button type="button" data-v="1" class="${fl.value ? "on" : ""}">${esc(f.yes)}<small>${cnt(true)}</small></button>
      <button type="button" data-v="0" class="${fl.value ? "" : "on"}">${esc(f.no)}<small>${cnt(false)}</small></button></div>`;
    body.querySelectorAll("button").forEach((b) => (b.onclick = () => { fl.value = b.dataset.v === "1"; render(); }));
  }

  // how many features of this kind would match with this filter set to a value (the other filters kept)
  function featCount(f, test) {
    const others = state.filters.filter((x) => x.key !== f.key && F[x.key].target === f.target && isActive(x));
    const { act, res } = lastEval;
    return itemsFor(f).filter((it) => (!act.length || !it.iso || it.iso.some((i) => res.get(i)?.match)) && others.every((x) => passes(it, x)) && test(it[f.key])).length;
  }
  function optionEditor(body, f, fl, keepSearch, scroll) {
    const counts = new Map(f.options.map((o) => [o, 0]));
    if (isFeat({ key: f.key })) {
      for (const o of f.options) counts.set(o, featCount(f, (v) => (Array.isArray(v) ? v.includes(o) : v === o)));
    } else for (const r of pool()) {
      if (!othersPass(r, f.key)) continue;
      const v = r[f.key];
      (Array.isArray(v) ? v : [v]).forEach((x) => counts.has(x) && counts.set(x, counts.get(x) + 1));
    }
    let opts = [...f.options];
    if (f.type === "multi") opts.sort((a, b) => (fl.values.includes(b) - fl.values.includes(a)) || (counts.get(b) - counts.get(a)) || a.localeCompare(b));
    const searchable = opts.length > 12;
    const mode = f.modes ? fl.mode || "any" : "any";
    const howText = { any: "Areas match if they have <b>any</b> of the ticked options (shaded ticks).", all: "Areas match if they have <b>all</b> of the ticked options (solid ticks).", none: "Areas match if they have <b>none</b> of the crossed-out options." }[mode];
    body.innerHTML = `${searchable ? `<input class="optsearch" id="optSearch" type="search" placeholder="Search ${opts.length} options" value="${esc(keepSearch)}">` : ""}
      ${f.type === "multi" || opts.length > 3 ? `<div class="tickall"><button type="button" class="linkbtn" id="tickAll">Tick all</button> · <button type="button" class="linkbtn" id="tickNone">Untick all</button>
        <span class="tcount">${fl.values.length} of ${opts.length} ticked</span></div>` : ""}
      <div class="opts mode-${mode}" role="group" aria-label="${esc(f.label)}"></div>
      ${f.type === "multi" && !f.target ? `<p class="info">${howText}</p>` : ""}`;
    const list = body.querySelector(".opts");
    const ta = body.querySelector("#tickAll"), tn = body.querySelector("#tickNone");
    // "Tick all" ticks every option that is shown (all of them, or those found by the search)
    if (ta) ta.onclick = () => { const q = (body.querySelector("#optSearch")?.value || "").toLowerCase(); fl.values = [...new Set(fl.values.concat(opts.filter((o) => (!q || o.toLowerCase().includes(q)) && (counts.get(o) || fl.values.includes(o)))))]; render(); };
    if (tn) tn.onclick = () => { fl.values = []; render(); };
    function draw(q) {
      q = (q || "").toLowerCase();
      list.innerHTML = opts.filter((o) => !q || o.toLowerCase().includes(q)).slice(0, 300).map((o) => {
        const n = counts.get(o), on = fl.values.includes(o);
        return `<label class="${!n && !on ? "zero" : ""}"><input type="checkbox" value="${esc(o)}" ${on ? "checked" : ""} ${!n && !on ? "disabled" : ""}><span>${glTerm(o)}</span><small>${n}</small></label>`;
      }).join("") || `<p class="info">Nothing matches “${esc(q)}”.</p>`;
      list.querySelectorAll("input").forEach((c) => (c.onchange = () => {
        if (c.checked) fl.values.push(c.value); else fl.values = fl.values.filter((v) => v !== c.value);
        render();
      }));
    }
    draw(keepSearch);
    list.scrollTop = scroll;
    const s = body.querySelector("#optSearch");
    if (s) { s.oninput = () => draw(s.value); if (keepSearch) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }
  }

  // Live update while dragging a slider: redraw everything except the editor itself.
  let raf = 0;
  function updateLive() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => render({ keepEditor: true }));
  }

  // ---------- Results list ----------
  function tabsHTML(n) {
    const ft = window.WP ? window.WP.tabs(lastEval) : [];
    if (!showCities() && !ft.length) return "";
    const t = state.tab;
    const tab = (id, label, k) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${t === id}" class="${t === id ? "on" : ""}">${label} <span class="num">${k.toLocaleString()}</span></button>`;
    return `<div class="tabs" role="tablist">${tab("areas", "Areas", n)}${showCities() ? tab("cities", "Cities", lastEval.cityList.length) : ""}${ft.map((x) => tab("feat:" + x.t, x.label, x.n)).join("")}</div>`;
  }
  // a list of physical features, or one feature's profile
  function renderFeatResults(matches) {
    const el = $("#results");
    const t = state.tab.slice(5);
    const list = lastEval.feat.get(t) || [];
    if (state.feat && state.feat.t === t) {
      el.innerHTML = window.WP.detailHTML(`${t}:${state.feat.i}`) + footHTML();
      $("#fback").onclick = () => { state.feat = null; render(); };
      $("#fzoom").onclick = () => zoomTo(window.WP.bounds(window.WP.byRef(`${t}:${state.feat.i}`)));
      el.querySelectorAll(".goto").forEach((b) => (b.onclick = () => { state.feat = null; state.tab = "areas"; state.selected = b.dataset.iso; render(); zoomToCountry(b.dataset.iso); }));
      bindCommon(el);
      return;
    }
    const scrollTop = el.querySelector(".rlist")?.scrollTop || 0;
    el.innerHTML = `<div class="rhead">${tabsHTML(matches.length)}</div>${window.WP.listHTML(t, list, state)}${footHTML()}`;
    el.querySelector(".rlist") && (el.querySelector(".rlist").scrollTop = scrollTop);
    bindCommon(el);
    el.querySelectorAll(".frow").forEach((b) => (b.onclick = () => { const [ft, fi] = b.dataset.ref.split(":"); state.feat = { t: ft, i: +fi }; render(); }));
  }
  // zoom so a country fills about 38% of the map (its biggest piece, so far-flung islands don't shrink it)
  function zoomToCountry(iso) {
    if (state.view !== "map" && !desk()) return;
    const g = geo.find((d) => d.rec?.iso3 === iso);
    if (!g) return;
    // the UK site: the area with its neighbours, so you can see where it is
    const near = (NB.get(iso) || []).map((n) => geo.find((d) => d.id === n)).filter((d) => d && !insetFor(d.id));
    if (!insetFor(iso) && near.length) { zoomTo(path.bounds({ type: "FeatureCollection", features: [g, ...near] }), 0.85); return; }
    let target = g;
    if (g.geometry?.type === "MultiPolygon") {
      const parts = g.geometry.coordinates.map((c) => ({ type: "Feature", geometry: { type: "Polygon", coordinates: c } }));
      const areas = parts.map((p) => d3.geoArea(p)), biggest = parts[areas.indexOf(Math.max(...areas))];
      const bb = path.bounds(biggest), all = path.bounds(g);
      // keep the whole country if its other parts are close by (e.g. Japan, Indonesia), otherwise the main part
      const spread = (all[1][0] - all[0][0]) * (all[1][1] - all[0][1]), main = (bb[1][0] - bb[0][0]) * (bb[1][1] - bb[0][1]);
      target = spread > main * 3 ? biggest : g;
    }
    zoomTo(path.bounds(target), 0.38);
  }
  function zoomToGroup(kind, name) {
    const fs = geo.filter((d) => d.rec && (kind === "nation" ? d.rec.nation === name : d.rec.region === name) && !insetFor(d.id));
    if (fs.length) zoomTo(path.bounds({ type: "FeatureCollection", features: fs }), 0.9);
  }
  function selectArea(iso, zoomIt = true) {
    state.selected = iso; state.open = null;
    if (state.view !== "map" && !desk()) state.view = "map";
    render();
    if (zoomIt) zoomToCountry(iso);
    $("#results")?.scrollTo?.({ top: 0 });
  }
  function zoomTo(b, frac = 0.8) {
    if (!b) return;
    const [[x0, y0], [x1, y1]] = b;
    const vb = svg.attr("viewBox").split(" ").map(Number);
    // the part of the map not covered by the quiz card
    const left = Math.min(mapLeftPad || 0, vb[2] * 0.5), visW = vb[2] - left;
    const kk = Math.max(1, Math.min(14, frac / Math.max((x1 - x0) / visW, (y1 - y0) / vb[3])));
    const tx = left + visW / 2 - kk * (x0 + x1) / 2, ty = vb[3] / 2 - kk * (y0 + y1) / 2;
    svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(kk));
  }
  function footHTML() {
    return `<div class="rfoot">
        <button type="button" id="srcLink">Sources &amp; methods</button>
        <a href="m/index.html" target="_blank" rel="noopener">Every measure A–Z</a>
        <a href="whatsnew.html" target="_blank" rel="noopener">What's new</a>
        ${SITE.donate ? `<a href="${SITE.donate}" target="_blank" rel="noopener">Support this project</a>` : ""}
        ${SITE.github ? `<a href="${SITE.github}" target="_blank" rel="noopener">Contribute on GitHub</a>` : ""}
        ${window.self === window.top ? `<button type="button" id="copyLink">Copy link to this view</button>` : ""}
      </div>`;
  }
  function bindCommon(el) {
    $("#srcLink").onclick = openAbout;
    const cl = $("#copyLink");
    if (cl) cl.onclick = () => navigator.clipboard?.writeText(location.href).then(() => (cl.textContent = "Link copied"), () => {});
    el.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => { state.tab = b.dataset.tab; render(); }));
  }
  // Sort buttons, like a spreadsheet: A–Z sorts by name, the arrow flips the order
  function sortDirFor(isNumber) { return state.sortDir || (isNumber ? "desc" : "asc"); }
  function sortButtons(isNumber, dir) {
    const az = !isNumber;
    return `<button type="button" class="sbtn${az ? " on" : ""}" id="sortAZ" title="${az && dir === "asc" ? "Sort Z to A" : "Sort by name, A to Z"}" aria-label="Sort by name">${az && dir === "desc" ? "Z–A" : "A–Z"}</button>
      <button type="button" class="sbtn" id="sortDir" title="${dir === "desc" ? (isNumber ? "Highest first: click for lowest first" : "Z to A: click for A to Z") : (isNumber ? "Lowest first: click for highest first" : "A to Z: click for Z to A")}" aria-label="Reverse the order">${dir === "desc" ? "↓" : "↑"}</button>`;
  }
  function bindSortButtons() {
    const az = $("#sortAZ"), dr = $("#sortDir");
    if (az) az.onclick = () => {
      const byName = state.sort === "__name" || (state.tab === "cities" ? state.citySort === "name" : false);
      if (state.tab === "cities" && showCities()) { state.sortDir = state.citySort === "name" && sortDirFor(false) === "asc" ? "desc" : "asc"; state.citySort = "name"; }
      else { state.sortDir = byName && sortDirFor(false) === "asc" ? "desc" : "asc"; state.sort = "__name"; }
      render();
    };
    if (dr) dr.onclick = () => {
      const isNum = state.tab === "cities" && showCities() ? state.citySort !== "name" : !!F[$("#sortSel")?.value] || $("#sortSel")?.value === "__combo";
      state.sortDir = sortDirFor(isNum) === "desc" ? "asc" : "desc";
      render();
    };
  }
  function renderCityResults(matches) {
    const el = $("#results");
    const byName = state.citySort === "name";
    const dir = sortDirFor(!byName);
    const list = [...lastEval.cityList].sort(byName
      ? (a, b) => (dir === "desc" ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name))
      : (a, b) => (dir === "desc" ? b.city_population - a.city_population : a.city_population - b.city_population));
    const scrollTop = el.querySelector(".rlist")?.scrollTop || 0;
    el.innerHTML = `
      <div class="rhead">${tabsHTML(matches.length)}
        <div class="count"><span class="n num">${list.length.toLocaleString()}</span><span class="of">${list.length === 1 ? "city matches" : "cities match"}</span></div>
        <div class="controls"><span class="sortctl"><span>Sort</span>${sortButtons(!byName, dir)}
          <button type="button" class="sbtn${byName ? "" : " on"}" id="sortPop">Population</button></span></div>
        <p class="note">Population of the city itself, not its suburbs. Ringed dots are capitals.</p>
      </div>
      <div class="rlist">
        ${list.slice(0, 300).map((c) => {
          const r = byIso.get(c.iso3);
          return `<button type="button" class="row" data-iso="${c.iso3}" data-city="${c.id}"><span class="fl">${r?.flag || ""}</span><span class="nm">${esc(c.name)}${c.city_capital ? ` <span class="tag">capital</span>` : ""}<small>${esc(r?.name || "")}</small></span><span class="val num">${compact(c.city_population)}</span></button>`;
        }).join("") || `<p class="empty">No cities match. Try a lower population, or loosen the area filters.</p>`}
        ${list.length > 300 ? `<p class="empty">Showing the first 300 of ${list.length.toLocaleString()}.</p>` : ""}
      </div>${footHTML()}`;
    el.querySelector(".rlist").scrollTop = scrollTop;
    bindCommon(el);
    bindSortButtons();
    $("#sortPop").onclick = () => { state.citySort = "pop"; state.sortDir = null; render(); };
    el.querySelectorAll(".row").forEach((b) => {
      b.onclick = () => { state.selected = b.dataset.iso; state.open = null; render(); zoomToCountry(b.dataset.iso); };
      b.onmouseenter = () => gCities.selectAll("circle").filter((d) => d.id === +b.dataset.city).classed("hover", true).raise();
      b.onmouseleave = () => gCities.selectAll("circle").classed("hover", false);
    });
  }

  function renderResults(matches, act, res) {
    if (showCities() && state.tab === "cities") return renderCityResults(matches);
    if (state.tab.startsWith("feat:") && lastEval.feat.has(state.tab.slice(5))) return renderFeatResults(matches);
    if (state.tab.startsWith("feat:")) state.tab = "areas";
    const el = $("#results");
    const rangeAct = act.map((fl) => F[fl.key]).filter((f) => f.type === "range");
    if (state.sort === "__combo" && rangeAct.length < 2) state.sort = "";
    const sortKey = state.sort || colourKey() || rangeAct[0]?.key || "__name";
    const combo = sortKey === "__combo" ? comboScores(rangeAct) : null;
    const sf = combo ? COMBO_F : F[sortKey] || null;
    const dir = sortDirFor(!!sf);
    const list = [...matches];
    if (combo) list.sort((a, b) => (dir === "desc" ? (combo.get(b.iso3) ?? -1) - (combo.get(a.iso3) ?? -1) : (combo.get(a.iso3) ?? 999) - (combo.get(b.iso3) ?? 999)) || a.name.localeCompare(b.name));
    else if (sf) list.sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      if (va == null || vb == null) return (va == null) - (vb == null); // no data goes last
      return dir === "desc" ? vb - va : va - vb;
    });
    else list.sort((a, b) => (dir === "desc" ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name)));
    const valF = combo ? null : sf || (colourKey() ? F[colourKey()] : rangeAct[0]) || null;
    lastListOrder = list.map((r) => r.iso3);
    if (desk()) return renderTable(el, { list, matches, act, rangeAct, sortKey, sf, dir, combo, total: pool().length });
    // quick sort: A–Z, each number filter, and a combined score when there are two or more
    const qs = [["__name", "A–Z"], ...rangeAct.slice(0, 5).map((f) => [f.key, f.short || f.label]), ...(rangeAct.length >= 2 ? [["__combo", "Combined"]] : [])];
    const qsOn = combo ? "__combo" : sf ? sortKey : "__name";
    const qsHTML = act.length ? `<div class="qsort" role="group" aria-label="Quick sort">${qs.map(([k, l]) => `<button type="button" data-qs="${esc(k)}" class="${qsOn === k ? "on" : ""}" ${k === "__combo" ? `title="Each area's average position across your ${rangeAct.length} number filters: 100 means the highest of all areas on every one, 0 the lowest"` : ""}>${esc(l)}${qsOn === k ? (dir === "desc" ? " ↓" : " ↑") : ""}</button>`).join("")}</div>` : "";
    const groups = [...lastEval.groups.entries()].sort((a, b) => a[1].length - b[1].length);
    const total = pool().length;
    const noun = state.territories ? "places" : "areas";
    const scrollTop = el.querySelector(".rlist")?.scrollTop || 0;

    el.innerHTML = `
      <div class="rhead">${tabsHTML(matches.length)}
        <div class="count"><span class="n num">${matches.length}</span><span class="of">of ${total} ${noun} match</span></div>
        ${qsHTML}
        ${combo ? `<p class="note">Combined score: each area's average position across ${esc(rangeAct.map((f) => f.short || f.label).join(", "))}, from 0 (lowest of all areas on every one) to 100 (highest).</p>` : ""}
        <div class="controls">
          
          <span class="sortctl"><span class="lbl">Sort</span>
            ${sortButtons(!!sf, dir)}
            <select id="sortSel" aria-label="Sort by" data-pick><option value="__name">Name</option>${rangeAct.length >= 2 ? `<option value="__combo" ${combo ? "selected" : ""}>Combined score</option>` : ""}
            ${groupedOptions(sortKey)}</select></span>
          <label>Shade by <select id="colSel" aria-label="Shade by" data-pick><option value="">Automatic</option><option value="none" ${state.colourBy === "none" ? "selected" : ""}>Single colour</option>
            ${groupedOptions(state.colourBy)}</select></label>
        </div>
      </div>
      <div class="rlist">
        ${list.length ? list.map((r, i) => rowHTML(r, valF, null, combo ? combo.get(r.iso3) : undefined, sf ? i + 1 : null)).join("") : `<p class="empty">${act.length ? "No matches yet." : ""}</p>`}
        ${groups.map(([key, list]) => {
          const fl = act.find((x) => x.key === key);
          list.sort((a, b) => a.name.localeCompare(b.name));
          const open = expandedNear.has(key);
          const shown = open ? list : list.slice(0, 6);
          return `<h4>Near misses · only fail “${esc(chipLabel(fl))}” (${list.length})</h4>${shown.map((r) => rowHTML(r, null, fl)).join("")}
            ${list.length > 6 ? `<button type="button" class="linkbtn more" data-k="${key}" style="margin:2px 8px">${open ? "Show fewer" : `Show all ${list.length}`}</button>` : ""}`;
        }).join("")}
      </div>${footHTML()}`;
    el.querySelector(".rlist").scrollTop = scrollTop;
    const terr = $("#terr"); if (terr) terr.onchange = (e) => { state.territories = e.target.checked; render(); };
    $("#sortSel").onchange = (e) => { state.sort = e.target.value; state.sortDir = null; render(); };
    bindSortButtons();
    el.querySelectorAll(".qsort button").forEach((b) => (b.onclick = () => {
      const k = b.dataset.qs;
      if (k === qsOn) state.sortDir = dir === "desc" ? "asc" : "desc";
      else { state.sort = k; state.sortDir = null; }
      render();
    }));
    $("#colSel").onchange = (e) => { state.colourBy = e.target.value; render(); };
    bindCommon(el);
    el.querySelectorAll(".more").forEach((b) => (b.onclick = () => {
      const k = b.dataset.k; expandedNear.has(k) ? expandedNear.delete(k) : expandedNear.add(k); render();
    }));
    el.querySelectorAll(".row").forEach((b) => {
      b.onclick = () => { state.selected = b.dataset.iso; state.open = null; render(); zoomToCountry(b.dataset.iso); };
      b.onmouseenter = () => highlight(b.dataset.iso, true);
      b.onmouseleave = () => highlight(b.dataset.iso, false);
    });
  }
  // ---------- In Compare, Rankings and Charts the pane lists the chart's countries and numbers ----------
  let listSort = { view: null, col: 0, dir: 0 };
  let clQuery = "";
  // a small world map coloured by group, for the Compare colour key (shapes are drawn once and kept)
  let miniPaths = null;
  function miniMapSVG(K) {
    const W2 = 200, H2 = 300;
    if (!miniPaths) {
      const pr = d3.geoTransverseMercator().rotate([2, -49]).fitExtent([[2, 2], [W2 - 2, H2 - 2]], { type: "FeatureCollection", features: geo });
      const pa = d3.geoPath(pr);
      miniPaths = geo.filter((d) => d.rec).map((d) => ({ r: d.rec, d: pa(d) })).filter((x) => x.d);
    }
    return `<svg class="ckey-map" viewBox="0 0 ${W2} ${H2}" role="img" aria-label="Map coloured by ${esc(K.label.toLowerCase())}">` +
      miniPaths.map(({ r, d }) => { const g = K.groupOf(r); const ok = g != null && K.groups.includes(g);
        return `<path d="${d}" fill="${ok ? K.colour(g) : "var(--land)"}"${ok ? ` data-g="${esc(g)}"` : ""} opacity="${K.focus && g !== K.focus ? 0.25 : 1}"><title>${esc(r.name)}${ok ? ": " + esc(g) : ""}</title></path>`; }).join("") + `</svg>`;
  }
  function renderChartList() {
    const L = window.WV_H.V.list, el = $("#results");
    if (listSort.view !== state.view + L.cols.map((f) => f.key).join()) listSort = { view: state.view + L.cols.map((f) => f.key).join(), col: 0, dir: L.asc ? 1 : -1 };
    const pinned = new Set(L.pinned || []);
    const rows = L.rows.map((x) => ({ ...x, r: byIso.get(x.iso) })).filter((x) => x.r);
    const c = listSort.col;
    rows.sort((a, b) => (c < 0 ? a.r.name.localeCompare(b.r.name) * listSort.dir : ((a.vals[c] ?? -Infinity) - (b.vals[c] ?? -Infinity)) * listSort.dir) || a.r.name.localeCompare(b.r.name));
    const scrollTop = el.querySelector(".clist")?.scrollTop || 0;
    const head = (i, f) => `<button type="button" class="ch${c === i ? " on" : ""}" data-c="${i}" title="Sort">${esc(f ? f.short || f.label : "Area")}${c === i ? (listSort.dir > 0 ? " ↑" : " ↓") : ""}</button>`;
    const ms = lastEval.act.length;
    // Gapminder-style colour key: a small world map in the bubbles' colours (click a colour to pick it out)
    const K = L.key;
    const keyHTML = K ? `<div class="ckey"><div class="ckey-h">Colour: <b>${esc(K.label)}</b></div>${miniMapSVG(K)}
        <div class="ckey-l">${K.groups.map((g) => `<button type="button" class="lg${K.focus && K.focus !== g ? " off" : ""}" data-k="${esc(g)}" aria-pressed="${K.focus === g}"><span class="sw" style="background:${K.colour(g)}"></span>${esc(g)}</button>`).join("")}</div></div>` : "";
    el.innerHTML = `<div class="rhead chead">
        <div class="count"><span class="n num">${rows.length}</span><span class="of">${ms ? "matching areas" : "areas"} in this chart</span></div>
        <p class="note">${esc(L.title)}. ${esc(L.note)}</p>
        <button type="button" class="linkbtn" id="paneHide">Hide this list ⇥</button>
      </div>${keyHTML}
      <div class="csearch"><input type="search" id="clSearch" placeholder="Find an area…" aria-label="Find an area in the list" value="${esc(clQuery)}"></div>
      <div class="clhead" style="--ncols:${L.cols.length}"><span class="rk">#</span>${head(-1)}${L.cols.map((f, i) => head(i, f)).join("")}</div>
      <div class="clist" role="list" style="--ncols:${L.cols.length}">${rows.map((x, i) => `<div class="crow${pinned.has(x.iso) ? " on" : ""}" role="listitem" data-iso="${x.iso}"><span class="rk num">${i + 1}</span>
          <button type="button" class="cpin" aria-pressed="${pinned.has(x.iso)}" title="${pinned.has(x.iso) ? "Remove from the chart" : "Add to the chart"}"><span class="fl">${x.r.flag || ""}</span><span class="nm">${esc(x.r.name)}</span></button>
          ${x.vals.map((v, i) => `<span class="val num">${v == null ? "–" : esc(fmtShort(L.cols[i], v))}</span>`).join("")}
          <button type="button" class="cinfo" aria-label="${esc(x.r.name)}: open profile" title="Open the area profile">i</button></div>`).join("") || `<p class="empty">No areas with data.</p>`}</div>
      ${footHTML()}`;
    bindCommon(el);
    el.querySelector(".clist").scrollTop = scrollTop;
    const filterRows = () => { const q = clQuery.trim().toLowerCase(); el.querySelectorAll(".crow").forEach((row) => (row.hidden = !!q && !row.querySelector(".nm").textContent.toLowerCase().includes(q))); };
    filterRows();
    const si = $("#clSearch");
    si.oninput = () => { clQuery = si.value; filterRows(); };
    if (K) {
      el.querySelectorAll(".ckey [data-k]").forEach((b) => (b.onclick = () => { K.setFocus(b.dataset.k); render(); }));
      el.querySelectorAll(".ckey path[data-g]").forEach((pth) => {
        pth.onclick = () => { K.setFocus(pth.dataset.g); render(); };
        pth.onmouseenter = () => el.querySelector(`.ckey-l [data-k="${CSS.escape(pth.dataset.g)}"]`)?.classList.add("hov");
        pth.onmouseleave = () => el.querySelectorAll(".ckey-l .hov").forEach((x) => x.classList.remove("hov"));
      });
    }
    $("#paneHide").onclick = () => { state.paneHidden = true; document.body.classList.add("pane-hidden"); render(); };
    el.querySelectorAll(".clhead .ch").forEach((b) => (b.onclick = () => { const i = +b.dataset.c; listSort.dir = listSort.col === i ? -listSort.dir : i < 0 ? 1 : -1; listSort.col = i; renderChartList(); }));
    el.querySelectorAll(".crow").forEach((row) => {
      const iso = row.dataset.iso;
      row.onmouseenter = () => highlight(iso, true);
      row.onmouseleave = () => highlight(iso, false);
      row.querySelector(".cpin").onclick = () => { L.toggle(iso); render(); };
      row.querySelector(".cinfo").onclick = () => { state.selected = iso; render(); };
    });
  }
  {
    const b = document.createElement("button");
    b.type = "button"; b.id = "paneShow"; b.className = "paneshow"; b.textContent = "⇤ Show list";
    b.onclick = () => { state.paneHidden = false; document.body.classList.remove("pane-hidden"); render(); };
    $(".main").appendChild(b);
  }

  // the combined score: the average percentile of a country across several measures (rank measures turned round so 1st = high)
  const COMBO_F = { key: "__combo", label: "Combined score", format: "count" };
  function comboScores(fs) {
    const pct = fs.map((f) => {
      const vs = pool().map((r) => r[f.key]).filter((v) => typeof v === "number").sort((x, y) => x - y);
      return (v) => { if (typeof v !== "number" || vs.length < 2) return null; const p = d3.bisectLeft(vs, v) / (vs.length - 1); return 100 * (f.format === "rank" ? 1 - p : p); };
    });
    const out = new Map();
    for (const r of pool()) {
      const ps = fs.map((f, i) => pct[i](r[f.key])).filter((x) => x != null);
      if (ps.length === fs.length) out.set(r.iso3, Math.round(d3.mean(ps)));
    }
    return out;
  }
  // ---------- The results as a table (laptop or bigger) ----------
  const DEFAULT_COLS = window.DEFAULT_COLUMNS || ["population", "median_age", "pct_65plus"];
  function renderTable(el, o) {
    const { list, matches, act, rangeAct, sortKey, sf, dir, combo, total } = o;
    const shadeF = colourKey() ? F[colourKey()] : null;
    // columns: the measure the list is sorted or shaded by, each number filter, then a few useful ones
    const keys = [];
    const addK = (k) => { if (k && F[k] && F[k].type === "range" && !F[k].target && !keys.includes(k)) keys.push(k); };
    addK(sf?.key); addK(shadeF?.key); rangeAct.forEach((f) => addK(f.key)); DEFAULT_COLS.forEach(addK);
    const cols = keys.slice(0, 5).map((k) => F[k]);
    const barF = cols[0];
    const ext = barF ? d3.extent(matches, (r) => r[barF.key]) : null;
    const barW = (v) => (v == null || !ext || ext[1] === ext[0] ? 0 : Math.round(6 + 54 * (v - Math.min(0, ext[0])) / (ext[1] - Math.min(0, ext[0]))));
    const cs = lastCS && barF && lastCS.f?.key === barF.key ? lastCS : null;
    const arrow = (k) => (sortKey === k || (k === "__name" && !sf && !combo) ? (dir === "desc" ? " ↓" : " ↑") : "");
    const th = (k, label, num) => `<th class="${num ? "num" : ""}${(sortKey === k || (k === "__name" && !sf && !combo)) ? " on" : ""}"><button type="button" data-sort="${k}" title="Sort by ${esc(label)}">${esc(label)}${arrow(k)}</button></th>`;
    const near = [...lastEval.groups.entries()];
    const scrollTop = el.querySelector(".tablewrap2")?.scrollTop || 0;
    el.innerHTML = `<div class="rtab">
      <div class="rtop"><span class="n num">${matches.length}</span><span class="of">${act.length ? `of ${total} areas match` : `areas`}</span>
        <label class="shadeby">Shade the map by <select id="colSel" aria-label="Shade the map by" data-pick><option value="">Automatic</option><option value="none" ${state.colourBy === "none" ? "selected" : ""}>Single colour</option>${groupedOptions(state.colourBy)}</select></label></div>
      ${combo ? `<p class="note">Combined score: each area's average position across ${esc(rangeAct.map((f) => f.short || f.label).join(", "))}, from 0 to 100.</p>` : ""}
      <div class="tablewrap2"><table class="rtable"><thead><tr><th class="rk">#</th>${th("__name", "Area")}${combo ? th("__combo", "Combined", true) : ""}${cols.map((f) => th(f.key, f.short || f.label, true)).join("")}</tr></thead>
      <tbody>${list.map((r, i) => `<tr class="trow${r.iso3 === state.selected ? " sel" : ""}" data-iso="${r.iso3}" tabindex="0"><td class="rk num">${i + 1}</td>
        <td class="nm"><span class="an">${esc(r.name)}</span><span class="ar">${esc(r.region === r.nation ? r.nation : r.region)}</span></td>
        ${combo ? `<td class="num">${combo.get(r.iso3) ?? "–"}</td>` : ""}
        ${cols.map((f, j) => { const v = r[f.key]; return `<td class="num">${j === 0 && v != null ? `<span class="tbar" style="width:${barW(v)}px;${cs ? `background:${cs(v)}` : ""}"></span>` : ""}${v == null ? `<span class="nodata">no data</span>` : esc(fmtShort(f, v))}</td>`; }).join("")}</tr>`).join("")}</tbody></table>
      ${!list.length ? `<p class="empty">No areas match all your filters. Try widening one of them.</p>` : ""}
      ${near.map(([key, nl]) => { const fl = act.find((x) => x.key === key); nl.sort((a, b) => a.name.localeCompare(b.name));
        return `<div class="nearmiss"><h4>Near misses: fail only “${esc(chipLabel(fl))}” (${nl.length})</h4><div class="nchips">${nl.slice(0, 30).map((r) => `<button type="button" class="nchip" data-iso="${r.iso3}">${esc(r.name)}</button>`).join("")}${nl.length > 30 ? `<span class="more">and ${nl.length - 30} more</span>` : ""}</div></div>`; }).join("")}
      </div></div>`;
    el.querySelector(".tablewrap2").scrollTop = scrollTop;
    $("#colSel").onchange = (e) => { state.colourBy = e.target.value; render(); };
    el.querySelectorAll("th button[data-sort]").forEach((b) => (b.onclick = () => {
      const k = b.dataset.sort, on = sortKey === k || (k === "__name" && !sf && !combo);
      if (on) state.sortDir = dir === "desc" ? "asc" : "desc";
      else { state.sort = k; state.sortDir = null; }
      render();
    }));
    el.querySelectorAll("tr.trow, .nchip").forEach((b) => {
      b.onclick = () => selectArea(b.dataset.iso);
      b.onkeydown = (e) => { if (e.key === "Enter") selectArea(b.dataset.iso); };
      b.onmouseenter = () => highlight(b.dataset.iso, true);
      b.onmouseleave = () => highlight(b.dataset.iso, false);
    });
  }

  // ---------- One area: how it compares, and ways to move on ----------
  // the period a figure is for: "2024/25", "2022–24"; measures whose year differs by nation show each area's own year
  const yearOf = (f, r) => (f.yearText && !/^\d{4}–\d{4}$/.test(f.yearText) ? f.yearText : typeof f.year === "string" && r[f.year] ? String(r[f.year]) : null);
  const HEADLINE = () => (window.HEADLINE || ["population", "median_age", "pct_0_15", "pct_65plus", "pop_change_10y", "density"]).filter((k) => F[k]);
  function similarAreas(r, n = 6) {
    const ks = HEADLINE(), all = rows.filter((x) => x.sovereign);
    const tf = (k, v) => (F[k].scale === "log" ? Math.log(Math.max(v, 1e-9)) : v);
    const st = ks.map((k) => { const vs = all.map((x) => x[k]).filter((v) => v != null).map((v) => tf(k, v)); return [d3.mean(vs), d3.deviation(vs) || 1]; });
    const z = (x) => ks.map((k, i) => (x[k] == null ? null : (tf(k, x[k]) - st[i][0]) / st[i][1]));
    const me = z(r);
    return all.filter((x) => x !== r).map((x) => { const zx = z(x); let d = 0, m = 0; zx.forEach((v, i) => { if (v != null && me[i] != null) { d += (v - me[i]) ** 2; m++; } }); return [x, m ? Math.sqrt(d / m) : 99]; })
      .sort((a, b) => a[1] - b[1]).slice(0, n).map((x) => x[0]);
  }
  function areaSummaryHTML(r) {
    const all = rows.filter((x) => x.sovereign);
    const med = (k, fil) => d3.median(all.filter(fil), (x) => x[k]);
    const cards = HEADLINE().filter((k) => r[k] != null).map((k) => {
      const f = F[k], v = r[k];
      // measures made differently in each nation (deprivation, apprenticeships) are compared within the nation only
      const own = f.compare === "nation";
      const vs = all.filter((x) => !own || x.nation === r.nation).map((x) => x[k]).filter((x) => x != null);
      const where = own ? `areas in ${r.nation}` : "UK areas";
      const below = vs.filter((x) => x < v).length, above = vs.filter((x) => x > v).length, pct = Math.round((100 * below) / (vs.length - 1 || 1));
      const rankTxt = !above ? `Highest of all ${where}` : !below ? `Lowest of all ${where}` : `Higher than ${pct}% of ${where}`;
      const reg = r.region !== r.nation ? med(k, (x) => x.region === r.region) : null, nat = med(k, (x) => x.nation === r.nation), uk = own ? null : med(k, () => true);
      const yr = yearOf(f, r);
      return `<div class="scard"><div class="sk">${esc(f.short || f.label)}${yr ? ` <span>${esc(yr)}</span>` : ""}</div><div class="sv num">${esc(fmtShort(f, v))}</div>
        <div class="sc">${reg != null ? `Region <b>${esc(fmtShort(f, reg))}</b> · ` : ""}${esc(r.nation)} <b>${esc(fmtShort(f, nat))}</b>${uk != null ? ` · UK <b>${esc(fmtShort(f, uk))}</b>` : ""}</div>
        <div class="sp">${rankTxt}</div></div>`;
    }).join("");
    const nbs = (NB.get(r.iso3) || []).map((i) => byIso.get(i)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
    const sim = similarAreas(r);
    const chip = (x) => `<button type="button" class="achip" data-iso="${x.iso3}">${esc(x.name)}</button>`;
    return `<div class="asum"><div class="scards">${cards}</div>
      <p class="snote">Region, nation and UK figures are the typical (median) area. Hover a measure name in the full profile below for its source.</p>
      <div class="anav">
        <div class="abox"><h4>Neighbouring areas</h4><div class="achips">${nbs.length ? nbs.map(chip).join("") : `<span class="snote">None: it has no land border with another area.</span>`}</div></div>
        <div class="abox"><h4>Similar areas</h4><div class="achips">${sim.map(chip).join("")}</div><p class="snote">Closest on ${esc(HEADLINE().map((k) => (F[k].short || F[k].label).toLowerCase()).join(", "))}.</p></div>
        <div class="abox"><h4>Show all the areas in</h4><div class="achips">${r.region !== r.nation ? `<button type="button" class="achip go" data-k="region" data-v="${esc(r.region)}">${esc(r.region)}</button>` : ""}<button type="button" class="achip go" data-k="nation" data-v="${esc(r.nation)}">${esc(r.nation)}</button></div></div>
      </div></div>`;
  }
  function showGroup(k, v) {
    state.filters = state.filters.filter((x) => x.key !== k);
    const fl = makeFilter(k); fl.values = [v]; state.filters.push(fl);
    state.selected = null; state.open = null;
    render();
    zoomToGroup(k, v);
  }
  function bindAreaNav(el) {
    el.querySelectorAll(".achip[data-iso]").forEach((b) => {
      b.onclick = () => selectArea(b.dataset.iso);
      b.onmouseenter = () => highlight(b.dataset.iso, true);
      b.onmouseleave = () => highlight(b.dataset.iso, false);
    });
    el.querySelectorAll(".achip.go").forEach((b) => (b.onclick = () => showGroup(b.dataset.k, b.dataset.v)));
  }
  // the breadcrumb above the panel: United Kingdom › nation › region › area, with previous and next
  function renderCrumbs() {
    const trail = $("#crumbTrail"), sel = $("#crumbSel");
    if (!trail) return;
    const r = state.selected && byIso.get(state.selected);
    if (sel) sel.hidden = !!r;
    if (!r) { trail.innerHTML = ""; trail.hidden = true; return; }
    trail.hidden = false;
    const order = lastListOrder.includes(r.iso3) ? lastListOrder : rows.filter((x) => x.sovereign).sort((a, b) => a.name.localeCompare(b.name)).map((x) => x.iso3);
    const i = order.indexOf(r.iso3), prev = byIso.get(order[i - 1]), next = byIso.get(order[i + 1]);
    const steps = [`<button type="button" data-go="uk">United Kingdom</button>`, `<button type="button" data-go="nation" data-v="${esc(r.nation)}">${esc(r.nation)}</button>`];
    if (r.region !== r.nation) steps.push(`<button type="button" data-go="region" data-v="${esc(r.region)}">${esc(r.region)}</button>`);
    steps.push(`<b>${esc(r.name)}</b>`);
    trail.innerHTML = `<nav class="trail" aria-label="Where this area is">${steps.join(`<span class="sep" aria-hidden="true">›</span>`)}</nav>
      <span class="pn"><button type="button" class="tolist" data-go="list" title="Back to the list">☰ List</button>${prev ? `<button type="button" data-iso="${prev.iso3}" title="Previous in the list">‹ ${esc(prev.name)}</button>` : ""}<span class="pos">${i + 1} of ${order.length}</span>${next ? `<button type="button" data-iso="${next.iso3}" title="Next in the list">${esc(next.name)} ›</button>` : ""}</span>`;
    trail.querySelectorAll("button[data-iso]").forEach((b) => (b.onclick = () => selectArea(b.dataset.iso)));
    trail.querySelectorAll("button[data-go]").forEach((b) => (b.onclick = () => {
      const g = b.dataset.go;
      state.selected = null; render();
      if (g === "uk") svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
      else if (g !== "list") zoomToGroup(g, b.dataset.v);
    }));
  }

  function rowHTML(r, sf, fail, override, pos) {
    const val = override !== undefined ? `<span class="val num" title="Combined score">${override ?? "–"}</span>` : sf ? `<span class="val num">${fmtShort(sf, r[sf.key])}</span>` : "";
    const why = fail ? `<span class="why">✕ ${esc(F[fail.key].short || F[fail.key].label)}</span>` : "";
    return `<button type="button" class="row" data-iso="${r.iso3}">${pos ? `<span class="rk num">${pos}</span>` : ""}<span class="fl">${r.flag || ""}</span><span class="nm">${esc(r.name)}</span>${val}${why}</button>`;
  }
  function highlight(iso, on) {
    paths.filter((d) => d.rec?.iso3 === iso).classed("hover", on).raise();
    window.WV?.highlight(iso, on);
  }

  // ---------- Country detail ----------
  // ---------- SDG dashboard for a country ----------
  const SDG_ICON = ["✔", "↗", "→", "–", "↘"];
  let sdgOpen = null;
  function sdgHTML(r) {
    if (!r.sdg_detail || !window.SDGS) return "";
    const ST = window.SDG_STATUS;
    const stIndex = (s) => ST.findIndex(([n]) => n === s);
    const tiles = window.SDGS.map((g) => {
      const s = r[`sdg${g.n}_status`];
      const i = s ? stIndex(s) : -1;
      return `<button type="button" class="sdgt${i < 0 ? " none" : ""}${sdgOpen === g.n ? " open" : ""}" data-n="${g.n}" style="--sdg:${g.colour}" ${i < 0 ? "disabled" : ""}
        title="Goal ${g.n}: ${esc(g.name)}${s ? ` · ${s}` : g.measures.length ? " · not enough data" : " · not tracked here"}">
        <span class="sdgn">${g.n}</span><span class="sdgs" ${i >= 0 ? `style="background:${ST[i][1]}"` : ""}>${i >= 0 ? SDG_ICON[i] : ""}</span></button>`;
    }).join("");
    let detail = "";
    const g = window.SDGS.find((x) => x.n === sdgOpen);
    if (g && r.sdg_detail[g.n]) {
      const rows = r.sdg_detail[g.n].map(([key, v, y, st]) => {
        const f = F[key], m = g.measures.find((x) => x[0] === key);
        return `<li><span class="dot" style="background:${ST[st][1]}"></span><span><b>${esc(f ? f.label : key)}</b>: ${esc(f ? fmtFull(f, v) : String(v))} <small>(${y})</small><br><small>Target ${esc(m ? m[1].replace(/^[^:]*: /, "") : "")} · ${ST[st][0]}</small></span></li>`;
      }).join("");
      detail = `<div class="sdgd" style="--sdg:${g.colour}"><b>Goal ${g.n}: ${esc(g.name)}</b> <span class="sub">${esc(g.aim)}</span><ul>${rows}</ul>
        ${window.WL ? `<p class="fwhy">${window.WL.sdg(g.n, g.name).map(([l, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(l)} ↗</a>`).join(" · ")}</p>` : ""}</div>`;
    }
    return `<h4 data-g="sdgs">Sustainable Development Goals</h4>
      <p class="sub">On track or achieved for <b>${r.sdg_on_track} of ${r.sdg_measured}</b> goals with data${r.sdg_achieved ? ` (${r.sdg_achieved} already achieved)` : ""}. Tap a goal to see why.</p>
      <div class="sdggrid">${tiles}</div>${detail}
      <p class="sdgkey">${window.SDG_STATUS.map(([n, c], i) => `<span><span class="sdgs" style="background:${c}">${SDG_ICON[i]}</span>${n}</span>`).join("")}</p>
      <p class="sub sdgnote">Worked out on this site from the speed of change since 2015 (the SDSN's method, simplified). Goals 12, 14 and 17 aren't tracked: there isn't good yearly data for every area.</p>`;
  }
  function bindSdg(el) {
    el.querySelectorAll(".sdgt[data-n]").forEach((b) => (b.onclick = () => {
      const n = +b.dataset.n, sc = el.querySelector(".detail")?.scrollTop || 0;
      sdgOpen = sdgOpen === n ? null : n;
      renderDetail();
      const d = el.querySelector(".detail"); if (d) d.scrollTop = sc;
    }));
  }

  const lowerL = (s) => (/^[A-Z][^A-Z]*$/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
  // ---------- A country seen through your filters: just the measures you're asking about ----------
  let focusFor = null, showFull = false, detailOpen = null;
  function rankLine(f, r) {
    const vs = pool().map((x) => x[f.key]).filter((v) => typeof v === "number");
    const v = r[f.key];
    if (typeof v !== "number" || vs.length < 3) return "";
    const asc = f.format === "rank";
    const rank = vs.filter((x) => (asc ? x < v : x > v)).length + 1;
    const ord = (n) => n + (["th", "st", "nd", "rd"][(n % 100 - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");
    return `${ord(rank)} of ${vs.length}${asc ? "" : ", highest first"} · UK median ${fmtShort(f, d3.median(vs))}`;
  }
  function sdgBreakdown(r, only) {
    if (!r.sdg_detail || !window.SDGS) return `<p class="sub">No SDG data for ${esc(r.name)}.</p>`;
    const ST = window.SDG_STATUS;
    const goals = window.SDGS.filter((g) => g.measures.length && (!only || only.includes(g.n)));
    const line = (g) => {
      const s = r[`sdg${g.n}_status`];
      const i = ST.findIndex(([n]) => n === s);
      const ms = (r.sdg_detail[g.n] || []).map(([key, v, y, st]) => {
        const f = F[key], m = g.measures.find((x) => x[0] === key);
        return `<li><span class="dot" style="background:${ST[st][1]}"></span>${esc(f ? f.label : key)}: <b>${esc(f ? fmtShort(f, v) : String(v))}</b> <small>(${y}) · target ${esc(m ? m[1].replace(/^[^:]*: /, "") : "")} · ${ST[st][0].toLowerCase()}</small></li>`;
      }).join("");
      return `<div class="sdgline" style="--sdg:${g.colour}"><span class="sdgnum">${g.n}</span><div><b>${esc(g.name)}</b> <span class="sdgst" ${i >= 0 ? `style="background:${ST[i][1]}"` : ""}>${esc(s || "no data")}</span>${ms ? `<ul>${ms}</ul>` : ""}</div></div>`;
    };
    const good = goals.filter((g) => ["Achieved", "On track"].includes(r[`sdg${g.n}_status`]));
    const bad = goals.filter((g) => r[`sdg${g.n}_status`] && !good.includes(g));
    const none = goals.filter((g) => !r[`sdg${g.n}_status`]);
    if (only) return goals.map(line).join("");
    return `<h5 class="fgood">Achieved or on track (${good.length})</h5>${good.map(line).join("") || `<p class="sub">None.</p>`}
      <h5 class="fbad">Not on track (${bad.length})</h5>${bad.map(line).join("") || `<p class="sub">None.</p>`}
      ${none.length ? `<p class="sub">Not enough data: ${none.map((g) => `${g.n} ${esc(g.name)}`).join(", ")}.</p>` : ""}`;
  }
  function focusHTML(r) {
    const act = lastEval.act, e = lastEval.res.get(r.iso3);
    const sdgDone = new Set();
    return act.map((fl) => {
      const f = F[fl.key], ok = e ? !e.fails.includes(fl) : null;
      const mark = ok == null ? "" : ok ? `<span class="fok">✓ passes</span>` : `<span class="fno">✕ fails</span>`;
      let body = "";
      const sdgGoal = fl.key.match(/^sdg(\d+)_status$/);
      if (/^sdg_(on_track|achieved|on_track_pct|goals_on_track)$/.test(fl.key)) {
        if (sdgDone.has("all")) return "";
        sdgDone.add("all");
        body = `<p class="fval">${r.sdg_on_track != null ? `On track or achieved for <b>${r.sdg_on_track} of ${r.sdg_measured}</b> goals with data (${r.sdg_achieved} achieved).` : "No SDG data."}</p>${sdgBreakdown(r)}`;
      } else if (sdgGoal) {
        body = sdgBreakdown(r, [+sdgGoal[1]]);
      } else if (f.type === "range") {
        const y = f.year && typeof f.year === "string" && r[f.year] ? ` <small>(${r[f.year]})</small>` : "";
        body = `<p class="fval"><b>${esc(fmtFull(f, r[fl.key]))}</b>${y}</p><p class="sub">${esc(rankLine(f, r))}</p>`;
      } else if (f.type === "bool") {
        body = `<p class="fval"><b>${r[fl.key] == null ? "No data" : r[fl.key] ? esc(f.yes) : esc(f.no)}</b></p>`;
      } else {
        const v = r[fl.key];
        const vals = Array.isArray(v) ? v : v != null ? [v] : [];
        body = `<p class="fval">${vals.length ? vals.map((x) => `<span class="fv${fl.values.includes(x) ? " hit" : ""}">${glossFor(x) ? glTerm(x) : esc(x)}</span>`).join(" ") : "<b>No data</b>"}</p>`;
      }
      // "Why?" links: for numbers, and for categories with a matching article (religion, languages, government…)
      const why = !window.WL ? [] : sdgGoal ? window.WL.sdg(+sdgGoal[1], window.SDGS.find((g) => g.n === +sdgGoal[1])?.name || "")
        : f.type === "range" && !f.target ? window.WL.countryMeasure(r, f) : window.WL.hasTopic(f.key) ? window.WL.countryMeasure(r, f).slice(0, 1) : [];
      return `<section class="fcardx" data-g="${gslug(f.group)}"><div class="fhead"><span class="ftitle">${esc(chipLabel(fl))}</span>${mark}</div>${body}
        ${why.length ? `<p class="fwhy">Why? ${why.map(([l, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(l)} ↗</a>`).join(" · ")}</p>` : ""}</section>`;
    }).join("");
  }

  function renderDetail() {
    const r = byIso.get(state.selected);
    const el = $("#results");
    if (!r) { state.selected = null; return render(); }
    if (focusFor !== r.iso3) { focusFor = r.iso3; showFull = false; }
    // with filters on, show how the country does on them first; the whole profile is one click away
    if (lastEval.act.length && !showFull && state.view === "map" && !desk()) {
      const e0 = lastEval.res.get(r.iso3);
      el.innerHTML = `<div class="detail">
        <button type="button" class="linkbtn back" id="back">← Back to results</button>
        <h2><span>${r.flag || ""}</span>${esc(r.name)}</h2>
        ${e0?.match ? `<span class="badge m">Matches every filter</span>` : e0 ? `<span class="badge">Fails ${e0.fails.length} of ${lastEval.act.length} filters</span>` : ""}
        <h4>On your filters</h4>
        ${focusHTML(r)}
        ${window.WL ? window.WL.html(window.WL.country(r), `Find out more about ${r.name}`) : ""}
        <div class="fmore"><button type="button" class="ffopen" id="fullBtn">Everything about ${esc(r.name)} <span>full profile</span></button>
        ${window.openFactfile ? `<button type="button" class="linkbtn" id="ffOpen2">📄 Area factfile</button>` : ""}</div>
      </div>${footHTML()}`;
      $("#back").onclick = () => { state.selected = null; render(); };
      $("#fullBtn").onclick = () => { showFull = true; renderDetail(); };
      if ($("#ffOpen2")) $("#ffOpen2").onclick = () => window.openFactfile?.(r.iso3);
      bindCommon(el);
      return;
    }
    const e = lastEval.res.get(r.iso3);
    const badge = !lastEval.act.length ? "" : e?.match ? `<span class="badge m">Matches every filter</span>` : e?.near ? `<span class="badge n">Near miss: fails ${esc(F[e.fails[0].key].label)}</span>` : e ? `<span class="badge">Fails ${e.fails.length} filters</span>` : `<span class="badge">Territory (hidden)</span>`;
    const val = (f) => {
      const v = r[f.key];
      if (f.type === "range") return v == null ? null : fmtFull(f, v);
      if (f.type === "bool") return v == null ? null : v ? "Yes" : "No";
      if (Array.isArray(v)) return v.length ? v.join(", ") : null;
      return v ?? null;
    };
    const yr = (f) => (f.year && typeof f.year === "string" && r[f.year] ? ` <small>${r[f.year]}</small>` : "");
    const cell = (f) => { const v = val(f); return f.type === "cat" && glossFor(v) ? glTerm(v) : esc(v); };
    // --- extra blocks that belong inside a topic ---
    const extras = {
      Refugees: () => {
        const out = flows.filter((f) => f[0] === r.iso3).sort((a, b) => b[2] - a[2]);
        const inn = flows.filter((f) => f[1] === r.iso3).sort((a, b) => b[2] - a[2]);
        if (!out.length && !inn.length) return "";
        const nm = (i) => esc(byIso.get(i)?.name || i);
        const list = (fs, col) => `<dl class="pmini">${fs.slice(0, 5).map((f) => `<dt>${nm(f[col])}</dt><dd>${d3.format(",")(f[2])}</dd>`).join("")}</dl>`;
        return `${inn.length ? `<p class="psub">Largest groups of refugees living here come from:</p>${list(inn, 0)}` : ""}
          ${out.length ? `<p class="psub">Refugees from ${esc(r.name)} live mostly in:</p>${list(out, 1)}` : ""}
          <div class="flowbtns">${inn.length ? `<button type="button" data-dir="to">Map where its refugees come from</button>` : ""}${out.length ? `<button type="button" data-dir="from">Map where its refugees have gone</button>` : ""}</div>`;
      },
      "Global links": () => {
        if (!MIG) return "";
        const inn = migPairs(r.iso3, 0), out = migPairs(r.iso3, 1);
        if (!inn.length && !out.length) return "";
        const nm = (i) => esc(byIso.get(i)?.name || i);
        const y = MIG.years[MIG.years.length - 1];
        const list = (fs) => `<dl class="pmini">${fs.slice(0, 5).map(([i, n]) => `<dt>${nm(i)}</dt><dd>${d3.format(",")(n)}</dd>`).join("")}</dl>`;
        return `${inn.length ? `<p class="psub">Most migrants living here were born in (${y}):</p>${list(inn)}` : ""}
          ${out.length ? `<p class="psub">People born in ${esc(r.name)} living abroad are mostly in:</p>${list(out)}` : ""}
          <div class="flowbtns">${inn.length ? `<button type="button" data-dir="to" data-kind="mig">Map where its migrants were born</button>` : ""}${out.length ? `<button type="button" data-dir="from" data-kind="mig">Map where its emigrants live</button>` : ""}</div>`;
      },
      Geography: () => {
        const nb = r.borders_list || [];
        return nb.length ? `<p class="psub">Neighbours (${nb.length}), with the length of each land border:</p><dl class="pmini nbrs">${nb.map(([iso, km]) => `<dt><button type="button" class="linkbtn goto" data-iso="${iso}">${byIso.get(iso)?.flag || ""} ${esc(byIso.get(iso)?.name || iso)}</button></dt><dd>${d3.format(",")(km)} km</dd>`).join("")}</dl>` : `<p class="psub">No land borders.</p>`;
      },
      Cities: () => {
        const cs = cities.filter((c) => c.iso3 === r.iso3).slice(0, 6);
        return cs.length ? `<p class="psub">Largest cities:</p><dl class="pmini">${cs.map((c) => `<dt>${esc(c.name)}${c.city_capital ? " (capital)" : ""}</dt><dd>${d3.format(",")(c.city_population)}</dd>`).join("")}</dl>` : "";
      },
      Climate: () => {
        const cl = r.climate_list || [];
        return cl.length ? `<p class="psub">Climate zones (share of land):</p><dl class="pmini">${cl.slice(0, 6).map(([n, p]) => `<dt>${glossFor(n) ? glTerm(n) : esc(n)}</dt><dd>${p}%</dd>`).join("")}</dl>` : "";
      },
      "Energy & resources": () => {
        const ml = r.minerals_list || [];
        return ml.length ? `<p class="psub">Share of world mining (2025):</p><dl class="pmini">${ml.map(([m, p]) => `<dt>${esc(m.charAt(0).toUpperCase() + m.slice(1))}</dt><dd>${p < 1 ? "under 1" : Math.round(p)}%</dd>`).join("")}</dl>` : "";
      },
      SDGs: () => sdgHTML(r),
      Population: () => (state.mode !== "physical" && window.WV ? window.WV.profileHTML(r) : ""),
    };
    const skip = (f) => f.target || f.hidden || /^sdg\d+_status$/.test(f.key) || f.key === "sdg_goals_on_track";
    // one group of measures: the ones with data as rows, the rest named in one line
    const groupHTML = (g) => {
      const fs = FILTERS.filter((f) => f.group === g && !skip(f)).sort((x, y) => x.label.localeCompare(y.label, "en", { numeric: true }));
      const have = g === "SDGs" ? [] : fs.filter((f) => val(f) != null), miss = g === "SDGs" ? [] : fs.filter((f) => val(f) == null);
      const extra = extras[g] ? extras[g]() : "";
      if (!have.length && !extra) return "";
      return `<div class="pgroup" data-g="${gslug(g)}"><h4>${esc(g)}</h4>${extra}
        ${have.length ? `<dl class="prows">${have.map((f) => `<dt>${esc(f.label)}</dt><dd>${cell(f)}${yr(f)}</dd>`).join("")}</dl>` : ""}
        ${miss.length ? `<p class="pmiss">No data: ${esc(miss.map((f) => f.short || f.label).join(", "))}.</p>` : ""}</div>`;
    };
    // --- key facts at the top ---
    const K = (k, label) => { const f = F[k]; if (!f) return ""; const v = val(f); return v == null ? "" : `<div><dt>${esc(label || f.short || f.label)}</dt><dd>${cell(f)}</dd></div>`; };
    const keyFacts = state.mode === "physical"
      ? [K("region"), K("area_km2", "Area"), K("highest_m", "Highest point"), K("main_climate", "Main climate"), K("main_biome", "Main biome"), K("landlocked")].join("")
      : [K("region"), K("population"), K("income_group", "Income group"), K("hdi", "HDI"), K("regime", "Government"), K("largest_religion", "Largest religion"), K("official_languages", "Official languages"), K("currencies", "Currency")].join("");
    const TH = themes();
    detailOpen ||= new Set([TH[0].id]);
    const sections = TH.map((t) => {
      const inner = t.groups.map(groupHTML).join("");
      if (!inner) return "";
      return `<details class="psec" data-t="${t.id}" ${detailOpen.has(t.id) ? "open" : ""}><summary><span>${esc(t.label)}</span><small>${esc(t.groups.join(" · "))}</small></summary>${inner}</details>`;
    }).join("");
    el.innerHTML = `<div class="detail pdetail">
      <button type="button" class="linkbtn back" id="back">← Back to results</button>
      <h2><span>${r.flag || ""}</span>${esc(r.name)}</h2>
      <p class="sub">${esc([r.county && r.county !== r.name ? r.county : "", r.region !== r.nation ? r.region : "", r.nation, r.population ? d3.format(",")(r.population) + " people" + (r.population_year ? ` (mid-${r.population_year})` : "") : ""].filter(Boolean).join(" · "))}</p>
      ${badge}
      ${desk() ? areaSummaryHTML(r) + (lastEval.act.length ? `<h4 class="pfh">On your filters</h4>${focusHTML(r)}` : "") : `<dl class="pkeys">${keyFacts}</dl>`}
      ${window.WK ? `<button type="button" class="linkbtn wsadd" id="wsCountry">＋ Add these key facts to my worksheet</button>` : ""}
      ${window.openFactfile ? `<button type="button" class="ffopen" id="ffOpen">📄 Area factfile <span>the full picture, to print or download</span></button>` : ""}
      ${state.year ? `<p class="sub">Measures with yearly data show <b>${state.year}</b>; the rest show the latest figures.</p>` : ""}
      ${state.mode === "physical" && window.WP ? `<div class="pphys">${window.WP.profileHTML(r)}</div>` : ""}
      <div class="ptools"><button type="button" class="linkbtn" id="pOpenAll">Open all</button> · <button type="button" class="linkbtn" id="pCloseAll">Close all</button></div>
      ${sections}
      ${window.WL ? window.WL.html(window.WL.country(r), `Find out more about ${r.name}`) : ""}
    </div>`;
    el.querySelectorAll(".psec").forEach((d) => (d.ontoggle = () => { d.open ? detailOpen.add(d.dataset.t) : detailOpen.delete(d.dataset.t); }));
    $("#pOpenAll").onclick = () => el.querySelectorAll(".psec").forEach((d) => (d.open = true));
    $("#pCloseAll").onclick = () => el.querySelectorAll(".psec").forEach((d) => (d.open = false));
    $("#back").onclick = () => { state.selected = null; render(); };
    if (desk()) bindAreaNav(el);
    if (state.mode !== "physical") window.WV?.bindProfile(el, r);
    if ($("#ffOpen")) $("#ffOpen").onclick = () => window.openFactfile?.(r.iso3);
    $("#wsCountry") && ($("#wsCountry").onclick = () => window.WK.addCountry(r.iso3));
    el.querySelectorAll(".goto").forEach((b) => (b.onclick = () => { state.selected = b.dataset.iso; render(); zoomToCountry(b.dataset.iso); }));
    bindSdg(el);
    el.querySelectorAll(".flowbtns button").forEach((b) => (b.onclick = () => { state.flow = { iso: r.iso3, dir: b.dataset.dir, kind: b.dataset.kind || "ref" }; render(); }));
  }

  // ---------- Tooltip ----------
  const tip = $("#tooltip");
  function showTip(evt, r) {
    if (!r) { tip.hidden = true; return; }
    // the quiz is asking where a country is, or the blank map is on: no names
    if (window.WQ?.hideNames?.()) { tip.hidden = true; return; }
    if (state.flow && flowScale) {
      const src = byIso.get(state.flow.iso);
      const v = flowScale.vals.get(r.iso3);
      const txt = r.iso3 === src.iso3 ? (state.flow.dir === "from" ? "Area of origin" : "Host area")
        : v ? (state.flow.kind === "mig" ? (state.flow.dir === "from" ? `${d3.format(",")(v)} people born in ${src.name}` : `${d3.format(",")(v)} of the migrants in ${src.name}`)
          : state.flow.dir === "from" ? `${d3.format(",")(v)} refugees from ${src.name}` : `${d3.format(",")(v)} of the refugees in ${src.name}`)
        : "Fewer than 100, or none";
      tip.innerHTML = `<strong>${r.flag || ""} ${esc(r.name)}</strong><span class="st">${esc(txt)}</span>`;
      return placeTip(evt);
    }
    const e = lastEval.res.get(r.iso3);
    const act = lastEval.act;
    let st = "";
    if (!e) st = `<span class="st">Territory: tick “Include territories” to count it</span>`;
    else if (act.length) st = e.match ? `<span class="st m">Matches every filter</span>` : e.near ? `<span class="st">Near miss</span>` : `<span class="st">Fails ${e.fails.length} of ${act.length} filters</span>`;
    const dl = act.map((fl) => {
      const f = F[fl.key];
      let v = r[fl.key];
      v = f.type === "range" ? fmtShort(f, v) : f.type === "bool" ? (v ? f.yes : f.no) : Array.isArray(v) ? (v.length ? v.join(", ") : "none") : v ?? "no data";
      const failed = e && e.fails.includes(fl);
      return `<dt>${esc(f.short || f.label)}</dt><dd class="${failed ? "fail" : ""}">${esc(v)}</dd>`;
    }).join("");
    const extra = styleInfo && (!act.length || e?.match) ? styleInfo.tip(r) : "";
    const popLine = state.popSized && r.population ? `<span class="st">Population ${esc(compact(r.population))}</span>` : "";
    tip.innerHTML = `<strong>${r.flag || ""} ${esc(r.name)}</strong>${st}${popLine}${extra}${dl && !extra ? `<dl>${dl}</dl>` : ""}`;
    placeTip(evt);
  }
  function showCityTip(evt, c) {
    const r = byIso.get(c.iso3);
    tip.innerHTML = `<strong>${esc(c.name)}</strong><span class="st">${r?.flag || ""} ${esc(r?.name || "")}${c.city_capital ? " · capital" : ""}</span><dl><dt>Population</dt><dd>${d3.format(",")(c.city_population)}</dd></dl>`;
    placeTip(evt);
  }
  function placeTip(evt) {
    tip.hidden = false;
    const box = $("#mapstage").getBoundingClientRect();
    let x = evt.clientX - box.left + 14, y = evt.clientY - box.top + 14;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    if (x + tw > box.width - 8) x = evt.clientX - box.left - tw - 14;
    if (y + th > box.height - 8) y = evt.clientY - box.top - th - 14;
    tip.style.left = Math.max(4, x) + "px"; tip.style.top = Math.max(4, y) + "px";
  }
  svg.on("pointermove", (evt) => {
    if (evt.pointerType === "touch") return;
    const t = evt.target;
    const fref = (t.getAttribute && t.getAttribute("data-feat")) || (state.mode === "physical" && window.WP?.hit(evt));
    if (fref && window.WP) { paths.classed("hover", false); tip.innerHTML = window.WP.tipHTML(fref); return placeTip(evt); }
    const cid = t.getAttribute && t.getAttribute("data-city");
    if (cid) { paths.classed("hover", false); return showCityTip(evt, cities[+cid]); }
    const bref = t.getAttribute && t.getAttribute("data-base");
    if (bref) { paths.classed("hover", false); tip.innerHTML = `<strong>${esc(bref)}</strong>`; return placeTip(evt); }
    const iso = t.getAttribute && t.getAttribute("data-iso");
    paths.classed("hover", false);
    if (iso) d3.select(t).filter("path").classed("hover", true).raise();
    showTip(evt, iso ? byIso.get(iso) : null);
  }).on("pointerleave", () => { tip.hidden = true; paths.classed("hover", false); });
  svg.on("click", (evt) => {
    const t = evt.target;
    const fref = (t.getAttribute && t.getAttribute("data-feat")) || (state.mode === "physical" && window.WP?.hit(evt));
    if (fref) { const [ft, fi] = fref.split(":"); state.feat = { t: ft, i: +fi }; state.selected = null; state.tab = "feat:" + ft; return render(); }
    const cid = t.getAttribute && t.getAttribute("data-city");
    const iso = cid ? cities[+cid].iso3 : t.getAttribute && t.getAttribute("data-iso");
    if (iso && byIso.get(iso) && window.WQ?.mapClick?.(iso)) return;
    if (iso && byIso.get(iso)) { state.selected = iso; state.open = null; render(); }
  });

  // Double-click a country to see just that one (the rest fade away); double-click again, press Esc or
  // use "Show all" to bring the rest back
  svg.on("dblclick", (evt) => {
    const t = evt.target;
    const iso = t.getAttribute && t.getAttribute("data-iso");
    if (!iso || !byIso.get(iso)) { if (state.solo) setSolo(null); return; }
    setSolo(state.solo === iso ? null : iso);
  });
  function setSolo(iso) {
    state.solo = iso;
    if (iso) {
      state.selected = iso;
      zoomToCountry(iso);
    } else svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
    render();
  }
  function renderSolo() {
    const stage = $("#mapstage");
    stage.classList.toggle("solo", !!state.solo);
    paths.classed("soloed", (d) => !!state.solo && d.rec?.iso3 === state.solo);
    let chip = $("#soloChip");
    if (!state.solo) { if (chip) chip.hidden = true; return; }
    if (!chip) {
      chip = document.createElement("div");
      chip.id = "soloChip"; chip.className = "solochip";
      stage.appendChild(chip);
    }
    const r = byIso.get(state.solo);
    chip.hidden = false;
    chip.innerHTML = `<span>${r.flag || ""} Only <b>${esc(r.name)}</b></span><button type="button" class="linkbtn">Show all areas</button>`;
    chip.querySelector("button").onclick = () => setSolo(null);
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && state.solo && !document.querySelector(".ff-overlay:not([hidden])")) setSolo(null); });

  // ---------- Add-a-filter search ----------
  const input = $("#addInput"), menu = $("#addMenu");
  let items = [], cursor = 0;
  function score(f, q) {
    const hay = (f.label + " " + (f.keywords || "") + " " + f.group).toLowerCase();
    if (f.label.toLowerCase().startsWith(q)) return 3;
    if (f.label.toLowerCase().includes(q)) return 2;
    return q.split(/\s+/).every((w) => hay.includes(w)) ? 1 : 0;
  }
  function openMenu() {
    const q = input.value.trim().toLowerCase();
    if (!q) { closeMenu(); return; }
    if (openTheme) closeThemes();
    const used = new Set(state.filters.map((x) => x.key));
    items = [];
    const row = (f, label, isValue) => {
      items.push({ key: f.key, value: isValue ? label : undefined });
      const added = used.has(f.key) && !isValue;
      const fam = famOf[f.key];
      const other = !modeGroups().has(f.group) ? (state.mode === "physical" ? " · Human" : " · Physical") : "";
      const where = (isValue ? (MENU_LABELS[f.key] || f.label) : fam ? `${fam.short} · ${f.group}` : f.group) + other;
      const right = added ? `<span class="added-tag">✓ Added</span>` : `<span class="gtag">${esc(where)}</span>`;
      return `<button type="button" role="option" class="item${added ? " added" : ""}" data-g="${gslug(f.group)}" data-i="${items.length - 1}"><span>${!isValue && f.time ? CLOCK : ""}${esc(label)}</span>${right}</button>`;
    };
    const mg = modeGroups();
    // every filter can be found from either side; this side's come first
    const visible = FILTERS.filter((f) => !f.hidden).sort((x, y) => mg.has(y.group) - mg.has(x.group));
    const fs = visible.map((f) => {
      const fam = famOf[f.key];
      // a family name also finds its measures, e.g. "HDI" finds HDI rank
      const s2 = fam ? Math.max(score(f, q), score({ label: fam.label + " " + fam.short, keywords: "", group: "" }, q) ? 1 : 0) : score(f, q);
      return { f, s: s2 };
    }).filter((x) => x.s).sort((a, b) => b.s - a.s);
    const vals = [];
    if (q.length >= 2) {
      for (const f of visible) {
        if (!f.options) continue;
        for (const o of f.options) if (o.toLowerCase().includes(q)) vals.push({ f, o, s: o.toLowerCase().startsWith(q) ? 2 : 1 });
      }
      vals.sort((a, b) => b.s - a.s || a.o.length - b.o.length);
    }
    let html = "";
    // a question in plain English: show how it was understood, first in the list
    const raw = input.value.trim();
    if (window.WA && (raw.split(/\s+/).length >= 3 || /\d/.test(raw) || /^(how|which|what|show|compare|list|find|where|who)\b/i.test(raw))) {
      const a = window.WA.previewHTML(raw);
      if (a.html) { items.push({ ask: a.p }); html += `<div role="option" class="item askitem" tabindex="-1" data-i="${items.length - 1}">${a.html}</div>`; }
    }
    // places whose name matches, best matches first
    if (q.length >= 2) {
      const norm = (t) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const qn = norm(q);
      const places = rows.filter((r) => norm(r.name).includes(qn))
        .map((r) => ({ r, s: norm(r.name).startsWith(qn) ? 2 : 1 })).sort((a, b) => b.s - a.s || a.r.name.localeCompare(b.r.name)).slice(0, 6);
      if (places.length) html += `<h4 class="rh">Places</h4>` + places.map(({ r }) => {
        items.push({ place: r.iso3 });
        return `<button type="button" role="option" class="item" data-i="${items.length - 1}"><span>${esc(r.name)}</span><span class="gtag">${esc(r.region === r.nation ? r.nation : r.region + ", " + r.nation)}</span></button>`;
      }).join("");
    }
    if (fs.length) html += `<h4 class="rh">Filters</h4>` + fs.slice(0, 12).map(({ f }) => row(f, f.label)).join("");
    if (vals.length) html += `<h4 class="rh">Values</h4>` + vals.slice(0, 6).map((v) => row(v.f, v.o, true)).join("");
    if (!fs.length && !vals.length && !items.length) html = `<p class="info" style="padding:8px 10px;margin:0">Nothing found for “${esc(q)}”. Try a place name, or a broader word like “age” or “population”, or browse the themes.</p>`;
    cursor = 0;
    menu.innerHTML = html;
    menu.hidden = false;
    input.setAttribute("aria-expanded", "true");
    markCursor();
    menu.querySelectorAll("button, .askitem").forEach((b) => (b.onmousedown = (e) => e.preventDefault()));
    menu.querySelectorAll("button.item").forEach((b) => (b.onclick = () => choose(items[+b.dataset.i])));
    menu.querySelectorAll(".askitem").forEach((d) => (d.onclick = (e) => {
      const sug = e.target.closest(".asksug");
      const it = items[+d.dataset.i];
      if (sug) { input.value = ""; closeMenu(); input.blur(); if (openTheme) closeThemes(); window.WA.apply(it.ask, sug.dataset.k); return; }
      choose(it);
    }));
  }
  function markCursor() {
    menu.querySelectorAll(".item").forEach((b) => b.classList.toggle("on", +b.dataset.i === cursor));
    menu.querySelector(".item.on")?.scrollIntoView({ block: "nearest" });
  }
  function closeMenu() { menu.hidden = true; input.setAttribute("aria-expanded", "false"); }
  // ---------- Browse filters: theme bar, panels, definition cards ----------
  const HUMAN_THEMES = window.THEMES || [];
  const PHYS_THEMES = window.PHYS_THEMES || [];
  const themes = () => (state.mode === "physical" ? PHYS_THEMES : HUMAN_THEMES);
  const modeGroups = () => new Set(themes().flatMap((t) => t.groups));
  const MENU_LABELS = window.MENU_LABELS || {};
  // on a phone, filters shown per category before "More…"; on a laptop or bigger, all of them
  const showFirst = () => (window.innerWidth <= 760 ? 6 : Infinity);
  const touch = window.matchMedia("(hover: none)");
  const expanded = new Set();
  let openTheme = null;
  // One menu entry per family, or per filter that isn't in a family
  function entriesFor(group) {
    const out = [], seenFam = new Set();
    for (const f of FILTERS) {
      if (f.group !== group || f.hidden) continue;
      const fam = famOf[f.key];
      if (fam) { if (!seenFam.has(fam.id)) { seenFam.add(fam.id); out.push({ fam, id: "fam:" + fam.id }); } }
      else out.push({ f, id: f.key });
    }
    // A to Z (numbers in order: "Goal 2" before "Goal 10")
    return out.sort((x, y) => entryLabel(x).localeCompare(entryLabel(y), "en", { numeric: true, sensitivity: "base" }));
  }
  const entryById = (id) => (id.startsWith("fam:") ? { fam: FAMILIES.find((x) => "fam:" + x.id === id), id } : { f: F[id], id });
  const entryLabel = (e) => (e.fam ? e.fam.short : MENU_LABELS[e.f.key] || e.f.label);
  const entryTime = (e) => (e.fam ? e.fam.time : e.f.time);
  const entryAdded = (e) => (e.fam ? e.fam.variants.some(([k]) => state.filters.some((x) => x.key === k)) : state.filters.some((x) => x.key === e.f.key));
  function addEntry(e) {
    let key = e.f?.key;
    if (e.fam) {
      const free = e.fam.variants.find(([k]) => !state.filters.some((x) => x.key === k));
      key = (free || e.fam.variants[0])[0];
    }
    closeThemes();
    choose({ key });
  }
  function renderThemeBar() {
    const nav = $("#themes");
    const TH = themes();
    nav.innerHTML = `<button type="button" class="browse-btn" data-theme="${TH[0].id}" aria-haspopup="dialog">Browse filters</button>` +
      TH.map((t) => {
        const n = state.filters.filter((fl) => t.groups.includes(F[fl.key].group)).length;
        return `<button type="button" class="theme-btn${openTheme === t.id ? " on" : ""}" data-theme="${t.id}" data-g="${gslug(t.groups[0])}" aria-expanded="${openTheme === t.id}"><span class="tdot" aria-hidden="true"></span><span class="tlab">${esc(t.label)}</span>${n ? `<span class="tn" title="${n} filter${n > 1 ? "s" : ""} in use">${n}</span>` : ""}<span class="caret" aria-hidden="true">›</span></button>`;
      }).join("");
    nav.querySelectorAll("button").forEach((b) => (b.onclick = (ev) => {
      ev.stopPropagation();
      if (sheet) openSheet(null);  // on a phone the filter list replaces the sheet
      if (openTheme === b.dataset.theme && b.classList.contains("theme-btn")) closeThemes(); else { showTheme(b.dataset.theme); window.WQ?.setTopic(b.dataset.theme); }
    }));
  }
  function showTheme(id) {
    openTheme = id;
    closeMenu();
    hideCard();
    const TH = themes();
    const t = TH.find((x) => x.id === id) || TH[0];
    const panel = $("#tpanel");
    panel.hidden = false;
    panel.innerHTML = `<div class="tp-head"><div class="tp-tabs" role="tablist">${TH.map((x) => `<button type="button" role="tab" data-theme="${x.id}" aria-selected="${x.id === id}" class="${x.id === id ? "on" : ""}">${esc(x.label)}</button>`).join("")}</div>
        <button type="button" class="iconbtn tp-close" aria-label="Close">×</button></div>
      <div class="tp-body">${t.groups.map((g) => {
        const es = entriesFor(g);
        const open = expanded.has(g);
        const SHOW_FIRST = showFirst(), shown = open ? es : es.slice(0, SHOW_FIRST);
        return `<section class="gsec" data-g="${gslug(g)}"><h4>${esc(g)}</h4><div class="fchips">${shown.map((e) => {
          const added = entryAdded(e);
          return `<button type="button" class="fchip${added ? " added" : ""}" data-id="${esc(e.id)}" data-g="${gslug(g)}">${entryTime(e) ? CLOCK : ""}<span>${esc(entryLabel(e))}</span>${added ? `<span class="tick" aria-label="added">✓</span>` : ""}</button>`;
        }).join("")}${es.length > SHOW_FIRST ? `<button type="button" class="more-btn" data-g="${esc(g)}">${open ? "Fewer" : `${es.length - SHOW_FIRST} more…`}</button>` : ""}</div></section>`;
      }).join("")}</div>
      <p class="mkey">${state.mode === "physical" ? "" : `${CLOCK}<span>Has data for past years: use the year slider under the map.</span>`} <span class="mtick">✓</span><span>Added</span> <span class="mhint">${touch.matches ? "Tap a filter to see what it means." : "Hover over a filter to see what it means."}${(window.PHYS_THEMES || []).length ? " Filters stay when you switch between Human and Physical, so you can mix them." : ""}</span></p>`;
    renderThemeBar();
    placePanel(panel, t);
    panel.querySelectorAll(".tp-tabs button").forEach((b) => (b.onclick = () => showTheme(b.dataset.theme)));
    panel.querySelector(".tp-tabs button.on")?.scrollIntoView({ block: "nearest", inline: "center" });
    panel.querySelector(".tp-close").onclick = closeThemes;
    panel.querySelectorAll(".more-btn").forEach((b) => (b.onclick = () => { const g = b.dataset.g; expanded.has(g) ? expanded.delete(g) : expanded.add(g); showTheme(id); }));
    panel.querySelectorAll(".fchip").forEach((b) => {
      const e = entryById(b.dataset.id);
      b.onclick = () => {
        if (touch.matches && cardFor !== e.id) return showCard(e, b);  // first tap: explain
        addEntry(e);
      };
      b.onmouseenter = () => { if (!touch.matches) { clearTimeout(cardTimer); cardTimer = setTimeout(() => showCard(e, b), 280); } };
      b.onmouseleave = () => { clearTimeout(cardTimer); if (!touch.matches) cardTimer = setTimeout(hideCard, 120); };
      b.onfocus = () => { if (!touch.matches) showCard(e, b); };
      b.onblur = () => { if (!touch.matches) hideCard(); };
    });
  }
  // Open the panel beside the control panel, level with its theme button, with as many columns as it has groups (up to 3)
  function placePanel(panel, t) {
    panel.style.setProperty("--cols", Math.min(3, t.groups.length));
    panel.style.left = ""; panel.style.top = "";
    if (getComputedStyle(panel).position === "fixed") return;
    const btn = document.querySelector(`.theme-btn[data-theme="${t.id}"]`), host = panel.offsetParent, cp = $("#cpanel");
    if (!btn || !host) return;
    const hb = host.getBoundingClientRect(), bb = btn.getBoundingClientRect(), pb = cp.getBoundingClientRect();
    const addB = $("#addFilter");
    if (desk() && addB) {
      const ab = addB.getBoundingClientRect(), left = Math.max(8, ab.left - hb.left);
      panel.style.left = left + "px"; panel.style.top = (ab.bottom - hb.top + 8) + "px";
      panel.style.maxWidth = (hb.width - left - 16) + "px";
      return;
    }
    // the panel sits on the right of the page on the UK site, so the flyout opens to its left
    if (pb.left > hb.left + hb.width / 2) panel.style.left = Math.max(8, pb.left - hb.left - panel.offsetWidth - 8) + "px";
    else panel.style.left = (pb.right - hb.left + 8) + "px";
    const h = panel.offsetHeight;
    panel.style.top = Math.max(8, Math.min(bb.top - hb.top - 14, hb.height - h - 8)) + "px";
  }
  function closeThemes() {
    openTheme = null;
    $("#tpanel").hidden = true;
    hideCard();
    renderThemeBar();
  }
  // Definition card: hover on desktop; first tap on phones and tablets, with an Add button
  let cardFor = null, cardTimer = 0;
  function showCard(e, anchor) {
    const card = $("#fcard");
    cardFor = e.id;
    const f = e.f, fam = e.fam;
    const g = fam ? fam.group : f.group;
    const title = fam ? fam.label : f.label;
    const info = fam ? fam.info : f.info;
    const timeKeys = fam ? fam.variants.filter(([k]) => F[k].time) : f.time ? [[f.key, f.label]] : [];
    const timeNote = timeKeys.length ? `<p class="fc-time">${CLOCK}<span>Yearly data from ${Math.min(...timeKeys.map(([k]) => timeFrom(k) || 9999))}${fam && timeKeys.length < fam.variants.length ? ` for ${timeKeys.map(([, l]) => l).join(", ")}` : ""}</span></p>` : "";
    card.dataset.g = gslug(g);
    card.innerHTML = `<div class="fc-eyebrow">${esc(g)}</div><h5>${esc(title)}</h5><p>${glossify(esc(info))}</p>
      ${fam ? `<p class="fc-vars">Choose from: ${fam.variants.map(([, l]) => esc(l)).join(" · ")}</p>` : ""}
      ${timeNote}
      ${touch.matches ? `<div class="fc-actions"><button type="button" class="fc-add">${entryAdded(e) ? "Add again" : "Add filter"}</button><button type="button" class="linkbtn fc-close">Close</button></div>` : ""}`;
    card.hidden = false;
    if (touch.matches) {
      card.querySelector(".fc-add").onclick = () => addEntry(e);
      card.querySelector(".fc-close").onclick = hideCard;
      card.classList.add("sheet");
    } else {
      card.classList.remove("sheet");
      const r = anchor.getBoundingClientRect(), cw = card.offsetWidth, ch = card.offsetHeight;
      let x = r.left, y = r.bottom + 8;
      if (x + cw > window.innerWidth - 12) x = window.innerWidth - cw - 12;
      if (y + ch > window.innerHeight - 12) y = r.top - ch - 8;
      card.style.left = Math.max(12, x) + "px"; card.style.top = Math.max(12, y) + "px";
    }
  }
  function hideCard() { cardFor = null; $("#fcard").hidden = true; }
  $("#fcard").onmouseenter = () => clearTimeout(cardTimer);
  $("#fcard").onmouseleave = () => { if (!touch.matches) hideCard(); };
  document.addEventListener("click", (ev) => {
    if (!openTheme) return;
    if (!ev.target.isConnected) return; // the panel was just redrawn under the click
    if (ev.target.closest("#tpanel, #themes, #fcard, #tabbar")) return;
    closeThemes();
  });
  renderThemeBar();

  // ---------- Human / physical geography switch ----------
  const filtersByMode = { human: [], physical: [] };
  // Filters are shared by both sides: switching only changes the menus, the base map and the quiz,
  // so "countries with deserts and over 20 million people" mixes a physical and a human filter.
  function setMode(m) {
    if (m === state.mode) return;
    state.mode = m;
    state.open = null; state.feat = null;
    if (state.tab.startsWith("feat:") && !state.filters.some((x) => F[x.key].target === state.tab.slice(5))) state.tab = "areas";
    if (m === "physical") { state.mapStyle = "std"; state.popSized = false; }
    if (openTheme) closeThemes(); else renderThemeBar();
    $("#mmCard").hidden = true;
    render();
  }
  document.querySelectorAll("#modes button").forEach((b) => (b.onclick = () => setMode(b.dataset.m)));
  let modeShown = "human";
  function renderModes() {
    document.querySelectorAll("#modes button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.m === state.mode)));
    if (modeShown !== state.mode) {
      modeShown = state.mode;
      if (!openTheme) renderThemeBar();
      input.placeholder = state.mode === "physical" ? "Search or ask: “volcanoes over 5,000 m”" : "Search or ask: “democracies with over 40% women MPs”";
    }
  }
  // "Show all on the map" switches in the physical map style card
  function hasFeature(t) { return state.filters.some((x) => F[x.key].target === t); }
  function toggleFeature(t, on) {
    if (on && !hasFeature(t)) {
      const f = FILTERS.find((x) => x.target === t && !x.hidden);
      const fl = makeFilter(f.key);
      if (f.type === "range") { fl.min = f.dmin; fl.max = f.dmax; }
      state.filters.push(fl);
      state.tab = "feat:" + t; state.feat = null;
    } else if (!on) {
      state.filters = state.filters.filter((x) => F[x.key].target !== t);
      if (state.tab === "feat:" + t) { state.tab = "areas"; state.feat = null; }
      if (state.open && !state.filters.some((x) => x.key === state.open)) state.open = null;
    }
    render();
  }
  // show one physical feature: make sure its kind is on the map, open its profile and zoom to it
  function showFeature(t, i) {
    if (state.mode !== "physical") setMode("physical");
    if (!state.filters.some((x) => F[x.key].target === t)) {
      const f = FILTERS.find((x) => x.target === t && !x.hidden);
      const fl = makeFilter(f.key);
      if (f.type === "range") { fl.min = f.dmin; fl.max = f.dmax; }
      state.filters.push(fl);
    }
    state.feat = { t, i }; state.tab = "feat:" + t; state.selected = null; state.view = "map";
    render();
    zoomTo(window.WP.bounds(window.WP.byRef(`${t}:${i}`)));
  }

  function choose(it) {
    if (!it) return;
    if (it.ask) { input.value = ""; closeMenu(); input.blur(); if (openTheme) closeThemes(); window.WA.apply(it.ask); return; }
    // a place: show its profile and zoom to it
    if (it.place) { input.value = ""; closeMenu(); input.blur(); if (openTheme) closeThemes(); state.selected = it.place; state.open = null; if (state.view !== "map") state.view = "map"; render(); zoomToCountry(it.place); return; }
    let fl = state.filters.find((x) => x.key === it.key);
    if (!fl) { fl = makeFilter(it.key); fl.fresh = true; state.filters.push(fl); }
    if (it.value && fl.values && !fl.values.includes(it.value)) fl.values.push(it.value);
    state.open = it.key; state.selected = null;
    if (F[it.key].target === "city") state.tab = "cities";
    else if (F[it.key].target) { state.tab = "feat:" + F[it.key].target; state.feat = null; }
    input.value = ""; closeMenu(); input.blur();
    render();
  }
  input.addEventListener("focus", openMenu);
  input.addEventListener("input", openMenu);
  input.addEventListener("blur", () => setTimeout(closeMenu, 120));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { cursor = Math.min(items.length - 1, cursor + 1); markCursor(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { cursor = Math.max(0, cursor - 1); markCursor(); e.preventDefault(); }
    else if (e.key === "Enter") { choose(items[cursor]); e.preventDefault(); }
    else if (e.key === "Escape") { closeMenu(); input.blur(); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openTheme) { closeThemes(); return; }
    if (e.key === "Escape" && state.open) { state.open = null; render(); }
    else if (e.key === "Escape" && state.flow) { state.flow = null; render(); }
    if (e.key === "Escape" && !$("#about").hidden) $("#about").hidden = true;
  });

  function removeFilter(key) {
    state.filters = state.filters.filter((x) => x.key !== key);
    if (state.open === key) state.open = null;
    if (state.colourBy === key) state.colourBy = "";
    if (!showCities() && state.tab === "cities") state.tab = "areas";
    if (state.tab.startsWith("feat:") && !state.filters.some((x) => F[x.key].target === state.tab.slice(5))) { state.tab = "areas"; state.feat = null; }
    render();
  }
  function clearAll() {
    state.filters = []; state.open = null; state.colourBy = ""; state.sort = ""; state.sortDir = null; state.tab = "areas";
    state.flow = null; state.selected = null; state.mapStyle = "std"; state.popSized = false; state.feat = null; state.solo = null;
    stopPlay(); if (state.year) { state.year = null; applyYear(null); }
    window.WV?.clearYears?.();   // the Compare and Charts players too
    svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity);
    render();
  }

  // ---------- Back, Home and Clear all (the floating dock) ----------
  // Every settled change to what's on screen is remembered, so Back can step through them.
  const SNAP_KEYS = ["filters", "territories", "colourBy", "sort", "sortDir", "selected", "tab", "flow", "year", "view", "mode", "feat", "mapStyle", "popSized", "mm", "classes", "nClasses"];
  const past = [];
  let committed = null, trackT = 0, restoring = false;
  function snapshot() {
    const s = {};
    for (const k of SNAP_KEYS) s[k] = state[k];
    return JSON.stringify({ s, fbm: filtersByMode, v: window.WV?.snapshot?.(), pb: window.WP ? { ...window.WP.style } : null });
  }
  function trackHistory() {
    if (restoring) return;
    if (committed === null) { committed = snapshot(); return; }
    clearTimeout(trackT);
    trackT = setTimeout(() => {
      const now = snapshot();
      if (now === committed) return;
      past.push(committed);
      if (past.length > 60) past.shift();
      committed = now;
      renderDock();
    }, 450);
  }
  function restoreSnap(str) {
    const o = JSON.parse(str);
    restoring = true;
    stopPlay();
    const yearBefore = state.year;
    Object.assign(state, o.s, { open: null });
    filtersByMode.human = o.fbm.human; filtersByMode.physical = o.fbm.physical;
    window.WV?.restore?.(o.v);
    if (o.pb && window.WP) Object.assign(window.WP.style, o.pb);
    if (state.year !== yearBefore) applyYear(state.year);
    if (openTheme) closeThemes();
    $("#mmCard").hidden = true;
    render();
    committed = snapshot();
    restoring = false;
    renderDock();
  }
  function goBack() {
    clearTimeout(trackT);
    const now = snapshot();
    if (now !== committed) return restoreSnap(committed);  // a change still settling: undo it
    if (past.length) restoreSnap(past.pop());
  }
  function goHome() {
    if (state.mode !== "human") { filtersByMode[state.mode] = []; setMode("human"); }
    filtersByMode.human = []; filtersByMode.physical = [];
    state.view = "map"; state.territories = false; state.starterHidden = false;
    if (openTheme) closeThemes();
    $("#mmCard").hidden = true;
    clearAll();
  }
  function somethingToClear() {
    return !!(state.filters.length || state.flow || state.year || state.selected || state.mapStyle !== "std" || state.popSized || state.colourBy || state.sort || state.feat);
  }
  function renderDock() {
    const d = $("#dock");
    if (!d) return;
    d.querySelector("[data-a=back]").disabled = !past.length && snapshot() === committed;
    d.querySelector("[data-a=home]").disabled = state.mode === "human" && state.view === "map" && !somethingToClear();
    d.querySelector("[data-a=clear]").disabled = !somethingToClear();
    renderPanel();
  }
  {
    const d = document.createElement("nav");
    d.id = "dock"; d.className = "dock"; d.setAttribute("aria-label", "Back, home and clear");
    d.innerHTML = `<button type="button" data-a="back" title="Go back one step"><span aria-hidden="true">←</span> Back</button>
      <button type="button" data-a="home" title="Back to the start: the UK map with no filters"><span aria-hidden="true">⌂</span> Home</button>
      <button type="button" data-a="clear" class="clr" title="Remove every filter and setting on this page"><span aria-hidden="true">✕</span> Clear all</button>`;
    ($("#cpFoot") || document.body).appendChild(d);
    d.querySelector("[data-a=back]").onclick = goBack;
    d.querySelector("[data-a=home]").onclick = goHome;
    d.querySelector("[data-a=clear]").onclick = clearAll;
  }

  // ---------- Control panel ----------
  // Desktop: everything lives in the panel on the left, with Back, Home and Clear all at its foot.
  // Phones: a tab bar along the bottom opens each part of the panel (or the results list) as a sheet,
  // and Back, Home and Clear all move to the top.
  const phone = window.matchMedia("(max-width: 760px)");
  let sheet = null, lastSel = null, lastOpen = null;
  function placeDock() {
    const d = $("#dock"), home = phone.matches ? $("#dockTop") : $("#cpFoot");
    if (d && home && d.parentElement !== home) home.appendChild(d);
    if (!phone.matches) openSheet(null);
  }
  function openSheet(name) {
    if (name === sheet) name = null;
    if (name === "quiz") { openSheet(null); $("#quizBtn")?.click(); return; }
    sheet = name;
    document.body.dataset.sheet = name || "";
    $("#sheetShade").hidden = !name;
    document.querySelectorAll("#tabbar button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.t === name)));
    if (name && openTheme) closeThemes();
    if (name === "list") $("#results").scrollTop = 0;
  }
  function renderPanel() {
    const n = state.filters.length;
    const c = $("#cpCount"); if (c) { c.hidden = !n; c.textContent = n; }
    const bd = document.querySelector("#tabbar .tb-badge"); if (bd) { bd.hidden = !n; bd.textContent = n; }
    $("#cpanel").classList.toggle("nofilters", !n);
    const q = $("#quizBtn"), tq = document.querySelector("#tabbar [data-t=quiz]");
    if (q && tq) tq.setAttribute("aria-pressed", q.getAttribute("aria-pressed") || "false");
    // the filter editor sits in the panel under the chips: on a phone, open the Filters sheet to show it
    if (state.open && state.open !== lastOpen) {
      if (phone.matches && sheet !== "filters") openSheet("filters");
      requestAnimationFrame(() => $("#editor")?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    }
    lastOpen = state.open;
    // on a phone, picking a country (on the map or in a chart) opens its profile in the list sheet
    if (phone.matches && state.selected && state.selected !== lastSel && sheet !== "list") openSheet("list");
    // and the quiz asks a question about it
    if (state.selected && state.selected !== lastSel) window.WQ?.askAbout(state.selected);
    lastSel = state.selected;
  }
  document.querySelectorAll("#tabbar button").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); openSheet(b.dataset.t); }));
  $("#sheetShade").onclick = () => openSheet(null);
  // a choice in the View sheet closes it, so the chart is seen straight away
  document.querySelectorAll("#views button").forEach((b) => b.addEventListener("click", () => { if (phone.matches && sheet === "view") openSheet(null); }));
  $("#cpanel").addEventListener("click", (e) => {
    if (!phone.matches || sheet !== "more") return;
    if (e.target.closest("#ffBtn, #sbsBtn, #shareBtn, #quizBtn")) openSheet(null);
  });
  // a sheet handle: drag or tap to close
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheet) openSheet(null); });
  phone.addEventListener?.("change", placeDock);
  placeDock();

  // ---------- About ----------
  function openAbout() {
    const el = $("#about");
    const used = [...new Set(FILTERS.map((f) => f.source).filter((k) => window.SOURCES[k]))];
    el.innerHTML = `<div class="panel" role="dialog" aria-modal="true" aria-labelledby="aboutH">
      <button type="button" class="iconbtn close" id="aboutClose" aria-label="Close">×</button>
      <h2 id="aboutH">About Which Places?</h2>
      <p>An open-source map for asking questions about the UK. Every filter shows where its data comes from and what year it describes. Each measure says which nations it covers, because England, Wales, Scotland and Northern Ireland sometimes measure things differently.</p>
      <p>Areas match when they pass <b>every</b> filter. Each end of a slider means “no limit”. Within a list filter, such as languages, ticking several options matches areas that have <b>any</b> of them. Areas with no data for a filter don’t match it.</p>
      <div class="tablewrap"><table><thead><tr><th>Source</th><th>Used for</th><th>Licence</th></tr></thead><tbody>
      ${used.map((k) => { const s = window.SOURCES[k]; const fs = FILTERS.filter((f) => f.source === k).map((f) => f.label); return `<tr><td><a href="${s.url}" target="_blank" rel="noopener">${esc(s.name)}</a></td><td>${esc(fs.join(", ") || ({ gdl: "Regions within areas: the HDI, life expectancy, schooling, income and gender measures for 1,800 regions", gapmincm: "Income mountains (Charts)", unppp: "The shaded ranges on population projections" }[k] || "Area shapes"))}</td><td>${esc(s.licence)}</td></tr>`; }).join("")}
      </tbody></table></div>
      <p>Areas are the 361 local authorities (lower tier) of the UK, on detailed May 2025 boundaries (ONS, BGC). Orkney and Shetland are drawn in a box in the North Sea, and London is drawn again, enlarged, in a box to the west. Deprivation, new homes and apprenticeships are measured differently in each nation, so compare them only within a nation. Regions are the 12 ITL1 regions: the nine English regions, Wales, Scotland and Northern Ireland. Contains OS data © Crown copyright and database right.</p>
    </div>`;
    el.hidden = false;
    $("#aboutClose").onclick = () => (el.hidden = true);
    el.onclick = (e) => { if (e.target === el) el.hidden = true; };
  }
  if ($("#aboutBtn")) $("#aboutBtn").onclick = openAbout;

  // ---------- Shareable URL ----------
  function encodeState() {
    const parts = state.filters.map((fl) => {
      const f = F[fl.key];
      if (f.type === "range" && fl.slice) return `${fl.key}:${fl.slice.k === "q" ? `q${fl.slice.of}.${fl.slice.g.join(".")}` : (fl.slice.k === "top" ? "t" : "b") + fl.slice.n}${fl.slice.w ? "w" : ""}`;
      if (f.type === "range") return `${fl.key}:${fl.min}~${fl.max}`;
      if (f.type === "bool") return `${fl.key}:${fl.value ? 1 : 0}`;
      return `${fl.key}:${fl.values.map(encodeURIComponent).join("|")}${fl.mode && fl.mode !== "any" ? "~" + fl.mode : ""}`;
    });
    const p = new URLSearchParams();
    if (parts.length) p.set("f", parts.join(","));
    if (state.territories) p.set("t", "1");
    if (state.colourBy) p.set("c", state.colourBy);
    if (state.year) p.set("y", state.year);
    if (state.view !== "map") p.set("v", state.view);
    if (state.mode === "physical") { p.set("m", "p"); if (window.WP && window.WP.style.base !== "landforms") p.set("pb", window.WP.style.base); }
    if (state.mapStyle === "change") {
      const { key, from, to } = changeYears();
      p.set("ms", "change"); p.set("mc", key); p.set("mf", from); p.set("mt", to);
      if (state.mm.pct) p.set("mp", "1");
    } else if (state.mapStyle === "bi") { p.set("ms", "bi"); p.set("bx", state.mm.bx || "gdp_per_capita"); p.set("by", state.mm.by || "co2_per_capita"); }
    if (state.popSized) p.set("pz", "1");
    if (state.classes) p.set("cl", state.classes + (state.nClasses !== 5 ? state.nClasses : ""));
    if (state.selected) p.set("s", state.selected);
    window.WV?.encode(p);
    return p.toString();
  }
  function decodeState(qs) {
    const p = new URLSearchParams(qs);
    const out = [];
    (p.get("f") || "").split(",").filter(Boolean).forEach((part) => {
      const i = part.indexOf(":"); const key = part.slice(0, i), v = part.slice(i + 1);
      const f = F[key]; if (!f) return;
      const wv = /w$/.test(v), vv = v.replace(/w$/, "");
      if (f.type === "range" && /^[tb]\d+$/.test(vv)) out.push(makeFilter(key, { slice: { k: vv[0] === "t" ? "top" : "bottom", n: Math.min(500, +vv.slice(1)), w: wv } }));
      else if (f.type === "range" && /^q[45](\.[1-5])+$/.test(vv)) { const [q, ...g] = vv.split("."); const of = +q.slice(1); out.push(makeFilter(key, { slice: { k: "q", of, g: [...new Set(g.map(Number).filter((x) => x <= of))], w: wv } })); }
      else if (f.type === "range") { const [a, b] = v.split("~").map(Number); out.push(makeFilter(key, { min: a, max: b })); }
      else if (f.type === "bool") out.push(makeFilter(key, { value: v === "1" }));
      else {
        const [vs, mode] = v.split("~");
        out.push(makeFilter(key, { values: vs.split("|").filter(Boolean).map(decodeURIComponent).filter((x) => f.options.includes(x)), mode: mode === "all" || mode === "none" ? mode : "any" }));
      }
    });
    const OLD = { un_crc: "Children's rights (UNCRC)", un_icc: "International Criminal Court", un_paris: "Paris Agreement", un_refugee: "Refugee Convention",
      un_cedaw: "Women's rights (CEDAW)", un_crpd: "Disability rights (CRPD)", un_npt: "Non-Proliferation Treaty (NPT)", un_tpnw: "Nuclear weapons ban", un_landmine: "Landmine ban",
      wc_men_host: "Men's World Cup", wc_women_host: "Women's World Cup", olympics_summer_host: "Summer Olympics", olympics_winter_host: "Winter Olympics", commonwealth_games_host: "Commonwealth Games",
      wto_member: "World Trade Organization" };
    state.filters = out.map((fl) => {
      if (!OLD[fl.key]) return fl;
      const key = fl.key === "wto_member" ? "groups" : fl.key.startsWith("un_") ? "treaties_joined" : "events_hosted";
      return makeFilter(key, { values: [OLD[fl.key]], mode: fl.value ? "any" : "none" });
    });
    if (out.some(isCity) && !out.some((fl) => !isCity(fl))) state.tab = "cities";
    state.territories = p.get("t") === "1";
    state.colourBy = F[p.get("c")] ? p.get("c") : "";
    { const cl = /^(equal|quantile|jenks)([3-7])?$/.exec(p.get("cl") || ""); state.classes = cl ? cl[1] : ""; state.nClasses = cl && cl[2] ? +cl[2] : 5; }
    if (["compare", "rank", "trends", "insights"].includes(p.get("v"))) state.view = p.get("v");
    if (p.get("m") === "p") { state.mode = "physical"; if (window.WP && ["biomes", "climate", "plates", "none"].includes(p.get("pb"))) window.WP.style.base = p.get("pb"); }
    if (p.get("ms") === "change" && F[p.get("mc")]) {
      state.mapStyle = "change"; state.mm.ck = p.get("mc"); state.mm.from = +p.get("mf") || null; state.mm.to = +p.get("mt") || null; state.mm.pct = p.get("mp") === "1";
    } else if (p.get("ms") === "bi") {
      state.mapStyle = "bi"; state.mm.bx = F[p.get("bx")] ? p.get("bx") : ""; state.mm.by = F[p.get("by")] ? p.get("by") : "";
    }
    state.popSized = p.get("pz") === "1";
    if (byIso.has(p.get("s"))) state.selected = p.get("s");
    window.WV?.decode(p);
    const y = +p.get("y");
    if (y && TS_YEARS.includes(y)) { state.year = y; applyYear(y); }  // clamped to the filters' years on first render
  }
  // go to a view saved as a link (guided tours, curriculum links)
  function applyQS(qs) {
    stopPlay();
    Object.assign(state, { filters: [], colourBy: "", view: "map", mapStyle: "std", popSized: false, selected: null, classes: "", nClasses: 5, flow: null, solo: null,
      territories: false, open: null, feat: null, tab: "areas", sort: "", sortDir: null });
    if (state.year) { state.year = null; applyYear(null); }
    window.WV?.clearYears?.();
    const want = new URLSearchParams(qs).get("m") === "p" ? "physical" : "human";
    if (want !== state.mode) setMode(want);
    decodeState(qs);
    svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity);
    render();
  }
  function saveURL() {
    try {
      const q = [encodeState(), window.WTR?.urlExtra?.() || "", document.body.classList.contains("embed") ? "embed=1" : ""].filter(Boolean).join("&");
      history.replaceState(null, "", location.pathname + (q ? "?" + q : ""));
    } catch (e) { /* sandboxed frames may refuse */ }
  }
  try { decodeState(location.search); } catch (e) { /* ignore */ }

  // ---------- Shared with factfile.js ----------
  window.WC = { openSheet: (n) => openSheet(n),
    F, FILTERS, rows, byIso, geo, topo, cities, flows, state, famOf, esc, gslug, fmt, fmtShort, fmtFull, yearLabel, timeFrom, UNITS,
    applyYear, CLOCK, compact, TS, TS_YEARS, tsValue, SURVEY_KEYS, span, CAT_TS, NO_LOOKBACK, numericFilters, yearlyNumeric, measureOptions, fmtChange, cssVar,
    pool, isActive, passes, chipLabel, phrase, andList, matchList, setMode, itemsFor, showFeature, toggleFeature, hasFeature, applyPreset: (p) => { if (state.view !== "map") state.view = "map"; applyPreset(p); },
    get lastEval() { return lastEval; }, get styleInfo() { return styleInfo; }, get cs() { return lastCS; }, colourKey: () => colourKey(), CLASS_NAMES,
    render: (o) => render(o), refreshList: () => { if (!state.selected && state.view !== "map" && window.WV_H?.V?.list) renderChartList(); }, setView, select: (iso) => { state.selected = iso; state.open = null; render(); }, highlightMap: (iso, on) => highlight(iso, on),
    mapSVG: () => svg.node(), get matches() { return lastMatches; }, applyQS, getQS: () => encodeState(), setYear: (y) => setYear(y), stopPlay: () => stopPlay(),
    zoomBy: (f) => svg.transition().duration(250).call(zoom.scaleBy, f),
    panBy: (dx, dy) => { const t = d3.zoomTransform(svg.node()); svg.transition().duration(200).call(zoom.translateBy, dx / t.k, dy / t.k); },
    resetZoom: () => svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity),
    zoomToCountry: (iso) => zoomToCountry(iso), insetShift, selectArea, zoomToGroup, openAbout: () => openAbout(), NB,
    project: (lon, lat) => projection([lon, lat]), geoPath: () => path, landNode: () => gLand.node(), get k() { return d3.zoomTransform(svg.node()).k; },
    layer: (name) => { let g = gRoot.select(`g.layer-${name}`); if (g.empty()) g = gRoot.append("g").attr("class", `layer-${name}`); return g; },
    zoomToPoint: (lon, lat, k = 4) => { const [x, y] = projection([lon, lat]); const vb = svg.attr("viewBox").split(" ").map(Number); svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity.translate(vb[2] / 2 - x * k, vb[3] / 2 - y * k).scale(k)); },
    // a measure made on the page (e.g. your own index)
    addField: (f) => {
      const nums = rows.map((r) => r[f.key]).filter((v) => typeof v === "number").sort((a, b) => a - b);
      Object.assign(f, { type: "range", scale: "linear", step: f.step || 1, dmin: f.dmin ?? nums[0] ?? 0, dmax: f.dmax ?? nums[nums.length - 1] ?? 100 });
      f.toT = (v) => v; f.fromT = (t) => t; f.round = (v) => Math.round(v / f.step) * f.step;
      f.say ||= (b) => `${f.label} is ${b}`;
      // listed with the other measures, so the charts can use it
      const old = FILTERS.findIndex((x) => x.key === f.key);
      if (old >= 0) FILTERS[old] = f; else FILTERS.push(f);
      const oi = numericFilters.findIndex((x) => x.key === f.key);
      if (oi >= 0) numericFilters[oi] = f; else numericFilters.push(f);
      if (f.group && !window.FILTER_GROUPS.includes(f.group)) window.FILTER_GROUPS.unshift(f.group);
      F[f.key] = f;
      return f;
    },
    // the part of the map picture that has land on it (for exports), in viewBox units
    mapBounds: () => {
      const vb = svg.attr("viewBox").split(" ").map(Number), t = d3.zoomTransform(svg.node());
      const b = path.bounds({ type: "FeatureCollection", features: geo });
      const x0 = Math.max(0, b[0][0] * t.k + t.x - 12), y0 = Math.max(0, b[0][1] * t.k + t.y - 12);
      const x1 = Math.min(vb[2], b[1][0] * t.k + t.x + 12), y1 = Math.min(vb[3], b[1][1] * t.k + t.y + 40);
      return [x0, y0, x1 - x0, y1 - y0];
    }, clearAll: () => clearAll(),
    resultsCSV: () => {
      const { act, res } = lastEval;
      const list = pool().filter((r) => res.get(r.iso3).match).sort((a, b) => a.name.localeCompare(b.name));
      const keys = [...new Set(act.map((fl) => fl.key).concat(colourKey() ? [colourKey()] : []))];
      const cell = (r, k) => { const v = r[k]; return Array.isArray(v) ? v.join("; ") : typeof v === "boolean" ? (v ? "Yes" : "No") : v ?? ""; };
      return [["Area", "Region", ...keys.map((k) => F[k].label + (state.year && F[k].time ? ` (${state.year})` : ""))],
        ...list.map((r) => [r.name, r.region, ...keys.map((k) => cell(r, k))])];
    },
    latest: (r, key) => (r._latest && key in r._latest ? r._latest[key] : r[key]),
    latestYear: (r, f) => {
      if (typeof f.year === "string") return r._latest && f.year in r._latest ? r._latest[f.year] : r[f.year];
      return f.yearText || f.year || "";
    },
  };
  $("#ffBtn")?.addEventListener("click", () => window.openFactfile?.(state.selected));
  window.WP?.setW(window.WC);
  window.WV?.init();
  window.WQ?.init();
  window.WN?.init();
  window.WK?.init();
  window.WMS?.init();
  window.WST?.init();
  window.WTR?.init();
  window.WQM?.init();
  window.WX?.init();
  window.WLN?.init();
  window.WCL?.init();
  window.WCG?.init();
  window.WRG?.init();
  window.WLY?.init();
  window.WAB?.init();
  window.WA?.init();

  // ---------- Go ----------
  new ResizeObserver(() => { layout(); floatChanged?.(); }).observe($("#mapstage"));

  // ---------- Cards that can be moved and resized: the quiz card and the filter editor ----------
  // Drag them by their title; drag the bottom-right corner to resize; double-click the title to put them back.
  function floatChanged() {
    clearTimeout(floatChanged.t);
    floatChanged.t = setTimeout(() => {
      // the quiz card sits at the bottom of the map, centred under southern Africa (open ocean), so the map keeps its full size
      const st = $("#starter"), stage = $("#mapstage");
      if (mapLeftPad) { mapLeftPad = 0; layout(); }
      const open = st && !st.hidden && !narrow() && st.offsetWidth > 0 && stage.contains(st);
      // the card may cover the Southern Ocean (about 60px) but not much more
      // if the card has been moved, the map only makes room when the card is still low down
      const moved = open && st.classList.contains("moved"), sh = stage.offsetHeight;
      const bp = !open ? 0 : moved ? (st.offsetTop > sh * 0.45 ? Math.max(0, sh - st.offsetTop - 60) : 0) : Math.max(0, st.offsetHeight + 12 - 60);
      if (Math.abs(bp - mapBottomPad) > 6) { mapBottomPad = bp; layout(); }
      if (!open) return;
      const W0 = stage.offsetWidth, w = st.offsetWidth;
      const x = projection([25, -30])[0];
      st.style.setProperty("--qx", Math.round(Math.max(12, Math.min(W0 - w - 62, x - w / 2))) + "px"); // clear of the zoom buttons
    }, 60);
  }
  function makeFloating(el, handleSel, store) {
    if (!el) return;
    const apply = (p) => {
      el.classList.add("moved");
      Object.assign(el.style, { left: p.x + "px", top: p.y + "px", right: "auto", bottom: "auto", transform: "none" });
      if (p.w) el.style.width = p.w + "px";
      if (p.h) el.style.height = p.h + "px";
    };
    const save = () => { try { localStorage.setItem(store, JSON.stringify({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.style.height ? el.offsetHeight : 0 })); } catch (e) { /* storage may be off */ } };
    const reset = () => {
      el.classList.remove("moved");
      ["left", "top", "width", "height", "right", "bottom", "transform"].forEach((k) => (el.style[k] = ""));
      try { localStorage.removeItem(store); } catch (e) { /* ignore */ }
      floatChanged();
    };
    try { const p = JSON.parse(localStorage.getItem(store) || "null"); if (p && !narrow()) apply(p); } catch (e) { /* ignore */ }
    el.addEventListener("pointerdown", (e) => {
      if (narrow() || e.button) return;
      if (!e.target.closest(handleSel) || e.target.closest("button, input, select, a, summary, label")) return;
      e.preventDefault();
      const host = el.parentElement.getBoundingClientRect(), r = el.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      apply({ x: r.left - host.left, y: r.top - host.top, w: r.width });
      el.classList.add("dragging");
      const move = (ev) => {
        el.style.left = Math.max(0, Math.min(host.width - 80, ev.clientX - host.left - dx)) + "px";
        el.style.top = Math.max(0, Math.min(host.height - 40, ev.clientY - host.top - dy)) + "px";
      };
      const up = () => { el.classList.remove("dragging"); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); save(); floatChanged(); };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    });
    el.addEventListener("dblclick", (e) => { if (e.target.closest(handleSel) && !e.target.closest("button, input, select")) reset(); });
    new ResizeObserver(() => {
      // resizing from the corner sets an inline width/height: keep that too
      if (el.offsetWidth && !el.classList.contains("dragging") && (el.classList.contains("moved") || el.style.height || el.style.width)) {
        clearTimeout(el._rs); el._rs = setTimeout(() => { if (!el.classList.contains("moved")) apply({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }); save(); }, 300);
      }
      floatChanged();
    }).observe(el);
  }
  // the quiz card: drag it by its title, resize it from the bottom-right corner, double-click the title to put it back
  makeFloating($("#starter"), ".qz-head", "wcq-card");
  new ResizeObserver(floatChanged).observe($("#starter"));
  window.addEventListener("resize", floatChanged);
  layout();
  render();
})();
