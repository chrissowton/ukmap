/* Which Places? — the page layout on a laptop or bigger (release 2.0).
   - A bar across the top: the name, search, the three modes (Explore, Find places, Compare), Tools and Help.
   - The map on the left, as wide as the place being shown needs (app.js works it out: the tall UK gets a narrower map,
     a round council a wider one), with Whole UK and Layers buttons at its top and the key at its bottom.
   - The panel on the right: in Explore, the trail (United Kingdom ▾ › England ▾ › …) and the place's page; in Find places,
     the filters, the sentence saying what matches, and List / Scatter / Rankings / Charts / Insights; in Compare, the
     places side by side. A compare list waits at the bottom of the panel.
   Phones keep their own layout: below 761px wide nothing here applies, and anything moved is put back.
   The page's parts are moved, not copied, so everything in app.js and the other scripts keeps working. */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const wide = window.matchMedia("(min-width: 761px)");
  const home = new Map();   // each moved element -> a marker where it came from

  function move(el, parent, before) {
    if (!el || !parent) return;
    if (!home.has(el)) { const mark = document.createComment(" moved: " + (el.id || el.className) + " "); el.parentNode.insertBefore(mark, el); home.set(el, mark); }
    if (el.parentNode !== parent || (before && el.nextSibling !== before)) parent.insertBefore(el, before || null);
  }
  function putBack() { for (const [el, mark] of home) if (mark.parentNode) mark.parentNode.insertBefore(el, mark.nextSibling); }
  function make(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function menu(btn, box) {
    const close = () => { box.hidden = true; btn.setAttribute("aria-expanded", "false"); };
    btn.onclick = (e) => { e.stopPropagation(); const open = box.hidden; document.querySelectorAll(".appmenu").forEach((m) => (m.hidden = true)); box.hidden = !open; btn.setAttribute("aria-expanded", String(open)); if (open) box.dispatchEvent(new Event("open")); };
    document.addEventListener("click", (e) => { if (!box.hidden && !box.contains(e.target)) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !box.hidden) close(); });
    box.addEventListener("click", (e) => { if (e.target.closest("button, a")) setTimeout(close, 0); });
  }

  let panel, built = false;
  function build() {
    const top = $(".top"), shell = $(".shell");
    if (!top || !shell) return;
    const W = () => window.WC;
    // ---- the bar across the top ----
    if (!$("#uiModes")) {
      const modes = make("nav", "uimodes", `<button type="button" data-ui="explore">Explore</button><button type="button" data-ui="find">Find places</button><button type="button" data-ui="compare">Compare <b id="uiCmpN" class="uin" hidden>0</b></button>`);
      modes.id = "uiModes"; modes.setAttribute("aria-label", "What do you want to do?");
      top.appendChild(modes);
      modes.querySelectorAll("[data-ui]").forEach((b) => (b.onclick = () => W()?.setUI(b.dataset.ui)));
      const tools = make("div", "appmenus", `
        <span class="amw"><button type="button" id="toolsBtn" class="ambtn" aria-expanded="false" aria-controls="toolsMenu">Tools ▾</button>
          <div id="toolsMenu" class="card appmenu" hidden>
            <div class="amh">This place</div>
            <button type="button" data-m="report">🖨 Print a report for this place</button>
            <button type="button" data-m="note">📝 Add a note</button>
            <div class="amh">Your work (kept in this browser)</div>
            <button type="button" data-m="notebook">📒 Notebook <span id="amNotes" class="amn"></span></button>
            <button type="button" data-m="draw">✏️ Make your own area from neighbourhoods</button>
            <button type="button" data-m="mydata">📤 Map your own data (postcodes)</button>
            <div class="amh">Map and data</div>
            <div id="amSlots"></div>
            <button type="button" data-m="style">🎨 Map styles: change over time, two measures</button>
            <button type="button" data-m="copy">🔗 Copy a link to this view</button>
            <div id="moreTools"></div>
          </div></span>
        <span class="amw"><button type="button" id="helpBtn" class="ambtn" aria-expanded="false" aria-controls="helpMenu">Help ▾</button>
          <div id="helpMenu" class="card appmenu" hidden>
            <a href="guide.html" target="_blank" rel="noopener">Using Which Places? for a funding bid</a>
            <a href="methods.html" target="_blank" rel="noopener">How the figures are made</a>
            <button type="button" data-m="about">Sources &amp; methods</button>
            <a href="m/index.html" target="_blank" rel="noopener">Every measure A–Z</a>
            <a href="whatsnew.html" target="_blank" rel="noopener">What's new</a>
          </div></span>`);
      tools.id = "appMenus";
      top.appendChild(tools);
      menu($("#toolsBtn"), $("#toolsMenu"));
      menu($("#helpBtn"), $("#helpMenu"));
      $("#toolsMenu").addEventListener("open", () => {
        const has = !!W()?.hasPlace();
        $("#toolsMenu [data-m=report]").disabled = !has;
        $("#toolsMenu [data-m=report]").title = has ? "" : "Open a place first";
        const n = W()?.notesCount() || 0; $("#amNotes").textContent = n ? `(${n})` : "";
      });
      document.addEventListener("click", (e) => {
        const b = e.target.closest(".appmenu [data-m]"); if (!b) return;
        const m = b.dataset.m, w = W();
        if (m === "report") w?.printReport();
        if (m === "note" || m === "notebook") w?.openNotebook();
        if (m === "draw") w?.startDraw();
        if (m === "mydata") w?.openMyData();
        if (m === "about") w?.openAbout();
        if (m === "style") setTimeout(() => $("#mmBtn")?.click(), 0);
        if (m === "copy") navigator.clipboard?.writeText(location.href).then(() => { b.textContent = "✓ Link copied"; setTimeout(() => (b.textContent = "🔗 Copy a link to this view"), 1800); }).catch(() => prompt("Copy this link:", location.href));
      });
    }
    ["stxBtn", "dlBtn", "shareBtn"].forEach((id) => move(document.getElementById(id), $("#amSlots")));
    ["tblBtn", "ixBtn", "dscBtn", "nhBtn"].forEach((id) => { const b = document.getElementById(id); if (b && !b.hidden) move(b, $("#moreTools")); });

    // ---- the panel ----
    panel = $("#panel");
    if (!panel) {
      panel = make("section", "wpanel", `<div class="phead" id="phead">
          <div id="crumbTrail" class="crumbtrail" hidden></div>
          <div id="findBar" class="findbar">
            <div class="fb-head"><h2>Find places</h2><span id="viewSlot"></span></div>
            <div class="frow" id="frow"><span class="flab">Filters</span><span id="chipsSlot"></span>
              <button type="button" id="addFilter" class="addf" aria-haspopup="dialog">+ Add a filter</button>
              <button type="button" id="clearF" class="clearf" hidden>Clear all</button></div>
            <div id="sentSlot"></div></div></div>
        <div class="pbody" id="pbody"></div>
        <div id="ppHold" hidden></div>`);
      panel.id = "panel";
      panel.setAttribute("aria-label", "The place, filters and results");
      shell.appendChild(panel);
      $("#addFilter").onclick = (e) => {
        e.stopPropagation();
        if (!$("#tpanel").hidden) { $("#tpanel .tp-close")?.click(); return; }
        document.querySelector("#themes .theme-btn")?.click();
      };
      $("#clearF").onclick = () => window.WC?.clearAll();
      const chips = $("#chips");
      new MutationObserver(() => { $("#clearF").hidden = !chips.children.length; }).observe(chips, { childList: true });
      // a button on the panel's edge hides it, so the map can use the whole screen
      const pt = make("button", "ptoggle", "‹");
      pt.type = "button"; pt.id = "pToggle"; pt.title = "Hide the panel (map full screen)"; pt.setAttribute("aria-label", "Hide the panel");
      pt.onclick = () => {
        const off = document.body.classList.toggle("pc-off");
        pt.textContent = off ? "›" : "‹"; pt.title = off ? "Show the panel" : "Hide the panel (map full screen)";
        requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
      };
      shell.appendChild(pt);
    }
    move($("#views"), $("#viewSlot"));
    move($("#placePick"), $("#ppHold"));
    move($("#chips"), $("#frow"), $("#addFilter"));
    move($("#sentence"), $("#sentSlot"));
    move($("#editor"), $("#phead"));
    move($("#starter"), $("#pbody"));
    move($("#viewwrap"), $("#pbody"));
    move($("#results"), $("#pbody"));
    $("#clearF").hidden = !$("#chips").children.length;
    // the views' names, as tabs within Find places
    const names = { map: "List", compare: "Scatter", rank: "Rankings", trends: "Charts", insights: "Insights" };
    document.querySelectorAll("#views button[data-v]").forEach((b) => { const t = [...b.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim()); if (t && names[b.dataset.v]) t.textContent = names[b.dataset.v]; });
    document.body.classList.add("desk");
    built = true;
  }
  function unbuild() {
    if (!built) return;
    putBack();
    document.body.classList.remove("desk", "pc-off");
    const names = { map: "Map", compare: "Compare", rank: "Rankings", trends: "Charts", insights: "Insights" };
    document.querySelectorAll("#views button[data-v]").forEach((b) => { const t = [...b.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim()); if (t && names[b.dataset.v]) t.textContent = names[b.dataset.v]; });
    built = false;
  }
  function apply() {
    if (wide.matches) build(); else unbuild();
    requestAnimationFrame(() => { window.dispatchEvent(new Event("resize")); window.WC?.render(); });
  }
  // wait for the other scripts to add their buttons (Statistics, Download, Table view), then lay out the page
  let tries = 0;
  (function wait() {
    const ready = window.WC && $("#dlBtn") && $("#stxBtn") && $("#tblBtn");
    if (!ready && tries++ < 60) return setTimeout(wait, 100);
    apply();
    wide.addEventListener?.("change", apply);
  })();
  window.WSH = { apply };
})();
