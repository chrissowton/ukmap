/* Which Countries? — physical geography: map layers for peaks, landforms, rivers, lakes, waterfalls,
 * deltas, trenches, volcanoes, earthquakes and plate boundaries; base maps of landforms, biomes,
 * climate zones and plates; feature lists and profiles; and physical facts in country profiles.
 * Loaded before app.js; app.js calls WP.load() with physical.json, then the hooks below. */
(function () {
  "use strict";
  let W = null, items = {}, shapes = {}, loaded = false;
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const n0 = (v) => d3.format(",")(Math.round(v));
  const fmtM = (v) => (v == null ? "—" : `${n0(v)} m`);

  // ---------- What each kind of feature is called, and how it's sorted ----------
  const T = {
    peak: { one: "peak", many: "peaks", sort: "peak_elev", value: (it) => fmtM(it.peak_elev) },
    landform: { one: "landform", many: "landforms", sort: "landform_area", value: (it) => `${it.landform_kind}` },
    range: { one: "mountain range", many: "mountain ranges", sort: "range_area", value: (it) => (it.top_m ? `top ${n0(it.top_m)} m` : "") },
    desert: { one: "desert", many: "deserts", sort: "desert_area", value: (it) => `${n0(it.area)} km²` },
    river: { one: "river", many: "rivers", sort: "river_km", value: (it) => (it.river_km ? `${n0(it.river_km)} km` : "") },
    lake: { one: "lake", many: "lakes", sort: "lake_km2", value: (it) => `${n0(it.lake_km2)} km²` },
    waterfall: { one: "waterfall", many: "waterfalls", sort: "waterfall_m", value: (it) => fmtM(it.waterfall_m) },
    delta: { one: "delta", many: "deltas", sort: null, value: (it) => it.shape || "" },
    trench: { one: "trench", many: "trenches", sort: "trench_depth", value: (it) => fmtM(it.trench_depth) },
    volcano: { one: "volcano", many: "volcanoes", sort: "volcano_elev", value: (it) => (it.last ? `last erupted ${it.last < 0 ? `${n0(-it.last)} BCE` : it.last}` : "no dated eruption") },
    quake: { one: "earthquake", many: "earthquakes", sort: "quake_mag", value: (it) => `M${it.quake_mag.toFixed(1)}, ${it.quake_year}` },
    boundary: { one: "plate boundary section", many: "plate boundaries", sort: "boundary_speed", value: (it) => it.boundary_margin },
  };
  const MARGIN_COL = { Constructive: "--s1", Destructive: "--c-asia", Collision: "--c-europe", Conservative: "--c-americas" };
  const LANDFORM_COL = {
    "Mountain range": "#a07850", Plateau: "#c8a77a", Desert: "#e9cf8f", Plain: "#a9c98a", Basin: "#b9c27e", Delta: "#7fbfa9",
    Tundra: "#b7c4c0", Valley: "#9fbf8f", Lowland: "#b5d19b", Wetland: "#7fb7a6", Depression: "#d9b98a", Gorge: "#b08968", Foothills: "#b69b74",
  };
  const BIOME_COL = {
    "Tropical rainforest": "#2f8f4e", "Tropical savanna": "#b9c45a", "Hot desert": "#efd08a", "Cold desert": "#d8c7a0",
    "Steppe and dry grassland": "#d9b86a", Mediterranean: "#c98b52", "Temperate forest": "#7bb662", "Boreal forest (taiga)": "#3f7c6b",
    Tundra: "#b9c6c8", "Ice sheet": "#eef4f8",
  };
  const CLIMATE_COL = { Tropical: "#3d7ed1", Dry: "#e2a548", Temperate: "#59a85c", Continental: "#8b6bb8", Polar: "#b9c9d0" };
  const PLATE_COLS = ["#d9a6a6", "#a6c4d9", "#b9d9a6", "#d9cfa6", "#c4a6d9", "#a6d9cf", "#d9b8a6", "#a6a9d9"];

  // ---------- Loading ----------
  function load(phys) {
    if (!phys || !phys.layers) return;
    const L = phys.layers;
    const ids = (arr, t) => arr.map((it, i) => Object.assign(it, { _t: t, _i: i }));
    items.peak = ids((L.peak || []).map((p) => ({ ...p, peak_elev: p.elev })), "peak");
    items.landform = ids((L.landform || []).map((l) => ({ ...l, landform_kind: l.kind, landform_area: l.area })), "landform");
    // mountain ranges and deserts as their own kinds of feature, so each shows as its own shape
    items.range = ids((L.landform || []).filter((l) => l.kind === "Mountain range").map((l) => ({ ...l, range_name: [l.name], range_area: l.area, range_top: l.top_m })), "range");
    items.desert = ids((L.landform || []).filter((l) => l.kind === "Desert").map((l) => ({ ...l, desert_name: [l.name], desert_area: l.area })), "desert");
    items.river = ids((L.river || []).map((r) => ({ ...r, river_name: [r.name], river_km: r.km, river_to: r.to ? [r.to] : [], river_countries: (r.iso || []).length })), "river");
    items.lake = ids((L.lake || []).map((l) => ({ ...l, lake_name: [l.name], lake_km2: l.km2, lake_kind: l.kind })), "lake");
    items.waterfall = ids((L.waterfall || []).map((w) => ({ ...w, waterfall_m: w.height })), "waterfall");
    items.delta = ids((L.delta || []).map((d) => ({ ...d, delta_shape: [d.shape || "Not usually classed by shape"] })), "delta");
    items.trench = ids((L.trench || []).map((t) => ({ ...t, trench_depth: t.depth })), "trench");
    items.volcano = ids((L.volcano || []).map((v) => ({
      ...v, volcano_type: [v.type], volcano_setting: v.setting, volcano_vei: v.vei, volcano_elev: v.elev,
      volcano_last: v.last == null ? "No dated eruption" : v.last >= 2000 ? "Since 2000" : v.last >= 1900 ? "1900–1999" : v.last >= 1500 ? "1500–1899" : "Before 1500",
    })), "volcano");
    const q = L.quake || { fields: [], rows: [] }, fi = Object.fromEntries(q.fields.map((f, i) => [f, i]));
    items.quake = ids(q.rows.map((r) => ({
      name: r[fi.place], quake_mag: r[fi.mag], quake_year: r[fi.y], quake_depth: r[fi.depth], date: `${r[fi.y]}-${String(r[fi.m]).padStart(2, "0")}-${String(r[fi.d]).padStart(2, "0")}`,
      lat: r[fi.lat], lon: r[fi.lon], iso: r[fi.iso] ? [r[fi.iso]] : [], offshore: !!r[fi.offshore], quake_margin: [r[fi.margin] || "Far from a boundary"],
    })).sort((a, b) => b.quake_mag - a.quake_mag), "quake");
    // names that would give away the answer in the quiz are rewritten
    const RENAME = { "Himalayan collision zone": "India–Eurasia boundary (Himalayas)" };
    items.boundary = ids((L.boundary || []).map((b) => ({ ...b, name: RENAME[b.name] || b.name, boundary_margin: [b.margin], boundary_speed: b.speed })), "boundary");
    for (const it of items.boundary) delete it.iso;
    for (const it of items.trench) delete it.iso;
    items.plate = ids((L.plate || []).map((x) => ({ ...x })), "plate");
    shapes = { ice: L.ice, plates: L.plate_shapes, biome: L.biome_shapes, climate: L.climate_shapes, plateInfo: L.plate };
    loaded = true;
  }
  const itemsOf = (t) => items[t] || [];
  const isFeatKey = (f) => f && f.target && f.target !== "city";

  // ---------- Which features match ----------
  let last = new Map();
  function evaluate(res, act, featFilters) {
    last = new Map();
    if (!loaded) return last;
    const byT = d3.group(featFilters, (fl) => W.F[fl.key].target);
    for (const [t, fls] of byT) {
      const live = fls.filter((fl) => W.isActive(fl));
      const list = itemsOf(t).filter((it) => {
        if (act.length && it.iso) { if (!it.iso.some((i) => res.get(i)?.match)) return false; }
        return live.every((fl) => W.passes(it, fl));
      });
      last.set(t, list);
    }
    return last;
  }

  // ---------- Drawing ----------
  let g = {}, proj = null, path = null, kZoom = 1, sizeF = 1;
  function attach(layers, projection, geoPath, svgNode) {
    g = layers; proj = projection; path = geoPath; g.svg = svgNode;
  }
  const pt = (it) => it._p || (it._p = proj([it.lon, it.lat]));
  function layout(s) {
    if (s) sizeF = s;
    quakeTree = null;
    drawQuakes();
    for (const t of Object.keys(items)) for (const it of items[t]) delete it._p;
    baseKey = "";
    if (g.feat) g.feat.selectAll("path.fl").attr("d", (d) => path(d.g));
  }
  const SYMBOL = {
    peak: "M0,-6.5L5.5,3.5L-5.5,3.5Z", volcano: "M-2,-5L2,-5L6,4L-6,4Z", trench: "M0,6L5.5,-3.5L-5.5,-3.5Z",
    delta: "M0,-5L5,0L0,5L-5,0Z",
  };
  const MAX_POINTS = 4000;
  function draw(state, lastEval) {
    if (!loaded || !g.feat) return;
    const phys = state.mode === "physical";
    drawBase(state, lastEval);
    const feat = lastEval.feat || new Map();
    const sel = state.feat;
    // one group per kind of feature, in a fixed order (areas under lines under points)
    const order = ["landform", "desert", "range", "lake", "boundary", "river", "volcano", "peak", "waterfall", "delta", "trench"];
    // the background fades while features are picked out, so their shapes stand out
    g.base.attr("opacity", phys && feat.size ? 0.35 : null);
    g.over.attr("opacity", phys && feat.size ? 0.6 : null);
    const groups = g.feat.selectAll("g.ft").data(order, (d) => d).join("g").attr("class", (d) => "ft ft-" + d);
    groups.each(function (t) {
      const list = (phys && feat.get(t)) || [];
      const gg = d3.select(this);
      if (["landform", "desert", "range", "lake", "river", "boundary"].includes(t)) {
        const withShape = list.filter((it) => it.g);
        gg.selectAll("path.fl").data(withShape, (d) => d._i).join("path")
          .attr("class", (d) => `fl fl-${t}${sel && sel.t === t && sel.i === d._i ? " sel" : ""}`)
          .attr("data-feat", (d) => `${t}:${d._i}`).attr("d", (d) => path(d.g))
          .style("fill", (d) => (["landform", "desert", "range"].includes(t) ? LANDFORM_COL[d.kind] || "#bbb" : t === "lake" ? null : "none"))
          .style("stroke", (d) => (t === "boundary" ? css(MARGIN_COL[d.margin] || "--muted") : null))
          .style("stroke-width", (d) => (t === "river" ? Math.max(1.4, Math.min(4, (d.river_km || 800) / 1600)) + "px" : null));
        // points for rivers/lakes with no shape aren't drawn; they still appear in the list
      } else {
        const pts = list.filter((it) => pt(it));
        const sel2 = gg.selectAll(".fp").data(pts, (d) => d._i).join((en) => (t === "waterfall" ? en.append("circle") : en.append("path")))
          .attr("class", (d) => `fp fp-${t}${sel && sel.t === t && sel.i === d._i ? " sel" : ""}`)
          .attr("data-feat", (d) => `${t}:${d._i}`);
        if (t === "waterfall") sel2.attr("cx", (d) => pt(d)[0]).attr("cy", (d) => pt(d)[1]).attr("r", (d) => radius(d) / kZoom);
        else sel2.attr("d", SYMBOL[t]).attr("transform", (d) => `translate(${pt(d)[0]},${pt(d)[1]}) scale(${((t === "volcano" ? volcScale(d) : 1) * sizeF) / kZoom})`)
          .style("fill", (d) => (t === "volcano" ? volcColour(d) : null));
      }
    });
    g.feat.attr("display", phys ? null : "none");
    // earthquakes go on a canvas: there can be over 14,000 of them
    quakeList = (phys && feat.get("quake")) || [];
    quakeSel = sel && sel.t === "quake" ? sel.i : null;
    quakeTree = null;
    drawQuakes();
  }

  // ---------- Earthquakes on a canvas ----------
  let canvas = null, quakeList = [], quakeSel = null, quakeTree = null, T0 = d3.zoomIdentity, rafQ = 0;
  function ensureCanvas() {
    if (canvas || !g.svg) return;
    canvas = document.createElement("canvas");
    canvas.className = "quakecanvas";
    canvas.setAttribute("aria-hidden", "true");
    g.svg.parentNode.insertBefore(canvas, g.svg.nextSibling);
  }
  function drawQuakes() {
    cancelAnimationFrame(rafQ);
    rafQ = requestAnimationFrame(() => {
      ensureCanvas();
      if (!canvas) return;
      const box = g.svg.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      const vb = (g.svg.getAttribute("viewBox") || "0 0 1 1").split(" ").map(Number);
      const s = box.width / vb[2];   // css pixels per map unit
      if (canvas.width !== Math.round(box.width * dpr) || canvas.height !== Math.round(box.height * dpr)) {
        canvas.width = Math.round(box.width * dpr); canvas.height = Math.round(box.height * dpr);
        canvas.style.width = box.width + "px"; canvas.style.height = box.height + "px";
      }
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, box.width, box.height);
      canvas.hidden = !quakeList.length;
      if (!quakeList.length) return;
      const cols = { s: css("--c-asia"), m: css("--c-europe"), d: css("--s1") }, ring = css("--surface"), ink = css("--ink");
      ctx.lineWidth = 0.8;
      for (let i = quakeList.length - 1; i >= 0; i--) {    // smallest first, so big ones sit on top
        const d = quakeList[i], p = pt(d);
        if (!p) continue;
        const x = (p[0] * T0.k + T0.x) * s, y = (p[1] * T0.k + T0.y) * s;
        if (x < -20 || y < -20 || x > box.width + 20 || y > box.height + 20) continue;
        const r = radius(d) * s;
        const z = d.quake_depth ?? 30;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 6.2832);
        ctx.globalAlpha = 0.72;
        ctx.fillStyle = z < 70 ? cols.s : z < 300 ? cols.m : cols.d;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = d._i === quakeSel ? ink : ring;
        ctx.lineWidth = d._i === quakeSel ? 2.5 : 0.8;
        ctx.stroke();
      }
    });
  }
  // the earthquake under the pointer, if any
  function hit(evt) {
    if (!quakeList.length || !g.svg) return null;
    const box = g.svg.getBoundingClientRect();
    const vb = g.svg.getAttribute("viewBox").split(" ").map(Number);
    const s = box.width / vb[2];
    const mx = ((evt.clientX - box.left) / s - T0.x) / T0.k, my = ((evt.clientY - box.top) / s - T0.y) / T0.k;
    if (!quakeTree) quakeTree = d3.quadtree(quakeList.filter((d) => pt(d)), (d) => pt(d)[0], (d) => pt(d)[1]);
    const d = quakeTree.find(mx, my, 14 / T0.k);
    if (!d) return null;
    const dist = Math.hypot(pt(d)[0] - mx, pt(d)[1] - my) * T0.k;
    return dist <= radius(d) + 3 ? `quake:${d._i}` : null;
  }
  const radius = (d) => (d._t === "quake" ? 1.6 + Math.max(0, d.quake_mag - 6) * 2.2 : 4.5) * sizeF;
  const volcScale = (d) => (d.volcano_last === "Since 2000" ? 1.15 : 0.9);
  function quakeColour(d) {
    const z = d.quake_depth ?? 30;
    return z < 70 ? css("--c-asia") : z < 300 ? css("--c-europe") : css("--s1");
  }
  function volcColour(d) {
    return d.volcano_last === "Since 2000" || d.volcano_last === "1900–1999" ? css("--c-asia") : css("--muted");
  }
  function zoomed(t) {
    const k = t.k;
    T0 = t;
    kZoom = k;
    drawQuakes();
    if (!g.feat) return;
    g.feat.selectAll("circle.fp").attr("r", (d) => radius(d) / k);
    g.feat.selectAll("path.fp").attr("transform", (d) => `translate(${pt(d)[0]},${pt(d)[1]}) scale(${((d._t === "volcano" ? volcScale(d) : 1) * sizeF) / k})`);
  }

  // ---------- Base maps (physical mode, when no country filter is set) ----------
  const style = { base: "landforms", boundaries: true, ice: true, rivers: true };
  let baseKey = "";
  function drawBase(state, lastEval) {
    const phys = state.mode === "physical" && loaded;
    const show = phys && !lastEval.act.length;
    g.base.attr("display", show ? null : "none");
    g.over.attr("display", phys ? null : "none");
    if (!phys) return;
    const key = style.base + "|" + document.documentElement.dataset.theme;
    if (key !== baseKey) {
      baseKey = key;
      g.base.selectAll("*").remove();
      if (style.base === "landforms") {
        const order = ["Plain", "Lowland", "Basin", "Tundra", "Wetland", "Plateau", "Desert", "Valley", "Depression", "Foothills", "Mountain range", "Gorge", "Delta"];
        const list = itemsOf("landform").filter((l) => l.g && LANDFORM_COL[l.kind]).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || b.area - a.area);
        g.base.selectAll("path").data(list).join("path").attr("class", "bl").attr("d", (d) => path(d.g)).style("fill", (d) => LANDFORM_COL[d.kind])
          .attr("data-base", (d) => d.name + " · " + d.kind);
      } else if (style.base === "biomes" || style.base === "climate") {
        const src = style.base === "biomes" ? shapes.biome : shapes.climate, cols = style.base === "biomes" ? BIOME_COL : CLIMATE_COL;
        const list = Object.entries(src || {}).filter(([, geom]) => geom).map(([name, geom]) => ({ name, geom }));
        g.base.selectAll("path").data(list).join("path").attr("class", "bl").attr("d", (d) => path(d.geom)).style("fill", (d) => cols[d.name] || "#ccc")
          .attr("data-base", (d) => d.name);
      } else if (style.base === "plates" && shapes.plates) {
        const names = [...new Set(shapes.plates.features.map((f) => f.properties.name))];
        g.base.selectAll("path").data(shapes.plates.features).join("path").attr("class", "bl plate").attr("d", path)
          .style("fill", (d) => PLATE_COLS[names.indexOf(d.properties.name) % PLATE_COLS.length]).attr("data-base", (d) => `${d.properties.name} Plate`);
        g.base.selectAll("text").data(shapes.plateInfo.filter((p) => p.major || p.area > 2e6)).join("text").attr("class", "platelab")
          .attr("transform", (d) => { const p = proj([d.lon, d.lat]); return p ? `translate(${p[0]},${p[1]})` : "translate(-999,-999)"; }).text((d) => d.name);
      }
      // overlays: ice, major rivers, plate boundaries
      g.over.selectAll("*").remove();
      if (style.ice && shapes.ice) g.over.append("path").attr("class", "ov-ice").attr("d", path(shapes.ice));
      if (style.rivers) g.over.selectAll("path.ov-river").data(itemsOf("river").filter((r) => r.g && (r.river_km || 0) >= 1500)).join("path").attr("class", "ov-river").attr("d", (d) => path(d.g));
      if (style.boundaries) g.over.selectAll("path.ov-bound").data(itemsOf("boundary")).join("path").attr("class", "ov-bound").attr("d", (d) => path(d.g))
        .style("stroke", (d) => css(MARGIN_COL[d.margin] || "--muted"));
    }
  }
  const SHOW_ALL = [["quake", "Earthquakes (magnitude 6+ since 1900)"], ["volcano", "Volcanoes"], ["peak", "Mountain peaks"], ["range", "Mountain ranges"],
    ["desert", "Deserts"], ["river", "Rivers"], ["lake", "Lakes"], ["boundary", "Plate boundaries (by type)"], ["trench", "Ocean trenches"], ["waterfall", "Waterfalls"], ["delta", "River deltas"]];
  function styleCard(card, rerender) {
    const B = [["landforms", "Landforms"], ["biomes", "Biomes"], ["climate", "Climate zones"], ["plates", "Tectonic plates"], ["none", "Plain"]];
    card.innerHTML = `<div class="mmhead"><h3>Physical map</h3><button type="button" class="iconbtn" id="mmClose" aria-label="Close">×</button></div>
      <div class="fld"><span>Background</span></div>
      <div class="seg wrap" role="radiogroup" aria-label="Background">${B.map(([v, l]) => `<button type="button" role="radio" aria-checked="${style.base === v}" data-b="${v}">${l}</button>`).join("")}</div>
      <label class="tog"><input type="checkbox" id="ovB" ${style.boundaries ? "checked" : ""}> Plate boundaries</label>
      <label class="tog"><input type="checkbox" id="ovR" ${style.rivers ? "checked" : ""}> Major rivers</label>
      <label class="tog"><input type="checkbox" id="ovI" ${style.ice ? "checked" : ""}> Ice sheets and glaciers</label>
      <div class="fld"><span>Show all on the map</span></div>
      <div class="showall">${SHOW_ALL.map(([t, l]) => `<label class="tog"><input type="checkbox" data-t="${t}" ${W.hasFeature(t) ? "checked" : ""}> ${l}</label>`).join("")}</div>
      <p class="hint">${style.base === "biomes" ? "Biomes here are worked out from climate zones, so they show the natural vegetation the climate supports." : style.base === "plates" ? "Plates from the PB2002 model, which includes many small plates." : "The background is hidden while country filters are on, so the matching countries stand out."}</p>`;
    card.querySelectorAll("[data-b]").forEach((b) => (b.onclick = () => { style.base = b.dataset.b; baseKey = ""; rerender(); }));
    card.querySelector("#ovB").onchange = (e) => { style.boundaries = e.target.checked; baseKey = ""; rerender(); };
    card.querySelector("#ovR").onchange = (e) => { style.rivers = e.target.checked; baseKey = ""; rerender(); };
    card.querySelector("#ovI").onchange = (e) => { style.ice = e.target.checked; baseKey = ""; rerender(); };
    card.querySelectorAll(".showall input").forEach((c) => (c.onchange = () => W.toggleFeature(c.dataset.t, c.checked)));
    return { name: B.find(([v]) => v === style.base)?.[1] };
  }
  function legendHTML(state, lastEval) {
    if (!loaded || state.mode !== "physical") return "";
    let h = "";
    if (!lastEval.act.length) {
      const cols = style.base === "landforms" ? Object.fromEntries(["Mountain range", "Plateau", "Desert", "Plain", "Basin", "Tundra"].map((k) => [k, LANDFORM_COL[k]]))
        : style.base === "biomes" ? BIOME_COL : style.base === "climate" ? CLIMATE_COL : null;
      if (cols) h += `<div class="lrow lwrap">${Object.entries(cols).map(([k, c]) => `<span class="li"><span class="sw" style="background:${c}"></span>${esc(k)}</span>`).join("")}</div>`;
    }
    if (style.boundaries || (lastEval.feat || new Map()).has("boundary"))
      h += `<div class="lrow lwrap">${Object.entries(MARGIN_COL).map(([k, v]) => `<span class="li"><span class="sw ln" style="background:${css(v)}"></span>${k}</span>`).join("")}</div>`;
    const feat = lastEval.feat || new Map();
    if (feat.has("quake")) {
      const n = feat.get("quake").length;
      h += `<div class="lrow lwrap"><span class="li"><span class="sw dot" style="background:${css("--c-asia")}"></span>Shallow (under 70 km)</span><span class="li"><span class="sw dot" style="background:${css("--c-europe")}"></span>70–300 km</span><span class="li"><span class="sw dot" style="background:${css("--s1")}"></span>Deep</span><span class="li">${n0(n)} shown</span></div>`;
    }
    if (feat.has("volcano")) h += `<div class="lrow"><span class="li"><span class="sym volc act"></span>Erupted since 1900</span><span class="li"><span class="sym volc"></span>Earlier</span></div>`;
    return h;
  }

  // ---------- Labels: the most important features are named first, more appear as you zoom in ----------
  const LABEL = {
    quake: { base: 18, w: (d) => d.quake_mag, text: (d) => `M${d.quake_mag.toFixed(1)} · ${d.quake_year}` },
    volcano: { base: 28, w: (d) => (d.last >= 1900 ? 2 : 0) + (d.vei ?? 0) / 3 + (d.elev ?? 0) / 3000 + (d.n1900 ? 1 : 0), text: (d) => d.name },
    peak: { base: 26, w: (d) => d.peak_elev, text: (d) => `${d.name} ${n0(d.peak_elev)} m` },
    waterfall: { base: 20, w: (d) => d.waterfall_m, text: (d) => d.name },
    delta: { base: 20, w: () => 1, text: (d) => d.name },
    trench: { base: 20, w: (d) => d.depth, text: (d) => d.name },
    range: { base: 18, w: (d) => d.area, text: (d) => d.name, area: true },
    desert: { base: 18, w: (d) => d.area, text: (d) => d.name, area: true },
    landform: { base: 20, w: (d) => d.area, text: (d) => d.name, area: true },
    lake: { base: 18, w: (d) => d.lake_km2, text: (d) => d.name, area: true },
    river: { base: 18, w: (d) => d.river_km || 0, text: (d) => d.name, line: true },
    boundary: { base: 10, w: (d) => d.km, text: (d) => d.name, line: true },
  };
  function midOf(geom) {
    const lines = geom.type === "LineString" ? [geom.coordinates] : geom.type === "MultiLineString" ? geom.coordinates : [];
    const longest = lines.reduce((a, b) => (b.length > a.length ? b : a), []);
    return longest.length ? longest[Math.floor(longest.length / 2)] : null;
  }
  function labels(kk, inView) {
    if (!loaded) return [];
    const out = [];
    for (const [t, list] of last) {
      const L = LABEL[t];
      if (!L || !list.length) continue;
      const max = Math.min(400, Math.round(L.base * kk * kk));
      const seenNames = new Set();
      const cands = [];
      for (const d of list) {
        if (t === "boundary" && (!d.name || seenNames.has(d.name))) continue;
        let p = null;
        if (L.line) { if (d.g) { d._mid ||= midOf(d.g); p = d._mid && proj(d._mid); } }
        else if (L.area) p = d.lat != null ? proj([d.lon, d.lat]) : null;
        else p = pt(d);
        if (!p || !inView(p)) continue;
        if (t === "boundary") seenNames.add(d.name);
        cands.push({ d, p });
      }
      cands.sort((a, b) => L.w(b.d) - L.w(a.d));
      cands.slice(0, max).forEach(({ d, p }, i) => out.push({
        text: L.text(d), x: p[0], y: p[1], cls: `feat f-${t}`, pri: 1.5, area: 1e9 - i, side: !L.area && !L.line, fref: `${t}:${d._i}`,
      }));
    }
    return out;
  }
  // Natural Earth's own place names that would repeat a feature's label
  function suppressed() {
    const s = new Set();
    if (last.has("peak")) s.add("peak");
    if (last.has("range") || last.has("landform")) s.add("range");
    if (last.has("desert") || last.has("landform")) s.add("desert");
    if (last.has("landform")) ["plateau", "basin", "plain", "delta", "tundra", "valley", "lowland", "peninsula"].forEach((x) => s.add(x));
    if (last.has("lake")) s.add("lake");
    return s;
  }

  // ---------- Tooltips ----------
  const country = (iso) => W.byIso.get(iso);
  const cname = (iso) => country(iso)?.name || "";
  const clist = (isos, max = 4) => { const n = (isos || []).map(cname).filter(Boolean); return n.length > max ? n.slice(0, max).join(", ") + ` +${n.length - max}` : n.join(", "); };
  function facts(it) {
    switch (it._t) {
      case "peak": return [["Height", fmtM(it.peak_elev)], ["Range", it.range], ["Country", clist(it.iso)]];
      case "range": case "desert":
      case "landform": return [["Type", it.kind], ["Area", `about ${n0(it.area)} km²`], ["Highest peak", it.top ? `${it.top} (${fmtM(it.top_m)})` : ""], ["Countries", clist(it.iso, 6)]];
      case "river": return [["Length", it.river_km ? `${n0(it.river_km)} km` : ""], ["Flows into", it.to], ["Basin", it.basin ? `${n0(it.basin)} km²` : ""],
        ["Rises in", clist(it.src)], ["Mouth in", clist(it.mouth)], ["Countries", clist(it.iso, 8)]];
      case "lake": return [["Area", `${n0(it.lake_km2)} km²`], ["Type", it.lake_kind], ["Countries", clist(it.iso, 6)]];
      case "waterfall": return [["Height", fmtM(it.waterfall_m)], ["Country", clist(it.iso)], ["", it.note]];
      case "delta": return [["River", it.river], ["Shape", it.shape || "Not usually classed by shape"], ["Country", clist(it.iso)], ["", it.note]];
      case "trench": return [["Deepest point", it.deep ? `${it.deep}, ${fmtM(it.depth)} deep` : `${fmtM(it.depth)} deep`], ["Ocean", it.ocean], ["Plates", it.plates]];
      case "volcano": return [["Type", it.type], ["Height", fmtM(it.elev)], ["Last eruption", it.last == null ? "No dated eruption" : it.last < 0 ? `about ${n0(-it.last)} BCE` : String(it.last)],
        ["Eruptions since 1900", it.n1900 ? String(it.n1900) : ""], ["Largest eruption", it.vei != null ? `VEI ${it.vei}` : ""], ["Setting", it.setting], ["Country", clist(it.iso)]];
      case "quake": return [["Magnitude", it.quake_mag.toFixed(1)], ["Date", it.date], ["Depth", it.quake_depth != null ? `${n0(it.quake_depth)} km` : ""],
        ["Nearest plate boundary", it.quake_margin[0]], ["Country", it.iso.length ? `${clist(it.iso)}${it.offshore ? " (offshore)" : ""}` : "At sea"]];
      case "boundary": return [["Type", `${it.margin} (${it.type.toLowerCase()})`], ["Plates", (it.plates || []).join(" and ")], ["Speed", it.speed != null ? `${it.speed} mm a year` : ""]];
    }
    return [];
  }
  function title(it) {
    if (it._t === "quake") return `Magnitude ${it.quake_mag.toFixed(1)} earthquake`;
    if (it._t === "boundary") return it.name || `${it.margin} plate boundary`;
    return it.name;
  }
  function sub(it) {
    if (it._t === "quake") return it.name;
    return { peak: "Mountain peak", range: "Mountain range", desert: "Desert", landform: it.kind, river: "River", lake: it.lake_kind, waterfall: "Waterfall", delta: "River delta", trench: "Ocean trench", volcano: "Volcano", boundary: "Plate boundary" }[it._t] || "";
  }
  function byRef(ref) {
    const [t, i] = ref.split(":");
    return itemsOf(t)[+i];
  }
  function tipHTML(ref) {
    const it = byRef(ref);
    if (!it) return "";
    const fs = facts(it).filter(([, v]) => v);
    return `<strong>${esc(title(it))}</strong><span class="st">${esc(sub(it))}</span><dl>${fs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
  }
  function baseTip(el) { return el.getAttribute("data-base"); }

  // ---------- Results list and feature profile ----------
  function tabs(lastEval) {
    return [...(lastEval.feat || new Map())].map(([t, list]) => ({ t, label: T[t].many.charAt(0).toUpperCase() + T[t].many.slice(1), n: list.length }));
  }
  const listMore = { key: "", n: 400 };
  document.addEventListener("click", (e) => {
    if (!e.target.closest?.(".fmore")) return;
    const box = e.target.closest(".rlist"), top = box?.scrollTop || 0;
    listMore.n += 400; W.render();
    const nb = document.querySelector("#results .rlist"); if (nb) nb.scrollTop = top;
  });
  function listHTML(t, list, state) {
    const info = T[t];
    const sorted = info.sort ? [...list].sort((a, b) => (b[info.sort] ?? -1e9) - (a[info.sort] ?? -1e9)) : [...list].sort((a, b) => a.name.localeCompare(b.name));
    // the list grows 400 at a time ("Show more"); the map always shows them all
    if (listMore.key !== t + ":" + list.length) { listMore.key = t + ":" + list.length; listMore.n = 400; }
    const shown = sorted.slice(0, listMore.n);
    const left = list.length - shown.length;
    return `<div class="count"><span class="n num">${n0(list.length)}</span><span class="of">${list.length === 1 ? info.one : info.many} match</span></div>
      ${left > 0 ? `<p class="sub" style="margin:0 14px 6px">Listing the first ${n0(shown.length)}${info.sort ? " (largest first)" : ""}. All ${n0(list.length)} are on the map.</p>` : ""}
      <div class="rlist">${shown.map((it) => `<button type="button" class="row frow" data-ref="${t}:${it._i}"><span class="nm">${esc(title(it))}<small>${esc(it._t === "quake" ? it.name : clist(it.iso, 2))}</small></span><span class="val num">${esc(info.value(it))}</span></button>`).join("") || `<p class="empty">Nothing matches. Try loosening the filters.</p>`}
        ${left > 0 ? `<button type="button" class="ghost fmore" style="margin:8px 14px">Show ${n0(Math.min(400, left))} more (${n0(left)} not listed yet)</button>` : ""}</div>`;
  }
  function detailHTML(ref) {
    const it = byRef(ref);
    if (!it) return "";
    const fs = facts(it).filter(([, v]) => v);
    const isos = it.iso || [];
    return `<div class="detail fdetail">
      <button type="button" class="linkbtn back" id="fback">← Back to the list</button>
      <h2>${esc(title(it))}</h2><p class="sub">${esc(sub(it))}</p>
      <dl>${fs.filter(([k]) => k !== "Countries" && k !== "Country").map(([k, v]) => `<dt>${esc(k || "Note")}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
      ${it.about ? `<p class="sub">${esc(it.about)}</p>` : ""}
      ${isos.length ? `<h4 data-g="geography">${isos.length === 1 ? "Country" : "Countries"}</h4><div class="fcountries">${isos.map((i) => country(i) ? `<button type="button" class="linkbtn goto" data-iso="${i}">${country(i).flag || ""} ${esc(country(i).name)}</button>` : "").join("")}</div>` : ""}
      ${window.WL && it._t !== "boundary" ? window.WL.html(window.WL.feature(it.name || title(it), { peak: "mountain", range: "mountains", river: "river", lake: "lake", volcano: "volcano", desert: "desert", delta: "delta", waterfall: "waterfall", trench: "ocean trench", quake: "earthquake", landform: "" }[it._t] || ""), "Find out more") : ""}
      <button type="button" class="ghost" id="fzoom">Zoom to it on the map</button>
      <p class="sub src">Source: ${esc(SRC[it._t] || "")}</p></div>`;
  }
  const SRC = { peak: "Natural Earth", range: "Natural Earth", desert: "Natural Earth", landform: "Natural Earth", river: "CIA World Factbook (lengths), Natural Earth (map)", lake: "Natural Earth, CIA World Factbook",
    waterfall: "compiled by hand from Wikipedia", delta: "compiled by hand", trench: "Wikipedia (depths); positions approximate", volcano: "Smithsonian Global Volcanism Program",
    quake: "USGS earthquake catalogue", boundary: "PB2002 model (Bird, 2003)" };
  function bounds(it) {
    if (it.g) return path.bounds(it.g);
    const p = pt(it);
    return p ? [[p[0] - 20, p[1] - 20], [p[0] + 20, p[1] + 20]] : null;
  }

  // ---------- Physical facts in a country profile ----------
  function profileHTML(r) {
    if (!loaded) return "";
    const rows = [];
    const add = (k, v) => { if (v != null && v !== "" && !(Array.isArray(v) && !v.length)) rows.push([k, Array.isArray(v) ? v.join(", ") : v]); };
    add("Highest point", r.highest_m != null ? `${r.highest_point ? r.highest_point + ", " : ""}${fmtM(r.highest_m)}` : null);
    add("Lowest point", r.lowest_m != null ? `${r.lowest_point ? r.lowest_point + ", " : ""}${fmtM(r.lowest_m)}` : null);
    add("Average height", r.mean_elevation_m != null ? fmtM(r.mean_elevation_m) : null);
    add("Coastline", r.coastline_km ? `${n0(r.coastline_km)} km` : r.coastline_km === 0 ? "None (landlocked)" : null);
    add("Coast on", r.seas);
    add("Mountain ranges", r.ranges);
    add("Deserts", r.deserts);
    add("Tectonic plates", r.plates);
    add("Plate boundaries", r.margins);
    add("Volcanoes", r.volcanoes ? `${r.volcanoes}${r.volcanoes_active ? ` (${r.volcanoes_active} erupted since 1900)` : ""}` : null);
    add("Earthquakes since 1900", r.quakes ? `${n0(r.quakes)} of magnitude 6+${r.quake_max ? `; largest ${r.quake_max.toFixed(1)} in ${r.quake_max_year}` : ""}` : null);
    add("Longest river", r.longest_river ? `${r.longest_river} (${n0(r.longest_river_km)} km)` : null);
    add("Main biome", r.main_biome);
    add("Ice", r.glacier_pct ? `${r.glacier_pct}% of the land` : null);
    const bl = r.biome_list || [];
    const biomeBar = bl.length ? `<div class="biomebar" role="img" aria-label="Biomes: ${esc(bl.map(([b, p]) => `${b} ${p}%`).join(", "))}">${bl.map(([b, p]) => `<span style="width:${p}%;background:${BIOME_COL[b] || "#ccc"}" title="${esc(b)} ${p}%"></span>`).join("")}</div>
      <div class="biomekey">${bl.filter(([, p]) => p >= 5).map(([b, p]) => `<span><span class="sw" style="background:${BIOME_COL[b]}"></span>${esc(b)} ${p}%</span>`).join("")}</div>` : "";
    return `<h4 data-g="landforms">Physical geography</h4>
      ${r.terrain ? `<p class="sub terrain">${esc(r.terrain.charAt(0).toUpperCase() + r.terrain.slice(1))}.</p>` : ""}
      <dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
      ${biomeBar}
      ${r.hazards_text ? `<h4 data-g="hazards">Natural hazards</h4><p class="sub">${esc(r.hazards_text.charAt(0).toUpperCase() + r.hazards_text.slice(1))}</p>` : ""}
      ${r.climate_text ? `<h4 data-g="climate">Climate</h4><p class="sub">${esc(r.climate_text.charAt(0).toUpperCase() + r.climate_text.slice(1))}</p>` : ""}
      <p class="sub src">Sources: CIA World Factbook, Natural Earth, Smithsonian GVP, USGS, PB2002.</p>`;
  }

  window.WP = {
    load, items: itemsOf, evaluate, hit, labels, suppressed, attach, draw, layout, zoomed, styleCard, legendHTML, tipHTML, baseTip, tabs, listHTML, detailHTML, byRef,
    bounds, profileHTML, title, sub, facts, isFeatKey, T, style, BIOME_COL, LANDFORM_COL, MARGIN_COL,
    get loaded() { return loaded; }, setW(w) { W = w; },
  };
})();
