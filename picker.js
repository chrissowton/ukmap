/* Which Countries? — the two-level measure picker.
   Any <select data-pick> with <optgroup>s becomes a button. The button opens a panel:
   categories on the left (grouped under the site's themes), and the measures of the
   category you hover or tap on the right. A search box finds any measure by name.
   The real <select> stays in the page (hidden) and is still the source of truth:
   picking a measure sets its value and fires "change", so the rest of the site
   does not need to know the picker exists. */
(function () {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clean = (t) => t.replace(/\s*◷\s*$/, "");
  const hasClock = (t) => /◷\s*$/.test(t);
  const narrow = () => window.innerWidth < 600;
  const touch = () => window.matchMedia("(hover: none)").matches;
  let pop = null, openFor = null;

  // Which theme each category belongs to, in the order the theme bar shows them
  function themeMap() {
    const mode = window.WC?.state?.mode || "human";
    const sets = mode === "physical" ? [[window.PHYS_THEMES, ""], [window.THEMES, "Human · "]] : [[window.THEMES, ""], [window.PHYS_THEMES, "Physical · "]];
    const order = [], of = new Map();
    for (const [ths, pre] of sets) for (const t of ths || []) {
      order.push(pre + t.label);
      for (const g of t.groups) if (!of.has(g)) of.set(g, pre + t.label);
    }
    return { order, of };
  }

  // Read the select into top-level options and categories
  function readSelect(sel) {
    const top = [], cats = [];
    for (const el of sel.children) {
      if (el.tagName === "OPTGROUP") {
        const items = [...el.children].map((o) => ({ v: o.value, t: clean(o.textContent), clock: hasClock(o.textContent), dis: o.disabled }));
        items.sort((x, y) => x.t.localeCompare(y.t, "en", { numeric: true, sensitivity: "base" }));
        if (items.length) cats.push({ g: el.label, items });
      } else if (el.tagName === "OPTION") top.push({ v: el.value, t: clean(el.textContent), clock: false, dis: el.disabled });
    }
    return { top, cats };
  }

  function label(sel) {
    const o = sel.options[sel.selectedIndex];
    return o ? clean(o.textContent) : "Choose…";
  }
  function sync(sel) {
    const b = sel._pk;
    if (!b) return;
    const t = label(sel);
    if (b.firstChild.textContent !== t) b.firstChild.textContent = t;
    b.title = t;
    b.disabled = sel.disabled;
  }

  function enhance(sel) {
    if (sel._pk) return sync(sel);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pk-btn";
    b.setAttribute("aria-haspopup", "dialog");
    b.setAttribute("aria-expanded", "false");
    b.innerHTML = `<span class="pk-val"></span><span class="pk-caret" aria-hidden="true">▾</span>`;
    const lab = sel.getAttribute("aria-label") || sel.closest("label")?.querySelector("span")?.textContent || sel.closest("label")?.firstChild?.textContent || "";
    if (lab.trim()) b.setAttribute("aria-label", `${lab.trim()}: ${label(sel)}`);
    sel.classList.add("pk-native");
    sel.tabIndex = -1;
    sel.setAttribute("aria-hidden", "true");
    sel.before(b);  // first in its <label>, so clicking the label text opens the picker
    sel._pk = b;
    b.onclick = (e) => { e.preventDefault(); openFor === sel ? close() : open(sel); };
    b.onkeydown = (e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); open(sel); } };
    sel.addEventListener("change", () => sync(sel));
    sync(sel);
  }

  function itemHTML(it, sel, sub) {
    const on = it.v === sel.value;
    return `<button type="button" class="pk-item${on ? " on" : ""}" data-v="${esc(it.v)}" ${it.dis ? "disabled" : ""} role="option" aria-selected="${on}">
      <span class="pk-t">${esc(it.t)}${sub ? `<small>${esc(sub)}</small>` : ""}</span>${it.clock ? `<span class="pk-clock" title="Has data for past years">◷</span>` : ""}${on ? `<span class="pk-tick" aria-hidden="true">✓</span>` : ""}</button>`;
  }

  function open(sel) {
    close();
    openFor = sel;
    const { top, cats } = readSelect(sel);
    const { order, of } = themeMap();
    // categories under their theme headings
    const byTheme = new Map();
    for (const c of cats) {
      const th = of.get(c.g) || (c.g === "Your index" ? "Made by you" : "Other");
      if (!byTheme.has(th)) byTheme.set(th, []);
      byTheme.get(th).push(c);
    }
    const themesInOrder = [...(byTheme.has("Made by you") ? ["Made by you"] : []), ...order.filter((t) => byTheme.has(t)), ...(byTheme.has("Other") ? ["Other"] : [])];
    const current = cats.find((c) => c.items.some((i) => i.v === sel.value)) || cats[0];
    const many = cats.reduce((s, c) => s + c.items.length, 0) > 12;

    pop = document.createElement("div");
    pop.className = "pk-pop" + (cats.length ? "" : " flat");
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", sel._pk.getAttribute("aria-label") || "Choose a measure");
    pop.innerHTML = `${many ? `<div class="pk-search"><input type="search" placeholder="Search measures…" aria-label="Search measures" autocomplete="off"></div>` : ""}
      ${top.length ? `<div class="pk-top">${top.map((it) => itemHTML(it, sel)).join("")}</div>` : ""}
      ${cats.length ? `<div class="pk-cols">
        <div class="pk-cats" role="listbox" aria-label="Categories">${themesInOrder.map((th) => `<div class="pk-th">${esc(th)}</div>${byTheme.get(th).map((c) => `<button type="button" class="pk-cat${c === current ? " on" : ""}" data-g="${esc(c.g)}"><span>${esc(c.g)}</span><span class="pk-n">${c.items.length}</span><span class="pk-arr" aria-hidden="true">›</span></button>`).join("")}`).join("")}</div>
        <div class="pk-items" role="listbox"></div>
      </div>` : ""}
      <div class="pk-results" role="listbox" hidden></div>`;
    document.body.appendChild(pop);
    sel._pk.setAttribute("aria-expanded", "true");
    sel._pk.classList.add("open");

    const itemsEl = pop.querySelector(".pk-items"), resEl = pop.querySelector(".pk-results"), colsEl = pop.querySelector(".pk-cols");
    let shown = null;
    const show = (c, focusFirst) => {
      if (!c || !itemsEl) return;
      shown = c;
      pop.querySelectorAll(".pk-cat").forEach((b) => b.classList.toggle("on", b.dataset.g === c.g));
      itemsEl.innerHTML = `<button type="button" class="pk-back">‹ All categories</button><div class="pk-ih">${esc(c.g)}</div>${c.items.map((it) => itemHTML(it, sel)).join("")}`;
      itemsEl.scrollTop = 0;
      itemsEl.querySelector(".pk-back").onclick = () => { colsEl.classList.remove("drill"); pop.querySelector(`.pk-cat[data-g="${CSS.escape(c.g)}"]`)?.focus(); };
      if (focusFirst) (itemsEl.querySelector(".pk-item.on") || itemsEl.querySelector(".pk-item"))?.focus();
    };
    show(current);
    // on a narrow screen show one column at a time; start in the current category if one is chosen
    if (colsEl && narrow() && cats.some((c) => c.items.some((i) => i.v === sel.value))) colsEl.classList.add("drill");

    let hoverT = 0;
    pop.querySelectorAll(".pk-cat").forEach((b) => {
      const c = cats.find((x) => x.g === b.dataset.g);
      b.onmouseenter = () => { if (touch() || narrow()) return; clearTimeout(hoverT); hoverT = setTimeout(() => show(c), 60); };
      b.onmouseleave = () => clearTimeout(hoverT);
      b.onfocus = () => { if (!narrow()) show(c); };
      b.onclick = () => { show(c, narrow() || !touch()); if (narrow()) colsEl.classList.add("drill"); };
    });
    pop.addEventListener("click", (e) => {
      const it = e.target.closest(".pk-item");
      if (!it || it.disabled) return;
      choose(sel, it.dataset.v);
    });

    // search across every measure
    const q = pop.querySelector(".pk-search input");
    if (q) q.oninput = () => {
      const s = q.value.trim().toLowerCase();
      if (!s) { resEl.hidden = true; if (colsEl) colsEl.hidden = false; pop.querySelector(".pk-top")?.removeAttribute("hidden"); return; }
      const words = s.split(/\s+/);
      const hits = [];
      for (const c of cats) for (const it of c.items) {
        const hay = (it.t + " " + c.g).toLowerCase();
        if (words.every((w) => hay.includes(w))) hits.push([it, c.g, it.t.toLowerCase().startsWith(s) ? 0 : 1]);
      }
      hits.sort((a, b) => a[2] - b[2]);
      if (colsEl) colsEl.hidden = true;
      pop.querySelector(".pk-top")?.setAttribute("hidden", "");
      resEl.hidden = false;
      resEl.innerHTML = hits.length ? hits.slice(0, 60).map(([it, g]) => itemHTML(it, sel, g)).join("") : `<p class="pk-none">No measure matches “${esc(q.value.trim())}”.</p>`;
    };

    // keyboard: arrows move within a column; right/left move between columns
    pop.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(true); return; }
      if (e.key === "Tab") return;
      const a = document.activeElement;
      const list = (root) => [...(root?.querySelectorAll(".pk-item:not([disabled]), .pk-cat") || [])].filter((x) => x.offsetParent);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        let root = a.closest(".pk-cats, .pk-items, .pk-results, .pk-top");
        if (a === q) root = resEl.hidden ? (pop.querySelector(".pk-top") || pop.querySelector(".pk-cats")) : resEl;
        const L = list(root);
        if (!L.length) return;
        const i = L.indexOf(a);
        const n = a === q ? 0 : e.key === "ArrowDown" ? Math.min(L.length - 1, i + 1) : Math.max(0, i - 1);
        if (a !== q && i === 0 && e.key === "ArrowUp" && q) return q.focus();
        L[n].focus();
      } else if (e.key === "ArrowRight" && a.classList.contains("pk-cat")) {
        e.preventDefault(); a.click();
      } else if (e.key === "ArrowLeft" && a.closest(".pk-items")) {
        e.preventDefault(); colsEl.classList.remove("drill"); pop.querySelector(".pk-cat.on")?.focus();
      } else if (e.key.length === 1 && q && a !== q && !e.ctrlKey && !e.metaKey && !e.altKey) {
        q.focus();  // start typing anywhere to search
      }
    });

    place(sel);
    // focus: the search box on a computer; the current measure otherwise
    if (q && !touch()) q.focus();
    else (pop.querySelector(".pk-item.on") || pop.querySelector(".pk-cat.on") || pop.querySelector("button"))?.focus({ preventScroll: true });
    pop.querySelector(".pk-cat.on")?.scrollIntoView({ block: "nearest" });
  }

  // Put the panel under the button (or above it if there is more room there), kept on screen
  function place(sel) {
    if (!pop) return;
    const r = sel._pk.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.min(pop.classList.contains("flat") ? 320 : 560, vw - 16);
    pop.style.width = w + "px";
    const below = vh - r.bottom - 10, above = r.top - 10;
    const up = below < 300 && above > below;
    const room = Math.max(180, (up ? above : below) - 6);
    pop.style.maxHeight = Math.min(room, 460) + "px";
    pop.style.left = Math.max(8, Math.min(r.left, vw - w - 8)) + "px";
    if (up) { pop.style.top = ""; pop.style.bottom = vh - r.top + 6 + "px"; }
    else { pop.style.bottom = ""; pop.style.top = r.bottom + 6 + "px"; }
  }

  function choose(sel, v) {
    const changed = sel.value !== v;
    sel.value = v;
    close(true);
    sync(sel);
    if (changed) sel.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function close(refocus) {
    if (!pop) return;
    const sel = openFor;
    pop.remove(); pop = null; openFor = null;
    if (sel?._pk) {
      sel._pk.setAttribute("aria-expanded", "false");
      sel._pk.classList.remove("open");
      if (refocus && sel._pk.isConnected) sel._pk.focus({ preventScroll: true });
    }
  }

  document.addEventListener("pointerdown", (e) => {
    if (pop && !pop.contains(e.target) && !openFor?._pk?.contains(e.target)) close();
  }, true);
  window.addEventListener("resize", () => { if (openFor) place(openFor); });
  window.addEventListener("scroll", (e) => { if (pop && !pop.contains(e.target)) close(); }, true);

  // Watch the page: new selects get a picker; changed selects get their button label updated
  let queued = false;
  function scan() {
    queued = false;
    document.querySelectorAll("select[data-pick]").forEach(enhance);
    if (openFor && !openFor.isConnected) close();
  }
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(scan); } })
    .observe(document.documentElement, { childList: true, subtree: true });
  // a value set from code (without a change event) still shows on the button
  const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  Object.defineProperty(HTMLSelectElement.prototype, "value", {
    get() { return desc.get.call(this); },
    set(v) { desc.set.call(this, v); if (this._pk) sync(this); },
    configurable: true,
  });
  document.addEventListener("DOMContentLoaded", scan);
  window.WPK = { enhance, close, scan };
})();
