/* Which Countries? — the Charts view (it replaced Trends).
 * One measure, many ways to draw it, picked from a row of tabs:
 *   Line · Bar · Table · Map   and   Stacked area · Slope · Marimekko · Parts of a whole · Sankey
 * Groups of countries (the world, each continent, the countries matching your filters) are summed
 * up three ways: the median country, the average weighted by population (or by GDP, exports…),
 * or the total, which is only offered for things you can add up, like population or CO₂.
 * Loaded after views.js, which hands over its chart helpers in window.WV_H. */
(function () {
  "use strict";
  let W, F, TS, TS_YEARS, esc, fmtShort, H, V;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  let playTimer = null;
  let tableSort = { col: "to", dir: -1 };
  let flowData = window.__RFLOWS__ || null, flowLoading = null;

  // ---------- What each measure allows ----------
  // Things you can add up: a total for the world or a continent means something
  const SUM_KEYS = new Set(["population", "pop_un", "co2_mt", "refugees_hosted", "refugees_from", "idps", "asylum_seekers_hosted", "tourists",
    "tourist_departures", "tourism_receipts_usd", "military_spend_usd", "armed_forces", "exports_usd", "goods_exports_usd",
    "services_exports_usd", "gdp_usd", "elec_twh", "oil_twh", "gas_twh", "coal_twh", "area_km2", "patents", "science_articles"]);
  const isSum = (key) => SUM_KEYS.has(key) || !!(F || window.WC?.F)?.[key]?.sum;
  // Missing refugee figures mean none were reported, so they count as zero in totals
  const ZERO_MISSING = new Set(["refugees_hosted", "refugees_from"]);

  // Averages are weighted, so they describe the average person (or dollar, or kilowatt-hour) rather than the average country
  function weightKey(key) {
    const f = F[key];
    if (/^exp_(fuel|metals|food|agri_raw|manuf)_pct$/.test(key) || key === "hightech_exports_pct" || key === "ict_goods_exports_pct") return "goods_exports_usd";
    if (/_elec_pct$/.test(key)) return "elec_twh";
    if (f && f.format === "pct" && /\bGDP\b|economy/.test((f.info || "") + " " + (f.label || "")) && !/per person/i.test(f.label)) return "gdp_usd";
    return "population";
  }
  const WEIGHT_NAME = { population: "population", goods_exports_usd: "goods exports", elec_twh: "electricity generated", gdp_usd: "GDP" };

  // Parts of a whole: measures that add up to 100%
  const COMPOSITIONS = [
    { id: "elec", label: "Where electricity comes from", weight: "elec_twh", parts: [
      ["coal_elec_pct", "Coal", "#6b5344"], ["oil_elec_pct", "Oil", "#a0522d"], ["gas_elec_pct", "Gas", "#e8962e"],
      ["nuclear_elec_pct", "Nuclear", "#8a5cc7"], ["hydro_elec_pct", "Hydro", "#2a78d6"], ["wind_elec_pct", "Wind", "#43b0c4"],
      ["solar_elec_pct", "Solar", "#e9c11a"], ["other_renew_elec_pct", "Other renewables", "#3a9a4a"], [null, "Other", "#b5b5b5"]] },
    { id: "jobs", label: "Jobs by sector", weight: "population", parts: [
      ["emp_agriculture", "Farming (primary)", "#3a9a4a"], ["emp_industry", "Industry (secondary)", "#8a96a3"], ["emp_services", "Services (tertiary)", "#2a78d6"]] },
    { id: "exports", label: "What goods exports are made of", weight: "goods_exports_usd", parts: [
      ["exp_fuel_pct", "Fuel", "#6b5344"], ["exp_metals_pct", "Ores & metals", "#8a96a3"], ["exp_food_pct", "Food", "#3a9a4a"],
      ["exp_agri_raw_pct", "Farm raw materials", "#c2912e"], ["exp_manuf_pct", "Manufactured goods", "#2a78d6"], [null, "Other goods", "#c9bfae"]] },
    { id: "religion", label: "Religion", weight: "population", parts: [
      ["pct_christian", "Christian", "#2a78d6"], ["pct_muslim", "Muslim", "#1baf7a"], ["pct_unaffiliated", "No religion", "#9aa5ab"],
      ["pct_hindu", "Hindu", "#ef8a1f"], ["pct_buddhist", "Buddhist", "#e3b81c"], ["pct_folk", "Folk religions", "#a56b3f"],
      ["pct_jewish", "Jewish", "#6a5acd"], ["pct_other_religion", "Other religions", "#c76ba8"]] },
    { id: "age", label: "Age groups", weight: "population", parts: [
      ["pct_under15", "Under 15", "#43b0c4"], [null, "15 to 64", "#2a78d6"], ["pct_over65", "65 and over", "#8a5cc7"]] },
  ];
  const compFor = (key) => COMPOSITIONS.find((c) => c.parts.some(([k]) => k === key));

  // Sankey charts: refugee flows between places, and exports by type of product
  const REFUGEE_KEYS = new Set(["refugees_hosted", "refugees_from", "refugees_hosted_per1000", "refugees_from_per1000", "asylum_seekers_hosted", "idps"]);
  const EXPORT_KEYS = new Set(["exports_usd", "goods_exports_usd", "services_exports_usd", "exports_pct", "trade_pct", "exp_fuel_pct", "exp_metals_pct",
    "exp_food_pct", "exp_agri_raw_pct", "exp_manuf_pct", "hightech_exports_pct"]);
  const sankeyKind = (key) => (REFUGEE_KEYS.has(key) ? "refugees" : EXPORT_KEYS.has(key) ? "exports" : null);
  const EXPORT_TYPES = [["exp_fuel_pct", "Fuel", "#6b5344"], ["exp_metals_pct", "Ores & metals", "#8a96a3"], ["exp_food_pct", "Food", "#3a9a4a"],
    ["exp_agri_raw_pct", "Farm raw materials", "#c2912e"], ["exp_manuf_pct", "Manufactured goods", "#2a78d6"], [null, "Other goods", "#c9bfae"], ["services", "Services", "#c76ba8"]];

  const TYPES = [
    { id: "line", label: "Line", icon: '<path d="M1.5 12l4-4.5 3 2.5 5.5-7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>' },
    { id: "bar", label: "Bar", icon: '<path d="M2 3h7M2 7h11M2 11h5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' },
    { id: "table", label: "Table", icon: '<path d="M1.5 2.5h13v11h-13zM1.5 6h13M1.5 9.5h13M6 2.5v11" fill="none" stroke="currentColor" stroke-width="1.3"/>' },
    { id: "map", label: "Map", icon: '<circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M1.7 8h12.6M8 1.7c-2.4 2.4-2.4 10.2 0 12.6M8 1.7c2.4 2.4 2.4 10.2 0 12.6" fill="none" stroke="currentColor" stroke-width="1.1"/>', more: false },
    { id: "area", label: "Stacked area", icon: '<path d="M1.5 13.5V9l4-2 3 2 6-5v9.5z" fill="currentColor" opacity=".35"/><path d="M1.5 13.5V11l4-1.5 3 1.5 6-3v5.5z" fill="currentColor"/>', more: true },
    { id: "slope", label: "Slope", icon: '<path d="M3 11l10-6M3 5l10 3" stroke="currentColor" stroke-width="1.5"/><path d="M3 2v12M13 2v12" stroke="currentColor" stroke-width="1" opacity=".5"/>', more: true },
    { id: "mekko", label: "Marimekko", icon: '<path d="M1.5 14V9h2.5v5zM4.5 14V5h5v9zM10 14V7h4.5v7z" fill="currentColor"/>', more: true },
    { id: "mix", label: "Parts of a whole", icon: '<path d="M2 3h12v3H2z" fill="currentColor" opacity=".35"/><path d="M2 3h5v3H2zM2 9h8v3H2z" fill="currentColor"/><path d="M2 9h12v3H2z" fill="none" stroke="currentColor" stroke-width="1"/>', more: true },
    { id: "multi", label: "Small multiples", icon: '<path d="M1.5 1.5h5.5v5.5H1.5zM9 1.5h5.5v5.5H9zM1.5 9h5.5v5.5H1.5zM9 9h5.5v5.5H9z" fill="none" stroke="currentColor" stroke-width="1"/><path d="M2.5 5.5l1.5-1.5 1.5 1 1-2M10 5l1.5-.5 1.5-2M2.5 13l2-2.5 2 .5M10 12.5l1.5-1 2 .5" fill="none" stroke="currentColor" stroke-width="1"/>', more: true },
    { id: "race", label: "Bar chart race", icon: '<path d="M2 3h11M2 6.5h8M2 10h5.5M2 13.5h3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M14 9.5l1.5 1.5-1.5 1.5" fill="none" stroke="currentColor" stroke-width="1.2"/>', more: true },
    { id: "sankey", label: "Sankey", icon: '<path d="M2 3c6 0 6 7 12 7M2 9c6 0 6-5 12-5M2 13c6 0 6-1 12-1" fill="none" stroke="currentColor" stroke-width="1.8"/>', more: true },
  ];

  // ---------- Values for one country and for groups of countries ----------
  const yearly = (key) => !!TS[key] && !W.CAT_TS[key];
  function value(key, iso, year) {
    if (year != null && TS[key]) return W.tsValue(key, iso, year);
    const r = W.byIso.get(iso);
    if (!r) return null;
    const v = W.latest(r, key);
    return typeof v === "number" ? v : null;
  }
  function weightOf(wk, iso, year) {
    let v = value(wk, iso, TS[wk] ? year : null);
    // past the World Bank's population figures (e.g. UN projections), weight by the UN's projected population
    if ((v == null || !(v > 0)) && wk === "population" && TS.pop_un && year) v = value("pop_un", iso, year);
    return v != null && v > 0 ? v : null;
  }
  const memo = new Map();
  // one number for a group of countries: median, weighted average or total; null when too few have data
  function agg(key, isos, year, mode, minN) {
    const ck = `${key}|${mode}|${year}|${isos.length}|${isos[0]}|${isos[isos.length - 1]}`;
    if (memo.has(ck)) return memo.get(ck);
    let out = null;
    if (mode === "median") {
      const vs = isos.map((i) => value(key, i, year)).filter((v) => v != null);
      out = vs.length >= minN ? d3.median(vs) : null;
    } else {
      const wk = mode === "total" ? "population" : weightKey(key);
      let sum = 0, wsum = 0, wAll = 0, n = 0;
      for (const iso of isos) {
        const w = weightOf(wk, iso, year);
        let v = value(key, iso, year);
        if (v == null && mode === "total" && ZERO_MISSING.has(key) && TS[key]) v = 0;
        if (w == null) continue;
        wAll += w;
        if (v == null) continue;
        n++;
        if (mode === "total") { sum += v; wsum += w; } else { sum += v * w; wsum += w; }
      }
      // enough of the group must be covered: 80% of its people for a total, 60% of its weight for an average
      const cover = wAll ? wsum / wAll : 0;
      if (n >= Math.min(minN, 3) && cover >= (mode === "total" ? 0.8 : 0.6)) out = mode === "total" ? sum : sum / wsum;
    }
    memo.set(ck, out);
    return out;
  }
  function groups() {
    const t = V.trend;
    const base = W.rows.filter((r) => r.sovereign || W.state.territories);
    const out = [];
    const ms = H.matchSet();
    if (t.world) out.push({ id: "world", name: "UK", isos: base.map((r) => r.iso3), colour: H.css("--ink"), minN: 20, world: true });
    if (t.conts) H.CONTINENTS.forEach((c) => out.push({ id: c, name: c, isos: base.filter((r) => r.region === c).map((r) => r.iso3), colour: H.contColour(c), minN: 5 }));
    if (ms && t.group) out.push({ id: "matches", name: `Your ${ms.size} ${ms.size === 1 ? "area" : "areas"}`, isos: [...ms], colour: H.css("--match"), minN: 3, mine: true });
    return out;
  }
  function pinsList() { return V.trend.pins.filter((iso) => W.byIso.has(iso)); }
  const pinColour = (i) => H.css(H.PIN_VARS[i % H.PIN_VARS.length]);
  const aggName = (mode) => (mode === "total" ? "total" : mode === "avg" ? "average" : "median");
  const seriesName = (g, mode) => (g.world ? `UK ${aggName(mode)}` : `${g.name} ${aggName(mode)}`);

  // UN projections (pop_un…) come every five years: use just the years that have figures, so lines are smooth
  const unProj = (key) => /_un$/.test(key) && W.SURVEY_KEYS?.has(key);
  const isSurvey = (key) => W.SURVEY_KEYS?.has(key) && !unProj(key);
  const yrMemo = new Map();
  function yearsFor(key) {
    const sp = yearly(key) ? W.span(key) : null;
    if (!sp) return [];
    if (!unProj(key)) return d3.range(sp[0], sp[1] + 1);
    if (!yrMemo.has(key)) {
      const have = new Set();
      for (const arr of Object.values(TS[key])) arr.forEach((v, i) => { if (v != null) have.add(TS_YEARS[0] + i); });
      yrMemo.set(key, [...have].sort((a, b) => a - b));
    }
    return yrMemo.get(key);
  }
  // the latest year with a value for the world (or else the latest year with data)
  function bestYear(key, mode) {
    const ys = yearsFor(key);
    if (!ys.length) return null;
    const all = W.rows.filter((r) => r.sovereign).map((r) => r.iso3);
    for (let i = ys.length - 1; i >= 0; i--) if (agg(key, all, ys[i], mode === "total" && !isSum(key) ? "median" : mode, 20) != null) return ys[i];
    return ys[ys.length - 1];
  }

  // ---------- Which chart types suit this measure ----------
  function why(type, key) {
    const f = F[key];
    if (!f) return "Pick a measure.";
    switch (type) {
      case "line": case "slope":
        return yearly(key) ? "" : `“${f.label}” has data for one year only, so there is nothing to draw over time. Try Bar, Table or Map.`;
      case "mountains": return "";
      case "multi":
        return yearly(key) ? "" : `“${f.label}” has data for one year only, so there is nothing to draw over time. Try Bar or Map.`;
      case "race":
        return yearly(key) ? "" : `“${f.label}” has data for one year only, so there is nothing to race through. Try Bar or Map.`;
      case "area":
        if (!yearly(key)) return `“${f.label}” has data for one year only.`;
        return isSum(key) ? "" : "A stacked area adds the regions together, so it needs something you can add up, such as population, CO₂ emissions or refugees. Rates and percentages can't be added.";
      case "mekko":
        return isSum(key) ? "A Marimekko chart shows a rate for every person, so it needs a measure per person or a percentage (such as GDP per person or life expectancy), not a total." : "";
      case "mix":
        return compFor(key) ? "" : "Parts of a whole works for measures that split something into shares adding up to 100%: where electricity comes from, jobs by sector, what exports are made of, religions and age groups.";
      case "sankey":
        return sankeyKind(key) ? "" : "A Sankey chart shows flows from one place or thing to another. Here it works for refugees (where people fled from, and where they went) and for exports (what each region sells).";
      default: return "";
    }
  }
  const SUGGEST = {
    area: [["population", "Population"], ["co2_mt", "CO₂ emissions"], ["refugees_from", "Refugees"], ["gdp_usd", "GDP"]],
    mekko: [["median_age", "Median age"], ["pct_65plus", "Aged 65+"], ["density", "Density"]],
    mix: [["coal_elec_pct", "Electricity sources"], ["emp_agriculture", "Jobs by sector"], ["exp_manuf_pct", "Exports by type"], ["pct_christian", "Religions"], ["pct_under15", "Age groups"]],
    sankey: [["refugees_from", "Refugee flows"], ["exports_usd", "Exports by type"]],
    race: [["population", "Population"], ["median_age", "Median age"]],
    line: [["population", "Population"], ["median_age", "Median age"], ["pct_65plus", "Aged 65+"]],
    slope: [["median_age", "Median age"], ["pct_65plus", "Aged 65+"], ["pct_0_15", "Aged 0–15"]],
  };

  // ---------- Shell ----------
  function shell() {
    return `<div class="vhead"><div class="vctrls">
        <label class="fld"><span>Measure</span><select id="tK" data-pick></select></label>
        <div class="fld" id="tAggF"><span>Groups show the</span><div class="seg" role="radiogroup" aria-label="Summarise groups by" id="tAgg">
          <button type="button" role="radio" data-a="median" title="The middle area: half are above it, half below">Median</button>
          <button type="button" role="radio" data-a="avg">Average</button>
          <button type="button" role="radio" data-a="total" title="Everything added up">Total</button></div></div>
        <div class="tchecks">
          <label class="tog"><input type="checkbox" id="tW"> UK</label>
          <label class="tog"><input type="checkbox" id="tC"> Regions</label>
          <label class="tog" id="tGL"><input type="checkbox" id="tG"> Your areas together</label>
          <label class="tog" id="tML"><input type="checkbox" id="tM"> Each matching area</label>
          <label class="fld tlabf" id="tLabL"><span>Label them</span><select id="tLab"><option value="">No</option><option value="name">Names</option><option value="code">Short codes (e.g. GBR)</option></select></label>
          <label class="tog" id="tLogL"><input type="checkbox" id="tLog"> Log scale</label>
          <label class="fld tlabf" id="tRelL"><span>Show</span><select id="tRel"><option value="">The actual figures</option><option value="abs">Change since…</option><option value="pct">% change since…</option><option value="idx">Index: start year = 100</option></select><select id="tBase" aria-label="Start year"></select></label>
        </div>
      </div>
      <div class="ctabs" role="tablist" aria-label="Chart type" id="tTypes"></div></div>
      <div class="vbody" id="vbody"><svg id="vsvg" role="img"></svg></div>
      <div class="vfoot">
        <div class="vyear" id="tYearRow"></div>
        <div class="vlegend" id="tLeg"></div>
        <div class="vopts">
          <span class="vfind"><input id="tFind" list="vCountries" placeholder="Add an area…" aria-label="Add an area"><datalist id="vCountries"></datalist></span>
          <span class="pins" id="tPins"></span></div>
        <p class="vnote" id="tNote"></p></div>`;
  }
  function bind() {
    W = window.WC; F = W.F; TS = W.TS; TS_YEARS = W.TS_YEARS; esc = W.esc; fmtShort = W.fmtShort; H = window.WV_H; V = H.V;
    const t = V.trend;
    if (!F[t.key] || F[t.key].type !== "range") t.key = "population";
    $("#tK").innerHTML = W.measureOptions(t.key);
    $("#tK").onchange = (e) => { setKey(e.target.value); W.render(); };
    $$("#tAgg button").forEach((b) => (b.onclick = () => { if (!b.disabled) { t.agg = b.dataset.a; W.render(); } }));
    $("#tW").onchange = (e) => { t.world = e.target.checked; W.render(); };
    $("#tC").onchange = (e) => { t.conts = e.target.checked; W.render(); };
    $("#tG").onchange = (e) => { t.group = e.target.checked; W.render(); };
    $("#tM").onchange = (e) => { t.matches = e.target.checked; W.render(); };
    $("#tLab").onchange = (e) => { t.labs = e.target.value; W.render(); };
    $("#tLog").onchange = (e) => { t.log = e.target.checked; W.render(); };
    $("#tRel").onchange = (e) => { t.rel = e.target.value; W.render(); };
    $("#tBase").onchange = (e) => { t.base = +e.target.value; W.render(); };
    $("#tFind").onchange = (e) => { const r = H.findCountry(e.target.value); e.target.value = ""; if (r && !t.pins.includes(r.iso3)) { t.pins = t.pins.concat(r.iso3).slice(-6); W.render(); } };
  }
  function setKey(k) {
    const t = V.trend;
    t.key = k; t.log = null; t.agg = null; t.year = null; t.from = null;
  }
  // log scale: the measure's usual scale, but not for totals, where a plain scale shows the sizes better
  function lineLog(key) { const t = V.trend; return t.log != null ? t.log : t.agg !== "total" && F[key]?.scale === "log"; }
  function defaultAgg(key) { return isSum(key) ? "total" : "median"; }

  function stop() {
    if (!playTimer) return;
    clearTimeout(playTimer); playTimer = null;
    const b = $("#chPlay"); if (b) b.textContent = "▶";
  }

  // ---------- Draw ----------
  function draw() {
    if (!W) bind();
    memo.clear();
    const t = V.trend, key = t.key, f = F[key];
    if (!f) return;
    $("#tK").value = key;
    if (!t.agg || (t.agg === "total" && !isSum(key))) t.agg = defaultAgg(key);
    if (!TYPES.some((x) => x.id === t.type)) t.type = yearly(key) ? "line" : "bar";
    const ms = H.matchSet();
    // controls
    $$("#tAgg button").forEach((b) => {
      b.setAttribute("aria-checked", String(b.dataset.a === t.agg));
      b.disabled = b.dataset.a === "total" && !isSum(key);
      if (b.dataset.a === "total") b.title = isSum(key) ? "Everything added up" : "Only for things you can add up, like population or CO₂ emissions";
      if (b.dataset.a === "avg") b.title = `Average weighted by ${WEIGHT_NAME[weightKey(key)] || "population"}`;
    });
    $("#tW").checked = t.world; $("#tC").checked = t.conts;
    $("#tGL").hidden = !ms; $("#tG").checked = t.group;
    $("#tML").hidden = !ms; $("#tM").checked = t.matches;
    $("#tLabL").hidden = !ms || !t.matches; $("#tLab").value = t.labs || "";
    const showsGroups = ["line", "bar", "table", "slope", "multi"].includes(t.type);
    $("#tAggF").hidden = !showsGroups;
    $$(".tchecks .tog").forEach((l) => (l.style.display = ""));
    $(".tchecks").hidden = !["line", "bar", "table", "slope", "mix"].includes(t.type);
    const log = lineLog(key);
    $("#tLogL").hidden = t.type !== "line" || !!t.rel; $("#tLog").checked = log;
    $("#tRelL").hidden = t.type !== "line" || isSurvey(key); $("#tRel").value = t.rel || "";
    { const ys = yearsFor(key), b = t.base && ys.includes(t.base) ? t.base : ys[0];
      $("#tBase").innerHTML = ys.map((y) => `<option ${y === b ? "selected" : ""}>${y}</option>`).join(""); $("#tBase").hidden = !t.rel; }
    // chart type tabs
    $("#tTypes").innerHTML = TYPES.map((x, i) => {
      const w = why(x.id, key);
      const sep = x.more && !TYPES[i - 1].more ? `<span class="csep" aria-hidden="true"></span>` : "";
      return `${sep}<button type="button" role="tab" data-t="${x.id}" aria-selected="${x.id === t.type}" class="${w ? "dim" : ""}" title="${esc(w || x.label)}"><svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">${x.icon}</svg>${x.label}${x.id === "map" ? " ↗" : ""}</button>`;
    }).join("");
    $$("#tTypes button").forEach((b) => (b.onclick = () => {
      if (b.dataset.t === "map") return toMap();
      stop(); t.type = b.dataset.t; W.render();
    }));
    // body
    const body = $("#vbody");
    body.classList.toggle("scroll", t.type === "table" || t.type === "bar");
    if (!$("#vsvg")) body.innerHTML = `<svg id="vsvg" role="img"></svg>`;
    $("#tLeg").innerHTML = ""; $("#tYearRow").innerHTML = "";
    V.csv = null;
    const w = why(t.type, key);
    if (w) { explain(t.type, w); pinsUI(); V.list = null; return; }
    ({ line: drawLine, bar: drawBar, table: drawTable, area: drawArea, slope: drawSlope, mekko: drawMekko, mix: drawMix, sankey: drawSankey, race: drawRace, multi: drawMulti, mountains: drawMountains })[t.type]();
    pinsUI();
    // the list in the results pane: every country's value in the year the chart shows
    const ly = yearly(key) ? (t.year && yearsFor(key).includes(t.year) ? t.year : bestYear(key, "median")) : null;
    V.list = { title: ly ? `Figures for ${ly}` : `Latest figures`, cols: [f], asc: f.format === "rank",
      rows: W.pool().filter((r) => !ms || ms.has(r.iso3)).map((r) => ({ iso: r.iso3, vals: [value(key, r.iso3, ly)] })).filter((x) => x.vals[0] != null),
      pinned: t.pins, note: ["area", "mekko", "sankey", "race", "mountains"].includes(t.type) ? "Areas added here show in Line, Bar, Table, Slope and Parts of a whole." : t.type === "multi" ? "Click an area to add a small chart for it (up to 6)." : "Click an area to add it to the chart (up to 6).", max: 6,
      toggle: (iso) => { t.pins = t.pins.includes(iso) ? t.pins.filter((x) => x !== iso) : t.pins.concat(iso).slice(-6); } };
  }

  function explain(type, text) {
    const body = $("#vbody");
    body.innerHTML = `<div class="cexplain"><h3>${esc(TYPES.find((x) => x.id === type).label)} chart</h3><p>${esc(text)}</p>
      ${SUGGEST[type] ? `<p class="sub">Try one of these:</p><div class="presets">${SUGGEST[type].map(([k, l]) => (F[k] ? `<button type="button" data-k="${k}">${esc(l)}</button>` : "")).join("")}</div>` : ""}</div>`;
    $$("button[data-k]", body).forEach((b) => (b.onclick = () => { setKey(b.dataset.k); V.trend.type = type; W.render(); }));
    $("#tNote").textContent = "";
    V.csv = null; V.title = "";
  }
  function toMap() {
    const key = V.trend.key;
    W.state.colourBy = key;
    W.setView("map");
  }

  // year controls: one year (with play) or a from/to pair
  function yearPicker(key, opts = {}) {
    const t = V.trend, ys = opts.years || yearsFor(key);
    const row = $("#tYearRow");
    if (!ys.length) { row.innerHTML = `<span class="ylab">Data for ${esc(W.yearLabel(F[key]) || "the latest year")}</span>`; return { year: null }; }
    const def = opts.def ?? ys[ys.length - 1];
    let year = t.year && ys.includes(t.year) ? t.year : def;
    if (opts.pair) {
      let from = t.from && ys.includes(t.from) && t.from < year ? t.from : opts.defFrom ?? Math.max(ys[0], year - 30);
      if (from >= year) from = ys[0];
      const opt = (sel) => ys.slice().reverse().map((y) => `<option ${y === sel ? "selected" : ""}>${y}</option>`).join("");
      row.innerHTML = `<label class="fld inline"><span>From</span><select id="tFrom">${opt(from)}</select></label><label class="fld inline"><span>To</span><select id="tTo">${opt(year)}</select></label>`;
      $("#tFrom").onchange = (e) => { t.from = +e.target.value; W.render(); };
      $("#tTo").onchange = (e) => { t.year = +e.target.value; W.render(); };
      return { year, from };
    }
    // ids start "ch" so they never clash with the map's year player
    row.innerHTML = `<button type="button" class="play" id="chPlay" aria-label="Play through the years">${playTimer ? "❚❚" : "▶"}</button>${window.WPL ? window.WPL.speedHTML("chSpeed") : ""}<span class="yslide"><input type="range" id="chYear" min="${ys[0]}" max="${ys[ys.length - 1]}" step="1" value="${year}" aria-label="Year"></span><span class="num vy">${year}</span><span class="ysig" id="chSig" hidden></span>`;
    const sigKey = opts.sigKey || key;
    const sig = window.WPL && TS[sigKey] && !W.CAT_TS[sigKey] ? window.WPL.merged([sigKey]) : new Map();
    if (window.WPL) {
      requestAnimationFrame(() => window.WPL.marks($("#chYear"), sig)); window.WPL.light($("#chSig"), sig, year); window.WPL.bindSpeed($("#chSpeed"));
      const st = sig.get(year);
      const av = window.WPL.avgHTML(sigKey, year);
      if (av) row.insertAdjacentHTML("beforeend", `<span class="tavg">${av}</span>`);
      if (st) row.insertAdjacentHTML("beforeend", `<p class="tsigtext pop l${st.level}">${esc(st.text)}</p>`);
    }
    $("#chYear").oninput = (e) => { stop(); t.year = +e.target.value; W.render(); };
    $("#chPlay").onclick = () => {
      if (playTimer) return stop();
      if (t.year == null || t.year >= ys[ys.length - 1]) t.year = ys[0];
      W.render();
      const tick = () => {
        if (t.year >= ys[ys.length - 1]) { stop(); W.render(); return; }
        t.year = ys[ys.indexOf(t.year) + 1] ?? t.year + 1; W.render();
        const s = sig.get(t.year);
        playTimer = setTimeout(tick, (window.WPL ? window.WPL.ms(420) : 420) * (s ? (s.level === 2 ? 3 : 2) : 1));
      };
      playTimer = setTimeout(tick, window.WPL ? window.WPL.ms(420) : 420);
      $("#chPlay").textContent = "❚❚";
    };
    return { year };
  }

  function pinsUI() {
    const t = V.trend, pins = pinsList();
    const usesPins = !["area", "mekko", "sankey", "race", "mountains"].includes(t.type) || !!why(t.type, t.key);
    $(".vopts", $("#viewwrap")).hidden = !usesPins;
    $("#tPins").innerHTML = pins.map((iso, i) => `<span class="pin"><span class="sw" style="background:${pinColour(i)}"></span>${esc(W.byIso.get(iso).name)}<button type="button" data-iso="${iso}" aria-label="Remove ${esc(W.byIso.get(iso).name)}">×</button></span>`).join("") +
      (!pins.length ? `<span class="hint">Add areas to compare them with the groups.</span>` : "");
    $$("#tPins button").forEach((b) => (b.onclick = () => { t.pins = t.pins.filter((x) => x !== b.dataset.iso); W.render(); }));
  }
  function aggNote(key, mode) {
    if (mode === "total") return `Totals add up every area with data; a total is left out when areas with less than 80% of the group's people have data, so totals for years with gaps can be a little low.`;
    if (mode === "avg") return `Averages are weighted by ${WEIGHT_NAME[weightKey(key)] || "population"}, so big areas count for more: this is the figure for the ${weightKey(key) === "population" ? "average person" : "group as a whole"}.`;
    return `The median is the middle area: half are above it and half below. Every area counts the same, however big.`;
  }
  const fmtV = (f, v) => (v == null ? "–" : fmtShort(f, v));
  const svgSel = (w, h, label) => {
    const svg = d3.select("#vsvg").attr("viewBox", `0 0 ${w} ${h}`).attr("width", w).attr("height", h).attr("aria-label", label);
    svg.selectAll("*").remove();
    return svg;
  };
  const clip = (s, n) => (s.length > n + 1 ? s.slice(0, n) + "…" : s);
  const lower = (s) => H.lower(s);

  // ======================= LINE =======================
  function drawLine() {
    const t = V.trend, key = t.key, f = F[key], mode = t.agg;
    const ys = yearsFor(key);
    const log = lineLog(key);
    const ms = H.matchSet(), pins = pinsList();
    const series = [];
    // survey measures: different countries were surveyed in each wave, so group medians would jump about as countries
    // come and go. Show countries instead.
    const survey = isSurvey(key);
    if (!survey) for (const g of groups()) series.push({ id: g.id, name: seriesName(g, mode), vals: ys.map((y) => agg(key, g.isos, y, mode, g.minN)),
      colour: pins.length && !g.world && !g.mine ? H.css("--muted") : g.colour, dash: g.world ? "6 4" : pins.length && !g.mine ? "2 3" : null,
      width: g.world || g.mine ? 2.4 : pins.length ? 1.4 : 2.2, label: true, bold: g.world || g.mine });
    if (ms && t.matches) for (const iso of ms) if (!pins.includes(iso) && TS[key][iso]) series.push({ id: iso, name: W.byIso.get(iso).name, vals: ys.map((y) => TS[key][iso][y - TS_YEARS[0]] ?? null), colour: H.css("--match"), width: 1, opacity: 0.5, thin: true });
    if (survey && !series.length) for (const [iso, arr] of Object.entries(TS[key])) if (!pins.includes(iso) && W.byIso.get(iso)?.sovereign)
      series.push({ id: iso, name: W.byIso.get(iso).name, vals: ys.map((y) => arr[y - TS_YEARS[0]] ?? null), colour: H.css("--muted"), width: 1, opacity: 0.35, thin: true });
    pins.forEach((iso, i) => series.push({ id: iso, name: W.byIso.get(iso).name, vals: ys.map((y) => TS[key][iso]?.[y - TS_YEARS[0]] ?? null), colour: pinColour(i), width: 2.8, label: true, bold: true }));
    // change since a start year: every line starts from the same place, so growth can be compared
    const rel = !survey && t.rel ? t.rel : "";
    let fy = f, base = null;
    if (rel) {
      base = t.base && ys.includes(t.base) ? t.base : ys[0];
      const bi = ys.indexOf(base);
      series.forEach((s) => {
        // the start value: the start year, or the first year after it with data
        let j = bi; while (j < s.vals.length && s.vals[j] == null) j++;
        const b0 = s.vals[j];
        s.vals = s.vals.map((v, i) => (i < bi || v == null || b0 == null ? null : rel === "abs" ? v - b0 : !b0 ? null : rel === "pct" ? (100 * (v - b0)) / Math.abs(b0) : (100 * v) / b0));
      });
      fy = rel === "abs" ? f : { ...f, format: rel === "pct" ? "pct" : "dec1", scale: "linear" };
    }
    const logL = log && !rel;
    let bandNote = "";
    const { w, h } = H.size();
    const mob = w < 560;
    const M = { t: 26, r: mob ? 96 : 160, b: 30, l: mob ? 48 : 62 };
    const all = series.flatMap((s) => s.vals).filter((v) => v != null && (!logL || v > 0));
    const svg = svgSel(w, h, `${f.label} over time`);
    if (!all.length) { $("#tNote").textContent = "No data to show. Try ticking UK or Regions, or add an area."; return; }
    const ext = d3.extent(all);
    if (!logL && !rel && ext[0] > 0 && ext[0] < ext[1] * 0.35) ext[0] = 0;
    const sx = d3.scaleLinear().domain([rel ? base : ys[0], ys[ys.length - 1]]).range([M.l, w - M.r]);
    const sy = (logL ? d3.scaleLog() : d3.scaleLinear()).domain(ext).range([h - M.b, M.t]).nice();
    axes(svg, sx, sy, logL, fy, w, h, M, mob, rel ? `↑ ${{ abs: "Change in", pct: "% change in", idx: "Index of" }[rel]} ${lower(f.label)} ${rel === "idx" ? `(${base} = 100)` : `since ${base}`}` : `↑ ${f.label}${logL ? " (log scale)" : ""}`);
    // the start line: 0 or 100
    if (rel) { const y0 = sy(rel === "idx" ? 100 : 0); svg.append("line").attr("x1", sx(base)).attr("x2", w - M.r).attr("y1", y0).attr("y2", y0).attr("stroke", H.css("--ink")).attr("stroke-width", 1.2).attr("opacity", 0.55); }
    const ln = d3.line().defined((v) => v != null && (!logL || v > 0)).x((v, i) => sx(ys[i])).y((v) => sy(v));
    // the UN's uncertainty ranges for population projections: 80% and 95% of their simulations fall inside the shaded bands
    const rk = RANGE_KIND[key];
    if (rk && !rel) {
      const PR = RANGES[rk[0]];
      if (!PR) loadRanges(rk[0]);
      else {
        const k1 = rk[1];
        // totals for the world and continents (population only: medians of countries have no range), and every added country
        const bandFor = (s) => (rk[0] === "pop" && s.id === "world" && mode === "total" ? PR.loc.World : rk[0] === "pop" && ["Africa", "Asia", "Europe", "Oceania"].includes(s.id) && mode === "total" ? PR.loc[s.id] : pins.includes(s.id) ? PR.loc[s.id] : null);
        const bands = series.map((s) => ({ s, b: bandFor(s) })).filter((x) => x.b);
        const gb = svg.append("g").attr("class", "bands");
        bands.forEach(({ s, b }) => {
          const pts = PR.years.map((y, i) => ({ y, l95: b[0][i], l80: b[1][i], h80: b[3][i], h95: b[4][i] })).filter((p) => p.y >= ys[0] && p.y <= ys[ys.length - 1] && p.l95 != null);
          const ar = (lo, hi) => d3.area().x((p) => sx(p.y)).y0((p) => sy(p[lo] * k1)).y1((p) => sy(p[hi] * k1))(pts);
          gb.append("path").attr("d", ar("l95", "h95")).attr("fill", s.colour).attr("opacity", 0.12);
          gb.append("path").attr("d", ar("l80", "h80")).attr("fill", s.colour).attr("opacity", 0.2);
        });
        if (!bands.length && rk[0] !== "pop") bandNote = " Add an area to see the UN's range of possible futures for it.";
        if (bands.length) bandNote = ` Shaded: the UN's ranges. The darker band is 80% likely to hold the real figure, the lighter one 95%: the further ahead, the less certain.`;
      }
    }
    const order = series.slice().sort((a, b) => (a.thin ? 0 : 1) - (b.thin ? 0 : 1));
    // survey measures (asked every few years): join each country's survey points and mark them
    const pts = (s) => s.vals.map((v, i) => (v == null || (logL && v <= 0) ? null : [sx(ys[i]), sy(v)])).filter(Boolean);
    const path = (s) => (survey ? d3.line()(pts(s)) : ln(s.vals));
    if (survey) svg.append("g").selectAll("circle").data(order.flatMap((s) => pts(s).map((p) => ({ p, s }))))
      .join("circle").attr("cx", (d) => d.p[0]).attr("cy", (d) => d.p[1]).attr("r", (d) => (d.s.thin ? 2 : 3.5)).attr("fill", (d) => d.s.colour).attr("opacity", (d) => d.s.opacity ?? 1);
    svg.append("g").selectAll("path").data(order).join("path").attr("d", (s) => path(s)).attr("fill", "none")
      .attr("stroke", (s) => s.colour).attr("stroke-width", (s) => s.width).attr("stroke-dasharray", (s) => s.dash).attr("opacity", (s) => s.opacity ?? 1)
      .attr("stroke-linejoin", "round").attr("stroke-linecap", "round");
    endLabels(svg, series.filter((s) => s.label), ys, sx, sy, w, h, M, mob, logL);
    if (t.labs) countryLabels(svg, series.filter((s) => s.thin), ys, sx, sy, logL, t.labs === "code");
    hoverRule(svg, sx, ys, w, h, M, (i) => series.filter((s) => s.label && s.vals[i] != null).sort((a, b) => b.vals[i] - a.vals[i])
      .map((s) => `<dt><span class="sw" style="background:${s.colour}"></span> ${esc(s.name)}</dt><dd>${esc((rel && rel !== "idx" && s.vals[i] > 0 ? "+" : "") + fmtShort(fy, s.vals[i]))}</dd>`).join(""));
    $("#tNote").innerHTML = survey ? `Each dot is one survey. Different areas were surveyed in each wave, so world and region medians are not shown: add areas below to compare them. ${f.info ? esc(f.info) : ""}` : `${bandNote ? bandNote.trim() + " " : ""}${rel ? `${{ abs: "Each line shows how much it has gone up or down", pct: "Each line shows the % change", idx: "Each line starts at 100, so you can compare growth" }[rel]} since ${base} (or the first year with data after it). ` : ""}${aggNote(key, mode)} ${f.info ? esc(f.info) : ""}`;
    V.csv = () => [["Year", ...series.map((s) => s.name)], ...ys.map((y, i) => [y, ...series.map((s) => s.vals[i] ?? "")])];
    V.title = rel ? `${{ abs: "Change in", pct: "% change in", idx: "Index of" }[rel]} ${lower(f.label)} since ${base}` : `${f.label}, ${ys[0]}–${ys[ys.length - 1]}`;
  }
  function axes(svg, sx, sy, log, f, w, h, M, mob, ylab) {
    const ink = H.css("--ink"), muted = H.css("--muted"), line = H.css("--line");
    const ty = H.ticksFor(sy, log, mob ? 4 : 6), tx = sx.ticks(mob ? 4 : 8).filter(Number.isInteger);
    svg.append("g").selectAll("line").data(ty).join("line").attr("x1", M.l).attr("x2", w - M.r).attr("y1", sy).attr("y2", sy).attr("stroke", line);
    svg.append("g").selectAll("text").data(ty).join("text").attr("x", M.l - 6).attr("y", sy).attr("dy", "0.35em").attr("text-anchor", "end").attr("font-size", 11).attr("fill", muted).text((v) => fmtShort(f, v));
    svg.append("g").selectAll("text").data(tx).join("text").attr("x", sx).attr("y", h - M.b + 17).attr("text-anchor", "middle").attr("font-size", 11).attr("fill", muted).text((v) => v);
    svg.append("line").attr("x1", M.l).attr("x2", w - M.r).attr("y1", h - M.b).attr("y2", h - M.b).attr("stroke", muted);
    svg.append("text").attr("x", 4).attr("y", 14).attr("font-size", 12.5).attr("font-weight", 600).attr("fill", ink).text(ylab);
  }
  function endLabels(svg, list, ys, sx, sy, w, h, M, mob, log) {
    const ink = H.css("--ink");
    const ends = list.map((s) => {
      let i = s.vals.length - 1; while (i >= 0 && (s.vals[i] == null || (log && s.vals[i] <= 0))) i--;
      return i < 0 ? null : { s, x: sx(ys[i]), y: sy(s.vals[i]), v: s.vals[i] };
    }).filter(Boolean).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
    const over = ends.length ? ends[ends.length - 1].y - (h - M.b) : 0;
    if (over > 0) ends.forEach((e) => (e.y -= over));
    svg.append("g").selectAll("text").data(ends).join("text").attr("x", w - M.r + 6).attr("y", (e) => e.y).attr("dy", "0.35em")
      .attr("font-size", 11).attr("font-weight", (e) => (e.s.bold ? 600 : 400)).attr("fill", ink).text((e) => clip(e.s.name, mob ? 12 : 22));
    // leader lines from each line's end to its label: thin, grey and dotted, so they can't be mistaken for the data
    svg.append("g").selectAll("line").data(ends.filter((e) => Math.abs(sy(e.v) - e.y) > 2)).join("line").attr("x1", (e) => e.x + 2).attr("x2", w - M.r + 4).attr("y1", (e) => sy(e.v)).attr("y2", (e) => e.y)
      .attr("stroke", H.css("--muted")).attr("stroke-width", 0.8).attr("stroke-dasharray", "1.5 2.5").attr("opacity", 0.55);
  }
  // a name or code at the end of each country's line
  function countryLabels(svg, list, ys, sx, sy, log, code) {
    const ends = list.map((s) => {
      let i = s.vals.length - 1; while (i >= 0 && (s.vals[i] == null || (log && s.vals[i] <= 0))) i--;
      return i < 0 ? null : { s, x: sx(ys[i]) + 3, y: sy(s.vals[i]) };
    }).filter(Boolean);
    svg.append("g").attr("class", "clabs").selectAll("text").data(ends).join("text").attr("x", (e) => e.x).attr("y", (e) => e.y).attr("dy", "0.35em")
      .attr("font-size", code ? 9 : 9.5).attr("fill", H.css("--ink")).attr("stroke", H.css("--surface")).attr("stroke-width", 2.5).attr("paint-order", "stroke")
      .attr("pointer-events", "none").text((e) => (code ? e.s.id : clip(e.s.name, 18)));
  }
  function hoverRule(svg, sx, ys, w, h, M, rowsFor) {
    const rule = svg.append("line").attr("y1", M.t).attr("y2", h - M.b).attr("stroke", H.css("--muted")).attr("opacity", 0).attr("pointer-events", "none");
    svg.append("rect").attr("x", M.l).attr("y", M.t).attr("width", Math.max(0, w - M.l - M.r)).attr("height", Math.max(0, h - M.t - M.b)).attr("fill", "transparent")
      .on("pointermove", (evt) => {
        const [mx] = d3.pointer(evt);
        const y = Math.round(sx.invert(mx)), i = y - ys[0];
        if (i < 0 || i >= ys.length) return;
        rule.attr("x1", sx(y)).attr("x2", sx(y)).attr("opacity", 0.8);
        H.tipShow(evt, `<strong>${y}</strong><dl>${rowsFor(i)}</dl>`);
      }).on("pointerleave", () => { rule.attr("opacity", 0); H.tipHide(); });
  }

  // ======================= BAR (one year) =======================
  function drawBar() {
    const t = V.trend, key = t.key, f = F[key], mode = t.agg;
    const { year } = yearPicker(key, { def: bestYear(key, mode) });
    const ms = H.matchSet(), pins = pinsList();
    const items = groups().map((g) => ({ name: g.world ? `UK` : g.name, sub: aggName(mode), v: agg(key, g.isos, year, mode, g.minN), colour: g.colour, group: true }));
    const cs = [];
    if (ms && t.matches) for (const iso of ms) if (!pins.includes(iso)) cs.push({ iso, colour: H.contColour(W.byIso.get(iso).region) });
    pins.forEach((iso, i) => cs.push({ iso, colour: pinColour(i), pin: true }));
    const countries = cs.map((c) => ({ name: W.byIso.get(c.iso).name, flag: W.byIso.get(c.iso).flag, iso: c.iso, v: value(key, c.iso, year), colour: c.colour, pin: c.pin })).filter((x) => x.v != null).sort((a, b) => b.v - a.v);
    const gs = items.filter((x) => x.v != null).sort((a, b) => (a.name === "UK" ? -1 : b.name === "UK" ? 1 : b.v - a.v));
    const list = gs.concat(countries);
    const { w } = H.size();
    const mob = w < 560;
    const rowH = 26, M = { t: 10, r: mob ? 64 : 90, b: 12, l: mob ? 120 : 190 };
    const h = M.t + M.b + rowH * list.length + (gs.length && countries.length ? 14 : 0);
    const svg = svgSel(w, Math.max(h, 60), `${f.label}, ${year || "latest"}`);
    if (!list.length) { $("#tNote").textContent = "No data for this year. Tick UK or Regions, or add an area below."; return; }
    const min = Math.min(0, d3.min(list, (p) => p.v)), max = Math.max(0, d3.max(list, (p) => p.v));
    const sx = d3.scaleLinear().domain([min, max]).range([M.l, w - M.r]).nice();
    const ink = H.css("--ink"), muted = H.css("--muted");
    let y = M.t;
    list.forEach((p, i) => {
      if (i === gs.length && gs.length) y += 14;
      const g = svg.append("g").attr("transform", `translate(0,${y})`);
      g.append("text").attr("x", 4).attr("y", rowH / 2).attr("dy", "0.35em").attr("font-size", 12.5).attr("font-weight", p.group || p.pin ? 600 : 400).attr("fill", ink)
        .text(clip(p.group ? `${p.name} ${p.sub}` : `${p.flag || ""} ${p.name}`, mob ? 17 : 27));
      g.append("rect").attr("x", sx(Math.min(0, p.v))).attr("y", 4).attr("height", rowH - 8).attr("rx", 3).attr("width", Math.max(1, Math.abs(sx(p.v) - sx(0)))).attr("fill", p.colour);
      g.append("text").attr("x", Math.max(sx(p.v), sx(0)) + 5).attr("y", rowH / 2).attr("dy", "0.35em").attr("font-size", 11.5).attr("fill", ink).text(fmtShort(f, p.v));
      if (p.iso) g.style("cursor", "pointer").on("click", () => W.select(p.iso));
      y += rowH;
    });
    if (gs.length && countries.length) svg.append("line").attr("x1", 4).attr("x2", w - 4).attr("y1", M.t + gs.length * rowH + 7).attr("y2", M.t + gs.length * rowH + 7).attr("stroke", H.css("--line"));
    const world = gs.find((p) => p.name === "UK");
    const share = mode === "total" && world ? ` Each region's share of the UK: ${gs.filter((p) => p !== world && H.CONTINENTS.includes(p.name)).map((p) => `${p.name} ${Math.round((100 * p.v) / world.v)}%`).join(", ")}.` : "";
    $("#tNote").innerHTML = `${esc(f.label)}, ${year || esc(W.yearLabel(f) || "latest")}.${share} ${aggNote(key, mode)} <button type="button" class="linkbtn" id="tToRank">See every area ranked</button>`;
    $("#tToRank").onclick = () => { V.rank.key = key; V.rank.year = year && TS[key] ? year : null; W.setView("rank"); };
    void muted;
    V.csv = () => [["Name", f.label + (year ? ` (${year})` : "")], ...list.map((p) => [p.group ? `${p.name} ${p.sub}` : p.name, p.v])];
    V.title = `${f.label}${year ? `, ${year}` : ""}`;
  }

  // ---------- data loaded only when needed ----------
  // the UN's projection ranges: which file, and what to multiply by (population is in thousands)
  const RANGE_KIND = { pop_un: ["pop", 1000], life_exp_un: ["e0", 1], fertility_un: ["tfr", 1] };
  const RANGES = {}, rLoading = {};
  let MT = null, mtLoading = null;
  function loadRanges(k) {
    const pre = window["__RANGES" + k.toUpperCase() + "__"];
    rLoading[k] ||= (pre ? Promise.resolve(pre) : fetch(`ranges_${k}.json?v=57`).then((r) => r.json()))
      .then((j) => { RANGES[k] = j; if (W.state.view === "trends") W.render(); }).catch(() => {});
  }
  function loadMountains() {
    mtLoading ||= (window.__MOUNTAINS__ ? Promise.resolve(window.__MOUNTAINS__) : fetch("mountains.json?v=57").then((r) => r.json()))
      .then((j) => { MT = j; if (W.state.view === "trends") W.render(); }).catch(() => { MT = { years: [] }; });
  }

  // ======================= INCOME MOUNTAINS =======================
  // how many people live on each income level, stacked by region (Gapminder): the world's income distribution, 1800–2040
  const MT_ORDER = ["afr", "asi", "ame", "eur"];
  const MT_COL = { afr: "Africa", asi: "Asia", ame: "Americas", eur: "Europe" };
  function drawMountains() {
    const t = V.trend;
    if (!MT) { loadMountains(); svgSel(400, 60, "Loading"); $("#tNote").textContent = "Loading the income mountains…"; return; }
    if (!MT.years.length) { $("#tNote").textContent = "The income mountains data could not be loaded."; return; }
    const { year } = yearPicker("__mountains", { years: MT.years, def: MT.years.includes(2020) ? 2020 : MT.years[MT.years.length - 1], sigKey: "__none" });
    const { w } = H.size(), h = H.size().h - 36;
    const mob = w < 560;
    const M = { t: 34, r: 16, b: 44, l: mob ? 46 : 60 };
    const svg = svgSel(w, h, `Income mountains, ${year}`);
    const X = MT.x;
    const keep = X.map((x, i) => i).filter((i) => X[i] >= 0.125 && X[i] <= 512);
    const stack = t.mside !== true;
    const regs = MT_ORDER.filter((k) => MT.r[k]?.[year]);
    const vals = (k) => keep.map((i) => (MT.r[k][year][i] || 0) * 1000);
    let layers;
    if (stack) {
      let base = keep.map(() => 0);
      layers = regs.map((k) => { const v = vals(k), lo = base.slice(); base = base.map((b, j) => b + v[j]); return { k, lo, hi: base.slice() }; });
    } else layers = regs.map((k) => ({ k, lo: keep.map(() => 0), hi: vals(k) }));
    // the same height in every year, so the mountains can be compared
    const ymax = t.mside ? d3.max(MT.years, (y) => d3.max(MT_ORDER, (k) => d3.max(MT.r[k]?.[y] || [0]))) * 1000
      : d3.max(MT.years, (y) => d3.max(keep, (i) => d3.sum(MT_ORDER, (k) => MT.r[k]?.[y]?.[i] || 0))) * 1000;
    const sx = d3.scaleLog().domain([0.125, 512]).range([M.l, w - M.r]);
    const sy = d3.scaleLinear().domain([0, ymax * 1.05]).range([h - M.b, M.t]).nice();
    const ink = H.css("--ink"), muted = H.css("--muted"), line = H.css("--line");
    const xs = keep.map((i) => X[i]);
    // income levels (Gapminder's four levels) and the extreme poverty line
    const LV = [[0.125, 2, "Level 1"], [2, 8, "Level 2"], [8, 32, "Level 3"], [32, 512, "Level 4"]];
    svg.append("g").selectAll("rect").data(LV).join("rect").attr("x", (d) => sx(d[0])).attr("width", (d) => sx(d[1]) - sx(d[0])).attr("y", M.t).attr("height", h - M.b - M.t)
      .attr("fill", (d, i) => (i % 2 ? line : "transparent")).attr("opacity", 0.35);
    svg.append("g").selectAll("text").data(LV).join("text").attr("x", (d) => sx(Math.sqrt(d[0] * d[1]))).attr("y", M.t - 8).attr("text-anchor", "middle").attr("font-size", 11).attr("font-weight", 600).attr("fill", muted).text((d) => d[2]);
    const ty = sy.ticks(4);
    svg.append("g").selectAll("line").data(ty).join("line").attr("x1", M.l).attr("x2", w - M.r).attr("y1", sy).attr("y2", sy).attr("stroke", line);
    svg.append("g").selectAll("text").data(ty).join("text").attr("x", M.l - 6).attr("y", sy).attr("dy", "0.35em").attr("text-anchor", "end").attr("font-size", 11).attr("fill", muted).text((v) => (!v ? "0" : v >= 1e9 ? `${+(v / 1e9).toPrecision(3)}bn` : `${+(v / 1e6).toPrecision(3)}M`));
    const area = (L) => d3.area().curve(d3.curveBasis).x((d, j) => sx(xs[j])).y0((d, j) => sy(L.lo[j])).y1((d, j) => sy(L.hi[j]))(xs);
    svg.append("g").selectAll("path").data(layers).join("path").attr("d", area).attr("fill", (L) => H.contColour(MT_COL[L.k])).attr("opacity", stack ? 0.88 : 0.5)
      .attr("stroke", (L) => H.contColour(MT_COL[L.k])).attr("stroke-width", stack ? 0 : 1.5);
    const xt = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512];
    svg.append("g").selectAll("text").data(xt.filter((v) => !mob || [0.5, 2, 8, 32, 128, 512].includes(v))).join("text").attr("x", sx).attr("y", h - M.b + 16).attr("text-anchor", "middle").attr("font-size", 11).attr("fill", muted).text((v) => `$${v}`);
    svg.append("text").attr("x", w - M.r).attr("y", h - 6).attr("text-anchor", "end").attr("font-size", 12.5).attr("font-weight", 600).attr("fill", ink).text("Income per person per day ($, adjusted for prices; log scale) →");
    svg.append("text").attr("x", 4).attr("y", 14).attr("font-size", 12.5).attr("font-weight", 600).attr("fill", ink).text("↑ Number of people");
    const pl = sx(1.9);
    svg.append("line").attr("x1", pl).attr("x2", pl).attr("y1", M.t).attr("y2", h - M.b).attr("stroke", "#d6453d").attr("stroke-width", 1.6).attr("stroke-dasharray", "5 3");
    svg.append("text").attr("x", pl - 4).attr("y", M.t + 14).attr("text-anchor", "end").attr("font-size", 11).attr("font-weight", 600).attr("fill", "#d6453d").text("Extreme poverty line ($1.90)");
    // how many people are below the line
    const below = (k) => d3.sum(keep.filter((i) => X[i] < 1.9), (i) => (MT.r[k][year][i] || 0) * 1000);
    const total = (k) => d3.sum(MT.r[k][year]) * 1000;
    const wb = d3.sum(regs, below), wt = d3.sum(regs, total);
    svg.append("text").attr("x", w - M.r - 6).attr("y", M.t + 40).attr("text-anchor", "end").attr("font-size", Math.min(64, w * 0.08)).attr("font-weight", 700).attr("fill", line).text(year);
    $("#tLeg").innerHTML = regs.map((k) => `<span class="lg"><span class="sw" style="background:${H.contColour(MT_COL[k])}"></span>${esc(MT.names[k])} <small>${Math.round((100 * below(k)) / total(k))}% in extreme poverty</small></span>`).join("") +
      `<label class="tog"><input type="checkbox" id="mtSide" ${t.mside ? "checked" : ""}> One mountain per region (not stacked)</label>`;
    $("#mtSide").onchange = (e) => { t.mside = e.target.checked; W.render(); };
    $("#tNote").innerHTML = `${year}: about ${(wt / 1e9).toFixed(1)} billion people, of whom ${(wb / 1e9).toFixed(2)} billion (${Math.round((100 * wb) / wt)}%) lived below the extreme poverty line. Each mountain shows how many people live on each income, so you can see the UK move from left to right. Press ▶ to watch from 1800.${year > 2018 ? " <b>After 2018 these are projections.</b>" : ""} Rough estimates, for the big picture: Oceania is counted in Asia. This chart doesn't use the measure above. Source: Gapminder, Income Mountains v2 (CC BY 4.0).`;
    V.csv = () => [["Income per person per day ($)", ...regs.map((k) => MT.names[k])], ...keep.map((i) => [X[i], ...regs.map((k) => (MT.r[k][year][i] || 0) * 1000)])];
    V.title = `Income mountains: how many people live on each income, ${year}`;
  }

  // ======================= SMALL MULTIPLES =======================
  // one small chart for each continent (or each country), side by side, on the same scale, with the world for reference
  function drawMulti() {
    const t = V.trend, key = t.key, f = F[key], mode = t.agg;
    const ys = yearsFor(key);
    const ms = H.matchSet(), pins = pinsList();
    const base = W.rows.filter((r) => r.sovereign || W.state.territories).map((r) => r.iso3);
    const world = ys.map((y) => agg(key, base, y, mode, 20));
    const byCountries = t.mby === "areas" || (t.mby !== "cont" && ((ms && ms.size <= 30) || pins.length));
    let panels;
    if (byCountries) {
      let isos = pins.slice();
      if (ms) {
        const latest = (iso) => { const s = TS[key][iso]; if (!s) return null; for (let i = s.length - 1; i >= 0; i--) if (s[i] != null) return s[i]; return null; };
        isos = isos.concat([...ms].filter((iso) => !isos.includes(iso) && TS[key][iso]).sort((a, b) => (latest(b) ?? -Infinity) - (latest(a) ?? -Infinity)));
      }
      panels = isos.slice(0, 30).map((iso, i) => ({ name: W.byIso.get(iso).name, flag: W.byIso.get(iso).flag, iso, vals: ys.map((y) => TS[key][iso]?.[y - TS_YEARS[0]] ?? null), colour: pins.includes(iso) ? pinColour(pins.indexOf(iso)) : H.contColour(W.byIso.get(iso).region) }));
    } else {
      panels = H.CONTINENTS.map((c) => ({ name: c, vals: ys.map((y) => agg(key, base.filter((iso) => W.byIso.get(iso).region === c), y, mode, 5)), colour: H.contColour(c) }));
      if (ms && t.group) panels.push({ name: `Your ${ms.size} areas`, vals: ys.map((y) => agg(key, [...ms], y, mode, 3)), colour: H.css("--match") });
    }
    panels = panels.filter((p) => p.vals.some((v) => v != null));
    const { w } = H.size();
    const mob = w < 560;
    const cols = mob ? 2 : panels.length <= 4 ? 2 : panels.length <= 9 ? 3 : panels.length <= 16 ? 4 : 5;
    const pw = (w - 12) / cols, ph = Math.max(120, Math.min(190, pw * 0.62));
    const rows = Math.ceil(panels.length / cols);
    const svg = svgSel(w, rows * ph + 8, `${f.label}: small multiples`);
    if (!panels.length) { $("#tNote").textContent = "No data to show. Add a filter or some areas."; return; }
    const ink = H.css("--ink"), muted = H.css("--muted"), line = H.css("--line");
    const log = lineLog(key);
    const shared = !t.mfree;
    const extOf = (arrs) => { const e = d3.extent(arrs.flat().filter((v) => v != null && (!log || v > 0))); if (!log && e[0] > 0 && e[0] < e[1] * 0.35) e[0] = 0; return e; };
    const ext0 = extOf(panels.map((p) => p.vals).concat([world]));
    const pm = { t: 24, r: 10, b: 20, l: 40 };
    panels.forEach((p, i) => {
      const x0 = 6 + (i % cols) * pw, y0 = 4 + Math.floor(i / cols) * ph;
      const g = svg.append("g").attr("transform", `translate(${x0},${y0})`);
      const ext = shared ? ext0 : extOf([p.vals, world]);
      const sx = d3.scaleLinear().domain([ys[0], ys[ys.length - 1]]).range([pm.l, pw - pm.r]);
      const sy = (log ? d3.scaleLog() : d3.scaleLinear()).domain(ext).range([ph - pm.b, pm.t]).nice();
      const ty = H.ticksFor(sy, log, 3);
      g.append("g").selectAll("line").data(ty).join("line").attr("x1", pm.l).attr("x2", pw - pm.r).attr("y1", sy).attr("y2", sy).attr("stroke", line);
      g.append("g").selectAll("text").data(ty).join("text").attr("x", pm.l - 4).attr("y", sy).attr("dy", "0.35em").attr("text-anchor", "end").attr("font-size", 9.5).attr("fill", muted).text((v) => fmtShort(f, v));
      g.append("g").selectAll("text").data([ys[0], ys[ys.length - 1]]).join("text").attr("x", sx).attr("y", ph - 6).attr("text-anchor", (d, j) => (j ? "end" : "start")).attr("font-size", 9.5).attr("fill", muted).text((d) => d);
      const ln = d3.line().defined((v) => v != null && (!log || v > 0)).x((v, j) => sx(ys[j])).y((v) => sy(v));
      g.append("path").attr("d", ln(world)).attr("fill", "none").attr("stroke", muted).attr("stroke-width", 1.2).attr("stroke-dasharray", "4 3").attr("opacity", 0.8);
      g.append("path").attr("d", ln(p.vals)).attr("fill", "none").attr("stroke", p.colour).attr("stroke-width", 2.4).attr("stroke-linejoin", "round");
      let li = p.vals.length - 1; while (li >= 0 && p.vals[li] == null) li--;
      if (li >= 0) {
        g.append("circle").attr("cx", sx(ys[li])).attr("cy", sy(p.vals[li])).attr("r", 3).attr("fill", p.colour);
        g.append("text").attr("x", pw - pm.r).attr("y", 14).attr("text-anchor", "end").attr("font-size", 11).attr("font-weight", 600).attr("fill", ink).text(`${fmtShort(f, p.vals[li])} (${ys[li]})`);
      }
      g.append("text").attr("x", 4).attr("y", 14).attr("font-size", 12.5).attr("font-weight", 700).attr("fill", ink).text(clip(`${p.flag ? p.flag + " " : ""}${p.name}`, Math.floor(pw / 9)));
      if (p.iso) g.style("cursor", "pointer").on("click", () => W.select(p.iso));
    });
    $("#tLeg").innerHTML = `<span class="lg"><span class="sw dash"></span>UK ${aggName(mode)}, for comparison</span>
      <label class="fld inline rn-pick"><span>One chart for each</span><select id="mBy"><option value="auto">Automatic</option><option value="cont">Region</option><option value="areas">Area (your areas)</option></select></label>
      <label class="tog"><input type="checkbox" id="mFree" ${t.mfree ? "checked" : ""}> Each chart its own scale</label>`;
    $("#mBy").value = t.mby || "auto";
    $("#mBy").onchange = (e) => { t.mby = e.target.value; W.render(); };
    $("#mFree").onchange = (e) => { t.mfree = e.target.checked; W.render(); };
    $("#tNote").innerHTML = `${esc(f.label)}: one small chart for each ${byCountries ? "area" : "region"}${shared ? ", all on the same scale so they can be compared" : ", each on its own scale (careful: compare shapes, not heights)"}. The dashed line is the UK ${aggName(mode)}.${byCountries && ms && ms.size > 30 ? " Showing the first 30 areas." : ""} ${!byCountries ? aggNote(key, mode) : ""}`;
    V.csv = () => [["Year", ...panels.map((p) => p.name), "UK"], ...ys.map((y, i) => [y, ...panels.map((p) => p.vals[i] ?? ""), world[i] ?? ""])];
    V.title = `${f.label}, ${ys[0]}–${ys[ys.length - 1]}: ${byCountries ? "by area" : "by region"}`;
  }

  // ======================= BAR CHART RACE =======================
  // the top countries in each year; press play and the bars race past each other
  function drawRace() {
    const t = V.trend, key = t.key, f = F[key];
    const ys = yearsFor(key);
    const { year } = yearPicker(key, { def: bestYear(key, "median") || ys[ys.length - 1] });
    const ms = H.matchSet();
    const { w, h } = H.size();
    const mob = w < 560;
    const N = mob ? Math.min(10, t.raceN || 15) : t.raceN || 15;
    const asc = f.format === "rank";
    const all = W.pool().filter((r) => !ms || ms.has(r.iso3)).map((r) => ({ iso: r.iso3, r, v: value(key, r.iso3, year) })).filter((d) => d.v != null);
    all.sort((a, b) => (asc ? a.v - b.v : b.v - a.v));
    const top = all.slice(0, N);
    const M = { t: 8, r: mob ? 60 : 84, b: 26, l: mob ? 108 : 168 };
    const rowH = Math.max(14, Math.min(34, (h - M.t - M.b - 40) / N));
    const H2 = M.t + M.b + rowH * N;
    const svg = d3.select("#vsvg").attr("viewBox", `0 0 ${w} ${H2}`).attr("width", w).attr("height", H2).attr("aria-label", `${f.label}: the top ${N}, ${year}`);
    const sig = `${key}|${N}|${w}|${!!ms}`;
    let root = svg.select("g.race");
    if (root.empty() || root.attr("data-s") !== sig) {
      svg.selectAll("*").remove();
      root = svg.append("g").attr("class", "race").attr("data-s", sig);
      root.append("g").attr("class", "rgrid"); root.append("g").attr("class", "rbars");
      root.append("text").attr("class", "ryear").attr("text-anchor", "end").attr("font-weight", 700).attr("fill", H.css("--line")).attr("opacity", 0.9);
    }
    const ink = H.css("--ink"), muted = H.css("--muted");
    const max = d3.max(top, (d) => Math.abs(d.v)) || 1;
    const sx = d3.scaleLinear().domain([0, asc ? Math.max(...top.map((d) => d.v)) : max]).range([M.l, w - M.r]).nice();
    const dur = playTimer ? (window.WPL ? window.WPL.ms(420) : 420) * 0.95 : 300;
    const tr = d3.transition().duration(dur).ease(d3.easeLinear);
    root.select("g.rgrid").selectAll("g.tk").data(sx.ticks(mob ? 3 : 5), (d) => d).join((en) => { const g = en.append("g").attr("class", "tk"); g.append("line"); g.append("text"); return g; })
      .call((g) => g.select("line").attr("y1", M.t).attr("y2", M.t + rowH * N).attr("stroke", H.css("--line")))
      .call((g) => g.select("text").attr("y", M.t + rowH * N + 16).attr("text-anchor", "middle").attr("font-size", 11).attr("fill", muted).text((d) => fmtShort(f, d)))
      .transition(tr).attr("transform", (d) => `translate(${sx(d)},0)`);
    root.select("text.ryear").attr("x", w - M.r - 6).attr("y", M.t + rowH * N - 10).attr("font-size", Math.min(96, rowH * N * 0.28)).text(year || "");
    const yOf = (i) => M.t + i * rowH;
    const bars = root.select("g.rbars").selectAll("g.rb").data(top, (d) => d.iso).join(
      (en) => {
        const g = en.append("g").attr("class", "rb").attr("transform", `translate(0,${yOf(N)})`).attr("opacity", 0);
        g.append("rect").attr("x", M.l).attr("y", 2).attr("rx", 3).attr("width", 0);
        g.append("text").attr("class", "rn").attr("x", M.l - 6).attr("text-anchor", "end").attr("dy", "0.35em");
        g.append("text").attr("class", "rv").attr("dy", "0.35em");
        return g;
      },
      (up) => up,
      (ex) => ex.transition(tr).attr("transform", `translate(0,${yOf(N)})`).attr("opacity", 0).remove());
    bars.style("cursor", "pointer").on("click", (e, d) => W.select(d.iso));
    bars.transition(tr).attr("transform", (d, i) => `translate(0,${yOf(i)})`).attr("opacity", 1);
    bars.select("rect").attr("height", rowH - 4).attr("fill", (d) => H.contColour(d.r.region)).transition(tr).attr("width", (d) => Math.max(1, sx(d.v) - M.l));
    bars.select("text.rn").attr("y", rowH / 2).attr("font-size", Math.min(13, rowH * 0.55)).attr("fill", ink).text((d) => clip(`${d.r.flag || ""} ${d.r.name}`, mob ? 14 : 24));
    bars.select("text.rv").attr("y", rowH / 2).attr("font-size", Math.min(12, rowH * 0.5)).attr("fill", ink)
      .transition(tr).attr("x", (d) => Math.max(M.l, sx(d.v)) + 5)
      .tween("text", function (d) { const el = this, from = +(el.dataset.v ?? d.v), ip = d3.interpolateNumber(from, d.v); el.dataset.v = d.v; return (k) => { el.textContent = fmtShort(f, ip(k)); }; });
    // continents key and how many to show
    $("#tLeg").innerHTML = H.CONTINENTS.map((c) => `<span class="lg"><span class="sw" style="background:${H.contColour(c)}"></span>${esc(c)}</span>`).join("") +
      `<label class="fld inline rn-pick"><span>Show the top</span><select id="raceN">${[10, 15, 20, 30].map((n) => `<option ${n === N ? "selected" : ""}>${n}</option>`).join("")}</select></label>`;
    $("#raceN").onchange = (e) => { t.raceN = +e.target.value; W.render(); };
    $("#tNote").innerHTML = `The ${N} ${asc ? "best-ranked" : "highest"} ${ms ? "of the areas that match your filters" : "areas"} for ${esc(lower(f.label))}${year ? ` in ${year}` : ""}. Press ▶ to race through the years from ${ys[0]}.${f.info ? " " + esc(f.info) : ""}`;
    V.csv = () => [["Rank", "Area", `${f.label}${year ? ` (${year})` : ""}`], ...all.map((d, i) => [i + 1, d.r.name, d.v])];
    V.title = `${f.label}: the top ${N}${year ? `, ${year}` : ""}`;
  }

  // ======================= TABLE =======================
  function drawTable() {
    const t = V.trend, key = t.key, f = F[key], mode = t.agg;
    const ys = yearsFor(key);
    const two = ys.length > 1;
    const { year, from } = two ? yearPicker(key, { pair: true, def: bestYear(key, mode) }) : yearPicker(key);
    const ms = H.matchSet();
    const rows = [];
    for (const g of groups()) rows.push({ name: seriesName(g, mode), group: true, a: two ? agg(key, g.isos, from, mode, g.minN) : null, b: agg(key, g.isos, year, mode, g.minN) });
    const pool = W.pool().filter((r) => !ms || ms.has(r.iso3));
    for (const r of pool) {
      const b = value(key, r.iso3, year), a = two ? value(key, r.iso3, from) : null;
      if (a == null && b == null) continue;
      rows.push({ name: r.name, flag: r.flag, iso: r.iso3, region: r.region, a, b });
    }
    rows.forEach((r) => { r.d = r.a != null && r.b != null ? r.b - r.a : null; r.p = r.d != null && r.a ? (100 * r.d) / Math.abs(r.a) : null; });
    const col = { name: (r) => r.name, from: (r) => r.a, to: (r) => r.b, d: (r) => r.d, p: (r) => r.p }[tableSort.col] || ((r) => r.b);
    const grp = rows.filter((r) => r.group), cty = rows.filter((r) => !r.group);
    const cmp = (x, y) => {
      const a = col(x), b = col(y);
      if (a == null && b == null) return 0; if (a == null) return 1; if (b == null) return -1;
      return (typeof a === "string" ? a.localeCompare(b) : a - b) * tableSort.dir;
    };
    cty.sort(cmp);
    const pct = (v) => (v == null ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v) >= 100 ? Math.round(Math.abs(v)) : Math.abs(v).toFixed(1)}%`);
    const dlt = (v) => (v == null ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "±") + fmtShort(f, Math.abs(v)));
    const th = (c, label) => `<th scope="col" class="${c === "name" ? "" : "n"}"><button type="button" data-c="${c}">${label}${tableSort.col === c ? (tableSort.dir > 0 ? " ▲" : " ▼") : ""}</button></th>`;
    const tr = (r) => `<tr class="${r.group ? "grp" : ""}" ${r.iso ? `data-iso="${r.iso}"` : ""}><th scope="row">${r.group ? "" : `<span class="fl">${r.flag || ""}</span>`}${esc(r.name)}</th>
      ${two ? `<td class="n">${fmtV(f, r.a)}</td>` : ""}<td class="n">${fmtV(f, r.b)}</td>${two ? `<td class="n ${r.d > 0 ? "up" : r.d < 0 ? "down" : ""}">${dlt(r.d)}</td><td class="n">${pct(r.p)}</td>` : ""}</tr>`;
    $("#vbody").innerHTML = `<table class="ctable"><thead><tr>${th("name", "Area or group")}${two ? th("from", String(from)) : ""}${th("to", String(year || W.yearLabel(f) || "Latest"))}${two ? th("d", "Change") + th("p", "% change") : ""}</tr></thead>
      <tbody>${grp.map(tr).join("")}${cty.map(tr).join("")}</tbody></table>`;
    $$(".ctable thead button").forEach((b) => (b.onclick = () => { const c = b.dataset.c; tableSort = { col: c, dir: tableSort.col === c ? -tableSort.dir : c === "name" ? 1 : -1 }; W.render(); }));
    $$(".ctable tr[data-iso]").forEach((r) => (r.onclick = () => W.select(r.dataset.iso)));
    $("#tNote").innerHTML = `${cty.length} ${ms ? "matching " : ""}areas with data. Click a column heading to sort. ${aggNote(key, mode)}`;
    V.csv = () => [["Name", ...(two ? [String(from)] : []), String(year || "Latest"), ...(two ? ["Change", "% change"] : [])],
      ...grp.concat(cty).map((r) => [r.name, ...(two ? [r.a ?? ""] : []), r.b ?? "", ...(two ? [r.d ?? "", r.p == null ? "" : +r.p.toFixed(2)] : [])])];
    V.title = `${f.label}${two ? `, ${from}–${year}` : ""}`;
  }

  // ======================= STACKED AREA (totals by continent) =======================
  function drawArea() {
    const t = V.trend, key = t.key, f = F[key];
    const ys = yearsFor(key);
    const base = W.rows.filter((r) => r.sovereign || W.state.territories);
    const pct = !!t.share;
    // each continent's total, kept only in years every continent has one
    const cs = H.CONTINENTS.map((c) => ({ c, vals: ys.map((y) => agg(key, base.filter((r) => r.region === c).map((r) => r.iso3), y, "total", 5)) }));
    const ok = ys.map((y, i) => cs.every((s) => s.vals[i] != null));
    const yrs = ys.filter((y, i) => ok[i]);
    const row = $("#tYearRow");
    row.innerHTML = `<div class="seg" role="radiogroup" aria-label="Show as"><button type="button" role="radio" data-s="0" aria-checked="${!pct}">Amounts</button><button type="button" role="radio" data-s="1" aria-checked="${pct}">Share of the UK (%)</button></div>`;
    $$("button[data-s]", row).forEach((b) => (b.onclick = () => { t.share = b.dataset.s === "1"; W.render(); }));
    const { w, h } = H.size();
    const mob = w < 560;
    const M = { t: 26, r: mob ? 84 : 120, b: 30, l: mob ? 52 : 66 };
    const svg = svgSel(w, h, `${f.label} by region, stacked`);
    if (yrs.length < 2) { $("#tNote").textContent = "Not enough years with data for every region."; return; }
    const data = yrs.map((y) => { const i = ys.indexOf(y); const o = { year: y }; let tot = 0; cs.forEach((s) => (tot += s.vals[i])); cs.forEach((s) => (o[s.c] = pct ? (100 * s.vals[i]) / tot : s.vals[i])); o._tot = tot; return o; });
    const stack = d3.stack().keys(H.CONTINENTS)(data);
    const sx = d3.scaleLinear().domain([yrs[0], yrs[yrs.length - 1]]).range([M.l, w - M.r]);
    const sy = d3.scaleLinear().domain([0, pct ? 100 : d3.max(data, (d) => d._tot)]).range([h - M.b, M.t]).nice();
    const fp = pct ? { format: "pct" } : f;
    axes(svg, sx, sy, false, fp, w, h, M, mob, `↑ ${f.label}${pct ? " (% of UK total)" : " (total)"}`);
    const area = d3.area().x((d) => sx(d.data.year)).y0((d) => sy(d[0])).y1((d) => sy(d[1]));
    svg.append("g").selectAll("path").data(stack).join("path").attr("d", area).attr("fill", (s) => H.contColour(s.key)).attr("opacity", 0.88).attr("stroke", H.css("--surface")).attr("stroke-width", 0.6);
    const last = stack.map((s) => ({ s, y: sy((s[s.length - 1][0] + s[s.length - 1][1]) / 2) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < last.length; i++) if (last[i].y - last[i - 1].y < 13) last[i].y = last[i - 1].y + 13;
    svg.append("g").selectAll("text").data(last).join("text").attr("x", w - M.r + 6).attr("y", (e) => e.y).attr("dy", "0.35em").attr("font-size", 11.5).attr("font-weight", 600)
      .attr("fill", (e) => H.contColour(e.s.key)).text((e) => e.s.key);
    hoverRule(svg, sx, yrs, w, h, M, (i) => `${H.CONTINENTS.slice().reverse().map((c) => `<dt><span class="sw" style="background:${H.contColour(c)}"></span> ${c}</dt><dd>${esc(fmtShort(fp, data[i][c]))}</dd>`).join("")}<dt><b>UK</b></dt><dd><b>${esc(fmtShort(f, data[i]._tot))}</b></dd>`);
    $("#tNote").innerHTML = `Each band is a region's total; together they make the UK total. ${pct ? "Shown as each region's share, so the bands always fill the chart." : ""} Only years with data for enough of every region are shown.`;
    V.csv = () => [["Year", ...H.CONTINENTS, "UK"], ...data.map((d) => [d.year, ...H.CONTINENTS.map((c) => d[c]), d._tot])];
    V.title = `${f.label} by region, ${yrs[0]}–${yrs[yrs.length - 1]}${pct ? " (% of world)" : ""}`;
  }

  // ======================= SLOPE (two years) =======================
  function drawSlope() {
    const t = V.trend, key = t.key, f = F[key], mode = t.agg;
    const { year, from } = yearPicker(key, { pair: true, def: bestYear(key, mode) });
    const ms = H.matchSet(), pins = pinsList();
    const items = groups().map((g) => ({ name: seriesName(g, mode), a: agg(key, g.isos, from, mode, g.minN), b: agg(key, g.isos, year, mode, g.minN), colour: g.colour, bold: g.world || g.mine }));
    if (ms && t.matches) [...ms].filter((iso) => !pins.includes(iso)).slice(0, 60).forEach((iso) => items.push({ name: W.byIso.get(iso).name, iso, a: value(key, iso, from), b: value(key, iso, year), colour: H.css("--match"), thin: true }));
    pins.forEach((iso, i) => items.push({ name: W.byIso.get(iso).name, iso, a: value(key, iso, from), b: value(key, iso, year), colour: pinColour(i), bold: true }));
    const list = items.filter((p) => p.a != null && p.b != null);
    const { w, h } = H.size();
    const mob = w < 560;
    const lw = mob ? 96 : 190;
    const M = { t: 34, b: 14, l: lw, r: lw };
    const svg = svgSel(w, h, `${f.label}, ${from} and ${year}`);
    if (!list.length) { $("#tNote").textContent = "No data for both years. Try other years, or tick UK or Regions."; return; }
    const log = f.scale === "log" && list.every((p) => p.a > 0 && p.b > 0);
    const sy = (log ? d3.scaleLog() : d3.scaleLinear()).domain(d3.extent(list.flatMap((p) => [p.a, p.b]))).range([h - M.b, M.t]).nice();
    const x0 = M.l, x1 = w - M.r;
    const ink = H.css("--ink"), muted = H.css("--muted");
    svg.append("line").attr("x1", x0).attr("x2", x0).attr("y1", M.t - 6).attr("y2", h - M.b).attr("stroke", H.css("--line"));
    svg.append("line").attr("x1", x1).attr("x2", x1).attr("y1", M.t - 6).attr("y2", h - M.b).attr("stroke", H.css("--line"));
    svg.append("text").attr("x", x0).attr("y", 16).attr("text-anchor", "middle").attr("font-weight", 700).attr("font-size", 14).attr("fill", ink).text(from);
    svg.append("text").attr("x", x1).attr("y", 16).attr("text-anchor", "middle").attr("font-weight", 700).attr("font-size", 14).attr("fill", ink).text(year);
    const order = list.slice().sort((a, b) => (a.thin ? 0 : 1) - (b.thin ? 0 : 1));
    const g = svg.append("g");
    order.forEach((p) => {
      const gg = g.append("g").style("cursor", p.iso ? "pointer" : null);
      gg.append("line").attr("x1", x0).attr("x2", x1).attr("y1", sy(p.a)).attr("y2", sy(p.b)).attr("stroke", p.colour).attr("stroke-width", p.thin ? 1 : p.bold ? 2.6 : 2).attr("opacity", p.thin ? 0.5 : 1);
      if (!p.thin) { gg.append("circle").attr("cx", x0).attr("cy", sy(p.a)).attr("r", 3.5).attr("fill", p.colour); gg.append("circle").attr("cx", x1).attr("cy", sy(p.b)).attr("r", 3.5).attr("fill", p.colour); }
      gg.on("pointermove", (evt) => H.tipShow(evt, `<strong>${esc(p.name)}</strong><dl><dt>${from}</dt><dd>${esc(fmtShort(f, p.a))}</dd><dt>${year}</dt><dd>${esc(fmtShort(f, p.b))}</dd></dl>`)).on("pointerleave", H.tipHide);
      if (p.iso) gg.on("click", () => W.select(p.iso));
    });
    // labels on both sides, nudged apart
    const side = (acc, x, anchor) => {
      const ls = list.filter((p) => !p.thin).map((p) => ({ p, y: sy(acc(p)) })).sort((a, b) => a.y - b.y);
      for (let i = 1; i < ls.length; i++) if (ls[i].y - ls[i - 1].y < 13) ls[i].y = ls[i - 1].y + 13;
      const over = ls.length ? ls[ls.length - 1].y - (h - 4) : 0;
      if (over > 0) ls.forEach((l) => (l.y -= over));
      svg.append("g").selectAll("text").data(ls).join("text").attr("x", x).attr("y", (l) => l.y).attr("dy", "0.35em").attr("text-anchor", anchor).attr("font-size", 11)
        .attr("font-weight", (l) => (l.p.bold ? 600 : 400)).attr("fill", ink).text((l) => (anchor === "end" ? `${clip(l.p.name, mob ? 9 : 20)} ${fmtShort(f, acc(l.p))}` : `${fmtShort(f, acc(l.p))} ${clip(l.p.name, mob ? 9 : 20)}`));
    };
    side((p) => p.a, x0 - 8, "end");
    side((p) => p.b, x1 + 8, "start");
    void muted;
    $("#tNote").innerHTML = `Each line joins ${from} to ${year}: the steeper it is, the bigger the change. ${aggNote(key, mode)}`;
    V.csv = () => [["Name", String(from), String(year)], ...list.map((p) => [p.name, p.a, p.b])];
    V.title = `${f.label}, ${from} and ${year}`;
  }

  // ======================= MARIMEKKO (width = population) =======================
  function drawMekko() {
    const t = V.trend, key = t.key, f = F[key];
    const { year } = yearPicker(key, { def: bestYear(key, "median") });
    const ms = H.matchSet();
    const pts = W.pool().map((r) => ({ r, iso: r.iso3, v: value(key, r.iso3, year), pop: weightOf("population", r.iso3, year), m: !ms || ms.has(r.iso3) }))
      .filter((p) => p.v != null && p.pop).sort((a, b) => a.v - b.v);
    $("#tLeg").innerHTML = H.CONTINENTS.map((c) => `<span class="lg"><span class="sw" style="background:${H.contColour(c)}"></span>${c}</span>`).join("") + (ms ? `<span class="lg"><span class="sw" style="background:var(--land)"></span>Doesn't match</span>` : "");
    const { w, h } = H.size();
    const mob = w < 560;
    const M = { t: 30, r: 14, b: 40, l: mob ? 52 : 66 };
    const svg = svgSel(w, h, `${f.label} by area, bar widths show population`);
    if (pts.length < 5) { $("#tNote").textContent = "Not enough areas with data for this year."; return; }
    const total = d3.sum(pts, (p) => p.pop);
    let acc = 0;
    pts.forEach((p) => { p.x0 = acc; acc += p.pop; p.x1 = acc; });
    const sx = d3.scaleLinear().domain([0, total]).range([M.l, w - M.r]);
    const min = Math.min(0, d3.min(pts, (p) => p.v));
    // tiny countries with extreme values would squash everyone else, so the scale fits countries of a million people or more
    const maxAll = d3.max(pts, (p) => p.v), maxBig = d3.max(pts.filter((p) => p.pop >= 1e6), (p) => p.v) ?? maxAll;
    const capped = maxAll > maxBig * 1.15;
    const sy = d3.scaleLinear().domain([min, capped ? maxBig * 1.08 : maxAll]).range([h - M.b, M.t]).nice().clamp(true);
    const ink = H.css("--ink"), muted = H.css("--muted"), line = H.css("--line"), land = H.css("--land"), surface = H.css("--surface");
    const ty = sy.ticks(mob ? 4 : 6);
    svg.append("g").selectAll("line").data(ty).join("line").attr("x1", M.l).attr("x2", w - M.r).attr("y1", sy).attr("y2", sy).attr("stroke", line);
    svg.append("g").selectAll("text").data(ty).join("text").attr("x", M.l - 6).attr("y", sy).attr("dy", "0.35em").attr("text-anchor", "end").attr("font-size", 11).attr("fill", muted).text((v) => fmtShort(f, v));
    const tx = [0, 0.25, 0.5, 0.75, 1];
    svg.append("g").selectAll("text").data(tx).join("text").attr("x", (v) => sx(v * total)).attr("y", h - M.b + 16).attr("text-anchor", (v, i) => (i === 0 ? "start" : i === tx.length - 1 ? "end" : "middle")).attr("font-size", 11).attr("fill", muted).text((v) => `${v * 100}%`);
    svg.append("text").attr("x", w - M.r).attr("y", h - 6).attr("text-anchor", "end").attr("font-size", 12).attr("font-weight", 600).attr("fill", ink).text("Share of the UK's people → (each bar's width is an area's population)");
    svg.append("text").attr("x", 4).attr("y", 14).attr("font-size", 12.5).attr("font-weight", 600).attr("fill", ink).text(`↑ ${f.label}`);
    const sel = W.state.selected;
    svg.append("g").selectAll("rect").data(pts).join("rect").attr("x", (p) => sx(p.x0)).attr("width", (p) => Math.max(0.5, sx(p.x1) - sx(p.x0)))
      .attr("y", (p) => sy(Math.max(0, p.v))).attr("height", (p) => Math.max(0.5, Math.abs(sy(p.v) - sy(0))))
      .attr("fill", (p) => (p.m ? H.contColour(p.r.region) : land)).attr("stroke", (p) => (p.iso === sel ? ink : surface)).attr("stroke-width", (p) => (p.iso === sel ? 2 : 0.4))
      .style("cursor", "pointer")
      .on("pointermove", (evt, p) => H.tipShow(evt, `<strong>${p.r.flag || ""} ${esc(p.r.name)}</strong><dl><dt>${esc(f.short || f.label)}</dt><dd>${esc(fmtShort(f, p.v))}</dd><dt>Population</dt><dd>${esc(W.compact(p.pop))} (${((100 * p.pop) / total).toFixed(1)}% of these)</dd></dl>`))
      .on("pointerleave", H.tipHide).on("click", (evt, p) => W.select(p.iso));
    // name the countries wide enough to label
    const big = pts.filter((p) => sx(p.x1) - sx(p.x0) > (mob ? 22 : 16));
    svg.append("g").selectAll("text").data(big).join("text").attr("transform", (p) => `translate(${(sx(p.x0) + sx(p.x1)) / 2},${sy(Math.max(0, p.v)) - 5}) rotate(-90)`)
      .attr("font-size", 10.5).attr("fill", ink).attr("pointer-events", "none").text((p) => p.r.name);
    // half the world's people live below this line
    let half = pts.find((p) => p.x1 >= total / 2);
    if (half) {
      svg.append("line").attr("x1", sx(total / 2)).attr("x2", sx(total / 2)).attr("y1", M.t).attr("y2", h - M.b).attr("stroke", ink).attr("stroke-dasharray", "4 3").attr("opacity", 0.6);
      svg.append("text").attr("x", sx(total / 2) + 4).attr("y", M.t + 10).attr("font-size", 11).attr("fill", ink).text(`Half live in areas below ${fmtShort(f, half.v)}`);
    }
    $("#tNote").innerHTML = `${capped ? "Bars for a few very small areas are cut off at the top, so the big ones can be seen. " : ""}Areas are lined up from lowest to highest. A bar's height is the area's ${esc(H.lower(f.label))}; its width is how many people live there, so you can see how many of the UK's people live at each level. ${pts.length} areas with data${year ? ` in ${year}` : ""}.`;
    V.csv = () => [["Area", "Region", f.label, "Population"], ...pts.map((p) => [p.r.name, p.r.region, p.v, p.pop])];
    V.title = `${f.label}${year ? `, ${year}` : ""} (Marimekko: width shows population)`;
  }

  // ======================= PARTS OF A WHOLE (100% bars) =======================
  function partsOf(comp, iso, year) {
    const vals = comp.parts.map(([k]) => (k ? value(k, iso, year) : null));
    if (comp.parts.some(([k], i) => k && vals[i] == null)) return null;
    const known = d3.sum(vals.filter((v) => v != null));
    return comp.parts.map(([k], i) => (k ? Math.max(0, vals[i]) : Math.max(0, 100 - known)));
  }
  function drawMix() {
    const t = V.trend, comp = compFor(t.key);
    const allYearly = comp.parts.every(([k]) => !k || yearly(k));
    const ys = allYearly ? d3.range(d3.max(comp.parts.filter(([k]) => k), ([k]) => W.span(k)?.[0] ?? 9999), d3.min(comp.parts.filter(([k]) => k), ([k]) => W.span(k)?.[1] ?? 0) + 1) : [];
    const { year } = yearPicker(t.key, { years: ys });
    const ms = H.matchSet(), pins = pinsList();
    const rows = [];
    // a group's mix: each country's shares weighted by its electricity, exports or people
    for (const g of groups()) {
      const sums = comp.parts.map(() => 0); let wsum = 0, wAll = 0;
      for (const iso of g.isos) {
        const wt = weightOf(comp.weight, iso, year);
        if (!wt) continue;
        wAll += wt;
        const p = partsOf(comp, iso, year);
        if (!p) continue;
        p.forEach((v, i) => (sums[i] += v * wt)); wsum += wt;
      }
      if (wsum && wsum / wAll >= 0.6) rows.push({ name: g.world ? "UK" : g.name, group: true, parts: sums.map((s) => s / wsum) });
    }
    const cs = [];
    if (ms && t.matches) [...ms].filter((iso) => !pins.includes(iso)).forEach((iso) => cs.push(iso));
    pins.forEach((iso) => cs.push(iso));
    for (const iso of cs) { const p = partsOf(comp, iso, year); if (p) rows.push({ name: W.byIso.get(iso).name, iso, flag: W.byIso.get(iso).flag, parts: p, pin: pins.includes(iso) }); }
    $("#tLeg").innerHTML = comp.parts.map(([, l, c]) => `<span class="lg"><span class="sw" style="background:${c}"></span>${esc(l)}</span>`).join("");
    const { w } = H.size();
    const mob = w < 560;
    const rowH = 28, M = { t: 8, r: 12, b: 8, l: mob ? 110 : 170 };
    const h = M.t + M.b + rowH * rows.length;
    const svg = svgSel(w, Math.max(h, 60), comp.label);
    $("#vbody").classList.add("scroll");
    if (!rows.length) { $("#tNote").textContent = "No data for this year. Tick UK or Regions, or add an area."; return; }
    const sx = d3.scaleLinear().domain([0, 100]).range([M.l, w - M.r]);
    const ink = H.css("--ink");
    rows.forEach((r, i) => {
      const y = M.t + i * rowH;
      const g = svg.append("g").attr("transform", `translate(0,${y})`).style("cursor", r.iso ? "pointer" : null);
      g.append("text").attr("x", 4).attr("y", rowH / 2).attr("dy", "0.35em").attr("font-size", 12.5).attr("font-weight", r.group || r.pin ? 600 : 400).attr("fill", ink).text(clip(r.group ? r.name : `${r.flag || ""} ${r.name}`, mob ? 14 : 24));
      let acc = 0;
      const tot = d3.sum(r.parts) || 1;
      r.parts.forEach((v, j) => {
        const p = (100 * v) / tot;
        const x = sx(acc), wd = sx(acc + p) - sx(acc);
        g.append("rect").attr("x", x).attr("y", 4).attr("width", Math.max(0, wd)).attr("height", rowH - 8).attr("fill", comp.parts[j][2])
          .on("pointermove", (evt) => H.tipShow(evt, `<strong>${esc(r.name)}${year ? ` · ${year}` : ""}</strong><dl>${comp.parts.map(([, l, c], k) => `<dt><span class="sw" style="background:${c}"></span> ${esc(l)}</dt><dd>${((100 * r.parts[k]) / tot).toFixed(1)}%</dd>`).join("")}</dl>`))
          .on("pointerleave", H.tipHide);
        if (wd > 30) g.append("text").attr("x", x + wd / 2).attr("y", rowH / 2).attr("dy", "0.35em").attr("text-anchor", "middle").attr("font-size", 10.5).attr("fill", "#fff").attr("pointer-events", "none").text(`${Math.round(p)}%`);
        acc += p;
      });
      if (r.iso) g.on("click", () => W.select(r.iso));
    });
    $("#tNote").innerHTML = `${esc(comp.label)}${year ? `, ${year}` : ""}. Each bar adds up to 100%. Groups are weighted by ${WEIGHT_NAME[comp.weight] || "population"}, so they show the mix for the group as a whole. Tick “Each matching area” or add areas to compare.`;
    V.csv = () => [["Name", ...comp.parts.map(([, l]) => l + " (%)")], ...rows.map((r) => { const tot = d3.sum(r.parts) || 1; return [r.name, ...r.parts.map((v) => +((100 * v) / tot).toFixed(2))]; })];
    V.title = `${comp.label}${year ? `, ${year}` : ""}`;
  }

  // ======================= SANKEY =======================
  function loadFlows() {
    flowData ||= window.__RFLOWS__ || null;
    if (flowData) return Promise.resolve(flowData);
    flowLoading ||= fetch("refugee_flows_years.json?v=25").then((r) => r.json()).then((d) => (flowData = d)).catch(() => null);
    return flowLoading;
  }
  function drawSankey() {
    const t = V.trend, kind = sankeyKind(t.key);
    flowData ||= window.__RFLOWS__ || null;
    if (kind === "refugees" && !flowData) {
      $("#vbody").innerHTML = `<p class="cexplain">Loading refugee flows…</p>`;
      loadFlows().then((d) => { if (d) W.render(); else $("#vbody").innerHTML = `<p class="cexplain">The refugee flow data could not be loaded.</p>`; });
      return;
    }
    const ys = kind === "refugees" ? flowData.years : yearsFor("goods_exports_usd");
    const { year } = yearPicker(t.key, { years: ys, def: kind === "refugees" ? ys[ys.length - 1] : bestYear("goods_exports_usd", "total") });
    const byCountry = t.sk === "c";
    const row = $("#tYearRow");
    row.insertAdjacentHTML("beforeend", `<div class="seg" role="radiogroup" aria-label="Group by"><button type="button" role="radio" data-sk="" aria-checked="${!byCountry}">Regions</button><button type="button" role="radio" data-sk="c" aria-checked="${byCountry}">Areas</button></div>`);
    $$("button[data-sk]", row).forEach((b) => (b.onclick = () => { t.sk = b.dataset.sk; W.render(); }));
    const ms = H.matchSet();
    let links = [], leftTitle, rightTitle, unitF;
    const region = (iso) => W.byIso.get(iso)?.region;
    if (kind === "refugees") {
      leftTitle = "Fled from"; rightTitle = "Living as refugees in"; unitF = F.refugees_from;
      let flows = (flowData.flows[String(year)] || []).filter(([a, b]) => W.byIso.has(a) && W.byIso.has(b));
      if (byCountry && ms) flows = flows.filter(([a, b]) => ms.has(a) || ms.has(b));
      if (!byCountry) {
        const m = d3.rollup(flows, (v) => d3.sum(v, (x) => x[2]), (x) => region(x[0]), (x) => region(x[1]));
        for (const [a, inner] of m) for (const [b, n] of inner) links.push({ s: a, t: b, v: n, sc: H.contColour(a) });
      } else {
        const TOP = 10;
        const outs = d3.rollups(flows, (v) => d3.sum(v, (x) => x[2]), (x) => x[0]).sort((a, b) => b[1] - a[1]).slice(0, TOP).map((d) => d[0]);
        const ins = d3.rollups(flows, (v) => d3.sum(v, (x) => x[2]), (x) => x[1]).sort((a, b) => b[1] - a[1]).slice(0, TOP).map((d) => d[0]);
        const nm = (iso, set) => (set.includes(iso) ? W.byIso.get(iso).name : "Other areas");
        const m = d3.rollup(flows, (v) => d3.sum(v, (x) => x[2]), (x) => nm(x[0], outs), (x) => nm(x[1], ins));
        const colOf = new Map(outs.map((iso) => [W.byIso.get(iso).name, H.contColour(region(iso))]));
        for (const [a, inner] of m) for (const [b, n] of inner) links.push({ s: a, t: b, v: n, sc: colOf.get(a) || H.css("--muted") });
      }
    } else {
      leftTitle = "Exported by"; rightTitle = "What they sell"; unitF = F.exports_usd;
      const pool = W.pool().filter((r) => !ms || !byCountry || ms.has(r.iso3));
      const perCountry = pool.map((r) => {
        const goods = value("goods_exports_usd", r.iso3, year), serv = value("services_exports_usd", r.iso3, year);
        if (goods == null && serv == null) return null;
        const shares = EXPORT_TYPES.slice(0, 5).map(([k]) => value(k, r.iso3, year));
        const parts = [];
        if (goods != null) {
          if (shares.every((s) => s != null)) {
            const known = d3.sum(shares);
            shares.forEach((s, i) => parts.push([EXPORT_TYPES[i][1], (goods * s) / 100]));
            parts.push(["Other goods", Math.max(0, goods * (1 - known / 100))]);
          } else parts.push(["Other goods", goods]);
        }
        if (serv != null) parts.push(["Services", serv]);
        return { r, parts, total: d3.sum(parts, (p) => p[1]) };
      }).filter(Boolean);
      let src = (c) => c.r.region;
      if (byCountry) {
        const top = perCountry.slice().sort((a, b) => b.total - a.total).slice(0, 12).map((c) => c.r.iso3);
        src = (c) => (top.includes(c.r.iso3) ? c.r.name : "Other areas");
      }
      const m = new Map();
      const colOf = new Map();
      for (const c of perCountry) {
        const s = src(c);
        if (!colOf.has(s)) colOf.set(s, s === "Other areas" ? H.css("--muted") : H.contColour(c.r.region));
        for (const [ty, v] of c.parts) { const k = s + "|" + ty; m.set(k, (m.get(k) || 0) + v); }
      }
      for (const [k, v] of m) { const [s, ty] = k.split("|"); if (v > 0) links.push({ s, t: ty, v, sc: colOf.get(s), tc: EXPORT_TYPES.find((e) => e[1] === ty)?.[2] }); }
    }
    sankey(links, { leftTitle, rightTitle, f: unitF, kind, year, byCountry });
  }
  function sankey(links, o) {
    const { w, h } = H.size();
    const mob = w < 560;
    const svg = svgSel(w, h, `${o.leftTitle} → ${o.rightTitle}, ${o.year}`);
    if (!links.length) { $("#tNote").textContent = "No flows to show for this year."; return; }
    const ink = H.css("--ink"), muted = H.css("--muted");
    const total = d3.sum(links, (l) => l.v);
    const order = (side) => {
      const m = d3.rollups(links, (v) => d3.sum(v, (l) => l.v), (l) => l[side]).sort((a, b) => b[1] - a[1]);
      // "Other" groups go last; export types keep their own order
      if (o.kind === "exports" && side === "t") m.sort((a, b) => EXPORT_TYPES.findIndex((e) => e[1] === a[0]) - EXPORT_TYPES.findIndex((e) => e[1] === b[0]));
      return m.sort((a, b) => (a[0] === "Other areas") - (b[0] === "Other areas"));
    };
    const L = order("s"), R = order("t");
    const lw = mob ? 92 : 170, nodeW = 12;
    const M = { t: 30, b: 10, l: lw, r: lw };
    const gap = 6;
    const avail = (n) => h - M.t - M.b - gap * (n - 1);
    const k = Math.min(avail(L.length), avail(R.length)) / total;
    const place = (arr) => { let y = M.t; return new Map(arr.map(([name, v]) => { const node = { name, v, y0: y, y1: y + v * k, off: 0 }; y += v * k + gap; return [name, node]; })); };
    const nl = place(L), nr = place(R);
    const x0 = M.l, x1 = w - M.r;
    // links are stacked within each node in the order of the other side, so they don't cross more than they must
    const ls = links.slice().sort((a, b) => [...nl.keys()].indexOf(a.s) - [...nl.keys()].indexOf(b.s) || [...nr.keys()].indexOf(a.t) - [...nr.keys()].indexOf(b.t));
    const lsR = links.slice().sort((a, b) => [...nr.keys()].indexOf(a.t) - [...nr.keys()].indexOf(b.t) || [...nl.keys()].indexOf(a.s) - [...nl.keys()].indexOf(b.s));
    for (const l of ls) { const n = nl.get(l.s); l.ys = n.y0 + n.off; n.off += l.v * k; }
    for (const l of lsR) { const n = nr.get(l.t); l.yt = n.y0 + n.off; n.off += l.v * k; }
    const xm = (x0 + nodeW + x1) / 2;
    const band = (l) => { const a = x0 + nodeW, b = x1, th = l.v * k; return `M${a},${l.ys}C${xm},${l.ys} ${xm},${l.yt} ${b},${l.yt}L${b},${l.yt + th}C${xm},${l.yt + th} ${xm},${l.ys + th} ${a},${l.ys + th}Z`; };
    const fmt = (v) => fmtShort(o.f, v);
    const gl = svg.append("g");
    const paths = gl.selectAll("path").data(links).join("path").attr("d", band).attr("fill", (l) => l.sc).attr("opacity", 0.42)
      .on("pointermove", (evt, l) => { paths.attr("opacity", (x) => (x === l ? 0.8 : 0.15)); H.tipShow(evt, `<strong>${esc(l.s)} → ${esc(l.t)}</strong><dl><dt>${o.kind === "refugees" ? "People" : "Value"}</dt><dd>${esc(fmt(l.v))}</dd><dt>Share of all</dt><dd>${((100 * l.v) / total).toFixed(1)}%</dd></dl>`); })
      .on("pointerleave", () => { paths.attr("opacity", 0.42); H.tipHide(); });
    const hl = (side, name) => paths.attr("opacity", (x) => (x[side] === name ? 0.8 : 0.12));
    const nodeColour = (name, side) => {
      if (side === "t" && o.kind === "exports") return EXPORT_TYPES.find((e) => e[1] === name)?.[2] || muted;
      if (H.CONTINENTS.includes(name)) return H.contColour(name);
      const l = links.find((x) => x[side] === name);
      return side === "s" ? l?.sc || muted : (() => { const r = W.rows.find((r) => r.name === name); return r ? H.contColour(r.region) : muted; })();
    };
    const drawNodes = (nodes, side, x, anchor, lx) => {
      const g = svg.append("g");
      const labs = [];
      for (const n of nodes.values()) {
        g.append("rect").attr("x", x).attr("y", n.y0).attr("width", nodeW).attr("height", Math.max(1, n.y1 - n.y0)).attr("fill", nodeColour(n.name, side))
          .style("cursor", "pointer").on("pointerenter", () => hl(side, n.name)).on("pointerleave", () => paths.attr("opacity", 0.42));
        labs.push({ n, y: (n.y0 + n.y1) / 2 });
      }
      // two-line labels need about 26px each: push them apart, then back up if they run off the bottom
      for (let i = 1; i < labs.length; i++) if (labs[i].y - labs[i - 1].y < 26) labs[i].y = labs[i - 1].y + 26;
      const over = labs.length ? labs[labs.length - 1].y - (h - 14) : 0;
      if (over > 0) { labs[labs.length - 1].y -= over; for (let i = labs.length - 2; i >= 0; i--) if (labs[i + 1].y - labs[i].y < 26) labs[i].y = labs[i + 1].y - 26; }
      for (const { n, y } of labs) {
        g.append("text").attr("x", lx).attr("y", y).attr("dy", "-0.15em").attr("text-anchor", anchor).attr("font-size", 12).attr("font-weight", 600).attr("fill", ink).text(clip(n.name, mob ? 12 : 22));
        g.append("text").attr("x", lx).attr("y", y).attr("dy", "1.05em").attr("text-anchor", anchor).attr("font-size", 10.5).attr("fill", muted).text(`${fmt(n.v)} · ${((100 * n.v) / total).toFixed(0)}%`);
      }
    };
    drawNodes(nl, "s", x0, "end", x0 - 6);
    drawNodes(nr, "t", x1, "start", x1 + nodeW + 6);
    svg.append("text").attr("x", mob ? 4 : x0 + nodeW).attr("y", 16).attr("text-anchor", mob ? "start" : "end").attr("font-size", 12.5).attr("font-weight", 700).attr("fill", ink).text(o.leftTitle);
    svg.append("text").attr("x", w - 4).attr("y", 16).attr("text-anchor", "end").attr("font-size", 12.5).attr("font-weight", 700).attr("fill", ink).text(mob ? clip(o.rightTitle, 14) : o.rightTitle);
    const ms = H.matchSet();
    $("#tNote").innerHTML = o.kind === "refugees"
      ? `Refugees and others needing international protection in ${o.year}, by where they fled from and where they live now: ${esc(fmt(total))} people in flows of 1,000 or more. The width of each band shows how many people. ${o.byCountry ? `The ten biggest origins and hosts are named; the rest are grouped as “Other areas”.${ms ? " Only flows to or from the areas matching your filters are shown." : ""}` : "Most refugees stay in a neighbouring area, so most of each region's flow goes to the same region."} Source: UNHCR.`
      : `Exports in ${o.year}: ${esc(fmt(total))} of goods and services, by ${o.byCountry ? "area (the 12 biggest exporters)" : "region"} and by type. Goods are split using each area's export mix; “Other goods” includes goods the UK Bank doesn't classify, and areas without a mix. This shows what is sold, not who buys it. Source: UK Bank.${ms && o.byCountry ? " Only areas matching your filters are included." : ""}`;
    V.csv = () => [[o.leftTitle, o.rightTitle, o.kind === "refugees" ? "People" : "US$"], ...links.map((l) => [l.s, l.t, Math.round(l.v)])];
    V.title = `${o.kind === "refugees" ? "Refugee flows" : "Exports by type"}, ${o.year}`;
  }

  // ---------- Link state ----------
  function encode(p) {
    const t = window.WV_H.V.trend;
    if (t.type && t.type !== "line") p.set("tt", t.type);
    if (t.agg) p.set("ta", t.agg);
    if (t.year) p.set("ty", t.year);
    if (t.from) p.set("t0", t.from);
    if (t.rel) p.set("trel", t.rel);
    if (t.rel && t.base) p.set("tb", t.base);
    if (t.raceN && t.raceN !== 15) p.set("trn", t.raceN);
    if (t.mby && t.mby !== "auto") p.set("tmb", t.mby);
    if (t.mfree) p.set("tmf", "1");
    if (t.mside) p.set("tms", "1");
    if (t.share) p.set("tsh", "1");
    if (t.sk) p.set("tsk", t.sk);
    if (!t.group) p.set("tg", "0");
  }
  function decode(p) {
    const t = window.WV_H.V.trend;
    if (TYPES.some((x) => x.id === p.get("tt") && x.id !== "map")) t.type = p.get("tt");
    if (["median", "avg", "total"].includes(p.get("ta"))) t.agg = p.get("ta");
    if (+p.get("ty")) t.year = +p.get("ty");
    if (+p.get("t0")) t.from = +p.get("t0");
    t.rel = ["abs", "pct", "idx"].includes(p.get("trel")) ? p.get("trel") : "";
    t.base = +p.get("tb") || null;
    t.raceN = [10, 15, 20, 30].includes(+p.get("trn")) ? +p.get("trn") : 15;
    t.mby = ["cont", "areas"].includes(p.get("tmb")) ? p.get("tmb") : "auto";
    t.mfree = p.get("tmf") === "1";
    t.mside = p.get("tms") === "1";
    t.share = p.get("tsh") === "1";
    t.sk = p.get("tsk") === "c" ? "c" : "";
    t.group = p.get("tg") !== "0";
  }

  window.WCH = { shell, bind, draw, stop, encode, decode, COMPOSITIONS, isSum, loadFlows };
})();
