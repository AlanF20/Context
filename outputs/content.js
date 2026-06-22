/**
 * content.js — in-page capture (DESIGN_SPEC §2.1)
 * ---------------------------------------------------------------------------
 *   1. Watch text selections.
 *   2. Show a tiny floating "+" icon near the selection.
 *   3. On click, expand into a one-gesture capture popup: context combobox
 *      (type to create), Aa/H type toggle, optional "nest under subtitle",
 *      and Cancel / Save (Enter saves).
 *   4. Persist through window.ContextStore (storage.js → chrome.storage.local),
 *      the shared bridge to the side panel.
 *   5. Mark the saved selection on the page with `.ch-hl`.
 * ---------------------------------------------------------------------------
 */
(function () {
  "use strict";

  const Store = window.ContextStore;
  if (!Store) {
    console.error("[ContextHighlighter] storage.js failed to load.");
    return;
  }

  let savedText = "";
  let savedRange = null; // cloned Range for page highlighting
  let iconEl = null;
  let popEl = null;

  // ----- selection detection -----
  document.addEventListener("mouseup", (e) => {
    if (isOwnUi(e.target)) return;
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : "";
      if (text) {
        savedText = text;
        savedRange = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
        const rect = getRect(sel);
        if (rect) showIcon(rect);
      } else {
        removeIcon();
        removePopup();
      }
    }, 0);
  });

  document.addEventListener("mousedown", (e) => {
    if (isOwnUi(e.target)) return;
    removePopup();
  });

  window.addEventListener(
    "scroll",
    () => {
      removeIcon();
      removePopup();
    },
    true
  );

  function isOwnUi(node) {
    return !!(node && node.closest && node.closest(".ch-root"));
  }

  /**
   * Find the context that already contains a highlight from the current page
   * (matched by exact URL). Returns the most recently used such context, or
   * null if this page has no prior highlights.
   */
  function contextForThisPage(contexts) {
    const url = location.href;
    let best = null;
    let bestTime = -1;
    for (const c of contexts) {
      for (const it of c.items || []) {
        if (it.sourceUrl === url && (it.createdAt || 0) > bestTime) {
          best = c;
          bestTime = it.createdAt || 0;
        }
      }
    }
    return best;
  }
  function getRect(sel) {
    if (!sel || sel.rangeCount === 0) return null;
    const r = sel.getRangeAt(0).getBoundingClientRect();
    return r && (r.width || r.height) ? r : null;
  }

  // ----- micro-icon -----
  function showIcon(rect) {
    removeIcon();
    removePopup();
    iconEl = document.createElement("div");
    iconEl.className = "ch-root ch-icon";
    iconEl.title = "Guardar resaltado";
    iconEl.textContent = "Guardar resaltado ＋";
    position(iconEl, rect);
    document.body.appendChild(iconEl);
    iconEl.addEventListener("click", (ev) => {
      ev.stopPropagation();
      removeIcon();
      openPopup(rect);
    });
  }
  function removeIcon() {
    if (iconEl && iconEl.parentNode) iconEl.parentNode.removeChild(iconEl);
    iconEl = null;
  }

  /**
   * Static markup for the capture popup. Kept as a single template here so the
   * structure lives in one place; openPopup() wires behaviour via data-role.
   */
  function popupSkeleton() {
    return `
      <div class="ch-pop-header">
        <span class="ch-pop-title">Guardar resaltado</span>
        <span class="ch-pop-ctx" data-role="ctx-tag"></span>
      </div>
      <div class="ch-quote" data-role="quote"></div>

      <div class="ch-control-row">
        <div class="ch-combo">
          <div class="ch-combo-pill">
            <span class="ch-combo-dot" data-role="dot"></span>
            <input class="ch-combo-input" data-role="combo" type="text"
                   placeholder="Contexto…" autocomplete="off" />
            <button class="ch-combo-chevron" data-role="chevron" type="button">▾</button>
          </div>
          <div class="ch-combo-menu" data-role="menu" hidden></div>
        </div>
      </div>

      <div class="ch-cats" data-role="cats"></div>

      <div class="ch-nest" data-role="nest" hidden>
        <label class="ch-nest-label" for="ch-nest-sel">Anidar bajo</label>
        <select class="ch-nest-sel" data-role="nest-select" id="ch-nest-sel"></select>
      </div>

      <div class="ch-microcopy" data-role="microcopy"></div>

      <div class="ch-actions">
        <button class="ch-btn ch-btn-ghost" data-role="cancel" type="button">Cancelar</button>
        <button class="ch-btn" data-role="save" type="button">Guardar <span class="ch-kbd">↵</span></button>
      </div>
      <div class="ch-status" data-role="status" hidden></div>
    `;
  }

  // ----- capture popup -----
  async function openPopup(rect) {
    removePopup();
    const contexts = await Store.listContexts();

    popEl = document.createElement("div");
    popEl.className = "ch-root ch-pop";
    popEl.innerHTML = popupSkeleton();
    position(popEl, rect);
    document.body.appendChild(popEl);
    popEl.querySelector('[data-role="quote"]').textContent = savedText;

    const els = {
      tag: popEl.querySelector('[data-role="ctx-tag"]'),
      dot: popEl.querySelector('[data-role="dot"]'),
      combo: popEl.querySelector('[data-role="combo"]'),
      chevron: popEl.querySelector('[data-role="chevron"]'),
      menu: popEl.querySelector('[data-role="menu"]'),
      cats: popEl.querySelector('[data-role="cats"]'),
      nest: popEl.querySelector('[data-role="nest"]'),
      nestSelect: popEl.querySelector('[data-role="nest-select"]'),
      microcopy: popEl.querySelector('[data-role="microcopy"]'),
      cancel: popEl.querySelector('[data-role="cancel"]'),
      save: popEl.querySelector('[data-role="save"]'),
      status: popEl.querySelector('[data-role="status"]'),
    };

    // local UI state
    let category = "idea"; // default = yellow (important ideas)
    // Recommend the context that already holds a highlight from THIS page, so
    // adding to the same page is one click. If the page has no prior highlight,
    // leave the selector empty for the user to choose/create.
    let selectedCtx = contextForThisPage(contexts); // {id,name,color} or null

    // Build the 4 category swatches from the store's CATEGORIES.
    const catButtons = {};
    for (const key of ["title", "idea", "argument", "evidence"]) {
      const meta = Store.CATEGORIES[key];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ch-cat" + (key === category ? " on" : "");
      btn.style.setProperty("--cat", meta.dot);
      btn.style.setProperty("--cat-bg", meta.hlBg);
      btn.style.setProperty("--cat-fg", meta.hlFg);
      btn.title = meta.label;
      btn.innerHTML = '<span class="sw"></span><span></span>';
      btn.querySelector(".sw").style.background = meta.dot;
      btn.querySelector("span:last-child").textContent = meta.label;
      btn.addEventListener("click", () => {
        category = key;
        Object.entries(catButtons).forEach(([k, b]) =>
          b.classList.toggle("on", k === key)
        );
        refreshNest();
      });
      catButtons[key] = btn;
      els.cats.appendChild(btn);
    }

    function paintContext() {
      const name = selectedCtx ? selectedCtx.name : els.combo.value.trim();
      els.dot.style.background = selectedCtx ? selectedCtx.color : "#9b998e";
      els.tag.textContent = name ? "en " + name : "nuevo contexto";
      els.microcopy.textContent = name
        ? `↳ Se guardará en ${name} · escribe para crear otro`
        : "↳ Escribe un nombre para crear un contexto";
    }

    async function refreshNest() {
      const isText = Store.typeForCategory(category) === "text";
      if (!isText || !selectedCtx) {
        els.nest.hidden = true;
        return;
      }
      const subs = await Store.listSubtitles(selectedCtx.id);
      if (!subs.length) {
        els.nest.hidden = true;
        return;
      }
      els.nestSelect.innerHTML =
        '<option value="">— Sin subtítulo —</option>' +
        subs.map(s => {
          const label = s.text.length > 40 ? s.text.slice(0, 40) + '…' : s.text;
          return `<option value="${s.id}">${label}</option>`;
        }).join('');
      // Pre-select the last subtitle (most recently added)
      els.nestSelect.value = subs[subs.length - 1].id;
      els.nest.hidden = false;
    }

    function buildMenu(filter) {
      els.menu.innerHTML = "";
      const f = (filter || "").trim().toLowerCase();
      const matches = contexts.filter((c) =>
        c.name.toLowerCase().includes(f)
      );
      for (const c of matches) {
        const opt = document.createElement("div");
        opt.className = "ch-combo-opt";
        opt.innerHTML = '<span class="ch-combo-dot"></span><span></span>';
        opt.querySelector(".ch-combo-dot").style.background = c.color;
        opt.querySelector("span:last-child").textContent = c.name;
        opt.addEventListener("mousedown", (e) => {
          e.preventDefault();
          selectedCtx = c;
          els.combo.value = c.name;
          els.menu.hidden = true;
          paintContext();
          refreshNest();
        });
        els.menu.appendChild(opt);
      }
      // "create new" affordance when the typed name is novel
      const typed = (filter || "").trim();
      if (typed && !contexts.some((c) => c.name.toLowerCase() === typed.toLowerCase())) {
        const opt = document.createElement("div");
        opt.className = "ch-combo-opt";
        opt.innerHTML = `<span class="new">+ Crear «${typed}»</span>`;
        opt.addEventListener("mousedown", (e) => {
          e.preventDefault();
          selectedCtx = null; // resolved/created on save
          els.menu.hidden = true;
          paintContext();
          refreshNest();
        });
        els.menu.appendChild(opt);
      }
    }

    // init UI
    if (selectedCtx) els.combo.value = selectedCtx.name;
    paintContext();
    await refreshNest();

    // combobox events
    els.combo.addEventListener("focus", () => {
      buildMenu(els.combo.value);
      els.menu.hidden = false;
    });
    els.combo.addEventListener("input", () => {
      const typed = els.combo.value.trim().toLowerCase();
      selectedCtx =
        contexts.find((c) => c.name.toLowerCase() === typed) || null;
      buildMenu(els.combo.value);
      els.menu.hidden = false;
      paintContext();
      refreshNest();
    });
    els.chevron.addEventListener("click", () => {
      buildMenu(els.combo.value);
      els.menu.hidden = !els.menu.hidden;
      if (!els.menu.hidden) els.combo.focus();
    });

    els.cancel.addEventListener("click", teardown);
    els.save.addEventListener("click", doSave);

    // Enter saves (unless the combo menu is guiding a pick).
    popEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        doSave();
      } else if (e.key === "Escape") {
        teardown();
      }
    });

    async function doSave() {
      const typedName = els.combo.value.trim();
      if (!selectedCtx && !typedName) {
        return showStatus(els.status, "Elige o crea un contexto.", true);
      }
      try {
        let ctx = selectedCtx;
        if (!ctx) {
          // resolve existing by name or create a new context
          ctx =
            contexts.find(
              (c) => c.name.toLowerCase() === typedName.toLowerCase()
            ) || (await Store.createContext(typedName));
        }
        const isText = Store.typeForCategory(category) === "text";
        const linkedSubtitleId =
          isText && els.nestSelect && els.nestSelect.value
            ? els.nestSelect.value
            : null;
        await Store.addItem(ctx.id, {
          text: savedText,
          category,
          linkedSubtitleId,
          sourceUrl: location.href,
        });
        highlightSavedRange(category);
        showStatus(els.status, "Guardado ✓", false);
        setTimeout(teardown, 500);
      } catch (err) {
        console.error(err);
        showStatus(els.status, "No se pudo guardar.", true);
      }
    }

    // keep clicks inside our UI from dismissing
    popEl.addEventListener("mousedown", (ev) => ev.stopPropagation());
    popEl.addEventListener("click", (ev) => ev.stopPropagation());
    els.combo.focus();
  }

  function removePopup() {
    if (popEl && popEl.parentNode) popEl.parentNode.removeChild(popEl);
    popEl = null;
  }
  function teardown() {
    removePopup();
    removeIcon();
  }

  function showStatus(el, msg, isError) {
    el.hidden = false;
    el.textContent = msg;
    el.classList.toggle("ch-status-error", !!isError);
  }

  // ----- page highlight -----
  function highlightSavedRange(category) {
    if (!savedRange) return;
    const mark = document.createElement("mark");
    mark.className = "ch-hl ch-hl-" + (category || "idea");
    try {
      savedRange.surroundContents(mark);
    } catch (_) {
      try {
        mark.appendChild(savedRange.extractContents());
        savedRange.insertNode(mark);
      } catch (__) {
        /* selection spans complex nodes — skip highlighting */
      }
    }
  }

  // ----- positioning -----
  function position(el, rect) {
    el.style.position = "fixed";
    el.style.visibility = "hidden";
    el.style.left = "0px";
    el.style.top = "0px";
    requestAnimationFrame(() => {
      const w = el.offsetWidth || 0;
      const h = el.offsetHeight || 0;
      const margin = 8;
      let left = rect.left + rect.width / 2 - w / 2;
      let top = rect.top - h - margin;
      if (top < margin) top = rect.bottom + margin;
      const maxLeft = window.innerWidth - w - margin;
      if (left < margin) left = margin;
      if (left > maxLeft) left = Math.max(margin, maxLeft);
      el.style.left = Math.round(left) + "px";
      el.style.top = Math.round(top) + "px";
      el.style.visibility = "visible";
    });
  }
})();
