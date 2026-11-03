/* Explore:
   - Live hazards: this week's earthquakes (USGS) and current disaster alerts (GDACS: tropical storms, volcanoes, floods, droughts) on the map.
   - Build your own index: pick measures, weight them, and see how the ranking changes; colour the map by it.
   - Compare two years: a swipe map with one year on the left and another on the right. */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  let W;
  const ago = (t) => { const m = (Date.now() - t) / 6e4; return m < 60 ? `${Math.max(1, Math.round(m))} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} day${Math.round(m / 1440) > 1 ? "s" : ""} ago`; };

  // ====================== Live hazards ======================
  const L = { on: false, period: store.get("wc-live-period", "week"), quakes: [], alerts: [], err: {}, at: 0, loading: false };
  const USGS = { day: "4.5_day", week: "4.5_week", month: "4.5_month" };
  const DAYS = { day: 1, week: 7, month: 30 };
  const GD = { TC: ["🌀", "Tropical storm"], VO: ["🌋", "Volcano"], FL: ["🌊", "Flood"], DR: ["🏜️", "Drought"], WF: ["🔥", "Wildfire"], EQ: ["⚠️", "Earthquake"] };
  async function load() {
    L.loading = true; L.err = {}; panel();
    const day = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
    const q = fetch(`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${USGS[L.period]}.geojson`).then((r) => r.json()).then((j) => {
      L.quakes = (j.features || []).map((f) => ({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], depth: f.geometry.coordinates[2], mag: f.properties.mag, place: f.properties.place || "", time: f.properties.time, url: f.properties.url, tsunami: f.properties.tsunami }))
        .filter((x) => Number.isFinite(x.mag)).sort((a, b) => b.mag - a.mag);
    }).catch(() => { L.err.usgs = true; L.quakes = []; });
    const g = fetch(`https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC;VO;FL;DR;WF&fromdate=${day(Math.max(DAYS[L.period], 7))}&todate=${day(-1)}`).then((r) => r.json()).then((j) => {
      L.alerts = (j.features || []).map((f) => {
        const p = f.properties || {}, c = f.geometry?.type === "Point" ? f.geometry.coordinates : d3.geoCentroid(f);
        return { type: p.eventtype, name: p.name || p.eventname || GD[p.eventtype]?.[1] || "Alert", level: p.episodealertlevel || p.alertlevel || "", lon: c[0], lat: c[1],
          country: p.country || "", from: p.fromdate, to: p.todate, url: p.url?.report || p.url?.details || "https://www.gdacs.org/", desc: p.description || "" };
      }).filter((a) => GD[a.type] && Number.isFinite(a.lon));
      // one marker per event
      const seen = new Set(); L.alerts = L.alerts.filter((a) => { const k = a.type + a.name + a.country; if (seen.has(k)) return false; seen.add(k); return true; });
    }).catch(() => { L.err.gdacs = true; L.alerts = []; });
    await Promise.all([q, g]);
    L.loading = false; L.at = Date.now();
    draw(); panel();
  }
  const depthCol = (d) => (d < 70 ? "#d6453d" : d < 300 ? "#f2a541" : "#3b7dd8");
  const lvlCol = (l) => ({ Red: "#d6453d", Orange: "#f2a541", Green: "#2e9d55" }[l] || "#7a5cd6");
  function draw() {
    const g = W.layer("live");
    g.style("display", L.on && W.state.view === "map" ? null : "none");
    if (!L.on) return;
    const k = W.k || 1;
    const qs = L.quakes.map((x) => ({ ...x, p: W.project(x.lon, x.lat) })).filter((x) => x.p);
    g.selectAll("circle.lq").data(qs.slice().reverse(), (d) => d.time + d.place).join("circle").attr("class", "lq")
      .attr("cx", (d) => d.p[0]).attr("cy", (d) => d.p[1]).attr("r", (d) => Math.max(2, (d.mag - 4) * 3.2) / k)
      .attr("fill", (d) => depthCol(d.depth)).attr("fill-opacity", 0.55).attr("stroke", "#fff").attr("stroke-width", 0.8 / k)
      .attr("data-base", (d) => `M${d.mag.toFixed(1)} earthquake · ${d.place} · ${Math.round(d.depth)} km deep · ${ago(d.time)}`);
    const as = L.alerts.map((a) => ({ ...a, p: W.project(a.lon, a.lat) })).filter((a) => a.p);
    g.selectAll("text.la").data(as, (d) => d.type + d.name).join("text").attr("class", "la")
      .attr("x", (d) => d.p[0]).attr("y", (d) => d.p[1]).attr("text-anchor", "middle").attr("dominant-baseline", "central")
      .attr("font-size", 15 / k).attr("stroke", (d) => lvlCol(d.level)).attr("stroke-width", 2.4 / k).attr("paint-order", "stroke")
      .text((d) => GD[d.type][0]).attr("data-base", (d) => `${GD[d.type][1]}: ${d.name}${d.country ? ` · ${d.country}` : ""} · ${d.level || ""} alert`);
    g.raise();
  }
  function panel() {
    let el = $("#liveCard");
    if (!el) { el = document.createElement("div"); el.id = "liveCard"; el.className = "card livecard"; $("#mapstage").appendChild(el); }
    el.hidden = !L.on || W.state.view !== "map";
    $("#liveBtn")?.setAttribute("aria-pressed", String(L.on));
    if (el.hidden) return;
    const n = L.quakes.length, big = L.quakes.filter((q) => q.mag >= 6).length;
    const by = d3.rollups(L.alerts, (v) => v.length, (a) => a.type);
    el.innerHTML = `<div class="dsc-head"><h3>⚡ Live hazards</h3><button type="button" class="iconbtn" id="lvX" aria-label="Turn off live hazards">×</button></div>
      <div class="seg lv-per">${[["day", "Past day"], ["week", "Past week"], ["month", "Past month"]].map(([v, l]) => `<button type="button" data-p="${v}" aria-checked="${L.period === v}" role="radio">${l}</button>`).join("")}</div>
      ${L.loading ? `<p class="hint">Loading…</p>` : `
      <p class="lv-sum"><b>${n}</b> earthquakes of magnitude 4.5+${big ? `, <b>${big}</b> of 6 or more` : ""}.${by.length ? ` Alerts: ${by.map(([t, c]) => `${GD[t][0]} ${c} ${GD[t][1].toLowerCase()}${c > 1 ? "s" : ""}`).join(", ")}.` : ""}</p>
      ${L.err.usgs ? `<p class="hint">Couldn't reach the earthquake feed (USGS). <a href="https://earthquake.usgs.gov/earthquakes/map/" target="_blank" rel="noopener">Open it on the USGS site ↗</a></p>` : ""}
      ${L.err.gdacs ? `<p class="hint">Couldn't reach the disaster alerts (GDACS). <a href="https://www.gdacs.org/" target="_blank" rel="noopener">Open gdacs.org ↗</a></p>` : ""}
      <ul class="lv-list">${L.alerts.slice(0, 6).map((a, i) => `<li><button type="button" class="linkbtn" data-a="${i}">${GD[a.type][0]} ${esc(a.name)}${a.country ? ` (${esc(a.country)})` : ""}</button> <span class="lv-lvl" style="background:${lvlCol(a.level)}"></span></li>`).join("")}
        ${L.quakes.slice(0, 6).map((q, i) => `<li><button type="button" class="linkbtn" data-q="${i}">M${q.mag.toFixed(1)} ${esc(q.place)}</button> <small>${ago(q.time)}</small></li>`).join("")}</ul>
      <p class="lv-key"><span style="background:#d6453d"></span>shallow (under 70 km) <span style="background:#f2a541"></span>intermediate <span style="background:#3b7dd8"></span>deep (300 km+). Circle size: magnitude.</p>
      <p class="hint">Live from <a href="https://earthquake.usgs.gov/" target="_blank" rel="noopener">USGS</a> and <a href="https://www.gdacs.org/" target="_blank" rel="noopener">GDACS</a>${L.at ? `, updated ${new Date(L.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}. Compare with the plate boundaries in Physical.</p>`}`;
    $("#lvX").onclick = () => toggleLive(false);
    el.querySelectorAll(".lv-per button").forEach((b) => (b.onclick = () => { L.period = b.dataset.p; store.set("wc-live-period", L.period); load(); }));
    el.querySelectorAll("[data-q]").forEach((b) => (b.onclick = () => { const q = L.quakes[+b.dataset.q]; W.zoomToPoint(q.lon, q.lat, 4); }));
    el.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => { const a = L.alerts[+b.dataset.a]; W.zoomToPoint(a.lon, a.lat, 4); }));
  }
  function toggleLive(on) {
    L.on = on ?? !L.on;
    if (L.on && (!L.at || Date.now() - L.at > 10 * 6e4)) load(); else { draw(); panel(); }
  }

  // ====================== Your own index ======================
  const IX = Object.assign({ name: "My development index", parts: [["life_expectancy", 1, 1], ["mean_schooling", 1, 1], ["gni_ppp", 1, 1]] }, store.get("wc-index", {}));
  const PRESETS = {
    "Like the HDI": [["life_expectancy", 1, 1], ["mean_schooling", 1, 1], ["gni_ppp", 1, 1]],
    "Green index": [["co2_per_capita", 2, -1], ["renewables_elec_pct", 1, 1], ["forest_pct", 1, 1], ["pm25", 1, -1]],
    "Quality of life": [["life_expectancy", 2, 1], ["safe_water", 1, 1], ["homicides", 1, -1], ["att_life_satisfaction", 1, 1], ["internet", 1, 1]],
    "Gender equality": [["women_parliament", 1, 1], ["female_labour", 1, 1], ["maternal_mortality", 1, -1], ["adolescent_births", 1, -1]],
  };
  function computeIndex() {
    const parts = IX.parts.filter(([k]) => W.F[k]);
    const rows = W.rows.filter((r) => r.sovereign && parts.every(([k]) => typeof r[k] === "number"));
    const ranges = parts.map(([k]) => { const f = W.F[k]; const t = rows.map((r) => f.toT(r[k])); return [d3.min(t), d3.max(t)]; });
    const wsum = d3.sum(parts, (p) => p[1]) || 1;
    const out = rows.map((r) => {
      let s = 0;
      parts.forEach(([k, w, dir], i) => { const [a, b] = ranges[i]; let x = b > a ? (W.F[k].toT(r[k]) - a) / (b - a) : 0.5; if (dir < 0) x = 1 - x; s += w * x; });
      return { r, v: Math.round((s / wsum) * 1000) / 10 };
    }).sort((a, b) => b.v - a.v);
    W.rows.forEach((r) => delete r.__myindex);
    out.forEach((o) => (o.r.__myindex = o.v));
    return { parts, out };
  }
  // your index as a measure like any other: on the map, and in every chart's measure list
  function register(parts) {
    W.addField({ key: "__myindex", label: IX.name, short: IX.name, group: "Your index", format: "dec1", step: 0.1, dmin: 0, dmax: 100, source: "myindex", yearText: "latest figures",
      info: `Your own index, from 0 (lowest) to 100 (highest): ${parts.map(([k, w, d]) => `${W.F[k].label} (weight ${w}, ${d > 0 ? "higher is better" : "lower is better"})`).join("; ")}.`,
      keywords: "my index own index development index custom" });
  }
  function indexCard() {
    let el = $("#ixCard");
    if (!el) { el = document.createElement("div"); el.id = "ixCard"; el.className = "card dsc stx ix"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Build your own index"); document.body.appendChild(el); }
    el.hidden = false;
    const { parts, out } = computeIndex();
    // how far does it agree with the HDI?
    const both = out.filter((o) => typeof o.r.hdi === "number");
    const rk = (a) => { const s = a.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]); const r = []; s.forEach(([, i], j) => (r[i] = j + 1)); return r; };
    let rho = null;
    if (both.length > 10) { const a = rk(both.map((o) => o.v)), b = rk(both.map((o) => o.r.hdi)), n = both.length; rho = 1 - (6 * d3.sum(a, (x, i) => (x - b[i]) ** 2)) / (n ** 3 - n); }
    const moved = both.length > 10 ? (() => { const a = rk(both.map((o) => o.v)), b = rk(both.map((o) => o.r.hdi)); return both.map((o, i) => ({ o, d: b[i] - a[i] })).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 4); })() : [];
    const row = (o, i) => `<tr><td>${i + 1}</td><td>${o.r.flag || ""} ${esc(o.r.name)}</td><td>${o.v.toFixed(1)}</td></tr>`;
    el.innerHTML = `<div class="dsc-head"><h2>🧮 Build your own index</h2><button type="button" class="iconbtn" id="ixX" aria-label="Close">×</button></div>
      <p class="hint">Choose what matters, give each a weight, and say whether more is better. Each measure is scaled 0–1 (lowest to highest country), then averaged. Like the HDI, but your choice.</p>
      <div class="ix-pre">Start from: ${Object.keys(PRESETS).map((k) => `<button type="button" class="cur-l" data-p="${esc(k)}">${esc(k)}</button>`).join("")}</div>
      <label class="fld">Name <input id="ixName" type="text" maxlength="60" value="${esc(IX.name)}"></label>
      <div class="ix-parts">${IX.parts.map(([k, w, dir], i) => `<div class="ix-row" data-i="${i}"><select class="stx-sel" data-pick data-r="k">${W.measureOptions(k)}</select>
        <label>Weight <select class="stx-sel" data-r="w">${[1, 2, 3, 4, 5].map((n) => `<option ${n === w ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <button type="button" class="ghost ix-dir" data-r="d" title="Click to switch">${dir > 0 ? "↑ Higher is better" : "↓ Lower is better"}</button>
        <button type="button" class="iconbtn" data-r="x" aria-label="Remove" ${IX.parts.length <= 2 ? "disabled" : ""}>×</button></div>`).join("")}</div>
      ${IX.parts.length < 6 ? `<button type="button" class="linkbtn" id="ixAdd">＋ Add a measure</button>` : ""}
      <div class="stx-res">${out.length} countries have data on all ${parts.length} measures.${rho != null ? ` Agreement with the HDI: ρ = ${rho.toFixed(2)}.` : ""}
        ${moved.length ? `<small>Biggest differences from the HDI ranking: ${moved.map((m) => `${esc(m.o.r.name)} (${m.d > 0 ? "up" : "down"} ${Math.abs(m.d)} places)`).join(", ")}.</small>` : ""}</div>
      <div class="stx-two"><div><h4>Top 10</h4><table class="stx-t stx-num">${out.slice(0, 10).map(row).join("")}</table></div>
        <div><h4>Bottom 10</h4><table class="stx-t stx-num">${out.slice(-10).map((o, i) => row(o, out.length - 10 + i)).join("")}</table></div></div>
      <div class="dsc-row"><button type="button" class="primary" id="ixMap">Colour the map by it</button><button type="button" class="ghost" id="ixCsv">Download (CSV)</button></div>
      <p class="hint">Think about it: which measures did you choose, and why? How would a different weighting change the winners? Your index is kept in this browser.</p>`;
    const save = () => { store.set("wc-index", IX); indexCard(); };
    $("#ixX").onclick = () => (el.hidden = true);
    $("#ixName").onchange = (e) => { IX.name = e.target.value.trim() || "My index"; save(); };
    el.querySelectorAll(".ix-pre button").forEach((b) => (b.onclick = () => { IX.parts = PRESETS[b.dataset.p].map((p) => p.slice()); IX.name = b.dataset.p; save(); }));
    el.querySelectorAll(".ix-row").forEach((rw) => {
      const i = +rw.dataset.i;
      rw.querySelector('[data-r="k"]').onchange = (e) => { IX.parts[i][0] = e.target.value; save(); };
      rw.querySelector('[data-r="w"]').onchange = (e) => { IX.parts[i][1] = +e.target.value; save(); };
      rw.querySelector('[data-r="d"]').onclick = () => { IX.parts[i][2] *= -1; save(); };
      rw.querySelector('[data-r="x"]').onclick = () => { IX.parts.splice(i, 1); save(); };
    });
    if ($("#ixAdd")) $("#ixAdd").onclick = () => { IX.parts.push(["internet", 1, 1]); save(); };
    $("#ixMap").onclick = () => {
      register(parts);
      el.hidden = true;
      W.applyQS("f=__myindex:0~100&c=__myindex");
    };
    $("#ixCsv").onclick = () => {
      const rows = [["Rank", "Country", IX.name, ...parts.map(([k]) => W.F[k].label)], ...out.map((o, i) => [i + 1, o.r.name, o.v, ...parts.map(([k]) => o.r[k])]), [], ["Weights", ...parts.map(([k, w, d]) => `${W.F[k].label}: ${w} (${d > 0 ? "higher better" : "lower better"})`)]];
      const q = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + rows.map((r) => r.map(q).join(",")).join("\r\n")], { type: "text/csv" })); a.download = "my-index.csv"; a.click();
    };
  }

  // ====================== Compare two years (swipe) ======================
  const SW = { on: false, left: null, x: 0.5, busy: false, key: "" };
  async function snapshot() {
    if (!SW.on || SW.busy) return;
    SW.busy = true;
    const st = W.state, right = st.year;
    const svgEl = W.mapSVG();
    // draw the left year, picture it, then go back to the right year
    // colours fade between years: switch that off while the picture is taken
    document.body.classList.add("no-anim");
    W.setYear(SW.left);
    await new Promise((r) => requestAnimationFrame(() => r()));
    try {
      const cv = await window.WV.svgToCanvas(svgEl, window.devicePixelRatio > 1 ? 2 : 1.5, getComputedStyle(document.documentElement).getPropertyValue("--ocean").trim());
      const img = $("#swImg"); img.width = cv.width; img.height = cv.height; img.getContext("2d").drawImage(cv, 0, 0);
    } catch (e) { /* the picture couldn't be made: the divider still works on the live map */ }
    SW.legendLeft = $("#legend")?.innerHTML || "";
    W.setYear(right);
    requestAnimationFrame(() => document.body.classList.remove("no-anim"));
    SW.key = keyNow(); SW.busy = false;
    place();
  }
  const keyNow = () => [W.getQS().replace(/(^|&)y=\d+/, ""), W.k, $("#map").getAttribute("viewBox"), SW.left].join("|");
  function place() {
    const host = $("#swipe"); if (!host) return;
    const w = $("#mapstage").offsetWidth;
    host.style.setProperty("--sx", Math.round(SW.x * w) + "px");
    $("#swL").textContent = SW.left ?? "Latest";
    $("#swR").textContent = W.state.year ?? "Latest";
  }
  function swipe(on) {
    SW.on = on ?? !SW.on;
    let host = $("#swipe");
    if (!SW.on) { host?.remove(); return; }
    const sp = [+$("#tRange").min, +$("#tRange").max];
    if (!sp[0]) { SW.on = false; return; }
    W.stopPlay();
    if (!W.state.year) W.setYear(sp[1]);
    SW.left = Math.max(sp[0], Math.min(sp[1] - 1, W.state.year - 30 >= sp[0] ? W.state.year - 30 : sp[0]));
    host = document.createElement("div"); host.id = "swipe"; host.className = "swipe";
    host.innerHTML = `<canvas id="swImg" class="sw-img"></canvas><div class="sw-bar" id="swBar"><span class="sw-grip" aria-hidden="true">⇆</span></div>
      <div class="sw-tag sw-l"><select id="swLsel" aria-label="Year on the left"></select><span id="swL" hidden></span></div>
      <div class="sw-tag sw-r"><span id="swR"></span> <small>(use the year slider)</small></div>
      <button type="button" class="sw-close" id="swX">Stop comparing</button>`;
    $("#mapstage").appendChild(host);
    const sel = $("#swLsel");
    sel.innerHTML = d3.range(sp[0], sp[1] + 1).map((y) => `<option ${y === SW.left ? "selected" : ""}>${y}</option>`).join("");
    sel.onchange = () => { SW.left = +sel.value; snapshot(); };
    $("#swX").onclick = () => swipe(false);
    const bar = $("#swBar");
    bar.onpointerdown = (e) => {
      e.preventDefault(); bar.setPointerCapture(e.pointerId);
      const box = $("#mapstage").getBoundingClientRect();
      const mv = (ev) => { SW.x = Math.max(0.03, Math.min(0.97, (ev.clientX - box.left) / box.width)); place(); };
      bar.onpointermove = mv; bar.onpointerup = () => { bar.onpointermove = null; };
    };
    bar.onkeydown = (e) => { if (e.key === "ArrowLeft") SW.x = Math.max(0.03, SW.x - 0.03); if (e.key === "ArrowRight") SW.x = Math.min(0.97, SW.x + 0.03); place(); };
    bar.tabIndex = 0; bar.setAttribute("role", "slider"); bar.setAttribute("aria-label", "Divider between the two years");
    snapshot();
  }
  // keep the left picture in step with the map (filters, zoom, size)
  let swT = 0;
  function refresh() {
    if (SW.on) {
      if (W.state.view !== "map" || !W.state.year && !SW.busy && !$("#tRange")?.min) return swipe(false);
      if (!SW.busy) { place(); if (keyNow() !== SW.key) { clearTimeout(swT); swT = setTimeout(snapshot, 350); } }
    }
    if (L.on) { draw(); panel(); }
  }

  function init() {
    W = window.WC;
    // live hazards button on the map
    const b = document.createElement("button");
    b.type = "button"; b.id = "liveBtn"; b.className = "mmbtn livebtn"; b.setAttribute("aria-pressed", "false");
    b.innerHTML = "⚡ Live hazards"; b.title = "This week's earthquakes and current storms, floods and eruptions";
    b.onclick = () => toggleLive();
    $("#mapstage").appendChild(b);
    const tools = $("#cpLearn");
    if (tools) {
      const ib = document.createElement("button"); ib.type = "button"; ib.id = "ixBtn"; ib.className = "cp-tool";
      ib.innerHTML = `<span class="cp-ic" aria-hidden="true">🧮</span>Own index`; ib.title = "Build your own development index"; ib.onclick = indexCard;
      if ($("#stxBtn")) $("#stxBtn").after(ib); else tools.prepend(ib);
    }
    // a saved index is there for links that use it
    if (store.get("wc-index", null)) register(computeIndex().parts);
  }
  window.WX = { init, zoomed: () => { if (L.on) draw(); }, layout: () => { if (L.on) draw(); if (SW.on) refresh(); }, refresh, swipe, toggleLive, indexCard, _L: L, _SW: SW };
})();
