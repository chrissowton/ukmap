/* Which Places? — the page layout on a laptop or bigger (release 1.0.2).
   The UK is tall and narrow, so:
   - one slim bar along the top: name, search, the five views as tabs, and the tools (Statistics, Download, Share, More)
   - the map on the left, as wide as the UK's shape needs, at full height, with its key and year in one small card
   - a wide panel on the right: where you are (United Kingdom › nation › region › area), the filters as chips,
     the sentence saying what is shown, then the results table, one area's profile, or a chart.
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

  let panel, built = false;
  function build() {
    const top = $(".top"), shell = $(".shell");
    if (!top || !shell) return;
    // ---- top bar ----
    let tabs = $("#topTabs");
    if (!tabs) { tabs = make("div", "toptabs"); tabs.id = "topTabs"; top.appendChild(tabs); }
    move($("#views"), tabs);
    let tools = $("#topTools");
    if (!tools) {
      tools = make("div", "toptools", `<span class="tt" id="ttStx"></span><span class="tt" id="ttDl"></span><span class="tt" id="ttShare"></span>
        <span class="tt"><button type="button" id="moreBtn" class="cp-tool morebtn" aria-expanded="false" aria-controls="moreMenu">More ▾</button>
        <div id="moreMenu" class="card moremenu" hidden><div id="moreTools"></div>
          <button type="button" class="mlink" data-m="about">Sources &amp; methods</button>
          <a class="mlink" href="m/index.html" target="_blank" rel="noopener">Every measure A–Z</a>
          <a class="mlink" href="whatsnew.html" target="_blank" rel="noopener">What's new</a>
          <button type="button" class="mlink" data-m="copy">Copy a link to this view</button></div></span>`);
      tools.id = "topTools";
      top.appendChild(tools);
      const menu = tools.querySelector("#moreMenu"), btn = tools.querySelector("#moreBtn");
      btn.onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute("aria-expanded", String(!menu.hidden)); };
      document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target)) { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); } });
      menu.addEventListener("click", (e) => {
        const m = e.target.closest("[data-m]")?.dataset.m;
        if (m === "about") window.WC?.openAbout();
        if (m === "copy") navigator.clipboard?.writeText(location.href).then(() => { const s = $("#sentence"); if (s) s.textContent = "Link copied."; }).catch(() => prompt("Copy this link:", location.href));
        if (e.target.closest("button, a")) { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); }
      });
    }
    move($("#stxBtn"), $("#ttStx")); move($("#dlBtn"), $("#ttDl")); move($("#shareBtn"), $("#ttShare"));
    ["sbsBtn", "tblBtn", "ixBtn", "dscBtn", "nhBtn"].forEach((id) => { const b = document.getElementById(id); if (b && !b.hidden) move(b, $("#moreTools")); });

    // ---- the panel ----
    panel = $("#panel");
    if (!panel) {
      panel = make("section", "wpanel", `<div class="phead" id="phead">
          <div class="crumbs"><span id="crumbSel" class="crumbsel"><span class="uk">United Kingdom</span></span><div id="crumbTrail" class="crumbtrail" hidden></div></div>
          <div class="frow" id="frow"><span class="flab">Filters</span><span id="chipsSlot"></span>
            <button type="button" id="addFilter" class="addf" aria-haspopup="dialog">+ Add a filter</button>
            <button type="button" id="clearF" class="clearf" hidden>Clear all</button></div>
          <div id="sentSlot"></div></div>
        <div class="pbody" id="pbody"></div>`);
      panel.id = "panel";
      panel.setAttribute("aria-label", "Filters and results");
      shell.appendChild(panel);
      $("#addFilter").onclick = (e) => {
        e.stopPropagation();
        if (!$("#tpanel").hidden) { $("#tpanel .tp-close")?.click(); return; }
        document.querySelector("#themes .theme-btn")?.click();
      };
      $("#clearF").onclick = () => window.WC?.clearAll();
      // "Clear all" shows only when there is something to clear
      const chips = $("#chips");
      new MutationObserver(() => { $("#clearF").hidden = !chips.children.length; }).observe(chips, { childList: true });
    }
    move($("#goTo")?.closest("label"), $("#crumbSel"));
    move($("#chips"), $("#frow"), $("#addFilter"));
    move($("#sentence"), $("#sentSlot"));
    move($("#editor"), $("#phead"));
    move($("#starter"), $("#pbody"));
    move($("#viewwrap"), $("#pbody"));
    move($("#results"), $("#pbody"));
    $("#clearF").hidden = !$("#chips").children.length;
    document.body.classList.add("desk");
    built = true;
  }
  function unbuild() {
    if (!built) return;
    putBack();
    document.body.classList.remove("desk");
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
