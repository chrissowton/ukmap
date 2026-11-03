/* Layout helpers (v50):
   - every pop-up box can be resized (drag its bottom-right corner) and made full screen (⛶ in its title bar)
   - the map's buttons (live hazards, climate, city growth, map style) and the boxes they open sit together in the bottom-left corner (the South Pacific)
   - the two side columns can be closed with the arrows on their edges, to give the map or chart more room
   - charts and other views have a full-screen button ([data-fs]) */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  let W;
  const rerender = () => setTimeout(() => { window.dispatchEvent(new Event("resize")); W?.render(); }, 30);

  // ---------- Full screen for any box ----------
  function setFS(el, on) {
    el.classList.toggle("is-fs", on);
    document.body.classList.toggle("has-fs", !!document.querySelector(".is-fs"));
    el.querySelectorAll(".fsbtn").forEach((b) => { b.textContent = on ? "🗗" : "⛶"; b.title = on ? "Leave full screen (Esc)" : "Full screen"; b.setAttribute("aria-pressed", String(on)); });
    if (el.matches("[data-fs-target], #viewwrap")) document.querySelectorAll(`[data-fs="#${el.id}"]`).forEach((b) => { b.textContent = on ? "🗗" : "⛶"; b.title = on ? "Leave full screen (Esc)" : "Full screen (Esc to leave)"; });
    rerender();
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-fs]");
    if (b) { const el = $(b.dataset.fs); if (el) setFS(el, !el.classList.contains("is-fs")); return; }
    const f = e.target.closest?.(".fsbtn");
    if (f) { const el = f.closest(POPUPS); if (el) setFS(el, !el.classList.contains("is-fs")); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { const el = [...document.querySelectorAll(".is-fs")].pop(); if (el) { setFS(el, false); e.stopPropagation(); } } }, true);

  // ---------- Pop-ups: resizable, with a full-screen button ----------
  const POPUPS = ".dsc, .livecard, #starter, #mmCard";
  const HEADS = ".dsc-head, .mmhead, .qz-head";
  function enhance() {
    document.querySelectorAll(POPUPS).forEach((box) => {
      box.classList.add("rsz");
      const head = box.querySelector(HEADS);
      if (!head || head.querySelector(".fsbtn")) return;
      const b = document.createElement("button");
      b.type = "button"; b.className = "iconbtn fsbtn"; b.textContent = box.classList.contains("is-fs") ? "🗗" : "⛶";
      b.title = box.classList.contains("is-fs") ? "Leave full screen (Esc)" : "Full screen"; b.setAttribute("aria-label", "Full screen");
      const close = head.querySelector(".iconbtn:not(.fsbtn), .hide");
      if (close && close.parentElement === head) head.insertBefore(b, close); else head.appendChild(b);
    });
  }

  // ---------- Buttons and boxes on the map: all together in the bottom-left corner ----------
  // (on a laptop or bigger; on a phone they stay where they were, at the top)
  const MAPBOXES = ["#liveCard", "#cgCard", "#climCard", "#rgCard"];
  const wide = window.matchMedia("(min-width: 761px)");
  function stack() {
    const stage = $("#mapstage");
    if (!stage) return;
    let dock = $("#mapdock");
    if (!dock) { dock = document.createElement("div"); dock.id = "mapdock"; dock.className = "mapdock"; stage.appendChild(dock); }
    let box = $("#mapcards");
    if (!box) { box = document.createElement("div"); box.id = "mapcards"; box.className = "mapcards"; }
    if (box.parentElement !== dock) dock.prepend(box);
    MAPBOXES.forEach((sel) => { const el = $(sel); if (el && el.parentElement !== box && !el.classList.contains("is-fs")) box.appendChild(el); });
    const btns = $("#mapbtns"), mm = $("#mmBtn"), mmCard = $("#mmCard");
    if (wide.matches) {
      if (btns && btns.parentElement !== dock) dock.appendChild(btns);
      if (btns && mm && mm.parentElement !== btns) btns.appendChild(mm);
      if (mmCard && mmCard.parentElement !== box && !mmCard.classList.contains("is-fs")) box.prepend(mmCard);
    } else {
      // a phone: the buttons go back to the top of the map
      if (btns && btns.parentElement !== stage) stage.appendChild(btns);
      if (mm && mm.parentElement !== stage) stage.insertBefore(mm, $(".zoom"));
      if (mmCard && mmCard.parentElement !== stage) stage.insertBefore(mmCard, $(".zoom"));
    }
  }
  wide.addEventListener?.("change", () => stack());

  // ---------- Closing the side columns ----------
  let cpOff = !!store.get("wc-cp-off", false), resOff = !!store.get("wc-res-off", false);
  function sides() {
    document.body.classList.toggle("cp-off", cpOff);
    document.body.classList.toggle("res-off", resOff);
    const a = $("#cpToggle"), b = $("#resToggle");
    if (a) { a.innerHTML = cpOff ? "<span>›</span><small>Panel</small>" : "<span>‹</span>"; a.title = cpOff ? "Show the control panel" : "Hide the control panel (more room for the map)"; a.setAttribute("aria-expanded", String(!cpOff)); }
    if (b) { b.innerHTML = resOff ? "<span>‹</span><small>Detailed data view</small>" : "<span>›</span>"; b.title = resOff ? "Show the detailed data: every area's figures, in a list you can sort" : "Hide the detailed data view (more room for the map)"; b.setAttribute("aria-expanded", String(!resOff)); }
    placeToggles();
  }
  function placeToggles() {
    const b = $("#resToggle"), res = $("#results");
    if (b && res) b.style.right = (resOff ? 0 : res.offsetWidth) + "px";
  }
  function makeToggles() {
    const content = $(".content"), main = $(".main");
    if (content && !$("#cpToggle")) {
      const a = document.createElement("button"); a.type = "button"; a.id = "cpToggle"; a.className = "sidetoggle left";
      a.onclick = () => { cpOff = !cpOff; store.set("wc-cp-off", cpOff); sides(); rerender(); };
      content.appendChild(a);
    }
    if (main && !$("#resToggle")) {
      const b = document.createElement("button"); b.type = "button"; b.id = "resToggle"; b.className = "sidetoggle right";
      b.onclick = () => { resOff = !resOff; store.set("wc-res-off", resOff); sides(); rerender(); };
      main.appendChild(b);
    }
    sides();
  }

  // a Download button on the map too, under the zoom buttons
  function mapDownload() {
    const z = $(".zoom");
    if (!z || $("#mapDl")) return;
    const b = document.createElement("button");
    b.type = "button"; b.id = "mapDl"; b.textContent = "⬇"; b.title = "Download this map as a picture, or its data as a spreadsheet"; b.setAttribute("aria-label", "Download");
    b.onclick = (e) => { e.stopPropagation(); window.WV?.openDownloadMenu(b); };
    z.appendChild(b);
  }

  let queued = false;
  const tick = () => { queued = false; enhance(); stack(); placeToggles(); };
  function init() {
    W = window.WC;
    makeToggles();
    mapDownload();
    tick();
    new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(tick); } }).observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", placeToggles);
  }
  window.WLY = { init, setFS };
})();
