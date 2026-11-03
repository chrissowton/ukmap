/* Access and housekeeping:
   - Learn & share grouped under Analyse / Teach / Share
   - Colour-blind-friendly colours (a switch in Map style; remembered)
   - The map from the keyboard: arrows move, + and − zoom, 0 resets, N and P step through the countries, T opens a table
   - "Read the map as a table", for screen readers and anyone who prefers a list
   - Works offline and can be installed (service worker; only on the real site, not the single-file version) */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  let W;

  // ---------- Learn & share in three groups ----------
  const GROUPS = [
    ["Analyse", ["dscBtn", "stxBtn", "ixBtn", "nhBtn"]],
    ["Teach", ["qmBtn", "wvBtn", "curBtn", "tourBtn"]],
    ["Share", ["ffBtn", "sbsBtn", "shareBtn", "dlBtn", "tblBtn"]],
  ];
  function group() {
    const box = $("#cpLearn");
    if (!box || box.dataset.grouped) return;
    box.dataset.grouped = "1";
    const all = [...box.children];
    const used = new Set();
    const frag = document.createDocumentFragment();
    for (const [name, ids] of GROUPS) {
      const h = document.createElement("p"); h.className = "cp-grph"; h.textContent = name;
      const g = document.createElement("div"); g.className = "cp-tools cp-grp";
      ids.forEach((id) => { const b = document.getElementById(id); if (b) { g.appendChild(b); used.add(b); } });
      if (name === "Share") all.filter((b) => !used.has(b) && b.id !== "introBtn" && b.tagName === "BUTTON").forEach((b) => { g.appendChild(b); used.add(b); });
      if (g.children.length) frag.append(h, g);
    }
    const intro = document.getElementById("introBtn");
    box.className = "cp-learn";
    box.innerHTML = "";
    box.appendChild(frag);
    if (intro) { intro.className = "linkbtn cp-introlink"; intro.innerHTML = "❔ Take the site tour"; box.appendChild(intro); }
  }

  // ---------- Colour-blind-friendly colours ----------
  let cvd = !!store.get("wc-cvd", false);
  function applyCvd() { document.documentElement.toggleAttribute("data-cvd", cvd); }
  function cvdToggleHTML() { return `<label class="tog"><input type="checkbox" id="mmCvd" ${cvd ? "checked" : ""}> Colour-blind-friendly colours</label>`; }
  // add the switch to the Map style card whenever it's drawn
  function hookMapStyle() {
    const card = $("#mmCard");
    if (!card) return;
    new MutationObserver(() => {
      if (card.hidden || card.querySelector("#mmCvd")) return;
      card.insertAdjacentHTML("beforeend", cvdToggleHTML());
      card.querySelector("#mmCvd").onchange = (e) => { cvd = e.target.checked; store.set("wc-cvd", cvd); applyCvd(); W.render(); };
    }).observe(card, { childList: true, attributes: true, attributeFilter: ["hidden"] });
  }

  // ---------- The map from the keyboard ----------
  let kbI = -1;
  function announce(t) { const el = $("#mapLive"); if (el) { el.textContent = ""; setTimeout(() => (el.textContent = t), 30); } }
  function kbList() {
    const cs = W.cs;
    const list = W.matches.slice();
    if (cs) list.sort((a, b) => (b[cs.f.key] ?? -Infinity) - (a[cs.f.key] ?? -Infinity));
    return list;
  }
  function describeCountry(r) {
    const cs = W.cs, act = W.lastEval.act;
    const bits = [r.name, r.subregion || r.region];
    if (cs && typeof r[cs.f.key] === "number") bits.push(`${cs.f.label}: ${W.fmtShort(cs.f, r[cs.f.key])}`);
    act.filter((fl) => !cs || fl.key !== cs.f.key).slice(0, 3).forEach((fl) => { const f = W.F[fl.key], v = r[fl.key]; bits.push(`${f.short || f.label}: ${f.type === "range" ? W.fmtShort(f, v) : Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "yes" : "no") : v ?? "no data"}`); });
    return bits.join(". ");
  }
  function keyboard() {
    const svg = W.mapSVG();
    svg.setAttribute("tabindex", "0");
    svg.setAttribute("aria-label", "Map. Arrow keys move the map, plus and minus zoom, 0 resets. N and P step through the areas shown; T opens the map as a table.");
    if (!$("#mapLive")) { const l = document.createElement("p"); l.id = "mapLive"; l.className = "sr-only"; l.setAttribute("aria-live", "polite"); $("#mapstage").appendChild(l); }
    svg.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      const step = 90;
      const acts = {
        ArrowLeft: () => W.panBy(step, 0), ArrowRight: () => W.panBy(-step, 0), ArrowUp: () => W.panBy(0, step), ArrowDown: () => W.panBy(0, -step),
        "+": () => W.zoomBy(1.5), "=": () => W.zoomBy(1.5), "-": () => W.zoomBy(1 / 1.5), _: () => W.zoomBy(1 / 1.5), 0: () => { W.resetZoom(); announce("Whole world"); },
        t: () => table(), T: () => table(),
      };
      if (/^[nNpP]$/.test(k)) {
        const list = kbList();
        if (!list.length) return announce("No areas on the map.");
        kbI = (kbI + (/n/i.test(k) ? 1 : -1) + list.length) % list.length;
        const r = list[kbI];
        W.select(r.iso3); W.zoomToCountry(r.iso3);
        announce(`${kbI + 1} of ${list.length}. ${describeCountry(r)}`);
        e.preventDefault(); return;
      }
      if (k === "Escape" && W.state.selected) { W.select(null); announce("Closed."); return; }
      if (acts[k]) { acts[k](); e.preventDefault(); }
    });
    svg.addEventListener("focus", () => { kbI = -1; });
  }

  // ---------- The map as a table ----------
  let sortCol = 0, sortDir = 1;
  function table() {
    let el = $("#tblCard");
    if (!el) { el = document.createElement("div"); el.id = "tblCard"; el.className = "card dsc stx tbl"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "The map as a table"); document.body.appendChild(el); }
    el.hidden = false;
    const rows = W.resultsCSV();
    const cs = W.cs;
    let head = rows[0].slice(), body = rows.slice(1);
    // add the colour class, if the key is split into classes
    if (cs && cs.breaks) {
      head.push("Class in the key");
      body = body.map((r) => { const rec = W.rows.find((x) => x.name === r[0]); const i = rec ? cs.classOf(rec[cs.f.key]) : -1; return r.concat(i >= 0 ? [`${i + 1}: ${W.fmtShort(cs.f, cs.breaks[i])}–${W.fmtShort(cs.f, cs.breaks[i + 1])}`] : [""]); });
    }
    const num = (v) => typeof v === "number" || (v !== "" && !Number.isNaN(+v));
    body.sort((a, b) => { const x = a[sortCol], y = b[sortCol]; return (num(x) && num(y) ? +x - +y : String(x).localeCompare(String(y))) * sortDir; });
    const sentence = ($("#sentence")?.textContent || "").replace(/Clear all$/, "").trim();
    el.innerHTML = `<div class="dsc-head"><h2>▦ The map as a table</h2><button type="button" class="iconbtn" id="tbX" aria-label="Close">×</button></div>
      <p class="hint">${esc(sentence)} Click a heading to sort.</p>
      <div class="stx-scroll tbl-scroll"><table class="stx-t stx-wide"><caption class="sr-only">${esc(sentence)}</caption>
        <thead><tr>${head.map((h, i) => `<th scope="col" aria-sort="${i === sortCol ? (sortDir > 0 ? "ascending" : "descending") : "none"}"><button type="button" class="tbl-sort" data-i="${i}">${esc(h)}${i === sortCol ? (sortDir > 0 ? " ▲" : " ▼") : ""}</button></th>`).join("")}</tr></thead>
        <tbody>${body.map((r) => `<tr>${r.map((c, i) => (i ? `<td>${esc(typeof c === "number" ? c.toLocaleString("en-GB", { maximumFractionDigits: 3 }) : c)}</td>` : `<th scope="row">${esc(c)}</th>`)).join("")}</tr>`).join("")}</tbody></table></div>
      <p class="hint">${body.length} areas.</p>`;
    $("#tbX").onclick = () => { el.hidden = true; W.mapSVG().focus(); };
    el.querySelectorAll(".tbl-sort").forEach((b) => (b.onclick = () => { const i = +b.dataset.i; if (i === sortCol) sortDir *= -1; else { sortCol = i; sortDir = i ? -1 : 1; } table(); el.querySelector(`.tbl-sort[data-i="${i}"]`)?.focus(); }));
    $("#tbX").focus();
  }

  // ---------- Offline and install ----------
  function offline() {
    if (window.__READY__ || !("serviceWorker" in navigator)) return; // not for the single-file version
    if (location.protocol !== "https:" && location.hostname !== "localhost") return;
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => { /* not available here */ }));
  }

  function init() {
    W = window.WC;
    applyCvd();
    const tools = $("#cpLearn");
    if (tools) {
      const b = document.createElement("button"); b.type = "button"; b.id = "tblBtn"; b.className = "cp-tool"; b.title = "Read the map as a table (for screen readers, or to sort the areas)";
      b.innerHTML = `<span class="cp-ic" aria-hidden="true">▦</span>Table view`; b.onclick = table; tools.appendChild(b);
    }
    group();
    hookMapStyle();
    keyboard();
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") { const t = $("#tblCard"); if (t && !t.hidden) t.hidden = true; } });
  }
  applyCvd();
  offline();
  window.WA = { init, table, group };
})();
