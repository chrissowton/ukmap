/* Which Countries? — chart views and tools that sit alongside the map:
 *   Compare   a Gapminder-style bubble chart of any two measures, animated through the years
 *   Rankings  every country in order, as bars or grouped by continent
 *   Charts    one measure drawn many ways (charts.js): line, bar, table, stacked area, slope, Marimekko, parts of a whole, Sankey
 * plus trend charts and population pyramids in country profiles, a side-by-side country
 * comparison, share links with a task for students, and image / CSV downloads.
 * Loaded before app.js; everything here waits for window.WC (set up by app.js). */
(function () {
  "use strict";
  let W, F, TS, TS_YEARS, esc, fmtShort;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const CONTINENTS = window.REGIONS;   // the 12 UK regions take the place of continents
  const CONT_VAR = { Africa: "--c-africa", Americas: "--c-americas", Asia: "--c-asia", Europe: "--c-europe", Oceania: "--c-oceania" };
  const INCOME = ["Low income", "Lower-middle income", "Upper-middle income", "High income"];
  const PIN_VARS = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6"];
  // Compare: things that make sense as bubble sizes (totals, not rates), and groupings that make sense as colours
  const SIZE_KEYS = ["population", "gdp_usd", "area_km2", "co2_mt", "military_spend_usd", "armed_forces", "tourists", "refugees_hosted", "refugees_from"];
  const COLOUR_KEYS = [["region", "Region"], ["income_group", "Income group"], ["hdi_group", "Human development"], ["regime", "Type of government"],
    ["largest_religion", "Largest religion"], ["main_climate", "Main climate"], ["match", "Matches your filters"]];
  const ORDERED_COLOURS = { income_group: INCOME, regime: ["Closed autocracy", "Electoral autocracy", "Electoral democracy", "Liberal democracy"] };
  const CAT_PAL = ["#2a78d6", "#e34948", "#1baf7a", "#eda100", "#8a5cd6", "#e86fb0", "#6d7a86", "#9c6b3a", "#0aa5c2"];
  // Words for the corners of the Compare chart: [low, high]
  const ADJ = {
    gdp_per_capita: ["poor", "rich"], gni_ppp: ["poor", "rich"], gdp_usd: ["small economy", "big economy"], hdi: ["less developed", "more developed"],
    life_expectancy: ["shorter lives", "longer lives"], happiness_score: ["unhappy", "happy"], att_happy: ["unhappy", "happy"], att_life_satisfaction: ["dissatisfied", "satisfied"],
    fertility: ["few children", "many children"], birth_rate: ["few births", "many births"], median_age: ["young", "old"], pop_growth: ["shrinking", "growing"],
    urban_pct: ["rural", "urban"], co2_per_capita: ["low CO₂", "high CO₂"], internet: ["offline", "online"], literacy: ["less literate", "more literate"],
    infant_mortality: ["few baby deaths", "many baby deaths"], under5_mortality: ["few child deaths", "many child deaths"], gini: ["more equal", "less equal"],
    extreme_poverty: ["little poverty", "much poverty"], libdem: ["less democratic", "more democratic"], att_trust: ["low trust", "high trust"],
    att_religion_important: ["secular", "religious"], women_parliament: ["few women MPs", "many women MPs"], density: ["empty", "crowded"],
    population: ["small population", "big population"], area_km2: ["small", "large"], mean_schooling: ["less schooling", "more schooling"],
    renewables_elec_pct: ["fossil power", "clean power"], forest_pct: ["few trees", "forested"], health_spend: ["low health spending", "high health spending"],
    military_spend_pct: ["low military spending", "high military spending"], tourists: ["few tourists", "many tourists"], migrants_pct: ["few migrants", "many migrants"],
    homicides: ["safe", "violent"], wgm_trust_science: ["low trust in science", "high trust in science"], wrp_resilience: ["less resilient", "more resilient"],
  };
  const adj = (key) => ADJ[key] || (key.startsWith("__") ? [`low on ${lower(F[key].label)}`, `high on ${lower(F[key].label)}`] : [`low ${lower(F[key].short || F[key].label)}`, `high ${lower(F[key].short || F[key].label)}`]);
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const contColour = (reg) => (window.REGION_COLOURS || {})[reg] || css(CONT_VAR[reg] || "--muted");
  const lower = (s) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

  // ---------- State for each view (saved in the link) ----------
  const V = {
    cmp: { x: "density", y: "median_age", size: "population", colour: "region", logx: null, logy: null, year: null, pins: [], fit: true, only: true, labs: "", focus: null },
    rank: { key: "", mode: "bars", year: null, only: false },
    trend: { key: "population", pins: [], conts: true, world: true, matches: false, group: true, log: null, type: "line", agg: null, year: null, from: null, share: false, sk: "" },
    task: "",
    built: null,
  };
  let playTimer = null;

  // ---------- Small helpers ----------
  function val(r, key, year) {
    if (!key) return null;
    if (year != null && TS[key]) return W.tsValue(key, r.iso3, year);
    const v = W.latest(r, key);
    return typeof v === "number" ? v : null;
  }
  const isLog = (key, flag) => (flag == null ? F[key]?.scale === "log" : flag);
  // matching countries, or null when no country filters are set
  function matchSet() {
    const ev = W.lastEval;
    if (!ev || !ev.act.length) return null;
    return new Set([...ev.res].filter(([, e]) => e.match).map(([iso]) => iso));
  }
  function medianSeries(key, region) {
    const cacheKey = key + "|" + (region || "") + "|" + W.state.territories;
    medianSeries.cache ||= new Map();
    if (medianSeries.cache.has(cacheKey)) return medianSeries.cache.get(cacheKey);
    const list = W.rows.filter((r) => r.sovereign && (!region || r.region === region) && TS[key]?.[r.iso3]);
    const minN = region ? 5 : 20;
    const out = TS_YEARS.map((y) => {
      const vs = list.map((r) => W.tsValue(key, r.iso3, y)).filter((v) => v != null);
      return vs.length >= minN ? d3.median(vs) : null;
    });
    medianSeries.cache.set(cacheKey, out);
    return out;
  }
  // years in which at least 20 countries have every one of these yearly measures
  function commonYears(keys) {
    const ck = keys.join("|");
    commonYears.cache ||= new Map();
    if (commonYears.cache.has(ck)) return commonYears.cache.get(ck);
    // count only values actually reported in that year, so the range doesn't run past the latest data
    const counts = TS_YEARS.map((y, i) => W.rows.filter((r) => r.sovereign && keys.every((k) => TS[k]?.[r.iso3]?.[i] != null)).length);
    const good = TS_YEARS.filter((y, i) => counts[i] >= 20);
    let res = null;
    if (good.length) {
      const max = d3.max(counts);
      const best = TS_YEARS.filter((y, i) => counts[i] >= 0.85 * max);
      res = { from: good[0], to: good[good.length - 1], best: best[best.length - 1] };
    }
    commonYears.cache.set(ck, res);
    return res;
  }
  // value range across every year, so the axes stay still while the years play
  function allYearsExtent(key, positive) {
    const vs = [];
    for (const r of W.rows) {
      const s = TS[key]?.[r.iso3];
      if (s && (r.sovereign || W.state.territories)) for (const v of s) if (v != null && (!positive || v > 0)) vs.push(v);
    }
    return d3.extent(vs);
  }
  function ticksFor(scale, log, n) {
    if (!log) return scale.ticks(n);
    const mant = (v) => v / Math.pow(10, Math.floor(Math.log10(v) + 1e-9));
    const all = scale.ticks();
    for (const keep of [[1, 2, 5], [1, 3], [1]]) {
      const t = all.filter((v) => keep.some((x) => Math.abs(mant(v) - x) < 1e-6));
      if (t.length <= n + 1 || keep.length === 1) return t.length >= 2 ? t : all.slice(0, n);
    }
    return all;
  }
  const yearsOpts = (from, to, sel, latestLabel) => (latestLabel ? `<option value="">${latestLabel}</option>` : "") +
    d3.range(to, from - 1, -1).map((y) => `<option value="${y}" ${y === sel ? "selected" : ""}>${y}</option>`).join("");
  const countryOptions = () => W.rows.filter((r) => r.sovereign || W.state.territories).sort((a, b) => a.name.localeCompare(b.name)).map((r) => `<option value="${esc(r.name)}"></option>`).join("");
  const findCountry = (name) => { const q = name.trim().toLowerCase(); return W.rows.find((r) => r.name.toLowerCase() === q) || W.rows.find((r) => r.name.toLowerCase().startsWith(q)); };

  // ---------- Tooltip inside the chart area ----------
  function tipShow(evt, html) {
    const tip = $("#vtip");
    if (!tip) return;
    tip.innerHTML = html;
    tip.hidden = false;
    const box = $("#viewwrap").getBoundingClientRect();
    let x = evt.clientX - box.left + 14, y = evt.clientY - box.top + 14;
    if (x + tip.offsetWidth > box.width - 6) x = evt.clientX - box.left - tip.offsetWidth - 14;
    if (y + tip.offsetHeight > box.height - 6) y = evt.clientY - box.top - tip.offsetHeight - 14;
    tip.style.left = Math.max(4, x) + "px";
    tip.style.top = Math.max(4, y) + "px";
  }
  const tipHide = () => { const t = $("#vtip"); if (t) t.hidden = true; };

  // ---------- Shell for each view ----------
  function build(view) {
    stopPlay();
    const wrap = $("#viewwrap");
    V.built = view;
    const shells = {
      compare: `<div class="vhead"><div class="vctrls cmpctrls">
          <label class="fld"><span>↑ Up</span><select id="cY" data-pick></select></label>
          <label class="fld"><span>→ Across</span><select id="cX" data-pick></select></label>
          <label class="fld"><span>Bubble size</span><select id="cZ" data-pick></select></label>
          <label class="fld"><span>Colour</span><select id="cC" data-pick></select></label>
          <span class="vtools">
            <details class="vopts-menu"><summary>⚙ Options</summary><div class="vopts-pop">
              <label class="fld vopt-sel"><span>Area labels</span><select id="cLab"><option value="">A few (the biggest)</option><option value="name">Every area: names</option><option value="code">Every area: short codes (e.g. GBR)</option></select></label>
              <label class="tog" id="cOnlyL"><input type="checkbox" id="cOnly"> Only areas that match the filters</label>
              <label class="tog"><input type="checkbox" id="cFit"> Trend line</label>
              <label class="tog"><input type="checkbox" id="cQuad"> Corner labels</label>
              <label class="tog"><input type="checkbox" id="cLogX"> Log scale across</label>
              <label class="tog"><input type="checkbox" id="cLogY"> Log scale up</label>
            </div></details>
            <button type="button" class="ghost vab" title="Where the data comes from, what it means, and how to cite it">ⓘ About this data</button>
            <button type="button" class="ghost vdl" title="Download this chart as a picture, or its data as a spreadsheet">⬇ Download</button>
            <button type="button" class="ghost vfs" data-fs="#viewwrap" title="Full screen (Esc to leave)" aria-label="Full screen">⛶</button>
          </span>
        </div></div>
        <div class="vbody" id="vbody"><svg id="vsvg" role="img"></svg>
          <div class="czoom" role="group" aria-label="Zoom the chart"><button type="button" id="cZin" aria-label="Zoom in">+</button><button type="button" id="cZout" aria-label="Zoom out">−</button><button type="button" id="cZreset" aria-label="Show the whole chart" title="Show the whole chart">⟲</button></div></div>
        <div class="vfoot">
          <div class="vyear" id="cYearRow"><button type="button" class="play" id="cPlay" aria-label="Play through the years">▶</button>${window.WPL ? window.WPL.speedHTML("cSpeed") : ""}<span class="yslide"><input type="range" id="cYear" step="1" aria-label="Year"></span><span class="num vy" id="cYearLab"></span><span class="ysig" id="cSig" hidden></span></div>
          <div class="vrow2"><div class="vlegend" id="cLeg"></div>
            <span class="vfind"><input id="cFind" list="vCountries" placeholder="Follow an area…" aria-label="Follow an area"><datalist id="vCountries"></datalist></span>
            <span class="pins" id="cPins"></span></div>
          <p class="vnote clamp" id="cNote" title="Click to read more"></p>
        </div>`,
      rank: `<div class="vhead"><div class="vctrls">
          <label class="fld"><span>Measure</span><select id="rK" data-pick></select></label>
          <label class="fld"><span>Year</span><select id="rYear"></select></label>
          <div class="seg" role="radiogroup" aria-label="Show as"><button type="button" role="radio" data-m="bars">Ranked bars</button><button type="button" role="radio" data-m="cont">By region</button></div>
          <label class="tog" id="rOnlyL"><input type="checkbox" id="rOnly"> <span id="rOnlyT">Only areas that match the filters</span></label>
        </div></div>
        <div class="vlegend vlegend-top" id="rLeg"></div>
        <div class="vbody scroll" id="vbody"><svg id="vsvg" role="img"></svg></div>
        <p class="vnote" id="rNote"></p>`,
      trends: window.WCH ? window.WCH.shell() : "",
      insights: window.WIN ? window.WIN.shell() : "",
    };
    wrap.innerHTML = (shells[view] || "") + `<div id="vtip" class="tooltip" hidden></div>`;
    if ($("#vCountries")) $("#vCountries").innerHTML = countryOptions();
    // every chart has Download and Full screen buttons at the top right (like Our World in Data)
    const head = wrap.querySelector(".vhead");
    if (head && !head.querySelector(".vdl")) {
      head.classList.add("has-tools");
      head.insertAdjacentHTML("beforeend", `<span class="vtools vtools-auto"><button type="button" class="ghost vab" title="Where the data comes from, what it means, and how to cite it">ⓘ About this data</button><button type="button" class="ghost vdl" title="Download this chart as a picture, or its data as a spreadsheet">⬇ Download</button><button type="button" class="ghost vfs" data-fs="#viewwrap" title="Full screen (Esc to leave)" aria-label="Full screen">${wrap.classList.contains("is-fs") ? "🗗" : "⛶"}</button></span>`);
    }
    wrap.querySelectorAll(".vdl").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); openDownloadMenu(b); }));
    wrap.querySelectorAll(".vab").forEach((b) => (b.onclick = () => window.WAB?.open()));
    if (view === "compare") bindCompare();
    if (view === "rank") bindRank();
    if (view === "trends") window.WCH?.bind();
    if (view === "insights") window.WIN?.bind();
  }
  // The number filters in use, newest last. When they change, the charts switch to them,
  // so a filter added on the map is what Compare, Rankings and Charts show.
  const filterNums = () => W.state.filters.filter((fl) => F[fl.key]?.type === "range" && !F[fl.key].target && !F[fl.key].hidden).map((fl) => fl.key);
  function followFilters() {
    const nums = filterNums(), sig = nums.join("|");
    if (V.fsig === undefined) { V.fsig = sig; return; }
    if (sig === V.fsig) return;
    const added = nums.filter((k) => !(V.fsig || "").split("|").includes(k));
    V.fsig = sig;
    if (!nums.length) return;
    const last = added.length ? added[added.length - 1] : nums[nums.length - 1];
    V.rank.key = last; V.rank.year = null; V.rank.only = W.state.filters.length > 0;
    V.trend.key = last; V.trend.agg = null; V.trend.year = null; V.trend.from = null; V.trend.log = null;
    // Compare: with two or more number filters, the first goes across and the second up; with one, it goes up
    if (nums.length >= 2) { V.cmp.x = nums[0]; V.cmp.y = nums[1]; V.cmp.logx = null; V.cmp.logy = null; V.cmp.year = null; }
    else {
      V.cmp.y = last; V.cmp.logy = null; V.cmp.year = null;
      if (V.cmp.x === last) V.cmp.x = last === "density" ? "median_age" : "density";
    }
  }
  // "Source: …" for the measures a chart shows, on screen and in downloads
  function sourceText(keys, extra = []) {
    const S = window.SOURCES || {};
    const seen = new Map();
    for (const k of keys) {
      const f = F[k];
      if (!f || !S[f.source]) continue;
      const yl = W.yearLabel(f);
      const s = seen.get(f.source) || { name: S[f.source].name, years: new Set() };
      if (yl) s.years.add(yl);
      seen.set(f.source, s);
    }
    for (const id of extra) if (S[id] && !seen.has(id)) seen.set(id, { name: S[id].name, years: new Set() });
    if (!seen.size) return "";
    return "Source: " + [...seen.values()].map((s) => s.name + (s.years.size ? ` (${[...s.years].slice(0, 2).join(", ")})` : "")).join("; ") + ".";
  }
  function srcKeys() {
    const view = W.state.view;
    if (view === "compare") return { keys: [V.cmp.y, V.cmp.x, V.cmp.size].filter(Boolean) };
    if (view === "rank") return { keys: [V.rank.key] };
    if (view === "trends" && V.trend.type === "mountains") return { keys: [], extra: ["gapmincm"] };
    if (view === "trends") {
      const t = V.trend, extra = [];
      const k = [t.key];
      if (t.type === "sankey" && /^refugee|asylum|idps/.test(t.key)) extra.push("unhcr");
      if (t.type === "sankey" && !/^refugee|asylum|idps/.test(t.key)) k.push("goods_exports_usd", "services_exports_usd", "exp_fuel_pct");
      if (t.agg === "avg" || t.type === "mekko") k.push("population");
      if (["pop_un", "life_exp_un", "fertility_un"].includes(t.key) && t.type === "line") extra.push("unppp");
      return { keys: k, extra };
    }
    if (view === "insights") return { keys: V.ins?.srcKeys || [] };
    return { keys: [...new Set(W.state.filters.map((fl) => fl.key).concat(W.state.colourBy && W.state.colourBy !== "none" ? [W.state.colourBy] : []))] };
  }
  function currentSource() { const s = srcKeys(); return sourceText(s.keys, s.extra); }
  function showSource() {
    const wrap = $("#viewwrap");
    let p = $("#vsrc");
    if (!p) { p = document.createElement("p"); p.id = "vsrc"; p.className = "vsrc"; wrap.appendChild(p); }
    p.textContent = currentSource();
  }

  function render() {
    if (!W) return;
    followFilters();
    const view = W.state.view;
    if (view === "map") { stopPlay(); V.built = null; V.list = null; return; }
    if (V.built !== view) build(view);
    if (view === "compare") drawCompare();
    if (view === "rank") drawRank();
    if (view === "trends") window.WCH?.draw();
    if (view === "insights") window.WIN?.draw();
    showSource();
  }
  function size() {
    const b = $("#vbody");
    const r = b.getBoundingClientRect();
    return { w: Math.max(300, Math.floor(r.width)), h: Math.max(260, Math.floor(r.height)) };
  }

  // ======================= COMPARE (bubble chart) =======================
  function bindCompare() {
    const c = V.cmp;
    $("#cX").innerHTML = W.measureOptions(c.x);
    $("#cY").innerHTML = W.measureOptions(c.y);
    $("#cZ").innerHTML = `<option value="">All the same size</option>` + SIZE_KEYS.filter((k) => F[k]).map((k) => `<option value="${k}" ${c.size === k ? "selected" : ""}>${esc(F[k].label)}</option>`).join("");
    $("#cZ").value = c.size;
    $("#cC").innerHTML = COLOUR_KEYS.filter(([k]) => k === "region" || k === "match" || F[k]).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("");
    $("#cC").value = c.colour;
    const upd = () => { c.year = null; resetZoom(true); W.render(); };
    $("#cX").onchange = (e) => { c.x = e.target.value; c.logx = null; upd(); };
    $("#cY").onchange = (e) => { c.y = e.target.value; c.logy = null; upd(); };
    $("#cQuad").onchange = (e) => { c.quads = e.target.checked; W.render(); };
    // zoom: scroll or pinch on the chart, drag to move around; the buttons do the same
    const svgEl = d3.select("#vsvg");
    zoomer = d3.zoom().scaleExtent([1, 30])
      .filter((e) => (e.type === "wheel" ? true : e.type === "touchstart" ? e.touches.length > 1 : !e.button))
      .on("zoom", (e) => { const t = e.transform; c.zt = t.k === 1 && !t.x && !t.y ? null : t; drawCompare(0); });
    svgEl.call(zoomer).on("dblclick.zoom", null);
    $("#cZin").onclick = () => svgEl.transition().duration(250).call(zoomer.scaleBy, 1.6);
    $("#cZout").onclick = () => svgEl.transition().duration(250).call(zoomer.scaleBy, 1 / 1.6);
    $("#cZreset").onclick = () => resetZoom();
    $("#cZ").onchange = (e) => { c.size = e.target.value; upd(); };
    $("#cC").onchange = (e) => { c.colour = e.target.value; c.focus = null; W.render(); };
    $("#cLogX").onchange = (e) => { c.logx = e.target.checked; W.render(); };
    $("#cLogY").onchange = (e) => { c.logy = e.target.checked; W.render(); };
    $("#cFit").onchange = (e) => { c.fit = e.target.checked; W.render(); };
    $("#cLab").onchange = (e) => { c.labs = e.target.value; W.render(); };
    $("#cOnly").onchange = (e) => { c.only = e.target.checked; c.zt = null; W.render(); };
    $("#cYear").oninput = (e) => { stopPlay(); c.year = +e.target.value; drawCompare(); };
    $("#cYear").onchange = () => W.render();
    $("#cPlay").onclick = () => (playTimer ? stopPlay() : startPlay());
    window.WPL?.bindSpeed($("#cSpeed"));
    $("#cNote").onclick = (e) => e.currentTarget.classList.toggle("open");
    $("#cFind").onchange = (e) => { const r = findCountry(e.target.value); e.target.value = ""; if (r && !c.pins.includes(r.iso3)) { c.pins = c.pins.concat(r.iso3).slice(-8); W.render(); } };
  }
  let zoomer = null;
  function resetZoom(quiet) {
    V.cmp.zt = null;
    const el = $("#vsvg");
    if (zoomer && el) { if (quiet) el.__zoom = d3.zoomIdentity; else d3.select(el).transition().duration(250).call(zoomer.transform, d3.zoomIdentity); }
  }
  // colour groups for the bubbles: continents, income groups, government type…
  function colourGroups() {
    const c = V.cmp;
    if (c.colour === "match") return [];
    if (c.colour === "region") return CONTINENTS;
    if (ORDERED_COLOURS[c.colour]) return ORDERED_COLOURS[c.colour];
    const f = F[c.colour];
    return f?.order || f?.options || [...new Set(W.rows.map((r) => r[c.colour]).filter((v) => typeof v === "string"))].sort();
  }
  function groupColour(k) {
    const c = V.cmp, gs = colourGroups(), i = gs.indexOf(k);
    if (i < 0) return css("--muted");
    if (c.colour === "region") return contColour(k);
    if (c.colour === "income_group") return css(`--inc-${i}`);
    if (ORDERED_COLOURS[c.colour] || c.colour === "hdi_group") return d3.interpolateRgbBasis(["#d1453b", "#e9a23b", "#3aa76d", "#2a6fc9"])(gs.length > 1 ? i / (gs.length - 1) : 0);
    return CAT_PAL[i % CAT_PAL.length];
  }
  const groupOf = (r) => (V.cmp.colour === "region" ? r.region : V.cmp.colour === "match" ? null : r[V.cmp.colour]);
  function compareYears() {
    const c = V.cmp;
    const keys = [c.x, c.y].concat(c.size && TS[c.size] ? [c.size] : []);
    if (!TS[c.x] || !TS[c.y] || W.CAT_TS[c.x] || W.CAT_TS[c.y]) return null;
    return commonYears(keys);
  }
  const cmpSig = () => (window.WPL ? window.WPL.merged([V.cmp.x, V.cmp.y].filter((k) => TS[k] && !W.CAT_TS[k])) : new Map());
  function startPlay() {
    const c = V.cmp, yrs = compareYears();
    if (!yrs) return;
    if (c.year == null || c.year >= yrs.to) c.year = yrs.from;
    playTimer = true;  // playing: the axes cover every year from the first frame
    drawCompare();
    const sig = cmpSig();
    const tick = () => {
      if (c.year >= yrs.to) { stopPlay(); W.render(); return; }
      c.year += 1;
      drawCompare(Math.min(500, window.WPL ? window.WPL.ms(500) : 500));
      const s = sig.get(c.year);
      playTimer = setTimeout(tick, (window.WPL ? window.WPL.ms(520) : 520) * (s ? (s.level === 2 ? 3 : 2) : 1));
    };
    playTimer = setTimeout(tick, window.WPL ? window.WPL.ms(520) : 520);
    $("#cPlay").textContent = "❚❚";
  }
  function stopPlay() {
    window.WCH?.stop();
    if (!playTimer) return;
    clearTimeout(playTimer); playTimer = null;
    const b = $("#cPlay"); if (b) b.textContent = "▶";
  }
  function drawCompare(dur = 250) {
    const c = V.cmp;
    const fx = F[c.x], fy = F[c.y], fz = c.size ? F[c.size] : null;
    if (!fx || !fy) return;
    const yrs = compareYears();
    const year = yrs ? Math.min(Math.max(c.year ?? yrs.best, yrs.from), yrs.to) : null;
    if (yrs) c.year = year;
    const logx = isLog(c.x, c.logx), logy = isLog(c.y, c.logy);
    $("#cLogX").checked = logx; $("#cLogY").checked = logy; $("#cFit").checked = c.fit;
    const nAct = W.lastEval.act.length;
    $("#cOnly").checked = c.only; $("#cOnly").disabled = !nAct; $("#cLab").value = c.labs || "";
    $("#cOnlyL").title = nAct ? "Show only the areas that match your filters, and fit the chart to them" : "Add a filter to use this";
    $("#cOnlyL").lastChild.textContent = ` Only areas that match the ${nAct === 1 ? "filter" : "filters"}`;
    // year slider
    const yr = $("#cYearRow");
    yr.classList.toggle("off", !yrs);
    const range = $("#cYear");
    if (yrs) { range.min = yrs.from; range.max = yrs.to; range.value = year; range.disabled = false; $("#cPlay").disabled = false; }
    else { range.disabled = true; $("#cPlay").disabled = true; }
    $("#cYearLab").textContent = yrs ? year : "Latest figures";
    {
      let a = $("#cAvg");
      if (!a) { a = document.createElement("span"); a.id = "cAvg"; a.className = "tavg"; $("#cYearRow").appendChild(a); }
      a.innerHTML = yrs && window.WPL ? [c.y, c.x].map((k) => window.WPL.avgHTML(k, year)).join("") : "";
      a.hidden = !a.innerHTML;
    }
    if (window.WPL) {
      const sig = yrs ? cmpSig() : new Map(); window.WPL.marks(range, sig); window.WPL.light($("#cSig"), sig, year);
      let p = $("#cSigText"); if (!p) { p = document.createElement("p"); p.id = "cSigText"; $("#cYearRow").appendChild(p); }
      const st = year && sig.get(year); p.hidden = !st || !playTimer; if (st)  // only while playing, so it doesn't cover the chart
       { p.textContent = st.text; p.className = `tsigtext pop l${st.level}`; }
    }
    // data
    const ms = matchSet();
    const pts = [];
    for (const r of W.pool()) {
      const x = val(r, c.x, year), y = val(r, c.y, year);
      if (x == null || y == null || (logx && x <= 0) || (logy && y <= 0)) continue;
      const z = fz ? val(r, c.size, year) : null;
      const m = !ms || ms.has(r.iso3);
      if (!m && c.only && ms) continue;  // only the matching countries
      pts.push({ r, iso: r.iso3, x, y, z: z ?? 0, m });
    }
    // the list in the results pane
    V.list = { title: year ? `Figures for ${year}` : "Latest figures", cols: [fy, fx], rows: pts.filter((p) => p.m).map((p) => ({ iso: p.iso, vals: [p.y, p.x] })),
      pinned: c.pins, note: "Tick areas to follow their path through the years.", max: 8,
      key: c.colour === "match" ? null : { label: (COLOUR_KEYS.find(([k]) => k === c.colour) || [, ""])[1], groups: colourGroups(), colour: groupColour, groupOf, focus: c.focus,
        setFocus: (k) => { c.focus = c.focus === k ? null : k; } },
      toggle: (iso) => { c.pins = c.pins.includes(iso) ? c.pins.filter((x) => x !== iso) : c.pins.concat(iso).slice(-8); } };
    const { w, h } = size();
    // no animation when the chart has just changed size, so bubbles never lag behind the axes
    if (drawCompare.size !== w + "x" + h) { dur = 0; drawCompare.size = w + "x" + h; }
    const mob = w < 560;
    const M = { t: 58, r: mob ? 40 : 60, b: 40, l: mob ? 46 : 60 };
    const rmax = Math.max(16, Math.min(46, Math.min(w, h) / 12));
    const PAD = mob ? 8 : Math.round(fz ? Math.max(16, rmax * 0.55) : 16); // keeps bubbles at the very top or end of the scale (e.g. 100%) inside the chart
    // the axes fit the bubbles on the chart. While playing through the years they cover those countries in every year,
    // so the bubbles move against still axes.
    const shown = new Set(pts.map((p) => p.iso));
    const ext = (key, log) => {
      let e = [null, null];
      if (yrs && TS[key] && playTimer) {
        const i0 = TS_YEARS.indexOf(yrs.from), i1 = TS_YEARS.indexOf(yrs.to), vs = [];
        for (const iso of shown) { const sr = TS[key][iso]; if (sr) for (let i = Math.max(0, i0); i <= (i1 < 0 ? sr.length - 1 : i1); i++) { const v = sr[i]; if (v != null && (!log || v > 0)) vs.push(v); } }
        e = d3.extent(vs);
      }
      if (e[0] == null) e = d3.extent(pts, (p) => (key === c.x ? p.x : p.y));
      if (e[0] == null) return [0, 1];
      if (e[0] === e[1]) return log ? [e[0] / 2, e[0] * 2] : [e[0] - 1, e[1] + 1];
      return e;
    };
    const ex = ext(c.x, logx), ey = ext(c.y, logy);
    const sx0 = (logx ? d3.scaleLog() : d3.scaleLinear()).domain(ex).range([M.l + PAD, w - M.r - PAD]).nice();
    const sy0 = (logy ? d3.scaleLog() : d3.scaleLinear()).domain(ey).range([h - M.b - PAD, M.t + PAD]).nice();
    // zoomed in: the same scales, stretched
    const zt = c.zt;
    const sx = zt ? zt.rescaleX(sx0) : sx0, sy = zt ? zt.rescaleY(sy0) : sy0;
    if (zoomer) zoomer.extent([[M.l, M.t], [w - M.r, h - M.b]]).translateExtent([[M.l, M.t], [w - M.r, h - M.b]]);
    $(".czoom")?.classList.toggle("zoomed", !!zt);
    const zmax = fz ? (yrs && TS[c.size] ? allYearsExtent(c.size)[1] : d3.max(pts, (p) => p.z)) || 1 : 1;
    const sr = fz ? d3.scaleSqrt().domain([0, zmax]).range([0, rmax]) : () => (mob ? 5 : 6.5);
    const colour = (p) => {
      if (!p.m) return css("--land");
      if (c.colour === "match") return css("--match");
      return groupColour(groupOf(p.r));
    };
    const key = (p) => groupOf(p.r);
    const svg = d3.select("#vsvg").attr("viewBox", `0 0 ${w} ${h}`).attr("width", w).attr("height", h)
      .attr("aria-label", `Bubble chart of ${fy.label} against ${fx.label}${year ? " in " + year : ""}`);
    // layers (made once)
    if (svg.select("g.layers").empty()) {
      svg.selectAll("*").remove();
      const L = svg.append("g").attr("class", "layers");
      svg.append("defs").append("clipPath").attr("id", "cClip").append("rect");
      ["wm", "grid", "quad", "axes", "fit", "trails", "bubbles", "labels"].forEach((n) => L.append("g").attr("class", n));
      ["fit", "trails", "bubbles", "labels", "grid"].forEach((n) => L.select("g." + n).attr("clip-path", "url(#cClip)"));
    }
    svg.select("#cClip rect").attr("x", M.l).attr("y", M.t - 2).attr("width", Math.max(0, w - M.r - M.l)).attr("height", Math.max(0, h - M.b - M.t + 2));
    const ink = css("--ink"), muted = css("--muted"), line = css("--line"), surface = css("--surface");
    // watermark year
    svg.select("g.wm").selectAll("text").data(year ? [year] : []).join("text")
      .attr("x", (M.l + w - M.r) / 2).attr("y", (M.t + h - M.b) / 2).attr("text-anchor", "middle").attr("dy", "0.35em")
      .attr("font-size", Math.min(w, h) * 0.26).attr("font-weight", 700).attr("fill", line).attr("opacity", 0.55).text((d) => d);
    // grid + axes
    const inR = (s) => (v) => { const p = s(v), r = s.range(); return p >= Math.min(...r) - 0.5 && p <= Math.max(...r) + 0.5; };
    const tx = ticksFor(sx, logx, mob ? 4 : 7).filter(inR(sx)), ty = ticksFor(sy, logy, mob ? 5 : 7).filter(inR(sy));
    const g = svg.select("g.grid");
    g.selectAll("line.gx").data(tx).join("line").attr("class", "gx").attr("x1", sx).attr("x2", sx).attr("y1", M.t).attr("y2", h - M.b).attr("stroke", line);
    g.selectAll("line.gy").data(ty).join("line").attr("class", "gy").attr("y1", sy).attr("y2", sy).attr("x1", M.l).attr("x2", w - M.r).attr("stroke", line);
    const a = svg.select("g.axes");
    a.selectAll("text.tx").data(tx).join("text").attr("class", "tx").attr("x", sx).attr("y", h - M.b + 16).attr("text-anchor", "middle").attr("fill", muted).attr("font-size", 11).text((v) => fmtShort(fx, v));
    a.selectAll("text.ty").data(ty).join("text").attr("class", "ty").attr("x", M.l - 6).attr("y", sy).attr("dy", "0.35em").attr("text-anchor", "end").attr("fill", muted).attr("font-size", 11).text((v) => fmtShort(fy, v));
    a.selectAll("text.ty2").data(ty).join("text").attr("class", "ty2").attr("x", w - M.r + 6).attr("y", sy).attr("dy", "0.35em").attr("text-anchor", "start").attr("fill", muted).attr("font-size", 11).text((v) => fmtShort(fy, v));
    a.selectAll("text.atx").data([fx]).join("text").attr("class", "atx").attr("x", w - M.r).attr("y", h - 6).attr("text-anchor", "end").attr("fill", ink).attr("font-size", 12.5).attr("font-weight", 600).text(`${fx.label} →${logx ? " (log scale)" : ""}`);
    a.selectAll("text.ctitle").data([0]).join("text").attr("class", "ctitle").attr("x", 4).attr("y", 18).attr("fill", ink).attr("font-size", mob ? 14 : 16).attr("font-weight", 700)
      .text(`${fy.label} and ${lower(fx.label)}${year ? `, ${year}` : ""}`);
    a.selectAll("text.csub").data([0]).join("text").attr("class", "csub").attr("x", 4).attr("y", 34).attr("fill", muted).attr("font-size", 11.5)
      .text(`Each bubble is an area${fz ? `, sized by ${lower(fz.label)}` : ""}${c.colour !== "match" ? `, coloured by ${lower((COLOUR_KEYS.find(([k]) => k === c.colour) || [, "group"])[1])}` : ""}.`);
    a.selectAll("text.aty").data([fy]).join("text").attr("class", "aty").attr("x", M.l - (mob ? 40 : 54)).attr("y", M.t - 8).attr("fill", ink).attr("font-size", 12.5).attr("font-weight", 600).text(`↑ ${fy.label}${logy ? " (log scale)" : ""}`);
    // trend line and correlation (among the countries shown in colour)
    const used = pts.filter((p) => p.m);
    const T = (v, log) => (log ? Math.log10(v) : v);
    let corr = null;
    if (used.length >= 5) {
      const X = used.map((p) => T(p.x, logx)), Y = used.map((p) => T(p.y, logy));
      const mx = d3.mean(X), my = d3.mean(Y);
      let sxy = 0, sxx = 0, syy = 0;
      X.forEach((x, i) => { sxy += (x - mx) * (Y[i] - my); sxx += (x - mx) ** 2; syy += (Y[i] - my) ** 2; });
      if (sxx > 0 && syy > 0) corr = { r: sxy / Math.sqrt(sxx * syy), slope: sxy / sxx, mx, my, x0: d3.min(X), x1: d3.max(X) };
    }
    const fitData = c.fit && corr ? [corr] : [];
    svg.select("g.fit").selectAll("line").data(fitData).join("line")
      .attr("x1", (d) => sx(logx ? 10 ** d.x0 : d.x0)).attr("x2", (d) => sx(logx ? 10 ** d.x1 : d.x1))
      .attr("y1", (d) => { const v = d.my + d.slope * (d.x0 - d.mx); return sy(logy ? 10 ** v : v); })
      .attr("y2", (d) => { const v = d.my + d.slope * (d.x1 - d.mx); return sy(logy ? 10 ** v : v); })
      .attr("stroke", ink).attr("stroke-width", 2).attr("stroke-dasharray", "6 4").attr("opacity", 0.7);
    // corner labels: what each corner of the chart means ("happy but poor"…)
    $("#cQuad").checked = c.quads !== false;
    const [loX, hiX] = adj(c.x), [loY, hiY] = adj(c.y);
    const neg = corr && corr.r < -0.2;
    const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
    // "Longer lives / poor": on two lines when long, with a big arrow pointing into the corner
    const fsQ = mob ? 10.5 : 12.5, lh = fsQ + 3;
    const corner = (yWord, xWord) => { const one = `${cap(yWord)} / ${xWord}`; return one.length > (mob ? 18 : 26) ? [`${cap(yWord)} /`, xWord] : [one]; };
    const quads = c.quads === false ? [] : [
      { lines: corner(hiY, loX), arrow: "↖", x: M.l + 8, y: M.t + 18, a: "start", top: true },
      { lines: corner(hiY, hiX), arrow: "↗", x: w - M.r - 8, y: M.t + 18, a: "end", top: true },
      { lines: corner(loY, loX), arrow: "↙", x: M.l + 8, y: h - M.b - 10, a: "start", top: false },
      { lines: corner(loY, hiX), arrow: "↘", x: w - M.r - 8, y: h - M.b - 10, a: "end", top: false },
    ];
    svg.select("g.quad").selectAll("text").data(quads).join("text").attr("text-anchor", (d) => d.a)
      .attr("font-size", fsQ).attr("font-weight", 600).attr("font-style", "italic").attr("fill", muted).attr("opacity", 0.9)
      .attr("stroke", surface).attr("stroke-width", 3).attr("paint-order", "stroke").attr("pointer-events", "none")
      .each(function (d) {
        const t = d3.select(this); t.selectAll("*").remove(); t.text(null);
        const n = d.lines.length, y0 = d.top ? d.y : d.y - (n - 1) * lh;
        const arrowLine = d.top ? 0 : n - 1;
        d.lines.forEach((ln, i) => {
          const sp = t.append("tspan").attr("x", d.x).attr("y", y0 + i * lh);
          const big = (s) => sp.append("tspan").attr("font-size", fsQ * 1.7).attr("font-style", "normal").attr("font-weight", 700).attr("dy", 0).text(s);
          if (i === arrowLine && d.a === "start") { big(d.arrow); sp.append("tspan").text(" " + ln); }
          else if (i === arrowLine) { sp.append("tspan").text(ln + " "); big(d.arrow); }
          else sp.append("tspan").text(ln);
        });
      });
    // trails for followed countries
    const pinned = c.pins.filter((iso) => W.byIso.has(iso));
    const trails = yrs ? pinned.map((iso) => {
      const r = W.byIso.get(iso);
      const ps = d3.range(yrs.from, year + 1).map((y) => [val(r, c.x, y), val(r, c.y, y), y]).filter(([x, y]) => x != null && y != null && (!logx || x > 0) && (!logy || y > 0));
      return { iso, r, ps };
    }) : [];
    const tg = svg.select("g.trails").selectAll("g.trail").data(trails, (d) => d.iso).join((en) => { const gg = en.append("g").attr("class", "trail"); gg.append("path"); return gg; });
    tg.select("path").attr("d", (d) => d3.line()(d.ps.map(([x, y]) => [sx(x), sy(y)]))).attr("fill", "none").attr("stroke", (d) => contColour(d.r.region)).attr("stroke-width", 1.6).attr("opacity", 0.8);
    tg.selectAll("circle").data((d) => d.ps.filter(([, , y]) => y % 5 === 0).map((p) => ({ p, d }))).join("circle")
      .attr("cx", (e) => sx(e.p[0])).attr("cy", (e) => sy(e.p[1])).attr("r", 2.6).attr("fill", (e) => contColour(e.d.r.region)).attr("opacity", 0.8);
    // bubbles: biggest first so small ones stay on top
    pts.sort((p, q) => (p.m - q.m) || sr(q.z) - sr(p.z));
    const sel = W.state.selected;
    const focus = c.focus;
    const circles = svg.select("g.bubbles").selectAll("circle").data(pts, (p) => p.iso).join(
      (en) => en.append("circle").attr("cx", (p) => sx(p.x)).attr("cy", (p) => sy(p.y)).attr("r", 0),
      (up) => up,
      (ex) => ex.transition().duration(200).attr("r", 0).remove());
    circles.order()
      .attr("data-iso", (p) => p.iso)
      .attr("fill", colour).attr("fill-opacity", (p) => (!p.m ? 0.5 : focus && key(p) !== focus ? 0.12 : 0.85))
      .attr("stroke", (p) => (p.iso === sel || pinned.includes(p.iso) ? ink : surface)).attr("stroke-width", (p) => (p.iso === sel || pinned.includes(p.iso) ? 2 : 1))
      .transition().duration(dur).ease(d3.easeLinear)
      .attr("cx", (p) => sx(p.x)).attr("cy", (p) => sy(p.y)).attr("r", (p) => Math.max(2.5, sr(p.z)));
    circles.on("pointermove", (evt, p) => {
      if (evt.pointerType === "touch") return;
      tipShow(evt, bubbleTip(p, fx, fy, fz, year));
      W.highlightMap?.(p.iso, true);
    }).on("pointerleave", (evt, p) => { tipHide(); }).on("click", (evt, p) => {
      tipShow(evt, bubbleTip(p, fx, fy, fz, year));
      c.pins = c.pins.includes(p.iso) ? c.pins.filter((x) => x !== p.iso) : c.pins.concat(p.iso).slice(-8);
      W.select(p.iso);
    });
    // labels: followed and selected countries, plus the largest bubbles when there is room
    const labelled = new Set(pinned.concat(sel ? [sel] : []));
    if (!mob && fz) pts.filter((p) => p.m).sort((p, q) => q.z - p.z).slice(0, 6).forEach((p) => labelled.add(p.iso));
    // or every country, by name or by its three-letter code (handy for saving the chart)
    if (c.labs) pts.filter((p) => p.m).forEach((p) => labelled.add(p.iso));
    const code = c.labs === "code", lab = pts.filter((p) => labelled.has(p.iso));
    const big = (p) => pinned.includes(p.iso) || p.iso === sel;
    svg.select("g.labels").selectAll("text").data(lab, (p) => p.iso).join("text")
      .attr("font-size", (p) => (big(p) ? 11.5 : code ? 9.5 : c.labs ? 10 : 11.5)).attr("font-weight", (p) => (big(p) ? 600 : 400)).attr("fill", ink)
      .attr("stroke", surface).attr("stroke-width", c.labs ? 2.5 : 3).attr("paint-order", "stroke").attr("pointer-events", "none")
      .text((p) => (code && !big(p) ? p.iso : p.r.name))
      .transition().duration(dur).ease(d3.easeLinear)
      .attr("x", (p) => sx(p.x) + Math.max(2.5, sr(p.z)) + 3).attr("y", (p) => sy(p.y) + 4);
    // legend
    const groups = colourGroups();
    const gcol = groupColour;
    $("#cLeg").innerHTML = (groups.length ? groups.map((k) => `<button type="button" class="lg ${focus && focus !== k ? "off" : ""}" data-k="${esc(k)}" aria-pressed="${focus === k}"><span class="sw" style="background:${gcol(k)}"></span>${esc(k)}</button>`).join("") + `<span class="lghint">Click to pick out</span>`
      : `<span class="lg"><span class="sw" style="background:var(--match)"></span>Matches your filters</span>`) +
      (ms ? `<span class="lg"><span class="sw" style="background:var(--land)"></span>Doesn't match</span>` : "") +
      (fz ? `<span class="lg"><span class="sw circ"></span>Size: ${esc(lower(fz.label))}</span>` : "");
    $$("#cLeg button.lg").forEach((b) => (b.onclick = () => { c.focus = c.focus === b.dataset.k ? null : b.dataset.k; drawCompare(); }));
    // explanation
    const n = used.length;
    let note = "";
    const yearText = year ? `In ${year}` : "Using the latest figures";
    if (corr && n >= 5) {
      const ar = Math.abs(corr.r);
      const strength = ar >= 0.7 ? "strong" : ar >= 0.4 ? "moderate" : ar >= 0.2 ? "weak" : null;
      note = strength
        ? `${yearText}, across ${n} areas, there is a <b>${strength} ${corr.r > 0 ? "positive" : "negative"} link</b> (r = ${corr.r.toFixed(2)}): areas with higher ${esc(lower(fx.label))} tend to have ${corr.r > 0 ? "higher" : "lower"} ${esc(lower(fy.label))}.`
        : `${yearText}, across ${n} areas, there is <b>little or no link</b> (r = ${corr.r.toFixed(2)}) between ${esc(lower(fx.label))} and ${esc(lower(fy.label))}.`;
      note += ` A link doesn't prove that one causes the other.`;
      // countries far from the trend line: doing better or worse than the other measure would suggest
      if (c.fit && used.length >= 10) {
        const res = used.map((p) => ({ p, d: T(p.y, logy) - (corr.my + corr.slope * (T(p.x, logx) - corr.mx)) })).sort((a, b) => b.d - a.d);
        const nm = (a) => a.slice(0, 3).map((q) => esc(q.p.r.name)).join(", ");
        note += ` <b>Furthest above the trend line</b> (higher ${esc(lower(fy.short || fy.label))} than their ${esc(lower(fx.short || fx.label))} would suggest): ${nm(res)}. <b>Furthest below:</b> ${nm(res.slice().reverse())}.`;
      }
    } else note = `${yearText}: too few areas have both measures to compare.`;
    note += ` <span class="vhint">Scroll or pinch on the chart to zoom in; drag to move around.</span>`;
    if (!yrs) note += ` ${!TS[c.x] || W.CAT_TS[c.x] ? esc(fx.label) : esc(fy.label)} has no yearly data here, so the chart shows the latest figures and can't play through time.`;
    else if (ms) note += ` Areas that don't match your filters are grey.`;
    $("#cNote").innerHTML = note;
    $("#cPins").innerHTML = pinned.map((iso) => `<span class="pin"><span class="sw" style="background:${contColour(W.byIso.get(iso).region)}"></span>${esc(W.byIso.get(iso).name)}<button type="button" data-iso="${iso}" aria-label="Stop following ${esc(W.byIso.get(iso).name)}">×</button></span>`).join("") +
      (yrs && !pinned.length ? `<span class="hint">Click a bubble to follow it and see its path.</span>` : "");
    $$("#cPins button").forEach((b) => (b.onclick = () => { c.pins = c.pins.filter((x) => x !== b.dataset.iso); W.render(); }));
    V.csv = () => [["Area", "Region", fx.label, fy.label].concat(fz ? [fz.label] : []).concat(["Year"]),
      ...pts.map((p) => [p.r.name, p.r.region, p.x, p.y].concat(fz ? [p.z] : []).concat([year || "latest"]))];
    V.title = `${fy.label} and ${fx.label}${year ? `, ${year}` : ""}`;
  }
  function bubbleTip(p, fx, fy, fz, year) {
    return `<strong>${p.r.flag || ""} ${esc(p.r.name)}</strong><span class="st">${esc(p.r.region || "")}${year ? ` · ${year}` : ""}</span>
      <dl><dt>${esc(fy.short || fy.label)}</dt><dd>${esc(fmtShort(fy, p.y))}</dd><dt>${esc(fx.short || fx.label)}</dt><dd>${esc(fmtShort(fx, p.x))}</dd>
      ${fz ? `<dt>${esc(fz.short || fz.label)}</dt><dd>${esc(fmtShort(fz, p.z))}</dd>` : ""}</dl>`;
  }

  // ======================= RANKINGS =======================
  function bindRank() {
    const k = V.rank;
    if (!k.key || !F[k.key]) k.key = defaultKey();
    $("#rK").innerHTML = W.measureOptions(k.key);
    $("#rK").onchange = (e) => { k.key = e.target.value; k.year = null; W.render(); };
    $("#rYear").onchange = (e) => { k.year = e.target.value ? +e.target.value : null; W.render(); };
    $$(".seg button[data-m]").forEach((b) => (b.onclick = () => { k.mode = b.dataset.m; W.render(); }));
    $("#rOnly").onchange = (e) => { k.only = e.target.checked; W.render(); };
  }
  function defaultKey() {
    const ck = W.state.colourBy && W.state.colourBy !== "none" ? W.state.colourBy : null;
    if (ck && F[ck]?.type === "range") return ck;
    const fl = W.state.filters.slice().reverse().find((x) => F[x.key].type === "range" && !F[x.key].target);
    return fl ? fl.key : W.state.mode === "physical" ? "highest_m" : "population";
  }
  function drawRank() {
    const k = V.rank, f = F[k.key];
    if (!f) return;
    $("#rK").value = k.key;
    const sp = TS[k.key] && !W.CAT_TS[k.key] ? W.span(k.key) : null;
    $("#rYear").innerHTML = sp ? yearsOpts(sp[0], sp[1], k.year, "Latest") : `<option value="">${esc(W.yearLabel(f) || "Latest")}</option>`;
    $("#rYear").disabled = !sp;
    $$(".seg button[data-m]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.m === k.mode)));
    const ms = matchSet();
    $("#rOnlyL").hidden = !ms;
    $("#rOnlyT").textContent = `Only areas that match the ${W.lastEval.act.length === 1 ? "filter" : "filters"}`;
    $("#rOnly").checked = k.only;
    const year = sp ? k.year : null;
    k.pins ||= [];
    let pts = W.pool().map((r) => ({ r, iso: r.iso3, v: val(r, k.key, year), m: !ms || ms.has(r.iso3) })).filter((p) => p.v != null && (!k.only || p.m));
    const asc = f.format === "rank";
    pts.sort((a, b) => (asc ? a.v - b.v : b.v - a.v) || a.r.name.localeCompare(b.r.name));
    pts.forEach((p, i) => (p.rank = i + 1));
    V.list = { title: year ? `Figures for ${year}` : `Latest figures`, cols: [f], rows: pts.filter((p) => p.m).map((p) => ({ iso: p.iso, vals: [p.v] })), asc,
      pinned: k.pins, note: "Click an area to pick it out in the chart.", max: 20,
      toggle: (iso) => { k.pins = k.pins.includes(iso) ? k.pins.filter((x) => x !== iso) : k.pins.concat(iso).slice(-20); } };
    const world = d3.median(W.rows.filter((r) => r.sovereign).map((r) => val(r, k.key, year)).filter((v) => v != null));
    $("#rLeg").innerHTML = CONTINENTS.map((c) => `<span class="lg"><span class="sw" style="background:${contColour(c)}"></span>${c}</span>`).join("") +
      (ms && !k.only ? `<span class="lg"><span class="sw" style="background:var(--land)"></span>Doesn't match</span>` : "") +
      `<span class="lg"><span class="sw dash"></span>UK median ${esc(fmtShort(f, world))}</span>`;
    if (k.mode === "cont") drawStrips(pts, f, world, year);
    else drawBars(pts, f, world);
    const yearText = year ? year : W.yearLabel(f) || "latest";
    $("#rNote").innerHTML = `${pts.length} ${W.state.territories ? "places" : "areas"} with data (${esc(String(yearText))}). ${asc ? "Rank 1 is shown first." : "Highest first."} ${f.info ? esc(f.info) : ""}`;
    V.csv = () => [["Rank", "Area", "Region", f.label + (year ? ` (${year})` : "")], ...pts.map((p) => [p.rank, p.r.name, p.r.region, p.v])];
    V.title = `${f.label}: ${k.mode === "cont" ? "by region" : "ranking"}${year ? `, ${year}` : ""}`;
  }
  function drawBars(pts, f, world) {
    const { w } = size();
    const mob = w < 560;
    const rowH = 19, M = { t: 8, r: mob ? 50 : 64, b: 10, l: mob ? 128 : 170 };
    const h = M.t + M.b + rowH * pts.length;
    const min = Math.min(0, d3.min(pts, (p) => p.v) ?? 0), max = Math.max(0, d3.max(pts, (p) => p.v) ?? 1);
    const sx = d3.scaleLinear().domain([min, max]).range([M.l, w - M.r]);
    const svg = d3.select("#vsvg").attr("viewBox", `0 0 ${w} ${h}`).attr("width", w).attr("height", h).attr("aria-label", `Areas ranked by ${f.label}`);
    svg.selectAll("*").remove();
    const ink = css("--ink"), muted = css("--muted"), land = css("--land");
    const sel = W.state.selected, pinS = new Set(V.rank.pins || []);
    const g = svg.selectAll("g.br").data(pts).join("g").attr("class", "br").attr("data-iso", (p) => p.iso).attr("transform", (p, i) => `translate(0,${M.t + i * rowH})`);
    g.append("rect").attr("class", "hit").attr("x", 0).attr("width", w).attr("height", rowH).attr("fill", (p) => (p.iso === sel || pinS.has(p.iso) ? css("--accent-soft") : "transparent"));
    g.append("text").attr("x", 4).attr("y", rowH / 2).attr("dy", "0.35em").attr("font-size", 11).attr("fill", muted).attr("class", "num").text((p) => p.rank);
    g.append("text").attr("x", mob ? 26 : 32).attr("y", rowH / 2).attr("dy", "0.35em").attr("font-size", 12).attr("fill", ink).attr("font-weight", (p) => (p.iso === sel || pinS.has(p.iso) ? 700 : 400))
      .text((p) => { const n = `${p.r.flag || ""} ${p.r.name}`; const lim = mob ? 15 : 21; return n.length > lim + 3 ? n.slice(0, lim + 2) + "…" : n; });
    g.append("rect").attr("x", (p) => sx(Math.min(0, p.v))).attr("y", 3).attr("height", rowH - 6).attr("rx", 3)
      .attr("width", (p) => Math.max(1, Math.abs(sx(p.v) - sx(0)))).attr("fill", (p) => (p.m ? contColour(p.r.region) : land));
    g.append("text").attr("x", (p) => Math.max(sx(p.v), sx(0)) + 4).attr("y", rowH / 2).attr("dy", "0.35em").attr("font-size", 11).attr("fill", ink).text((p) => fmtShort(f, p.v));
    if (world != null) svg.append("line").attr("x1", sx(world)).attr("x2", sx(world)).attr("y1", M.t).attr("y2", h - M.b).attr("stroke", ink).attr("stroke-dasharray", "4 3").attr("opacity", 0.6).attr("pointer-events", "none");
    g.style("cursor", "pointer").on("click", (evt, p) => W.select(p.iso))
      .on("pointerenter", (evt, p) => W.highlightMap?.(p.iso, true)).on("pointerleave", (evt, p) => W.highlightMap?.(p.iso, false));
    if (sel) {
      const i = pts.findIndex((p) => p.iso === sel);
      if (i >= 0) { const body = $("#vbody"); body.scrollTop = Math.max(0, M.t + i * rowH - body.clientHeight / 2); }
    }
  }
  function drawStrips(pts, f, world, year) {
    const { w, h: availH } = size();
    const mob = w < 560;
    const M = { t: 20, r: 18, b: 34, l: mob ? 74 : 92 };
    const conts = CONTINENTS.filter((c) => pts.some((p) => p.r.region === c));
    const rowH = Math.max(70, Math.min(130, (availH - M.t - M.b) / conts.length));
    const h = M.t + M.b + rowH * conts.length;
    const log = f.scale === "log" && pts.every((p) => p.v > 0);
    const sx = (log ? d3.scaleLog() : d3.scaleLinear()).domain(d3.extent(pts, (p) => p.v)).range([M.l, w - M.r]).nice();
    const svg = d3.select("#vsvg").attr("viewBox", `0 0 ${w} ${h}`).attr("width", w).attr("height", h).attr("aria-label", `${f.label} by region`);
    svg.selectAll("*").remove();
    const ink = css("--ink"), muted = css("--muted"), line = css("--line"), land = css("--land"), surface = css("--surface");
    const tx = ticksFor(sx, log, mob ? 4 : 7);
    svg.append("g").selectAll("line").data(tx).join("line").attr("x1", sx).attr("x2", sx).attr("y1", M.t).attr("y2", h - M.b).attr("stroke", line);
    svg.append("g").selectAll("text").data(tx).join("text").attr("x", sx).attr("y", h - M.b + 16).attr("text-anchor", "middle").attr("font-size", 11).attr("fill", muted).text((v) => fmtShort(f, v));
    svg.append("text").attr("x", w - M.r).attr("y", h - 4).attr("text-anchor", "end").attr("font-size", 12).attr("font-weight", 600).attr("fill", ink).text(`${f.label} →${log ? " (log scale)" : ""}`);
    const sel = W.state.selected;
    conts.forEach((cName, i) => {
      const cy = M.t + rowH * i + rowH / 2;
      const ps = pts.filter((p) => p.r.region === cName).map((p) => ({ ...p, x: sx(p.v), y: cy, tx: sx(p.v) }));
      // spread dots up and down so they don't hide each other
      const sim = d3.forceSimulation(ps).force("x", d3.forceX((d) => d.tx).strength(1)).force("y", d3.forceY(cy).strength(0.08)).force("c", d3.forceCollide(5.6)).stop();
      for (let t = 0; t < 120; t++) sim.tick();
      ps.forEach((p) => (p.y = Math.max(cy - rowH / 2 + 6, Math.min(cy + rowH / 2 - 6, p.y))));
      const row = svg.append("g");
      if (i) row.append("line").attr("x1", 0).attr("x2", w).attr("y1", cy - rowH / 2).attr("y2", cy - rowH / 2).attr("stroke", line);
      row.append("text").attr("x", 4).attr("y", cy).attr("dy", "0.35em").attr("font-size", 12.5).attr("font-weight", 600).attr("fill", ink).text(cName);
      const med = d3.median(ps, (p) => p.v);
      row.append("text").attr("x", 4).attr("y", cy + 15).attr("font-size", 10.5).attr("fill", muted).text(`median ${fmtShort(f, med)}`);
      row.append("line").attr("x1", sx(med)).attr("x2", sx(med)).attr("y1", cy - rowH / 2 + 4).attr("y2", cy + rowH / 2 - 4).attr("stroke", contColour(cName)).attr("stroke-width", 3).attr("opacity", 0.9);
      row.selectAll("circle").data(ps).join("circle").attr("cx", (p) => p.x).attr("cy", (p) => p.y).attr("r", 4.6).attr("data-iso", (p) => p.iso)
        .attr("fill", (p) => (p.m ? contColour(cName) : land)).attr("stroke", (p) => (p.iso === sel || (V.rank.pins || []).includes(p.iso) ? ink : surface)).attr("stroke-width", (p) => (p.iso === sel || (V.rank.pins || []).includes(p.iso) ? 2 : 1))
        .style("cursor", "pointer")
        .on("pointermove", (evt, p) => { if (evt.pointerType !== "touch") tipShow(evt, `<strong>${p.r.flag || ""} ${esc(p.r.name)}</strong><span class="st">${esc(cName)} · rank ${p.rank} of ${pts.length}</span><dl><dt>${esc(f.short || f.label)}</dt><dd>${esc(fmtShort(f, p.v))}</dd></dl>`); })
        .on("pointerleave", tipHide).on("click", (evt, p) => W.select(p.iso));
      // name the highest and lowest in each continent
      const ends = ps.length > 1 ? [d3.least(ps, (p) => p.v), d3.greatest(ps, (p) => p.v)] : ps;
      const named = new Set(ends.map((p) => p.iso).concat(sel && ps.some((p) => p.iso === sel) ? [sel] : []).concat((V.rank.pins || []).filter((i) => ps.some((p) => p.iso === i))));
      row.selectAll("text.nm").data(ps.filter((p) => named.has(p.iso))).join("text").attr("class", "nm")
        .attr("x", (p) => p.x).attr("y", (p) => p.y - 8).attr("text-anchor", (p) => (p.x > w - 90 ? "end" : p.x < M.l + 40 ? "start" : "middle"))
        .attr("font-size", 10.5).attr("fill", ink).attr("stroke", surface).attr("stroke-width", 3).attr("paint-order", "stroke").attr("pointer-events", "none").text((p) => p.r.name);
    });
    if (world != null) svg.append("line").attr("x1", sx(world)).attr("x2", sx(world)).attr("y1", M.t).attr("y2", h - M.b).attr("stroke", ink).attr("stroke-dasharray", "4 3").attr("opacity", 0.6).attr("pointer-events", "none");
  }

  // ======================= CHARTS (was Trends) =======================
  // The Charts view lives in charts.js; it borrows these helpers.
  window.WV_H = { sourceText, V, size, tipShow, tipHide, css, contColour, ticksFor, matchSet, isLog, findCountry, lower, CONTINENTS, PIN_VARS };

  // ======================= Country profile: trend chart, pyramid, DTM =======================
  let pyramids = window.__PYRAMIDS__ || null, pyrLoading = null;
  function loadPyramids() {
    pyramids ||= window.__PYRAMIDS__ || null;
    if (pyramids) return Promise.resolve(pyramids);
    pyrLoading ||= fetch("pyramids.json?v=25").then((r) => r.json()).then((d) => (pyramids = d)).catch(() => null);
    return pyrLoading;
  }
  // A small line chart as an SVG string: the country against the world and continent medians
  function lineChartSVG(iso, key, o = {}) {
    const r = W.byIso.get(iso), f = F[key];
    const wd = o.w || 300, ht = o.h || 150;
    const sp = W.span(key);
    if (!r || !f || !sp || !TS[key]?.[iso]) return "";
    const years = d3.range(sp[0], sp[1] + 1);
    const mine = years.map((y) => TS[key][iso][y - TS_YEARS[0]] ?? null);
    if (mine.filter((v) => v != null).length < 2) return "";
    const wm = years.map((y) => medianSeries(key)[y - TS_YEARS[0]]);
    const rm = years.map((y) => medianSeries(key, r.region)[y - TS_YEARS[0]]);
    const C = o.colours || { ink: css("--ink"), muted: css("--muted"), line: css("--line"), accent: css("--accent"), region: css("--match-deep") };
    const log = f.scale === "log";
    const all = mine.concat(wm, rm).filter((v) => v != null && (!log || v > 0));
    const ext = d3.extent(all);
    if (!log && ext[0] > 0 && ext[0] < ext[1] * 0.35) ext[0] = 0;
    const M = { t: 8, r: 8, b: 18, l: o.l || 40 };
    const sx = d3.scaleLinear().domain([sp[0], sp[1]]).range([M.l, wd - M.r]);
    const sy = (log ? d3.scaleLog() : d3.scaleLinear()).domain(ext).range([ht - M.b, M.t]).nice(4);
    const ln = d3.line().defined((v) => v != null && (!log || v > 0)).x((v, i) => sx(years[i])).y((v) => sy(v));
    const ty = ticksFor(sy, log, 3).slice(0, 5);
    const fs = o.fs || 10;
    const txt = (x, y, s, a = "start", fill = C.muted) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${fs}" fill="${fill}" text-anchor="${a}" font-family="IBM Plex Sans, Arial, sans-serif">${esc(s)}</text>`;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${wd} ${ht}" width="${wd}" height="${ht}" role="img" aria-label="${esc(f.label)} in ${esc(r.name)}, ${sp[0]}–${sp[1]}">`;
    ty.forEach((v) => { s += `<line x1="${M.l}" x2="${wd - M.r}" y1="${sy(v).toFixed(1)}" y2="${sy(v).toFixed(1)}" stroke="${C.line}" stroke-width="1"/>` + txt(M.l - 4, sy(v) + 3.5, fmtShort(f, v), "end"); });
    [sp[0], Math.round((sp[0] + sp[1]) / 2), sp[1]].forEach((y, i) => (s += txt(sx(y), ht - 4, String(y), i === 0 ? "start" : i === 2 ? "end" : "middle")));
    s += `<path d="${ln(wm) || ""}" fill="none" stroke="${C.muted}" stroke-width="1.6" stroke-dasharray="5 3"/>`;
    s += `<path d="${ln(rm) || ""}" fill="none" stroke="${C.region}" stroke-width="1.6" stroke-dasharray="1.5 2.5" stroke-linecap="round"/>`;
    if (W.SURVEY_KEYS?.has(key)) {
      // surveys every few years: join the survey points and mark each one
      const pts = mine.map((v, i) => (v == null ? null : [sx(years[i]), sy(v)])).filter(Boolean);
      s += `<path d="${d3.line()(pts)}" fill="none" stroke="${C.accent}" stroke-width="2.2" stroke-linejoin="round"/>` + pts.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" fill="${C.accent}"/>`).join("");
    } else s += `<path d="${ln(mine)}" fill="none" stroke="${C.accent}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>`;
    return s + `</svg>`;
  }
  const lineKey = (o = {}) => `<span class="lk"><span class="lkl" style="border-color:${o.accent || "var(--accent)"}"></span>This area</span><span class="lk"><span class="lkl dash" style="border-color:${o.muted || "var(--muted)"}"></span>UK median</span><span class="lk"><span class="lkl dot" style="border-color:${o.region || "var(--match-deep)"}"></span>${esc(o.regionName || "Region")} median</span>`;
  // Population pyramid as an SVG string. vals: [male 0–4 … 80+, female 0–4 … 80+] as % of the whole population
  function pyramidSVG(vals, ages, o = {}) {
    const wd = o.w || 300, ht = o.h || 210, cmp = o.compare || null;
    const C = o.colours || { ink: css("--ink"), muted: css("--muted"), line: css("--line"), male: css("--s1"), female: css("--s2") };
    const n = ages.length, mid = wd / 2, lab = o.lab || 34, M = { t: 16, b: 16 };
    const max = Math.max(d3.max(vals), cmp ? d3.max(cmp) : 0);
    const top = Math.ceil(max / 2) * 2 || 2;
    const half = mid - lab / 2 - 6;
    const sxv = (v) => (v / top) * half;
    const bh = (ht - M.t - M.b) / n;
    const fs = o.fs || 9.5;
    const T = (x, y, t, a = "middle", fill = C.muted, wgt = 400) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${fs}" fill="${fill}" font-weight="${wgt}" text-anchor="${a}" font-family="IBM Plex Sans, Arial, sans-serif">${esc(t)}</text>`;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${wd} ${ht}" width="${wd}" height="${ht}" role="img" aria-label="Population pyramid">`;
    s += T(mid - lab / 2 - 4, 10, "Males", "end", C.ink, 600) + T(mid + lab / 2 + 4, 10, "Females", "start", C.ink, 600);
    for (let i = 0; i < n; i++) {
      const y = ht - M.b - (i + 1) * bh;
      const m = vals[i], fe = vals[n + i];
      s += `<rect x="${(mid - lab / 2 - sxv(m)).toFixed(1)}" y="${(y + 0.6).toFixed(1)}" width="${sxv(m).toFixed(1)}" height="${(bh - 1.2).toFixed(1)}" fill="${C.male}" rx="1"/>`;
      s += `<rect x="${(mid + lab / 2).toFixed(1)}" y="${(y + 0.6).toFixed(1)}" width="${sxv(fe).toFixed(1)}" height="${(bh - 1.2).toFixed(1)}" fill="${C.female}" rx="1"/>`;
      if (i % 2 === 0 || bh > 11) s += T(mid, y + bh / 2 + 3.2, ages[i], "middle", C.muted);
    }
    if (cmp) {
      // outline of the comparison year
      let pm = "", pf = "";
      for (let i = 0; i < n; i++) {
        const y0 = ht - M.b - i * bh, y1 = y0 - bh;
        const xm = mid - lab / 2 - sxv(cmp[i]), xf = mid + lab / 2 + sxv(cmp[n + i]);
        pm += `${i ? "L" : "M"}${xm.toFixed(1)},${y0.toFixed(1)}L${xm.toFixed(1)},${y1.toFixed(1)}`;
        pf += `${i ? "L" : "M"}${xf.toFixed(1)},${y0.toFixed(1)}L${xf.toFixed(1)},${y1.toFixed(1)}`;
      }
      s += `<path d="${pm}" fill="none" stroke="${C.ink}" stroke-width="1.5"/><path d="${pf}" fill="none" stroke="${C.ink}" stroke-width="1.5"/>`;
    }
    [0, top / 2, top].forEach((v) => {
      s += T(mid - lab / 2 - sxv(v), ht - 3, `${+v.toFixed(1)}%`, v === top ? "start" : "middle") + (v ? T(mid + lab / 2 + sxv(v), ht - 3, `${+v.toFixed(1)}%`, v === top ? "end" : "middle") : "");
    });
    return s + `</svg>`;
  }
  function pyramidYears(iso) { return pyramids?.data?.[iso] ? Object.keys(pyramids.data[iso]).map(Number).sort((a, b) => a - b) : []; }
  const PROFILE_KEYS = ["population", "median_age", "pct_0_15", "pct_65plus", "density", "pop_growth"];
  let profKey = "median_age", profYear = null, profCmp = null;
  function profileHTML(r) {
    if (!W) return "";
    const keys = Object.keys(TS).filter((k) => F[k] && F[k].type === "range" && !W.CAT_TS[k] && TS[k][r.iso3] && TS[k][r.iso3].filter((v) => v != null).length >= 2);
    if (!keys.includes(profKey)) profKey = keys.includes("median_age") ? "median_age" : keys[0];
    const ordered = PROFILE_KEYS.filter((k) => keys.includes(k)).concat(keys.filter((k) => !PROFILE_KEYS.includes(k)).sort((a, b) => F[a].label.localeCompare(F[b].label)));
    const dtm = W.latest(r, "dtm_stage");
    return `${keys.length ? `<h4 data-g="development">Changes over time</h4>
      <div class="ptrend"><select id="ptKey" aria-label="Measure to show over time">${ordered.map((k) => `<option value="${k}" ${k === profKey ? "selected" : ""}>${esc(F[k].label)}</option>`).join("")}</select>
      <div id="ptChart" class="ptchart"></div><div class="lkey">${lineKey({ regionName: r.region })}</div>
      <button type="button" class="linkbtn" id="ptOpen">Open in Charts to compare with other areas →</button></div>` : ""}
      <h4 data-g="population">Population structure</h4>
      <div class="ppyr" id="ppyr"><p class="sub">Loading…</p></div>
      ${dtm ? `<p class="sub dtm"><b>Demographic transition:</b> ${esc(dtm)}${r.natural_increase != null ? ` (births ${esc(String(W.latest(r, "birth_rate")))}, deaths ${esc(String(W.latest(r, "death_rate")))} per 1,000 people)` : ""}.</p>` : ""}`;
  }
  function bindProfile(el, r) {
    const ch = $("#ptChart", el);
    if (ch) {
      const draw = () => { ch.innerHTML = lineChartSVG(r.iso3, profKey, { w: 300, h: 150 }) || `<p class="sub">Not enough data.</p>`; };
      draw();
      $("#ptKey", el).onchange = (e) => { profKey = e.target.value; draw(); };
      $("#ptOpen", el).onclick = () => { V.trend.key = profKey; V.trend.type = "line"; V.trend.agg = null; if (!V.trend.pins.includes(r.iso3)) { if (!V.trend.pins.length) V.trend.conts = false; V.trend.pins = V.trend.pins.concat(r.iso3).slice(-6); } W.setView("trends"); };
    }
    const box = $("#ppyr", el);
    loadPyramids().then((P) => {
      if (!box.isConnected) return;
      const yrs = pyramidYears(r.iso3);
      if (!P || !yrs.length) { box.innerHTML = `<p class="sub">No age data for this area.</p>`; return; }
      if (!yrs.includes(profYear)) profYear = yrs[yrs.length - 1];
      if (profCmp != null && !yrs.includes(profCmp)) profCmp = null;
      const draw = () => {
        box.innerHTML = `<div class="pyrctl"><label>Year <select id="pyY">${yrs.slice().reverse().map((y) => `<option ${y === profYear ? "selected" : ""}>${y}</option>`).join("")}</select></label>
          <label>Outline <select id="pyC"><option value="">none</option>${yrs.slice().reverse().filter((y) => y !== profYear).map((y) => `<option ${y === profCmp ? "selected" : ""}>${y}</option>`).join("")}</select></label></div>
          ${pyramidSVG(P.data[r.iso3][profYear], P.ages, { w: 300, h: 220, compare: profCmp ? P.data[r.iso3][profCmp] : null })}
          <p class="sub">Each bar is the share of the whole population in that age group${profCmp ? `; the black outline shows ${profCmp}` : ""}.</p>`;
        $("#pyY", box).onchange = (e) => { profYear = +e.target.value; draw(); };
        $("#pyC", box).onchange = (e) => { profCmp = e.target.value ? +e.target.value : null; draw(); };
      };
      draw();
    });
  }

  // ======================= Side by side =======================
  let sbsIsos = [];
  const sbsHidden = new Set();
  function openSideBySide(iso) {
    if (!W) return;
    if (iso && !sbsIsos.includes(iso)) sbsIsos = [iso].concat(sbsIsos).slice(0, 3);
    if (!sbsIsos.length) sbsIsos = [W.state.selected || "GBR", "FRA"].filter((x, i, a) => W.byIso.has(x) && a.indexOf(x) === i);
    if (sbsIsos.length < 2) sbsIsos.push(sbsIsos[0] === "FRA" ? "DEU" : "FRA");
    drawSideBySide();
    $("#sbs").hidden = false;
    document.body.classList.add("sbs-open");
  }
  function closeSideBySide() { $("#sbs").hidden = true; document.body.classList.remove("sbs-open"); }
  function drawSideBySide() {
    const el = $("#sbs");
    const cs = sbsIsos.map((i) => W.byIso.get(i)).filter(Boolean);
    const opts = (sel, blank) => (blank ? `<option value="">— none —</option>` : "") + W.rows.slice().sort((a, b) => a.name.localeCompare(b.name)).map((r) => `<option value="${r.iso3}" ${r.iso3 === sel ? "selected" : ""}>${esc(r.name)}</option>`).join("");
    const cols = ["--s1", "--s2", "--s3"];
    const sov = W.rows.filter((r) => r.sovereign);
    const strip = (f, vals) => {
      const ws = sov.map((r) => W.latest(r, f.key)).filter((v) => typeof v === "number" && (f.scale !== "log" || v > 0));
      if (ws.length < 5 || vals.every((v) => v == null)) return "";
      const log = f.scale === "log";
      const sx = (log ? d3.scaleLog() : d3.scaleLinear()).domain(d3.extent(ws)).range([4, 116]).clamp(true);
      const med = d3.median(ws);
      return `<svg viewBox="0 0 120 16" width="120" height="16" aria-hidden="true"><line x1="4" x2="116" y1="8" y2="8" stroke="${css("--line")}" stroke-width="3" stroke-linecap="round"/><line x1="${sx(med)}" x2="${sx(med)}" y1="2" y2="14" stroke="${css("--muted")}" stroke-width="1.5"/>${vals.map((v, i) => (v == null || (log && v <= 0) ? "" : `<circle cx="${sx(v).toFixed(1)}" cy="8" r="4.2" fill="${css(cols[i])}" stroke="${css("--surface")}" stroke-width="1.2"/>`)).join("")}</svg>`;
    };
    const show = (f, r) => {
      const v = W.latest(r, f.key);
      if (v == null || v === "") return "<span class='nd'>—</span>";
      if (f.type === "range") return esc(W.fmtFull(f, v));
      if (f.type === "bool") return v ? "Yes" : "No";
      if (Array.isArray(v)) return v.length ? esc(v.slice(0, 6).join(", ") + (v.length > 6 ? ` +${v.length - 6} more` : "")) : "none";
      return esc(String(v));
    };
    const sections = window.THEMES.filter((t) => !sbsHidden.has(t.id)).flatMap((t) => t.groups).map((g) => {
      const fs = W.FILTERS.filter((f) => f.group === g && !f.hidden && !f.target);
      const rowsH = fs.map((f) => {
        if (cs.every((r) => { const v = W.latest(r, f.key); return v == null || (Array.isArray(v) && !v.length); })) return "";
        const nums = cs.map((r) => (f.type === "range" ? W.latest(r, f.key) : null));
        return `<tr><th scope="row">${esc(f.label)}</th>${cs.map((r) => `<td>${show(f, r)}</td>`).join("")}<td class="pos">${f.type === "range" ? strip(f, nums) : ""}</td></tr>`;
      }).join("");
      return rowsH ? `<tbody><tr class="gh" data-g="${W.gslug(g)}"><th colspan="${cs.length + 2}">${esc(g)}</th></tr>${rowsH}</tbody>` : "";
    }).join("");
    el.innerHTML = `<div class="ff-bar">
        <div class="sbs-pick">${[0, 1, 2].map((i) => `<label><span class="sw" style="background:var(${cols[i]})"></span><select data-i="${i}" aria-label="Area ${i + 1}">${opts(sbsIsos[i], i === 2)}</select></label>`).join("")}</div>
        <div class="ff-actions"><button type="button" class="primary" id="sbsPrint">Print or save as PDF</button><button type="button" class="ghost" id="sbsClose">Close</button></div></div>
      <div class="secchips" role="group" aria-label="Sections to include"><span class="sclab">Include:</span>${window.THEMES.map((t) => sbsHidden.has(t.id)
        ? `<button type="button" class="secchip off" data-sec="${t.id}" title="Add ${esc(t.label)} back">+ ${esc(t.label)}</button>`
        : `<button type="button" class="secchip" data-sec="${t.id}" title="Leave ${esc(t.label)} out">${esc(t.label)} <span aria-hidden="true">✕</span></button>`).join("")}${sbsHidden.size ? `<button type="button" class="linkbtn allon">Put everything back</button>` : ""}</div>
      <div class="ff-scroll"><article class="ffdoc sbsdoc">
        <header class="ff-head"><h1>${cs.map((r) => `${r.flag || ""} ${esc(r.name)}`).join(" <span class='vs'>vs</span> ")}</h1>
        <p class="ff-sub">Every measure on Which Places?, side by side. The strip shows where each area sits among all areas, lowest to highest; the grey tick is the UK median.</p></header>
        <table class="sbs-table"><thead><tr><th>Measure</th>${cs.map((r, i) => `<th><span class="sw" style="background:var(${cols[i]})"></span>${esc(r.name)}</th>`).join("")}<th class="pos">Position</th></tr></thead>${sections}</table>
        <p class="ff-foot">Latest figures for each measure. Sources are listed in each filter and in the area factfiles.</p>
      </article></div>`;
    $$(".sbs-pick select", el).forEach((s) => (s.onchange = () => {
      const i = +s.dataset.i;
      sbsIsos[i] = s.value || undefined;
      sbsIsos = sbsIsos.filter(Boolean);
      drawSideBySide();
    }));
    $("#sbsClose").onclick = closeSideBySide;
    $$(".secchips [data-sec]", el).forEach((b) => (b.onclick = () => { const id = b.dataset.sec; sbsHidden.has(id) ? sbsHidden.delete(id) : sbsHidden.add(id); const sc = $(".ff-scroll", el).scrollTop; drawSideBySide(); $(".ff-scroll", el).scrollTop = sc; }));
    $(".secchips .allon", el)?.addEventListener("click", () => { sbsHidden.clear(); drawSideBySide(); });
    $("#sbsPrint").onclick = () => { const t = document.title; document.title = cs.map((r) => r.name).join(" vs "); window.print(); document.title = t; };
  }

  // ======================= Share and tasks =======================
  // A teacher can add a task and up to five questions. Students see them at the top of the page, can type answers
  // (kept in their browser), then copy them, email them to the teacher, or open the teacher's Google Form.
  V.qs ||= []; V.qform ||= ""; V.qmail ||= "";
  function shareURL(task, extra) {
    const p = new URLSearchParams(location.search);
    ["task", "tq", "tform", "tmail", "embed"].forEach((k) => p.delete(k));
    const o = extra || (task === undefined ? { qs: V.qs, form: V.qform, mail: V.qmail } : { qs: [], form: "", mail: "" });
    if (task) p.set("task", task);
    (o.qs || []).filter(Boolean).slice(0, 5).forEach((q) => p.append("tq", q));
    if (o.form) p.set("tform", o.form);
    if (o.mail) p.set("tmail", o.mail);
    const q = p.toString();
    let base = location.href.split("?")[0].split("#")[0];
    if (!/^https?:/.test(base)) base = W.SITE?.url || base;
    return base + (q ? "?" + q : "");
  }
  function openShare() {
    const el = $("#share");
    const qs = V.qs.concat(["", "", "", "", ""]).slice(0, 5);
    el.innerHTML = `<div class="panel share" role="dialog" aria-modal="true" aria-labelledby="shareH">
      <button type="button" class="iconbtn close" id="shareClose" aria-label="Close">×</button>
      <h2 id="shareH">Share this view</h2>
      <p class="sub">The link opens exactly what you see now: the filters, the year, the map style or chart, and the area you have open.</p>
      <label class="fld"><span>A task or introduction for students (optional)</span>
        <textarea id="shareTask" rows="2" maxlength="400" placeholder="e.g. Look at how fertility rates have changed since 1990.">${esc(V.task || "")}</textarea></label>
      <details class="shq" ${V.qs.length ? "open" : ""}><summary>Add questions for students to answer (up to 5)</summary>
        ${qs.map((q, i) => `<label class="fld"><span>Question ${i + 1}</span><input class="shq-q" maxlength="300" value="${esc(q)}" placeholder="${["e.g. Which region has the fastest-falling fertility rate?", "e.g. Name two areas that don't fit the pattern.", "e.g. Suggest two reasons for the pattern.", "", ""][i]}"></label>`).join("")}
        <label class="fld"><span>Your email, so students can send you their answers (optional)</span><input id="shqMail" type="email" maxlength="120" value="${esc(V.qmail)}" placeholder="teacher@school.org"></label>
        <label class="fld"><span>Or a Google Form (or Microsoft Form) for their answers (optional)</span><input id="shqForm" type="url" maxlength="300" value="${esc(V.qform)}" placeholder="https://forms.gle/…"></label>
        <p class="sub">Students type their answers under each question. Their answers stay on their own device until they copy them, email them to you, or paste them into your form.</p>
      </details>
      <label class="fld"><span>Link</span><div class="copyrow"><input id="shareLink" readonly><button type="button" class="primary" id="shareCopy">Copy link</button></div></label>
      <p class="sub" id="shareMsg">Students who open the link see the task and questions at the top of the page.</p>
    </div>`;
    el.hidden = false;
    const read = () => ({ qs: [...el.querySelectorAll(".shq-q")].map((x) => x.value.trim()).filter(Boolean), form: /^https:\/\//.test($("#shqForm").value.trim()) ? $("#shqForm").value.trim() : "", mail: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test($("#shqMail").value.trim()) ? $("#shqMail").value.trim() : "" });
    const upd = () => { $("#shareLink").value = shareURL($("#shareTask").value.trim(), read()); };
    upd();
    el.querySelectorAll("textarea, input:not(#shareLink)").forEach((x) => (x.oninput = upd));
    $("#shareCopy").onclick = async () => {
      const inp = $("#shareLink");
      try { await navigator.clipboard.writeText(inp.value); $("#shareMsg").textContent = "Copied. Paste it into an email, your class page or a slide."; }
      catch (e) { inp.select(); $("#shareMsg").textContent = "Press Ctrl+C (or ⌘C) to copy the selected link."; }
    };
    $("#shareClose").onclick = () => (el.hidden = true);
    el.onclick = (e) => { if (e.target === el) el.hidden = true; };
  }
  const ansKey = () => "wc-ans-" + [V.task, ...V.qs].join("|").split("").reduce((h, c) => ((h * 31 + c.charCodeAt(0)) | 0), 7);
  function loadAns() { try { return JSON.parse(localStorage.getItem(ansKey()) || "{}"); } catch (e) { return {}; } }
  function saveAns(a) { try { localStorage.setItem(ansKey(), JSON.stringify(a)); } catch (e) { /* private mode */ } }
  function renderTask() {
    const el = $("#task");
    if (!el) return;
    const has = V.task || V.qs.length;
    el.hidden = !has;
    if (!has) return;
    el.innerHTML = `<span class="tk">📝 <b>Task:</b> ${esc(V.task || "Answer the questions.")}</span>${V.qs.length ? `<button type="button" class="primary tkq" id="taskQs">✍️ ${V.qs.length} question${V.qs.length > 1 ? "s" : ""}</button>` : ""}<button type="button" class="iconbtn" id="taskClose" aria-label="Hide the task">×</button>`;
    $("#taskClose").onclick = () => { V.task = ""; V.qs = []; V.qform = ""; V.qmail = ""; renderTask(); W.render(); };
    if ($("#taskQs")) $("#taskQs").onclick = openAnswers;
  }
  function openAnswers() {
    let el = $("#ansCard");
    if (!el) { el = document.createElement("div"); el.id = "ansCard"; el.className = "card dsc ans"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Questions"); document.body.appendChild(el); }
    el.hidden = false;
    const a = loadAns();
    el.innerHTML = `<div class="dsc-head"><h2>✍️ Your answers</h2><button type="button" class="iconbtn" id="ansX" aria-label="Close">×</button></div>
      ${V.task ? `<p>${esc(V.task)}</p>` : ""}
      <label class="fld"><span>Your name</span><input id="ansName" maxlength="80" value="${esc(a.name || "")}"></label>
      ${V.qs.map((q, i) => `<label class="fld ansq"><span><b>${i + 1}.</b> ${esc(q)}</span><textarea data-i="${i}" rows="3">${esc(a["q" + i] || "")}</textarea></label>`).join("")}
      <p class="hint">You can change the map or chart while you answer: your answers are kept on this device.</p>
      <div class="dsc-row">
        <button type="button" class="primary" id="ansCopy">Copy my answers</button>
        ${V.qmail ? `<a class="ghost btnlink" id="ansMail" href="#">Email them to my teacher</a>` : ""}
        ${V.qform ? `<a class="ghost btnlink" href="${esc(V.qform)}" target="_blank" rel="noopener" id="ansForm">Open the answer form ↗</a>` : ""}
      </div>
      ${V.qform ? `<p class="hint">Copy your answers first, then paste them into the form.</p>` : ""}`;
    const text = () => {
      const x = loadAns();
      return [`Name: ${x.name || ""}`, V.task ? `Task: ${V.task}` : "", ...V.qs.map((q, i) => `${i + 1}. ${q}\n${x["q" + i] || ""}\n`), `Map/chart: ${shareURL()}`].filter(Boolean).join("\n");
    };
    el.querySelectorAll("textarea, #ansName").forEach((t) => (t.oninput = () => { const x = loadAns(); if (t.id === "ansName") x.name = t.value; else x["q" + t.dataset.i] = t.value; saveAns(x); }));
    $("#ansX").onclick = () => (el.hidden = true);
    $("#ansCopy").onclick = async (e) => { try { await navigator.clipboard.writeText(text()); e.target.textContent = "Copied ✓"; } catch (er) { prompt("Copy your answers:", text()); } };
    if ($("#ansMail")) $("#ansMail").onclick = (e) => { e.preventDefault(); location.href = `mailto:${encodeURIComponent(V.qmail)}?subject=${encodeURIComponent("My answers" + (loadAns().name ? " – " + loadAns().name : ""))}&body=${encodeURIComponent(text())}`; };
  }

  // ======================= Downloads =======================
  function download(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function downloadCSV(rows, name) {
    const q = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    download(new Blob(["﻿" + rows.map((r) => r.map(q).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }), name);
  }
  const STYLE_PROPS = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-opacity", "opacity", "font-size", "font-weight", "font-family", "text-anchor", "paint-order", "display", "visibility", "stroke-linecap", "stroke-linejoin"];
  // Copy an on-screen SVG with its computed styles, so it looks the same as an image
  function inlineSVG(src) {
    const clone = src.cloneNode(true);
    const a = [src, ...src.querySelectorAll("*")], b = [clone, ...clone.querySelectorAll("*")];
    a.forEach((n, i) => {
      if (!(n instanceof SVGElement)) return;
      const cs = getComputedStyle(n);
      b[i].setAttribute("style", STYLE_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(";"));
    });
    return clone;
  }
  async function svgToCanvas(svgEl, scale = 2, bg) {
    const vb = (svgEl.getAttribute("viewBox") || `0 0 ${svgEl.clientWidth} ${svgEl.clientHeight}`).split(/[\s,]+/).map(Number);
    const clone = inlineSVG(svgEl);
    // a picture can't use the page's flag font, so leave flags out of downloads
    clone.querySelectorAll("text, tspan").forEach((t) => { if (!t.children.length) t.textContent = t.textContent.replace(/[\u{1F1E6}-\u{1F1FF}]{2}\s?/gu, ""); });
    clone.setAttribute("width", vb[2]); clone.setAttribute("height", vb[3]);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    const img = new Image();
    await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = url; });
    const cv = document.createElement("canvas");
    cv.width = vb[2] * scale; cv.height = vb[3] * scale;
    const ctx = cv.getContext("2d");
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, cv.width, cv.height); }
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    return cv;
  }
  // The chart or map with a title above and the source below
  async function downloadImage() {
    const view = W.state.view;
    const svgEl = view === "map" ? W.mapSVG() : $("#vsvg");
    if (!svgEl) return;
    const scale = 2;
    const chart = await svgToCanvas(svgEl, scale, view === "map" ? css("--ocean") : css("--surface"));
    // notes drawn on top (arrows, circles, text) go into the picture too
    const ann = document.getElementById("annSvg");
    if (ann && ann.querySelector("g.items > *")) { const ac = await svgToCanvas(ann, scale); chart.getContext("2d").drawImage(ac, 0, 0, chart.width, chart.height); }
    // charts that draw their own title (the bubble chart) don't need a second one
    const title = view === "map" ? (document.querySelector("#sentence")?.textContent || "Map").trim() : svgEl.querySelector("text.ctitle") ? "" : V.title || "";
    const pad = 20 * scale, titleH = (title ? 44 : 12) * scale;
    const src = currentSource();
    const footLines = [];
    {
      const m = document.createElement("canvas").getContext("2d");
      m.font = `${11 * scale}px "IBM Plex Sans", Arial, sans-serif`;
      let cur = "";
      for (const w of src.split(" ")) { const t = cur ? cur + " " + w : w; if (m.measureText(t).width > chart.width && cur) { footLines.push(cur); cur = w; } else cur = t; }
      if (cur) footLines.push(cur);
    }
    const footH = (30 + 15 * footLines.slice(0, 4).length) * scale;
    const cv = document.createElement("canvas");
    cv.width = chart.width + pad * 2; cv.height = chart.height + titleH + footH;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = css("--surface"); ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = css("--ink");
    ctx.font = `600 ${17 * scale}px "IBM Plex Sans", Arial, sans-serif`;
    const words = title.split(" "); let lineTxt = "", lines = [];
    for (const w of words) { const t = lineTxt ? lineTxt + " " + w : w; if (ctx.measureText(t).width > cv.width - pad * 2 && lineTxt) { lines.push(lineTxt); lineTxt = w; } else lineTxt = t; }
    lines.push(lineTxt); lines = lines.slice(0, 2);
    if (lines.length > 1) ctx.font = `600 ${14 * scale}px "IBM Plex Sans", Arial, sans-serif`;
    lines.forEach((l, i) => ctx.fillText(l, pad, (lines.length > 1 ? 18 + i * 18 : 28) * scale));
    ctx.drawImage(chart, pad, titleH);
    ctx.fillStyle = css("--muted");
    ctx.font = `${11 * scale}px "IBM Plex Sans", Arial, sans-serif`;
    footLines.slice(0, 4).forEach((l, i) => ctx.fillText(l, pad, titleH + chart.height + (16 + i * 15) * scale));
    ctx.fillText(`Made with Which Places? · ${(W.SITE?.url || location.host || "").replace(/^https?:\/\//, "")}`, pad, cv.height - 9 * scale);
    cv.toBlob((b) => download(b, `which-areas-${view}.png`), "image/png");
  }
  function dataRows() {
    const view = W.state.view;
    if (view !== "map") return V.csv ? V.csv() : null;
    return W.styleInfo ? W.styleInfo.csv() : W.resultsCSV();
  }
  function openDownloadMenu(btn) {
    let m = $("#dlMenu");
    if (m) { m.remove(); return; }
    m = document.createElement("div");
    m.id = "dlMenu"; m.className = "dlmenu card";
    const what = W.state.view === "map" ? "map" : "chart";
    m.innerHTML = `<p class="dl-h">Image</p>
      <button type="button" data-a="png">This ${what} as a picture (PNG)</button>
      <button type="button" data-a="svg">This ${what} for editing (SVG)</button>
      <button type="button" data-a="notes">Add arrows, circles and notes first…</button>
      ${W.state.view === "map" ? `<button type="button" data-a="cw">Coursework map (A4, with key and north arrow)</button>` : ""}
      <p class="dl-h">Data</p>
      <button type="button" data-a="csv">The data shown (CSV, opens in Excel)</button>
      <button type="button" data-a="all">Every measure for these areas (CSV)</button>
      <p class="dl-h">Cite and share</p>
      <button type="button" data-a="cite">Copy a reference for this ${what}</button>
      <button type="button" data-a="embed">Embed this ${what} in a website or Google Classroom</button>
      <button type="button" data-a="about">About this data: sources and definitions</button>
      <p class="dl-note">All data is free to reuse with credit to the original sources (see Sources &amp; methods).</p>`;
    btn.after(m);
    m.querySelectorAll("button").forEach((b) => (b.onclick = async () => {
      m.remove();
      const a = b.dataset.a;
      if (a === "cw") window.WMS?.courseworkDialog();
      else if (a === "embed") window.WAB?.embedDialog();
      else if (a === "notes") window.WLN?.startNotes();
      else if (a === "about") window.WAB?.open();
      else if (a === "png") downloadImage().catch(() => alertMsg("Sorry, the image could not be made in this browser."));
      else if (a === "svg") downloadSVG();
      else if (a === "all") downloadCSV(allMeasuresRows(), `which-areas-all-measures.csv`);
      else if (a === "cite") {
        const t = citation();
        try { await navigator.clipboard.writeText(t); alertMsg("Reference copied: " + t); } catch (e) { prompt("Copy this reference:", t); }
      } else { const rows = dataRows(); if (rows) { const s = currentSource(); downloadCSV(s ? rows.concat([[], [s]]) : rows, `which-areas-${W.state.view}.csv`); } }
    }));
    setTimeout(() => document.addEventListener("click", function off(e) { if (!m.contains(e.target) && e.target !== btn) { m.remove(); document.removeEventListener("click", off); } }), 0);
  }
  function alertMsg(t) { const s = $("#sentence"); if (s) s.textContent = t; }
  // the map or chart as an SVG file, with its styles written in, for editing in PowerPoint, Inkscape, Illustrator…
  function downloadSVG() {
    const svgEl = W.state.view === "map" ? W.mapSVG() : $("#vsvg");
    if (!svgEl) return;
    const clone = inlineSVG(svgEl);
    const vb = (svgEl.getAttribute("viewBox") || `0 0 ${svgEl.clientWidth} ${svgEl.clientHeight}`).split(/[\s,]+/).map(Number);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg"); clone.setAttribute("width", vb[2]); clone.setAttribute("height", vb[3]);
    if (W.state.view === "map") { const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect"); bg.setAttribute("width", "100%"); bg.setAttribute("height", "100%"); bg.setAttribute("fill", css("--ocean")); clone.insertBefore(bg, clone.firstChild); }
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title"); title.textContent = citation(); clone.insertBefore(title, clone.firstChild);
    const ann = document.getElementById("annSvg");
    if (ann && ann.querySelector("g.items > *")) { const a = inlineSVG(ann); [...a.childNodes].forEach((n) => clone.appendChild(n)); }
    download(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }), `which-areas-${W.state.view}.svg`);
  }
  // every measure (latest figures, or the chosen year) for the countries on the map
  function allMeasuresRows() {
    const list = (W.matches && W.matches.length ? W.matches : W.pool()).slice().sort((a, b) => a.name.localeCompare(b.name));
    const fs = W.FILTERS.filter((f) => !f.target && !f.hidden && f.type !== "bool" && list.some((r) => r[f.key] != null));
    const cell = (v) => (Array.isArray(v) ? v.join("; ") : typeof v === "boolean" ? (v ? "Yes" : "No") : v ?? "");
    return [["Area", "ISO code", "Region", "Region", ...fs.map((f) => f.label)],
      ...list.map((r) => [r.name, r.iso3, r.region, r.subregion, ...fs.map((f) => cell(r[f.key]))]),
      [], ["Figures are the latest for each measure" + (W.state.year ? ` (yearly measures: ${W.state.year})` : "") + ". Sources: see Sources & methods on the site."]];
  }
  function citation() {
    const title = W.state.view === "map" ? ($("#sentence")?.textContent || "Map").replace(/Clear all$/, "").trim() : V.title || "Chart";
    const d = new Date();
    return `Which Places? (${d.getFullYear()}). ${title} Data: ${currentSource() || "see Sources & methods"} ${location.href.split("#")[0]} (accessed ${d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}).`;
  }

  // ======================= Link state =======================
  function encode(p) {
    const st = W?.state;
    if (!st) return;
    const c = V.cmp;
    if (st.view === "compare") {
      p.set("cx", c.x); p.set("cy", c.y); p.set("cz", c.size || "none");
      if (c.colour !== "region") p.set("cc", c.colour);
      const lg = (isLog(c.x, c.logx) ? "x" : "") + (isLog(c.y, c.logy) ? "y" : "");
      p.set("cl", lg || "-");
      if (c.year) p.set("cyr", c.year);
      if (c.pins.length) p.set("cp", c.pins.join("."));
      if (!c.fit) p.set("cf", "0");
      if (!c.only) p.set("co", "0");
      if (c.labs) p.set("clb", c.labs);
    } else if (st.view === "rank") {
      p.set("rk", V.rank.key || defaultKey());
      if (V.rank.mode !== "bars") p.set("rm", V.rank.mode);
      if (V.rank.year) p.set("ry", V.rank.year);
      if (V.rank.only) p.set("ro", "1");
    } else if (st.view === "trends") {
      p.set("tk", V.trend.key);
      if (V.trend.pins.length) p.set("tp", V.trend.pins.join("."));
      const fl = (V.trend.world ? "w" : "") + (V.trend.conts ? "c" : "") + (V.trend.matches ? "m" : "");
      if (fl !== "wc") p.set("tf", fl || "-");
      if (V.trend.log != null) p.set("tl", V.trend.log ? "1" : "0");
      if (V.trend.labs) p.set("tlb", V.trend.labs);
      window.WCH?.encode(p);
    } else if (st.view === "insights") window.WIN?.encode(p);
    if (V.task) p.set("task", V.task);
    V.qs.forEach((q) => p.append("tq", q));
    if (V.qform) p.set("tform", V.qform);
    if (V.qmail) p.set("tmail", V.qmail);
  }
  function decode(p) {
    const F0 = Object.fromEntries((window.FILTERS || []).map((f) => [f.key, f]));
    const ok = (k) => k && F0[k] && F0[k].type === "range";
    const c = V.cmp;
    if (ok(p.get("cx"))) c.x = p.get("cx");
    if (ok(p.get("cy"))) c.y = p.get("cy");
    if (p.get("cz")) c.size = p.get("cz") === "none" ? "" : ok(p.get("cz")) ? p.get("cz") : c.size;
    if (COLOUR_KEYS.some(([k]) => k === p.get("cc"))) c.colour = p.get("cc");
    if (p.get("cl")) { const l = p.get("cl"); c.logx = l.includes("x"); c.logy = l.includes("y"); }
    if (+p.get("cyr")) c.year = +p.get("cyr");
    if (p.get("cp")) c.pins = p.get("cp").split(".").filter((x) => /^[A-Z]{3}$/.test(x)).slice(0, 8);
    c.fit = p.get("cf") !== "0";
    c.only = p.get("co") !== "0";
    c.labs = ["name", "code"].includes(p.get("clb")) ? p.get("clb") : "";
    if (ok(p.get("rk"))) V.rank.key = p.get("rk");
    if (p.get("rm") === "cont") V.rank.mode = "cont";
    if (+p.get("ry")) V.rank.year = +p.get("ry");
    V.rank.only = p.get("ro") === "1";
    if (ok(p.get("tk"))) V.trend.key = p.get("tk");
    if (p.get("tp")) V.trend.pins = p.get("tp").split(".").filter((x) => /^[A-Z]{3}$/.test(x)).slice(0, 6);
    V.trend.labs = ["name", "code"].includes(p.get("tlb")) ? p.get("tlb") : "";
    if (p.get("tf")) { const t = p.get("tf"); V.trend.world = t.includes("w"); V.trend.conts = t.includes("c"); V.trend.matches = t.includes("m"); }
    if (p.get("tl")) V.trend.log = p.get("tl") === "1";
    if (p.get("v") === "trends") window.WCH?.decode(p);
    if (p.get("v") === "insights") window.WIN?.decode(p);
    V.task = (p.get("task") || "").slice(0, 400);
    V.qs = p.getAll("tq").map((q) => q.slice(0, 300)).filter(Boolean).slice(0, 5);
    V.qform = /^https:\/\//.test(p.get("tform") || "") ? p.get("tform").slice(0, 300) : "";
    V.qmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.get("tmail") || "") ? p.get("tmail").slice(0, 120) : "";
  }

  function init() {
    W = window.WC;
    F = W.F;
    pyramids ||= window.__PYRAMIDS__ || null;
    followFilters();
    W.SITE = window.SITE || {};
    F = W.F; TS = W.TS; TS_YEARS = W.TS_YEARS; esc = W.esc; fmtShort = W.fmtShort;
    renderTask();
    $("#sbsBtn").onclick = () => openSideBySide(W.state.selected);
    $("#shareBtn").onclick = openShare;
    const dl = document.createElement("button");
    dl.type = "button"; dl.id = "dlBtn"; dl.className = "cp-tool"; dl.innerHTML = `<span class="cp-ic" aria-hidden="true">⬇</span>Download`;
    dl.title = "Download this map or chart as an image, or its data as a spreadsheet";
    $("#shareBtn").after(dl);
    dl.onclick = () => openDownloadMenu(dl);
    let t = 0;
    new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => { if (W.state.view !== "map" && !playTimer) render(); }, 60); }).observe($("#viewwrap"));
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!$("#sbs").hidden) closeSideBySide();
      if (!$("#share").hidden) $("#share").hidden = true;
    });
  }
  function highlight(iso, on) {
    if (!W || W.state.view === "map") return;
    d3.selectAll(`#vsvg [data-iso="${iso}"]`).classed("hl", on);
  }

  // open Rankings on a measure, with a country picked out
  function showRank(key, iso) {
    V.rank.key = key; V.rank.mode = "bars"; V.rank.year = null; V.rank.only = false;
    if (iso) W.state.selected = iso;
    if (W.state.view === "rank") { V.built = null; W.render(); } else W.setView("rank");
  }
  // for the Back button: the chart settings as plain data, and back again
  function snapshot() { const { built, ...rest } = V; return JSON.parse(JSON.stringify(rest)); }
  function restore(o) { if (!o) return; stopPlay(); Object.assign(V.cmp, o.cmp); Object.assign(V.rank, o.rank); Object.assign(V.trend, o.trend); V.task = o.task || ""; V.qs = o.qs || []; V.qform = o.qform || ""; V.qmail = o.qmail || ""; }
  function clearYears() { stopPlay(); V.cmp.year = null; V.cmp.pins = []; V.cmp.focus = null; V.cmp.zt = null; V.trend.year = null; V.trend.from = null; V.trend.pins = []; V.rank.year = null; }
  window.WV = { downloadImage, openDownloadMenu, srcKeys, shareURL, clearYears, currentSource, sourceText, init, showRank, snapshot, restore, render, encode, decode, profileHTML, bindProfile, highlight, openSideBySide, lineChartSVG, pyramidSVG, loadPyramids, medianSeries, svgToCanvas, lineKey, get pyramids() { return pyramids; } };
})();
