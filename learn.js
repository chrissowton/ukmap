/* Learning tools (v55):
   - Worldview quiz: Gapminder-style questions (A, B or C) worked out live from the data, about things most people get wrong
   - Describe this chart: the main points of any chart, in plain words (the map has its own, in mapskills.js)
   - Notes on a chart or map: arrows, circles, boxes and text, drawn on top and included when it's downloaded */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  let W;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const listAnd = (a) => (a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);
  const card = (id, cls, label) => {
    let el = $("#" + id);
    if (!el) { el = document.createElement("div"); el.id = id; el.className = "card dsc " + cls; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", label); document.body.appendChild(el); }
    el.hidden = false;
    return el;
  };

  // ======================= Worldview quiz =======================
  const sov = () => W.rows.filter((r) => r.sovereign);
  const val = (key, iso, year) => (year != null && W.TS[key] ? W.tsValue(key, iso, year) : W.byIso.get(iso)?.[key]);
  const pop = (iso, year) => (year != null && W.TS.population ? W.tsValue("population", iso, year) : null) ?? W.byIso.get(iso)?.population;
  // the figure for the world's people (each country weighted by its population), if enough of the world has data
  function wavg(key, year, filter = () => true) {
    let s = 0, p = 0, all = 0;
    for (const r of sov().filter(filter)) {
      const q = pop(r.iso3, year); if (!q) continue;
      all += q;
      const v = val(key, r.iso3, year); if (v == null) continue;
      s += v * q; p += q;
    }
    return p && p / all >= 0.6 ? s / p : null;
  }
  function lastYear(key, f) {
    const sp = W.TS[key] ? W.span(key) : null;
    if (!sp) return null;
    for (let y = sp[1]; y >= sp[0]; y--) if ((f ? f(y) : wavg(key, y)) != null) return y;
    return null;
  }
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  // three options around the right answer, in order, with the right one in a random place
  function around(v, step, fmt, lo = -Infinity, hi = Infinity) {
    let r = Math.round(v / step) * step, pos = Math.floor(Math.random() * 3);
    if (r - pos * step < lo) pos = Math.floor((r - lo) / step);
    if (r + (2 - pos) * step > hi) pos = 2 - Math.floor((hi - r) / step);
    pos = Math.max(0, Math.min(2, pos));
    return { opts: [0, 1, 2].map((k) => fmt(r + (k - pos) * step)), ans: pos };
  }
  const pct = (x) => `${Math.round(x)}%`;
  const QUESTIONS = [
    () => {
      const y = lastYear("life_expectancy"); if (!y) return null;
      const v = wavg("life_expectancy", y), v0 = wavg("life_expectancy", 1960);
      const o = around(v, 10, (x) => `${Math.round(x)} years`);
      return { q: "What is the life expectancy of the world today?", ...o, why: `It's about ${Math.round(v)} years (${y}), counting every person. In 1960 it was ${v0 ? Math.round(v0) + " years" : "much lower"}.`, link: "v=trends&tk=life_expectancy" };
    },
    () => {
      const key = "extreme_poverty", y1 = lastYear(key); if (!y1) return null;
      let y0 = 1995; while (y0 < y1 - 10 && wavg(key, y0) == null) y0++;
      const a = wavg(key, y0), b = wavg(key, y1); if (a == null || b == null) return null;
      const ratio = b / a;
      return { q: `In the last ${y1 - y0} years, the share of the world's people living in extreme poverty has…`, opts: ["Almost doubled", "Stayed about the same", "Fallen by half or more"],
        ans: ratio > 1.4 ? 0 : ratio < 0.6 ? 2 : 1, why: `It went from ${pct(a)} of people in ${y0} to ${pct(b)} in ${y1}.`, link: `v=trends&tk=${key}&trel=pct&tb=${y0}` };
    },
    () => {
      const y = lastYear("electricity"); if (!y) return null;
      const v = wavg("electricity", y);
      const o = around(v, 20, (x) => pct(x), 10, 100);
      return { q: "How many of the world's people have some electricity at home?", ...o, why: `About ${pct(v)} (${y}).`, link: "c=electricity" };
    },
    () => {
      const y = lastYear("fertility"); if (!y) return null;
      const v = wavg("fertility", y), v0 = wavg("fertility", 1965);
      const o = around(v, 1.5, (x) => `About ${(+x.toFixed(1)).toString()}`, 1.5);
      return { q: "On average, how many children does a woman in the world have today?", ...o, why: `About ${v.toFixed(1)} (${y})${v0 ? `, down from ${v0.toFixed(1)} in 1965` : ""}.`, link: "v=trends&tk=fertility" };
    },
    () => {
      const key = "under5_mortality", y1 = lastYear(key); if (!y1) return null;
      const a = wavg(key, 1990), b = wavg(key, y1); if (a == null || b == null) return null;
      const ratio = b / a;
      return { q: `Since 1990, the share of children who die before their fifth birthday has…`, opts: ["Gone up", "Stayed about the same", "More than halved"],
        ans: ratio > 1.2 ? 0 : ratio < 0.5 ? 2 : 1, why: `It fell from ${Math.round(a)} to ${Math.round(b)} in every 1,000 births (${y1}).`, link: `v=trends&tk=${key}` };
    },
    () => {
      const tot = d3.sum(sov(), (r) => r.population || 0), asia = d3.sum(sov().filter((r) => r.region === "Asia"), (r) => r.population || 0);
      const v = (100 * asia) / tot;
      const o = around(v, 20, pct, 20, 80);
      return { q: "What share of the world's people live in Asia?", ...o, why: `About ${pct(v)}: Asia has about ${(asia / 1e9).toFixed(1)} billion of the world's ${(tot / 1e9).toFixed(1)} billion people.`, link: "c=population" };
    },
    () => {
      const low = (r) => r.income_group === "Low income";
      const y = lastYear("primary_completion", (yy) => wavg("primary_completion", yy, low)); if (!y) return null;
      const v = wavg("primary_completion", y, low); if (v == null) return null;
      const o = around(v, 20, pct, 20, 100);
      return { q: "In the world's low-income countries, how many children finish primary school?", ...o, why: `About ${pct(v)} (${y}).`, link: "f=income_group:Low%20income&c=primary_completion" };
    },
    () => {
      const key = "pop_un"; if (!W.TS[key]) return null;
      const iy = 2100 - W.TS_YEARS[0];
      const v = d3.sum(sov(), (r) => W.TS[key][r.iso3]?.[iy] || 0) / 1e9; if (!v) return null;
      const now = d3.sum(sov(), (r) => r.population || 0) / 1e9;
      const o = around(v, 2, (x) => `About ${Math.round(x)} billion`, 4);
      return { q: "The UN's experts expect the world's population in 2100 to be about…", ...o, why: `About ${v.toFixed(1)} billion, up from ${now.toFixed(1)} billion today: the UN expects growth to slow and stop as families get smaller.`, link: "v=trends&tk=pop_un&ta=total" };
    },
    () => {
      const y = lastYear("internet"); if (!y) return null;
      const v = wavg("internet", y);
      const o = around(v, 20, pct, 10, 100);
      return { q: "How many of the world's people use the internet?", ...o, why: `About ${pct(v)} (${y}).`, link: "v=trends&tk=internet" };
    },
    () => {
      const af = (r) => r.region === "Africa";
      const y = lastYear("life_expectancy", (yy) => wavg("life_expectancy", yy, af)); if (!y) return null;
      const v = wavg("life_expectancy", y, af);
      const o = around(v, 10, (x) => `${Math.round(x)} years`);
      return { q: "What is the life expectancy of people in Africa?", ...o, why: `About ${Math.round(v)} years (${y}): higher than many people guess, and rising fast.`, link: "v=trends&tk=life_expectancy" };
    },
    () => {
      const y = lastYear("basic_water"); if (!y) return null;
      const v = wavg("basic_water", y);
      const o = around(v, 20, pct, 20, 100);
      return { q: "How many of the world's people have at least basic drinking water?", ...o, why: `About ${pct(v)} (${y}).`, link: "c=basic_water" };
    },
  ];
  const WV = { qs: [], i: 0, right: 0, picked: null };
  function worldview() {
    W = window.WC;
    WV.qs = shuffle(QUESTIONS.map((f) => { try { return f(); } catch (e) { return null; } }).filter(Boolean)).slice(0, 8);
    WV.i = 0; WV.right = 0; WV.picked = null;
    drawWV();
  }
  function drawWV() {
    const el = card("wvCard", "wv", "Worldview quiz");
    const head = `<div class="dsc-head"><h2>🌍 Worldview quiz</h2><button type="button" class="iconbtn" id="wvX" aria-label="Close">×</button></div>`;
    if (WV.i >= WV.qs.length) {
      const n = WV.qs.length;
      el.innerHTML = `${head}<p class="wv-score"><b>${WV.right} out of ${n}</b></p>
        <p>A chimpanzee picking answers at random would get about ${Math.round(n / 3)} right. In Gapminder's surveys of thousands of people, most people do worse than that: we tend to think the world is worse than it is, because news is about sudden bad events, not slow improvements.</p>
        <p class="hint">Every answer was worked out from the data on this site, so it is up to date. Questions in the style of Hans Rosling's <i>Factfulness</i>.</p>
        <div class="dsc-row"><button type="button" class="primary" id="wvAgain">Play again</button></div>`;
      $("#wvX").onclick = () => (el.hidden = true);
      $("#wvAgain").onclick = worldview;
      return;
    }
    const q = WV.qs[WV.i], done = WV.picked != null;
    el.innerHTML = `${head}<p class="wv-n">Question ${WV.i + 1} of ${WV.qs.length}</p>
      <p class="wv-q">${esc(q.q)}</p>
      <div class="wv-opts">${q.opts.map((o, k) => `<button type="button" data-k="${k}" class="wv-o${done ? (k === q.ans ? " right" : k === WV.picked ? " wrong" : "") : ""}" ${done ? "disabled" : ""}><b>${"ABC"[k]}</b> ${esc(o)}</button>`).join("")}</div>
      ${done ? `<p class="wv-why"><b>${WV.picked === q.ans ? "Right!" : "Not quite."}</b> ${esc(q.why)}</p>
        <div class="dsc-row"><button type="button" class="primary" id="wvNext">${WV.i + 1 < WV.qs.length ? "Next question" : "See your score"}</button>${q.link ? `<button type="button" class="ghost" id="wvSee">See it on the map or chart</button>` : ""}</div>` : ""}`;
    $("#wvX").onclick = () => (el.hidden = true);
    el.querySelectorAll(".wv-o").forEach((b) => (b.onclick = () => { WV.picked = +b.dataset.k; if (WV.picked === q.ans) WV.right++; drawWV(); }));
    if ($("#wvNext")) $("#wvNext").onclick = () => { WV.i++; WV.picked = null; drawWV(); };
    if ($("#wvSee")) $("#wvSee").onclick = () => W.applyQS(q.link);
  }

  // ======================= Describe this chart =======================
  const H = () => window.WV_H;
  function corrText(r) { const a = Math.abs(r); return `${a >= 0.8 ? "very strong" : a >= 0.6 ? "strong" : a >= 0.4 ? "moderate" : a >= 0.2 ? "weak" : "very weak or no"} ${r >= 0 ? "positive" : "negative"}`; }
  function describeChart() {
    W = window.WC;
    const view = W.state.view;
    if (view === "map") return window.WMS?.open();
    const V = H().V, F = W.F, fmt = W.fmtShort, out = [];
    if (view === "compare") {
      const c = V.cmp, fx = F[c.x], fy = F[c.y], rows = (V.list?.rows || []).filter((r) => r.vals[0] != null && r.vals[1] != null);
      if (rows.length >= 5) {
        const X = rows.map((r) => r.vals[1]), Y = rows.map((r) => r.vals[0]);
        const lx = H().isLog(c.x, c.logx), ly = H().isLog(c.y, c.logy);
        const tx = X.map((v) => (lx ? Math.log10(v) : v)), ty = Y.map((v) => (ly ? Math.log10(v) : v));
        const mx = d3.mean(tx), my = d3.mean(ty);
        let sxy = 0, sxx = 0, syy = 0; tx.forEach((x, i) => { sxy += (x - mx) * (ty[i] - my); sxx += (x - mx) ** 2; syy += (ty[i] - my) ** 2; });
        const r = sxy / Math.sqrt(sxx * syy), slope = sxy / sxx;
        out.push({ h: "What the chart shows", t: `${fy.label} (up) against ${H().lower(fx.label)} (across) for ${rows.length} countries${c.year ? ` in ${c.year}` : ""}${W.lastEval.act.length ? " that match your filters" : ""}.` });
        out.push({ h: "The pattern", t: `A ${corrText(r)} link (r = ${r.toFixed(2)}): ${r >= 0 ? `countries with more ${H().lower(fx.short || fx.label)} tend to have more ${H().lower(fy.short || fy.label)}` : `countries with more ${H().lower(fx.short || fx.label)} tend to have less ${H().lower(fy.short || fy.label)}`}${Math.abs(r) < 0.2 ? ", but there is hardly any pattern" : ""}.` });
        const res = rows.map((row, i) => ({ n: W.byIso.get(row.iso).name, d: ty[i] - (my + slope * (tx[i] - mx)), x: X[i], y: Y[i] })).sort((a, b) => b.d - a.d);
        const sd = d3.deviation(res, (d) => d.d) || 1;
        const hi = res.filter((d) => d.d > 1.3 * sd).slice(0, 3), lo = res.filter((d) => d.d < -1.3 * sd).slice(-3).reverse();
        if (hi.length) out.push({ h: "Well above the trend", t: `${listAnd(hi.map((d) => `${d.n} (${fmt(fy, d.y)})`))}: ${H().lower(fy.short || fy.label)} is higher than the trend line would suggest.` });
        if (lo.length) out.push({ h: "Well below the trend", t: `${listAnd(lo.map((d) => `${d.n} (${fmt(fy, d.y)})`))}.` });
        const ymax = res.reduce((a, b) => (b.y > a.y ? b : a)), ymin = res.reduce((a, b) => (b.y < a.y ? b : a));
        out.push({ h: "Highest and lowest", t: `Highest ${H().lower(fy.short || fy.label)}: ${ymax.n} (${fmt(fy, ymax.y)}). Lowest: ${ymin.n} (${fmt(fy, ymin.y)}).` });
        out.push({ h: "Remember", t: "A link between two measures doesn't prove that one causes the other: both may depend on something else, such as wealth." });
      }
    } else {
      const csv = V.csv?.();
      if (csv && csv.length > 2 && csv[0][0] === "Year") {
        // over time: each line's first and last values
        const names = csv[0].slice(1), data = csv.slice(1).filter((r) => typeof r[0] === "number");
        const key = view === "trends" ? V.trend.key : V.rank.key, f = F[key];
        const ser = names.map((n, j) => {
          const pts = data.map((r) => [r[0], r[j + 1]]).filter(([, v]) => v !== "" && v != null);
          return pts.length >= 2 ? { n, y0: pts[0][0], v0: pts[0][1], y1: pts[pts.length - 1][0], v1: pts[pts.length - 1][1] } : null;
        }).filter(Boolean);
        if (ser.length) {
          out.push({ h: "What the chart shows", t: `${V.title || f.label}.` });
          const world = ser.find((s) => /^World/.test(s.n)) || ser[0];
          const pc = (s) => (s.v0 ? (100 * (s.v1 - s.v0)) / Math.abs(s.v0) : null);
          out.push({ h: "Overall", t: `${world.n}: from ${fmt(f, world.v0)} in ${world.y0} to ${fmt(f, world.v1)} in ${world.y1}${pc(world) != null && V.trend.rel !== "pct" && V.trend.rel !== "idx" ? ` (${pc(world) > 0 ? "up" : "down"} ${Math.abs(Math.round(pc(world)))}%)` : ""}.` });
          const ch = ser.filter((s) => s !== world && pc(s) != null).sort((a, b) => pc(a) - pc(b));
          const sg = (s) => `${pc(s) > 0 ? "+" : "−"}${Math.abs(Math.round(pc(s)))}%`;
          if (ch.length >= 2 && V.trend.rel !== "pct" && V.trend.rel !== "idx") {
            const lo = ch[0], hi = ch[ch.length - 1];
            out.push({ h: "Fastest and slowest change", t: pc(hi) <= 0 ? `Everything fell. The biggest fall was ${lo.n} (${sg(lo)}), the smallest ${hi.n} (${sg(hi)}).`
              : pc(lo) >= 0 ? `Everything rose. The biggest rise was ${hi.n} (${sg(hi)}), the smallest ${lo.n} (${sg(lo)}).`
              : `The biggest rise was ${hi.n} (${sg(hi)}); the biggest fall was ${lo.n} (${sg(lo)}).` });
          }
          const last = ser.filter((s) => s.y1 === world.y1).sort((a, b) => b.v1 - a.v1);
          if (last.length >= 2) out.push({ h: `Highest and lowest in ${world.y1}`, t: `${last[0].n} (${fmt(f, last[0].v1)}) and ${last[last.length - 1].n} (${fmt(f, last[last.length - 1].v1)}).` });
          if (last.length >= 2 && ser.find((s) => s.n === last[0].n)?.v0 != null) {
            const gap0 = Math.abs((ser.find((s) => s.n === last[0].n).v0) - (ser.find((s) => s.n === last[last.length - 1].n).v0)), gap1 = Math.abs(last[0].v1 - last[last.length - 1].v1);
            out.push({ h: "The gap", t: `The gap between them has ${gap1 > gap0 * 1.1 ? "widened" : gap1 < gap0 * 0.9 ? "narrowed" : "stayed about the same"} (from ${fmt(f, gap0)} to ${fmt(f, gap1)}).` });
          }
        }
      } else {
        // one year: who is highest and lowest
        const L = V.list, f = L?.cols?.[0], rows = (L?.rows || []).filter((r) => r.vals[0] != null).sort((a, b) => b.vals[0] - a.vals[0]);
        if (f && rows.length >= 3) {
          const vs = rows.map((r) => r.vals[0]), med = d3.median(vs);
          const nm = (r) => W.byIso.get(r.iso).name;
          out.push({ h: "What the chart shows", t: `${V.title || f.label}, for ${rows.length} countries.` });
          out.push({ h: "Highest", t: listAnd(rows.slice(0, 3).map((r) => `${nm(r)} (${fmt(f, r.vals[0])})`)) + "." });
          out.push({ h: "Lowest", t: listAnd(rows.slice(-3).reverse().map((r) => `${nm(r)} (${fmt(f, r.vals[0])})`)) + "." });
          out.push({ h: "The middle", t: `The median country has ${fmt(f, med)}.${vs[vs.length - 1] > 0 && vs[0] / vs[vs.length - 1] >= 5 ? ` The highest is about ${Math.round(vs[0] / vs[vs.length - 1]).toLocaleString()} times the lowest.` : ""}` });
          const top10 = rows.slice(0, 10).map((r) => W.byIso.get(r.iso).region), cnt = d3.rollups(top10, (v) => v.length, (d) => d).sort((a, b) => b[1] - a[1]);
          if (cnt.length) out.push({ h: "Where the top ten are", t: cnt.map(([k, n]) => `${n} in ${k}`).join(", ") + "." });
        }
      }
    }
    const el = card("dchCard", "dch", "Describe this chart");
    el.innerHTML = `<div class="dsc-head"><h2>📝 Describe this chart</h2><button type="button" class="iconbtn" id="dchX" aria-label="Close">×</button></div>
      ${out.length ? `<dl class="dsc-list">${out.map((o) => `<dt>${esc(o.h)}</dt><dd>${esc(o.t)}</dd>`).join("")}</dl><p class="hint">Worked out from the data in the chart.</p>
        <div class="dsc-row"><button type="button" class="ghost" id="dchCopy">Copy</button></div>` : `<p>There isn't enough in this chart to describe yet. Try another measure, or add some countries.</p>`}`;
    $("#dchX").onclick = () => (el.hidden = true);
    if ($("#dchCopy")) $("#dchCopy").onclick = (e) => { navigator.clipboard?.writeText(out.map((o) => `${o.h}: ${o.t}`).join("\n")); e.target.textContent = "Copied ✓"; };
  }

  // ======================= Notes on a chart or map =======================
  const NS = "http://www.w3.org/2000/svg";
  const COLOURS = ["#d6453d", "#1d6fd1", "#1a8f4c", "#111111"];
  const A = { on: false, tool: "arrow", colour: COLOURS[0], view: null, target: null, svg: null, hist: [], drag: null };
  function targetSVG() { return W.state.view === "map" ? W.mapSVG() : $("#vsvg"); }
  function place() {
    if (!A.svg || !A.target) return;
    const r = A.target.getBoundingClientRect();
    Object.assign(A.svg.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
  }
  function loop() {
    if (!A.svg) return;
    if (W.state.view !== A.view || !document.body.contains(A.target)) { clearNotes(); return; }
    place();
    requestAnimationFrame(loop);
  }
  function pt(e) { const m = A.svg.getScreenCTM().inverse(); const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m); return [p.x, p.y]; }
  const unit = () => { const vb = A.svg.viewBox.baseVal; return Math.max(vb.width, vb.height) / 300; };
  function el(name, attrs) { const n = document.createElementNS(NS, name); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; }
  function marker(colour) {
    const id = "annArrow" + colour.slice(1);
    if (!A.svg.querySelector("#" + id)) {
      const m = el("marker", { id, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 4, markerHeight: 4, orient: "auto-start-reverse" });
      m.appendChild(el("path", { d: "M0,0 L10,5 L0,10 z", fill: colour }));
      A.svg.querySelector("defs").appendChild(m);
    }
    return `url(#${id})`;
  }
  function startNotes() {
    W = window.WC;
    const t = targetSVG(); if (!t) return;
    if (!A.svg || A.target !== t) {
      clearNotes();
      A.target = t; A.view = W.state.view;
      A.svg = el("svg", { id: "annSvg", class: "annsvg", viewBox: t.getAttribute("viewBox") || `0 0 ${t.clientWidth} ${t.clientHeight}`, preserveAspectRatio: t.getAttribute("preserveAspectRatio") || "xMidYMid meet" });
      A.svg.appendChild(el("defs", {})); A.svg.appendChild(el("g", { class: "items" }));
      document.body.appendChild(A.svg);
      bindDraw();
      requestAnimationFrame(loop);
    }
    A.on = true; A.svg.classList.add("on");
    bar();
  }
  function bar() {
    let b = $("#annBar");
    if (!b) { b = document.createElement("div"); b.id = "annBar"; b.className = "annbar card"; document.body.appendChild(b); }
    b.hidden = false;
    const n = A.svg ? A.svg.querySelector("g.items").children.length : 0;
    if (!A.on) {
      b.innerHTML = `<span>✏️ ${n} note${n === 1 ? "" : "s"} on the ${A.view === "map" ? "map" : "chart"}</span><button type="button" class="ghost" data-a="edit">Edit</button><button type="button" class="ghost" data-a="dl">⬇ Picture</button><button type="button" class="ghost" data-a="clear">Remove</button>`;
    } else {
      const tools = [["arrow", "↗ Arrow"], ["circle", "◯ Circle"], ["box", "▭ Highlight"], ["text", "T Text"], ["move", "✥ Move"], ["erase", "⌫ Delete"]];
      b.innerHTML = `<span class="annt">✏️ Notes</span>${tools.map(([k, l]) => `<button type="button" class="tool${A.tool === k ? " on" : ""}" data-t="${k}">${l}</button>`).join("")}
        <span class="anncols">${COLOURS.map((c) => `<button type="button" class="col${A.colour === c ? " on" : ""}" data-c="${c}" style="background:${c}" aria-label="Colour"></button>`).join("")}</span>
        <button type="button" class="ghost" data-a="undo">Undo</button><button type="button" class="ghost" data-a="dl">⬇ Download picture</button><button type="button" class="primary" data-a="done">Done</button>
        <p class="annhint">${{ arrow: "Drag to draw an arrow.", circle: "Drag to draw a circle.", box: "Drag to highlight an area.", text: "Click where the words should go.", move: "Drag a note to move it.", erase: "Click a note to delete it." }[A.tool]} Notes stay on top of this ${A.view === "map" ? "map" : "chart"} and are included when you download it.</p>`;
    }
    b.querySelectorAll("[data-t]").forEach((x) => (x.onclick = () => { A.tool = x.dataset.t; bar(); }));
    b.querySelectorAll("[data-c]").forEach((x) => (x.onclick = () => { A.colour = x.dataset.c; bar(); }));
    b.querySelectorAll("[data-a]").forEach((x) => (x.onclick = () => {
      const a = x.dataset.a;
      if (a === "edit") startNotes();
      else if (a === "done") { A.on = false; A.svg?.classList.remove("on"); bar(); }
      else if (a === "clear") clearNotes();
      else if (a === "undo") { const last = A.hist.pop(); last?.remove(); bar(); }
      else if (a === "dl") window.WV?.downloadImage?.();
    }));
  }
  function add(node) { A.svg.querySelector("g.items").appendChild(node); A.hist.push(node); bar(); }
  function bindDraw() {
    const s = A.svg;
    s.addEventListener("pointerdown", (e) => {
      if (!A.on) return;
      e.preventDefault();
      const [x, y] = pt(e), u = unit(), c = A.colour;
      const item = e.target.closest?.("g.items > *");
      if (A.tool === "erase") { if (item) { item.remove(); A.hist = A.hist.filter((h) => h !== item); bar(); } return; }
      if (A.tool === "move") { if (item) { const tr = (item.getAttribute("transform") || "translate(0,0)").match(/-?[\d.]+/g).map(Number); A.drag = { item, x, y, tx: tr[0], ty: tr[1] }; s.setPointerCapture(e.pointerId); } return; }
      if (A.tool === "text") { textAt(x, y, e.clientX, e.clientY); return; }
      let n;
      if (A.tool === "arrow") n = el("line", { x1: x, y1: y, x2: x, y2: y, stroke: c, "stroke-width": u * 1.1, "stroke-linecap": "round", "marker-end": marker(c) });
      if (A.tool === "circle") n = el("ellipse", { cx: x, cy: y, rx: 0, ry: 0, fill: "none", stroke: c, "stroke-width": u * 0.9 });
      if (A.tool === "box") n = el("rect", { x, y, width: 0, height: 0, rx: u, fill: c, "fill-opacity": 0.18, stroke: c, "stroke-width": u * 0.5 });
      n.setAttribute("transform", "translate(0,0)");
      s.querySelector("g.items").appendChild(n);
      A.drag = { new: n, x, y };
      s.setPointerCapture(e.pointerId);
    });
    s.addEventListener("pointermove", (e) => {
      const d = A.drag; if (!d) return;
      const [x, y] = pt(e);
      if (d.item) { d.item.setAttribute("transform", `translate(${d.tx + x - d.x},${d.ty + y - d.y})`); return; }
      const n = d.new;
      if (n.tagName === "line") { n.setAttribute("x2", x); n.setAttribute("y2", y); }
      if (n.tagName === "ellipse") { n.setAttribute("cx", (x + d.x) / 2); n.setAttribute("cy", (y + d.y) / 2); n.setAttribute("rx", Math.abs(x - d.x) / 2); n.setAttribute("ry", Math.abs(y - d.y) / 2); }
      if (n.tagName === "rect") { n.setAttribute("x", Math.min(x, d.x)); n.setAttribute("y", Math.min(y, d.y)); n.setAttribute("width", Math.abs(x - d.x)); n.setAttribute("height", Math.abs(y - d.y)); }
    });
    const up = () => {
      const d = A.drag; A.drag = null; if (!d || d.item) return;
      const bb = d.new.getBBox();
      if (bb.width + bb.height < unit() * 2) d.new.remove(); else { A.hist.push(d.new); bar(); }
    };
    s.addEventListener("pointerup", up); s.addEventListener("pointercancel", up);
  }
  function textAt(x, y, cx, cy) {
    const inp = document.createElement("input");
    inp.className = "anninput"; inp.placeholder = "Type, then press Enter";
    Object.assign(inp.style, { left: cx + "px", top: cy - 14 + "px", color: A.colour });
    document.body.appendChild(inp); inp.focus();
    let ended = false;
    const finish = (keep) => {
      if (ended) return; ended = true;
      const t = inp.value.trim(); inp.remove();
      if (!keep || !t) return;
      const u = unit();
      const n = el("text", { x, y, fill: A.colour, "font-size": u * 5, "font-weight": 700, "font-family": '"IBM Plex Sans", Arial, sans-serif', stroke: "#ffffff", "stroke-width": u * 1.2, "paint-order": "stroke", transform: "translate(0,0)" });
      n.textContent = t;
      add(n);
    };
    inp.onkeydown = (e) => { if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); e.stopPropagation(); };
    inp.onblur = () => finish(true);
  }
  function clearNotes() {
    A.svg?.remove(); A.svg = null; A.target = null; A.on = false; A.hist = [];
    const b = $("#annBar"); if (b) b.hidden = true;
  }

  function init() {
    W = window.WC;
    const tools = $("#cpLearn");
    if (tools && !$("#wvBtn")) {
      const b = document.createElement("button");
      b.type = "button"; b.id = "wvBtn"; b.className = "cp-tool"; b.title = "Ten questions about the world that most people get wrong, worked out from the latest data";
      b.innerHTML = `<span class="cp-ic" aria-hidden="true">🌍</span>Worldview quiz`;
      b.onclick = worldview;
      ($("#qmBtn") || tools.lastElementChild)?.after?.(b) || tools.appendChild(b);
    }
    const d = $("#dscBtn");
    if (d) { d.innerHTML = `<span class="cp-ic" aria-hidden="true">📝</span>Describe`; d.title = "The main points of the map or chart on screen, in plain words"; d.onclick = describeChart; }
  }
  window.WLN = { init, worldview, describeChart, startNotes, clearNotes, get notes() { return A.svg; } };
})();
