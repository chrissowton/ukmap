/* About this data (v54): for the chart or map on screen, every measure it uses — what it means, its unit, source,
   licence, the years and countries covered, how it's shown here, links to find out more, and how to cite it —
   with a download of the measure for every year.
   Also embed mode: ?embed=1 shows just the chart or map, for a website, a blog or Google Classroom. */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  let W;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const FORMAT_UNIT = {
    pct: "Per cent (%)", people: "Number of people", usd: "US dollars", dec1: "A number (one decimal place)", dec2: "A number", dec3: "A score",
    index: "An index score", rank: "Position in the UK (1 = highest)", km2: "Square kilometres (km²)", tonnes: "Tonnes", years: "Years",
    per1000: "Per 1,000 people", per1000birth: "Per 1,000 births", per1000women: "Per 1,000 teenage girls", per100k: "Per 100,000 births",
    per100kpop: "Per 100,000 people", density: "People per km²", kmlen: "Kilometres", temp: "Degrees Celsius", mm: "Millimetres", m: "Metres",
    mag: "Magnitude", year: "A year", mt: "Million tonnes", degc: "Degrees Celsius", permillion: "Per million people", per100: "Per 100 people", kwh: "Kilowatt-hours per person",
  };

  // the measures in the chart or map on screen
  function keys() {
    const s = window.WV?.srcKeys?.() || { keys: [] };
    const ks = s.keys.slice();
    if (W.state.view === "map") { const ck = W.colourKey?.(); if (ck && !ks.includes(ck)) ks.unshift(ck); }
    return [...new Set(ks)].filter((k) => W.F[k]);
  }
  function coverage(f) {
    const pool = W.rows.filter((r) => r.sovereign);
    const have = pool.filter((r) => { const v = r[f.key]; return v != null && v !== "" && !(Array.isArray(v) && !v.length); }).length;
    return [have, pool.length];
  }
  function yearsText(f) {
    const sp = W.TS[f.key] && !W.CAT_TS?.[f.key] ? W.span(f.key) : null;
    const latest = W.yearLabel(f);
    if (sp) return `Every year from ${sp[0]} to ${sp[1]}${W.SURVEY_KEYS?.has(f.key) && !/_un$/.test(f.key) ? " (survey waves: not every area in every year)" : /_un$/.test(f.key) ? " (every five years; after 2023 these are UN projections)" : ""}. The map and lists use each area's latest figure${latest ? ` (mostly ${latest})` : ""}.`;
    return latest ? `${latest} (the latest figures).` : "The latest figures.";
  }
  // the measure's own page (made by make_pages.cjs), worked out the same way
  const slug = (s) => s.toLowerCase().replace(/₂/g, "2").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
  let slugs = null;
  function pageOf(key) {
    if (!slugs) {
      slugs = new Map(); const used = new Set();
      (window.FILTERS || []).filter((f) => f.type === "range" && !f.target && !f.hidden && !String(f.key).startsWith("__")).forEach((f) => {
        let s = slug(f.label); if (used.has(s)) s = slug(f.label + "-" + f.key); used.add(s); slugs.set(f.key, s);
      });
    }
    return slugs.has(key) ? `m/${slugs.get(key)}.html` : null;
  }
  function section(f) {
    const S = (window.SOURCES || {})[f.source] || {};
    const [have, all] = coverage(f);
    const unit = f.type === "range" ? (FORMAT_UNIT[f.format] || "A number") : f.type === "bool" ? "Yes or no" : "Categories" + (f.options ? `: ${f.options.slice(0, 8).join(", ")}${f.options.length > 8 ? "…" : ""}` : "");
    const yr = new Date().getFullYear();
    const cite = `${S.name || "Source"}${W.yearLabel(f) ? ` (${W.yearLabel(f)})` : ""}. ${f.label}. Retrieved from Which Places?, ${(W.SITE?.url || location.href.split("?")[0])}, ${yr}.`;
    const more = window.WL && f.type === "range" && !f.key.startsWith("__") ? window.WL.html(window.WL.measure(f), "Find out more") : "";
    return `<section class="ab-sec">
      <h3>${esc(f.label)}</h3>
      <p class="ab-what">${esc(f.info || "")}</p>
      <dl class="ab-dl">
        <dt>Unit</dt><dd>${esc(unit)}</dd>
        <dt>Source</dt><dd>${S.url && S.url !== "#" ? `<a href="${esc(S.url)}" target="_blank" rel="noopener">${esc(S.name)} ↗</a>` : esc(S.name || "—")}</dd>
        ${S.licence ? `<dt>Licence</dt><dd>${esc(S.licence)}${/CC BY/.test(S.licence) ? ": free to reuse, with credit to the source" : ""}</dd>` : ""}
        <dt>Years</dt><dd>${esc(yearsText(f))}</dd>
        <dt>Areas</dt><dd>${have} of ${all} areas have data${have < all * 0.6 ? ". Many are missing, so be careful comparing regions." : "."}</dd>
        <dt>On this site</dt><dd>${f.type === "range" ? "Groups (the UK, regions, your areas) show the median area unless you choose the average or the total. " : ""}Figures are as published by the source; areas without data are left grey.</dd>
        <dt>How to cite</dt><dd><span class="ab-cite">${esc(cite)}</span> <button type="button" class="linkbtn ab-copy" data-c="${esc(cite)}">Copy</button></dd>
      </dl>
      <div class="ab-row">${pageOf(f.key) ? `<a class="ghost btnlink" href="${pageOf(f.key)}" target="_blank" rel="noopener">The page for this measure ↗</a> ` : ""}${f.type === "range" ? `<button type="button" class="ghost ab-dl-btn" data-k="${esc(f.key)}">⬇ This measure for every area${W.TS[f.key] ? " and year" : ""} (CSV)</button>` : ""}</div>
      ${more}
    </section>`;
  }
  function open() {
    W = window.WC;
    let el = $("#abCard");
    if (!el) { el = document.createElement("div"); el.id = "abCard"; el.className = "card dsc ab"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "About this data"); document.body.appendChild(el); }
    const ks = keys();
    el.hidden = false;
    el.innerHTML = `<div class="dsc-head"><h2>ⓘ About this data</h2><button type="button" class="iconbtn" id="abX" aria-label="Close">×</button></div>
      ${ks.length ? `<p class="hint">The ${ks.length === 1 ? "measure" : `${ks.length} measures`} in this ${W.state.view === "map" ? "map" : "chart"}: what ${ks.length === 1 ? "it means" : "they mean"}, where ${ks.length === 1 ? "it comes" : "they come"} from, and how to cite ${ks.length === 1 ? "it" : "them"}.</p>${ks.map((k) => section(W.F[k])).join("")}`
        : `<p>Add a filter or shade the map by a measure, and its sources and definitions will appear here.</p>`}
      <p class="hint">Every source and licence is listed under <button type="button" class="linkbtn" id="abAll">Sources &amp; methods</button>.</p>`;
    $("#abX").onclick = () => (el.hidden = true);
    $("#abAll").onclick = () => { el.hidden = true; document.querySelector("#srcLink")?.click(); };
    el.querySelectorAll(".ab-copy").forEach((b) => (b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.c); b.textContent = "Copied ✓"; } catch (e) { prompt("Copy this reference:", b.dataset.c); } }));
    el.querySelectorAll(".ab-dl-btn").forEach((b) => (b.onclick = () => downloadMeasure(b.dataset.k)));
  }
  function downloadMeasure(key) {
    const f = W.F[key], S = (window.SOURCES || {})[f.source] || {};
    const pool = W.rows.filter((r) => r.sovereign || W.state.territories).sort((a, b) => a.name.localeCompare(b.name));
    let rows;
    const ts = W.TS[key];
    if (ts && !W.CAT_TS?.[key]) {
      const sp = W.span(key), ys = d3.range(sp[0], sp[1] + 1);
      rows = [["Area", "ISO code", "Region", ...ys], ...pool.filter((r) => ts[r.iso3]).map((r) => [r.name, r.iso3, r.region, ...ys.map((y) => ts[r.iso3][y - W.TS_YEARS[0]] ?? "")])];
    } else rows = [["Area", "ISO code", "Region", f.label], ...pool.filter((r) => r[key] != null).map((r) => [r.name, r.iso3, r.region, r[key]])];
    rows.push([], [`${f.label}. ${f.info || ""}`], [`Source: ${S.name || ""} ${S.url && S.url !== "#" ? S.url : ""}. Licence: ${S.licence || ""}.`], [`Downloaded from Which Places? ${W.SITE?.url || ""} on ${new Date().toLocaleDateString("en-GB")}.`]);
    const q = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const b = new Blob(["﻿" + rows.map((r) => r.map(q).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `${key}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ---------- Embed ----------
  const embedded = () => document.body.classList.contains("embed");
  function embedURL() {
    const u = window.WV?.shareURL ? window.WV.shareURL("") : location.href;
    return u + (u.includes("?") ? "&" : "?") + "embed=1";
  }
  function embedDialog() {
    W = window.WC;
    let el = $("#embCard");
    if (!el) { el = document.createElement("div"); el.id = "embCard"; el.className = "card dsc emb"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Embed"); document.body.appendChild(el); }
    el.hidden = false;
    const url = embedURL(), title = (W.state.view === "map" ? ($("#sentence")?.textContent || "Map").replace(/Clear all$/, "") : document.querySelector("#vsvg text.ctitle")?.textContent || "Which Places? chart").trim();
    const code = (h) => `<iframe src="${url}" title="${esc(title)}" width="100%" height="${h}" style="border:0;max-width:100%" loading="lazy" allowfullscreen></iframe>`;
    el.innerHTML = `<div class="dsc-head"><h2>Embed this ${W.state.view === "map" ? "map" : "chart"}</h2><button type="button" class="iconbtn" id="embX" aria-label="Close">×</button></div>
      <p class="hint">Paste this code into a website, a blog or a Google Site. It shows just this ${W.state.view === "map" ? "map" : "chart"}, still interactive, with a link to the full site. In Google Classroom, Teams or a slide, use the link instead.</p>
      <label class="fld"><span>Height</span><select id="embH"><option>500</option><option selected>600</option><option>750</option></select></label>
      <label class="fld"><span>Embed code</span><textarea id="embCode" rows="4" readonly></textarea></label>
      <div class="dsc-row"><button type="button" class="primary" id="embCopy">Copy embed code</button><button type="button" class="ghost" id="embLink">Copy the link</button><a class="ghost btnlink" href="${esc(url)}" target="_blank" rel="noopener">Preview ↗</a></div>`;
    const upd = () => ($("#embCode").value = code($("#embH").value));
    upd(); $("#embH").onchange = upd;
    $("#embX").onclick = () => (el.hidden = true);
    const copy = async (t, b) => { try { await navigator.clipboard.writeText(t); b.textContent = "Copied ✓"; } catch (e) { $("#embCode").select(); } };
    $("#embCopy").onclick = (e) => copy($("#embCode").value, e.target);
    $("#embLink").onclick = (e) => copy(url, e.target);
  }
  function initEmbed() {
    if (new URLSearchParams(location.search).get("embed") !== "1") return;
    document.body.classList.add("embed");
    const a = document.createElement("a");
    a.className = "embfoot"; a.target = "_blank"; a.rel = "noopener";
    a.innerHTML = `<b>Which Places?</b> · open the full site ↗`;
    const upd = () => { a.href = (window.WV?.shareURL?.("") || location.href).replace(/[?&]embed=1/, ""); };
    a.onmouseenter = upd; a.onfocus = upd; upd();
    document.body.appendChild(a);
  }

  function init() {
    W = window.WC;
    initEmbed();
    // ⓘ on the map, under the zoom buttons
    const z = document.querySelector(".zoom");
    if (z && !$("#mapAb")) {
      const b = document.createElement("button"); b.type = "button"; b.id = "mapAb"; b.textContent = "ⓘ"; b.title = "About this data: sources and definitions"; b.setAttribute("aria-label", "About this data");
      b.onclick = open; z.appendChild(b);
    }
  }
  window.WAB = { init, open, embedDialog, embedded, downloadMeasure, keys };
})();
