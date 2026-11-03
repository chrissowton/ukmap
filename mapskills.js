/* Map skills: "Describe this map" (the main points of the pattern on the map, with the filters in plain words)
   questions) and the coursework map (A4 landscape, with title, key, north arrow, projection, sources and the student's name). */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  let W;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const listAnd = (a) => (a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);
  const REGION_ORDER = ["Africa", "Americas", "Asia", "Europe", "Oceania"];

  // ---------- Describe ----------
  // what the map shows, worked out from the countries on it
  function analyse() {
    const st = W.state, cs = W.cs, act = W.lastEval.act;
    const all = W.pool();
    const matches = W.matches;
    const out = { n: matches.length, total: all.length, act, cs, year: st.year };
    // where the matching countries are, compared with all countries
    const byReg = d3.rollup(all, (v) => v.length, (r) => r.region || "Other");
    const mReg = d3.rollup(matches, (v) => v.length, (r) => r.region || "Other");
    out.regions = [...byReg].filter(([k]) => k !== "Other").map(([k, n]) => ({ k, n, m: mReg.get(k) || 0, share: (mReg.get(k) || 0) / n }))
      .sort((a, b) => b.m - a.m);
    if (!cs) return out;
    const f = cs.f, T = (v) => f.toT(v);
    const rows = matches.filter((r) => typeof r[f.key] === "number").map((r) => ({ r, v: r[f.key], t: T(r[f.key]) }));
    if (rows.length < 3) return out;
    rows.sort((a, b) => b.v - a.v);
    out.f = f; out.rows = rows;
    out.top = rows.slice(0, 5); out.bottom = rows.slice(-5).reverse();
    const vs = rows.map((x) => x.v).sort((a, b) => a - b);
    out.median = d3.quantileSorted(vs, 0.5); out.q1 = d3.quantileSorted(vs, 0.25); out.q3 = d3.quantileSorted(vs, 0.75);
    out.min = vs[0]; out.max = vs[vs.length - 1];
    // continents and smaller regions, by their median
    const med = (key) => d3.rollups(rows, (v) => ({ n: v.length, med: d3.median(v, (x) => x.v), medT: d3.median(v, (x) => x.t), sd: d3.deviation(v, (x) => x.t) || 0 }), (x) => x.r[key] || "")
      .filter(([k, o]) => k && o.n >= 3).map(([k, o]) => ({ k, ...o })).sort((a, b) => b.med - a.med);
    out.cont = med("region"); out.sub = med("subregion");
    // anomalies: countries far from the rest of their region
    const subMap = new Map(out.sub.map((s) => [s.k, s]));
    const sdAll = d3.deviation(rows, (x) => x.t) || 1;
    out.anoms = rows.map((x) => {
      const s = subMap.get(x.r.subregion);
      if (!s || s.n < 4) return null;
      const others = rows.filter((y) => y.r.subregion === x.r.subregion && y !== x);
      const m = d3.median(others, (y) => y.t), mv = d3.median(others, (y) => y.v);
      return { ...x, sub: x.r.subregion, d: (x.t - m) / sdAll, mv };
    }).filter((a) => a && Math.abs(a.d) > 0.9).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 4);
    // measures that line up with this one (Spearman's rank), to suggest an explanation
    const rank = (arr) => { const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = new Array(arr.length); let i = 0;
      while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; i = j + 1; } return r; };
    const pear = (a, b) => { const ma = d3.mean(a), mb = d3.mean(b); let n = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return n / Math.sqrt(da * db); };
    const links = [];
    for (const g of W.numericFilters) {
      if (g.key === f.key || /_year$|_rank$/.test(g.key) || /\brank\b/i.test(g.label)) continue;
      const pr = rows.filter((x) => typeof x.r[g.key] === "number");
      if (pr.length < Math.max(30, rows.length * 0.6)) continue;
      const rho = pear(rank(pr.map((x) => x.v)), rank(pr.map((x) => x.r[g.key])));
      if (Number.isFinite(rho) && Math.abs(rho) >= 0.6) links.push({ g, rho, n: pr.length });
    }
    // leave out near-copies of the same thing (e.g. GDP and GNI)
    out.links = links.sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho)).filter((l) => Math.abs(l.rho) < 0.97).slice(0, 4);
    return out;
  }
  const v = (f, x) => W.fmtShort(f, x);
  const named = (list, f) => list.map((x) => `${x.r.name} (${v(f, x.v)})`);

  function describe() {
    const a = analyse(), out = [];
    const what = a.cs ? a.f?.label : null;
    const yr = a.year ? ` in ${a.year}` : "";
    if (!a.act.length && !a.cs) return { empty: true };
    // the filters in plain words
    const fp = a.act.map((fl) => W.phrase?.(fl)).filter(Boolean);
    const where = fp.length ? ` (countries where ${W.andList(fp)})` : "";
    if (a.cs && a.rows) {
      const f = a.f;
      out.push({ h: "What the map shows", t: `${what}${yr}, for ${a.rows.length} countries${a.act.length ? ` that match your filters${where}` : ""}.` });
      if (a.cont.length >= 2) {
        const hi = a.cont[0], lo = a.cont[a.cont.length - 1];
        out.push({ h: "General pattern", t: `Generally highest in ${hi.k} (median ${v(f, hi.med)}) and lowest in ${lo.k} (median ${v(f, lo.med)}).` +
          (a.sub.length >= 3 ? ` By region, the highest median is in ${a.sub[0].k} (${v(f, a.sub[0].med)}) and the lowest in ${a.sub[a.sub.length - 1].k} (${v(f, a.sub[a.sub.length - 1].med)}).` : "") });
      }
      out.push({ h: "Highest", t: listAnd(named(a.top, f)) + "." });
      out.push({ h: "Lowest", t: listAnd(named(a.bottom, f)) + "." });
      out.push({ h: "Range and spread", t: `From ${v(f, a.min)} to ${v(f, a.max)}. The median country has ${v(f, a.median)}; the middle half of countries lie between ${v(f, a.q1)} and ${v(f, a.q3)}.` +
        (a.max / Math.max(1e-9, a.min) > 20 && a.min > 0 ? ` The highest is about ${Math.round(a.max / a.min).toLocaleString()} times the lowest.` : "") });
      if (a.anoms.length) out.push({ h: "Anomalies", t: a.anoms.map((x) => `${x.r.name} is much ${x.d > 0 ? "higher" : "lower"} than the rest of ${x.sub} (${v(f, x.v)}, against a median of ${v(f, x.mv)})`).join("; ") + "." });
      if (a.links.length) out.push({ h: "Might be linked to", t: a.links.map((l) => `${l.g.label} (${l.rho > 0 ? "rises with it" : "falls as it rises"}, ρ = ${l.rho.toFixed(2)})`).join("; ") + ". A link doesn't prove one causes the other." });
    } else {
      const top = a.regions.filter((r) => r.m > 0);
      out.push({ h: "What the map shows", t: `${a.n} of ${a.total} countries match your filters${yr}${where}.` });
      if (top.length) {
        const main = top[0];
        out.push({ h: "General pattern", t: `${main.m} of them (${Math.round((main.m / Math.max(1, a.n)) * 100)}%) are in ${main.k}` +
          (top.length > 1 ? `, then ${listAnd(top.slice(1, 3).map((r) => `${r.k} (${r.m})`))}` : "") + "." +
          (a.regions.filter((r) => r.m === 0).length ? ` None are in ${listAnd(a.regions.filter((r) => r.m === 0).map((r) => r.k))}.` : "") });
        out.push({ h: "Share of each continent", t: a.regions.filter((r) => r.n >= 5).sort((x, y) => y.share - x.share).map((r) => `${r.k} ${Math.round(r.share * 100)}%`).join(" · ") + "." });
        const lone = W.matches.filter((r) => W.matches.filter((s) => s.subregion === r.subregion).length === 1).slice(0, 4);
        if (lone.length && a.n >= 6) out.push({ h: "Anomalies", t: `On their own in their region: ${listAnd(lone.map((r) => `${r.name} (${r.subregion})`))}.` });
      }
    }
    return { out, what, a };
  }

  function open() {
    if (W.state.view !== "map") W.setView("map");
    const d = describe();
    let el = $("#dscCard");
    if (!el) { el = document.createElement("div"); el.id = "dscCard"; el.className = "card dsc"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Describe this map"); document.body.appendChild(el); }
    el.hidden = false;
    if (d.empty) {
      el.innerHTML = `<div class="dsc-head"><h2>📝 Describe this map</h2><button type="button" class="iconbtn" id="dscX" aria-label="Close">×</button></div>
        <p>Add a filter, or shade the map by a number (for example “Life expectancy”), and the main points of the pattern will appear here.</p>`;
      $("#dscX").onclick = close; return;
    }
    el.innerHTML = `<div class="dsc-head"><h2>📝 Describe this map</h2><button type="button" class="iconbtn" id="dscX" aria-label="Close">×</button></div>
      <div class="dsc-body"><dl class="dsc-list">${d.out.map((o) => `<dt>${esc(o.h)}</dt><dd>${esc(o.t)}</dd>`).join("")}</dl>
        <p class="hint">Worked out from the data on the map.</p></div>
      <div class="dsc-row"><button type="button" class="ghost" id="dscCopy">Copy</button></div>`;
    $("#dscX").onclick = close;
    const plain = () => d.out.map((o) => `${o.h}: ${o.t}`);
    $("#dscCopy").onclick = () => { navigator.clipboard?.writeText(plain().join("\n")); $("#dscCopy").textContent = "Copied ✓"; };
  }
  function close() { const el = $("#dscCard"); if (el) el.hidden = true; }
  // keep it up to date as the map changes
  function refresh() { const el = $("#dscCard"); if (el && !el.hidden) open(); }

  // ---------- Coursework map ----------
  function courseworkDialog() {
    let el = $("#cwCard");
    if (!el) { el = document.createElement("div"); el.id = "cwCard"; el.className = "card dsc cw"; el.setAttribute("role", "dialog"); document.body.appendChild(el); }
    el.hidden = false;
    const saved = (() => { try { return JSON.parse(localStorage.getItem("wc-cw") || "{}"); } catch (e) { return {}; } })();
    const cs = W.cs;
    const title = cs ? `${cs.f.label} by country, ${W.state.year || "latest data"}` : (document.querySelector("#sentence")?.textContent || "World map").replace(/Clear all$/, "").replace(/^Showing /, "").trim();
    el.innerHTML = `<div class="dsc-head"><h2>🗺️ Coursework map</h2><button type="button" class="iconbtn" id="cwX" aria-label="Close">×</button></div>
      <p class="hint">An A4 landscape map with everything a marker looks for: title, key, north arrow, projection, sources and date.</p>
      <label class="fld">Title <input id="cwTitle" type="text" value="${esc(saved.title && saved.for === title ? saved.title : title)}"></label>
      <label class="fld">Your name (optional) <input id="cwName" type="text" value="${esc(saved.name || "")}"></label>
      <label class="fld">Figure number (optional) <input id="cwFig" type="text" placeholder="e.g. Figure 3" value="${esc(saved.fig || "")}"></label>
      <div class="dsc-row"><button type="button" class="primary" id="cwPng">Download image (PNG)</button><button type="button" class="ghost" id="cwPdf">Print or save as PDF</button></div>`;
    $("#cwX").onclick = () => (el.hidden = true);
    const go = async (pdf) => {
      const o = { title: $("#cwTitle").value.trim() || title, name: $("#cwName").value.trim(), fig: $("#cwFig").value.trim() };
      try { localStorage.setItem("wc-cw", JSON.stringify({ ...o, for: title })); } catch (e) { /* ignore */ }
      const btn = pdf ? $("#cwPdf") : $("#cwPng"); const t0 = btn.textContent; btn.textContent = "Making…"; btn.disabled = true;
      try {
        const cv = await courseworkCanvas(o);
        if (pdf) printCanvas(cv, o.title);
        else cv.toBlob((b) => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "coursework-map.png"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }, "image/png");
      } catch (e) { btn.textContent = "Sorry, that didn't work"; return; }
      btn.textContent = t0; btn.disabled = false;
    };
    $("#cwPng").onclick = () => go(false);
    $("#cwPdf").onclick = () => go(true);
  }
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function wrap(ctx, text, maxW) {
    const lines = []; let cur = "";
    for (const w of String(text).split(/\s+/)) { const t = cur ? cur + " " + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur); return lines;
  }
  async function courseworkCanvas(o) {
    // A4 landscape at 200 dots per inch
    const Wd = 2339, Ht = 1654, M = 90, FONT = '"IBM Plex Sans", Arial, sans-serif';
    const cv = document.createElement("canvas"); cv.width = Wd; cv.height = Ht;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, Wd, Ht);
    ctx.fillStyle = "#14212b"; ctx.textBaseline = "alphabetic";
    // title
    ctx.font = `600 46px ${FONT}`;
    const tl = wrap(ctx, (o.fig ? o.fig + ": " : "") + o.title, Wd - M * 2).slice(0, 2);
    tl.forEach((l, i) => ctx.fillText(l, M, M + 40 + i * 56));
    const top = M + 40 + tl.length * 56;
    // footer: key on the left, sources on the right
    const footH = 260, mapH = Ht - top - footH - 30, mapW = Wd - M * 2;
    const svgEl = W.mapSVG();
    const vb = svgEl.getAttribute("viewBox").split(/\s+/).map(Number);
    // crop to the land (empty ocean above and below wastes the page)
    const cb = W.mapBounds ? W.mapBounds() : [0, 0, vb[2], vb[3]];
    const k = Math.min(mapW / cb[2], mapH / cb[3]);
    const mapCv = await window.WV.svgToCanvas(svgEl, k, css("--ocean") || "#dfe7ec");
    const dw = cb[2] * k, dh = cb[3] * k;
    const mx = M + (mapW - dw) / 2, my = top + 10;
    ctx.drawImage(mapCv, cb[0] * k, cb[1] * k, dw, dh, mx, my, dw, dh);
    ctx.strokeStyle = "#14212b"; ctx.lineWidth = 3; ctx.strokeRect(mx, my, dw, dh);
    // north arrow
    const nx = mx + dw - 80, cy = my + 80;
    ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.beginPath(); ctx.arc(nx, cy, 54, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = "#14212b"; ctx.font = `700 28px ${FONT}`; ctx.textAlign = "center"; ctx.fillText("N", nx, cy - 18); ctx.textAlign = "left";
    ctx.beginPath(); ctx.moveTo(nx, cy - 10); ctx.lineTo(nx + 16, cy + 40); ctx.lineTo(nx, cy + 30); ctx.lineTo(nx - 16, cy + 40); ctx.closePath(); ctx.fill();
    // key
    const ky = my + dh + 50;
    ctx.font = `600 28px ${FONT}`; ctx.fillStyle = "#14212b"; ctx.fillText("Key", M, ky);
    drawKey(ctx, M, ky + 20, Wd * 0.55, FONT);
    // sources and details
    const src = window.WV?.currentSource?.() || "";
    ctx.font = `22px ${FONT}`; ctx.fillStyle = "#4a5a66";
    const rx = Wd * 0.6, rw = Wd - M - rx;
    const lines = [
      ...wrap(ctx, src, rw).slice(0, 5),
      "Projection: Equal Earth (shows the true relative size of countries). Scale varies across a world map.",
      `Made with Which Countries? · ${(W.SITE?.url || location.host || "").replace(/^https?:\/\//, "")} · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
      o.name ? `Map by ${o.name}` : "",
    ].filter(Boolean);
    let yy = ky;
    for (const l of lines) for (const w of wrap(ctx, l, rw)) { ctx.fillText(w, rx, yy); yy += 30; }
    return cv;
  }
  // the key, drawn to match the map
  function drawKey(ctx, x, y, w, FONT) {
    const cs = W.cs, si = W.styleInfo;
    ctx.font = `22px ${FONT}`; ctx.fillStyle = "#14212b";
    const sw = (col, label, xx, yy) => { ctx.fillStyle = col; ctx.fillRect(xx, yy, 40, 26); ctx.strokeStyle = "#7a8a96"; ctx.lineWidth = 1; ctx.strokeRect(xx, yy, 40, 26); ctx.fillStyle = "#14212b"; ctx.fillText(label, xx + 52, yy + 21); return ctx.measureText(label).width + 52; };
    if (si) {
      // the on-screen key already says what the special map style means
      const t = document.querySelector("#legend")?.innerText.replace(/\s+/g, " ").trim() || "";
      wrap(ctx, t, w).slice(0, 4).forEach((l, i) => ctx.fillText(l, x, y + 22 + i * 30));
      return;
    }
    if (cs) {
      ctx.fillText(cs.f.label + (W.state.year && cs.f.time ? `, ${W.state.year}` : ""), x, y + 22);
      if (cs.breaks) {
        let xx = x, yy = y + 42;
        cs.cols.forEach((c, i) => {
          const lab = `${W.fmtShort(cs.f, cs.breaks[i])} – ${W.fmtShort(cs.f, cs.breaks[i + 1])} (${cs.counts[i]})`;
          const need = ctx.measureText(lab).width + 80;
          if (xx + need > x + w) { xx = x; yy += 38; }
          xx += sw(c, lab, xx, yy) + 28;
        });
        ctx.fillStyle = "#4a5a66"; ctx.fillText(`Classes: ${W.CLASS_NAMES[cs.method] || cs.method}. Number of countries in brackets.`, x, yy + 64);
      } else {
        const g = ctx.createLinearGradient(x, 0, x + 420, 0);
        const st = cs.grad.split(/,\s*(?![^(]*\))/);
        st.forEach((c, i) => g.addColorStop(i / Math.max(1, st.length - 1), c));
        ctx.fillStyle = g; ctx.fillRect(x, y + 42, 420, 26);
        ctx.fillStyle = "#14212b";
        ctx.fillText(W.fmtShort(cs.f, cs.ext[0]), x, y + 98);
        const hi = W.fmtShort(cs.f, cs.ext[1]); ctx.fillText(hi, x + 420 - ctx.measureText(hi).width, y + 98);
      }
      sw(css("--land") || "#d6dde2", "No data, or doesn't match the filters", x, y + 120);
      return;
    }
    if (W.lastEval.act.length) { sw(css("--match") || "#1c7a8c", "Matches every filter", x, y + 40); sw(css("--land") || "#d6dde2", "Doesn't match", x, y + 80); }
  }
  function printCanvas(cv, title) {
    const url = cv.toDataURL("image/png");
    const w = window.open("", "_blank");
    if (!w) { const a = document.createElement("a"); a.href = url; a.download = "coursework-map.png"; a.click(); return; }
    w.document.write(`<!doctype html><title>${esc(title)}</title><style>@page{size:A4 landscape;margin:0}html,body{margin:0}img{width:100%;display:block}</style><img src="${url}" onload="setTimeout(()=>print(),200)">`);
    w.document.close();
  }

  function init() {
    W = window.WC;
    const tools = $("#cpLearn");
    if (tools) {
      const b = document.createElement("button");
      b.type = "button"; b.id = "dscBtn"; b.className = "cp-tool"; b.title = "A description of the pattern on the map, and a writing frame";
      b.innerHTML = `<span class="cp-ic" aria-hidden="true">📝</span>Describe map`;
      b.onclick = open;
      tools.insertBefore(b, tools.firstChild);
    }
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") { close(); const c = $("#cwCard"); if (c) c.hidden = true; } });
  }
  window.WMS = { init, open, refresh, courseworkDialog, describe, _jenks: null };
})();
