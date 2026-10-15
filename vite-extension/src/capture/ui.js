/**
 * capture/ui.js — in-page capture UI (DESIGN_SPEC §2.1)
 * ---------------------------------------------------------------------------
 *   1. Watch text selections (native mouseup only).
 *   2. Show the quick-capture toolbar (4 category swatches + "⋯").
 *   3. Fast-save into the context already used on this source, or open the
 *      capture popup: context combobox (type to create), category, optional
 *      nest-under-subtitle, comment, Cancel / Save (Enter saves).
 *
 * Shared by the web content script (content.js) and the PDF viewer
 * (viewer.js, feature 37). Everything that differs between the two lives in
 * the adapter passed to initCaptureUI():
 *
 *   store                      storage module (content-storage.js / storage.js)
 *   getSourceUrl()             URL saved as item.sourceUrl
 *   getAnchorRoot(range)       root for rangeStart/rangeEnd offsets
 *   getCaptureMeta(range)      extra addItem fields (e.g. { page, sourceTitle })
 *   validateSelection(range)   null, or an error message shown in the toolbar
 *   getSelectionText(sel, range)  optional → { text, rawText }
 *   afterSave(item, range, info)  paint/notify; info = { category, ctxId, fast, capturedUrl }
 *
 * Vite inlines this module into the content script bundle (see
 * vite-plugins/isolate-content-script.js) — it must never become a shared chunk.
 * ---------------------------------------------------------------------------
 */
import { fragmentToMarkdown } from './markdown.js';
import { extractRangeContext } from './ranges.js';

let adapter = null;
let Store = null;
let savedText = "";
let savedRawText = "";
let savedRange = null;
let toolbarEl = null;
let popEl = null;

const CAT_LABELS = {
  title: 'Título',
  idea: 'Idea',
  argument: 'Argumento',
  evidence: 'Evidencia',
};

/**
 * Install the selection listeners and wire the capture UI to `captureAdapter`.
 * Call once per document.
 */
export function initCaptureUI(captureAdapter) {
  adapter = captureAdapter;
  Store = captureAdapter.store;

  document.addEventListener("mouseup", onMouseUp);
  document.addEventListener("mousedown", (e) => {
    if (isOwnUi(e.target)) return;
    removePopup();
    removeToolbar();
  });
  window.addEventListener(
    "scroll",
    () => {
      removeToolbar();
      removePopup();
    },
    true
  );
  // Opening the side panel shrinks the page's own viewport (it's a docked
  // panel, not an overlay) — a toolbar/popup already positioned in fixed
  // pixels can end up beyond the new, narrower viewport and appear to just
  // vanish. Re-clamp whichever is currently shown back into view (feature 031
  // fix) instead of leaving positioning frozen at selection time.
  window.addEventListener("resize", () => {
    reclampToViewport(toolbarEl);
    reclampToViewport(popEl);
  });
}

/** Default selection text: Markdown for list selections, plain text otherwise. */
function defaultSelectionText(sel, range) {
  const text = sel.toString().trim();
  const mdText = range ? fragmentToMarkdown(range.cloneContents()) : null;
  // rawText is always the plain DOM text — used for re-anchoring on reload.
  return { text: mdText !== null ? mdText : text, rawText: text };
}

// ----- selection detection -----
function onMouseUp(e) {
  if (isOwnUi(e.target)) return;
  setTimeout(() => {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : "";
    if (!text) {
      removeToolbar();
      removePopup();
      return;
    }
    const range = sel.rangeCount ? sel.getRangeAt(0) : null;
    const rect = getRect(sel);
    const invalid = adapter.validateSelection ? adapter.validateSelection(range) : null;
    if (invalid) {
      if (rect) showToolbarMessage(rect, invalid);
      return;
    }
    const picked = (adapter.getSelectionText || defaultSelectionText)(sel, range);
    savedText = picked.text;
    savedRawText = picked.rawText;
    savedRange = range ? range.cloneRange() : null;
    if (rect) showToolbar(rect);
  }, 0);
}

function isOwnUi(node) {
  return !!(node && node.closest && node.closest(".ch-root"));
}

/**
 * Find the context that already contains a highlight from the current source
 * (matched by exact URL). Returns the most recently used such context, or
 * null if this source has no prior highlights.
 */
function contextForThisPage(contexts) {
  const url = adapter.getSourceUrl();
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

/** Anchoring + source metadata for the current selection, ready for addItem. */
function captureFields() {
  const root = adapter.getAnchorRoot ? adapter.getAnchorRoot(savedRange) : document.body;
  const meta = adapter.getCaptureMeta ? adapter.getCaptureMeta(savedRange) : {};
  return {
    ...meta,
    ...extractRangeContext(savedRange, root),
    rangeText: savedRawText !== savedText ? savedRawText : null,
  };
}

/** Toolbar variant that only shows a message (e.g. an invalid selection). */
function showToolbarMessage(rect, message) {
  removeToolbar();
  removePopup();
  toolbarEl = document.createElement('div');
  toolbarEl.className = 'ch-root ch-toolbar ch-toolbar-msg';
  toolbarEl.setAttribute('role', 'status');
  toolbarEl.textContent = message;
  position(toolbarEl, rect);
  document.body.appendChild(toolbarEl);
}

// ----- quick-capture toolbar -----
function showToolbar(rect) {
  removeToolbar();
  removePopup();

  toolbarEl = document.createElement('div');
  toolbarEl.className = 'ch-root ch-toolbar';

  const ctxDot = document.createElement('span');
  ctxDot.className = 'ch-toolbar-ctx-dot';
  ctxDot.hidden = true;

  const ctxDivider = document.createElement('span');
  ctxDivider.className = 'ch-toolbar-divider';
  ctxDivider.hidden = true;

  toolbarEl.appendChild(ctxDot);
  toolbarEl.appendChild(ctxDivider);

  const swatchEls = {};
  for (const cat of ['title', 'idea', 'argument', 'evidence']) {
    const btn = document.createElement('button');
    btn.className = 'ch-toolbar-swatch';
    btn.type = 'button';
    btn.dataset.cat = cat;
    btn.setAttribute('aria-label', `Guardar como ${CAT_LABELS[cat]}`);
    btn.title = CAT_LABELS[cat];
    toolbarEl.appendChild(btn);
    swatchEls[cat] = btn;
  }

  const mainDivider = document.createElement('span');
  mainDivider.className = 'ch-toolbar-divider';
  toolbarEl.appendChild(mainDivider);

  const moreBtn = document.createElement('button');
  moreBtn.className = 'ch-toolbar-more';
  moreBtn.type = 'button';
  moreBtn.textContent = '⋯';
  moreBtn.setAttribute('aria-label', 'Más opciones');
  moreBtn.title = 'Más opciones';
  toolbarEl.appendChild(moreBtn);

  position(toolbarEl, rect);
  document.body.appendChild(toolbarEl);

  let detectedCtx = null;
  Store.listContexts().then((contexts) => {
    detectedCtx = contextForThisPage(contexts);
    if (!detectedCtx || !toolbarEl) return;
    ctxDot.style.background = detectedCtx.color;
    ctxDot.hidden = false;
    ctxDivider.hidden = false;
    for (const [cat, btn] of Object.entries(swatchEls)) {
      const label = `Guardar en ${detectedCtx.name} como ${CAT_LABELS[cat]}`;
      btn.setAttribute('aria-label', label);
      btn.title = label;
    }
  });

  toolbarEl.addEventListener('mousedown', (e) => e.stopPropagation());
  toolbarEl.addEventListener('click', async (e) => {
    e.stopPropagation();
    const swatch = e.target.closest('.ch-toolbar-swatch');
    if (swatch) {
      const category = swatch.dataset.cat;
      if (detectedCtx) {
        await fastSave(detectedCtx, category);
      } else {
        removeToolbar();
        openPopup(rect, category);
      }
      return;
    }
    if (e.target.closest('.ch-toolbar-more')) {
      removeToolbar();
      openPopup(rect);
    }
  });

  toolbarEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      removeToolbar();
    }
  });
}

/** Save directly to detected context without opening the popup. */
async function fastSave(ctx, category) {
  try {
    const capturedUrl = adapter.getSourceUrl();
    const savedItem = await Store.addItem(ctx.id, {
      text: savedText,
      category,
      linkedSubtitleId: null,
      sourceUrl: capturedUrl,
      ...captureFields(),
    });
    adapter.afterSave(savedItem, savedRange, { category, ctxId: ctx.id, fast: true, capturedUrl });
    showToolbarSuccess(category, savedItem, ctx.id);
  } catch (err) {
    console.error('[CH] fast-save error:', err);
    removeToolbar();
  }
}


const TOAST_DISMISS_MS = 450;

/**
 * Show the post-fast-save "✓ Guardado" toast. When the saved item is a text
 * item (idea/argumento/evidencia — never a subtitle), it also offers a
 * "+ agregar comentario" link that morphs the same toast in-place into a
 * one-line comment form (feature 031), without touching the swatch row.
 */
function showToolbarSuccess(category, item, contextId) {
  if (!toolbarEl) return;
  const el = toolbarEl;
  el.classList.add('ch-toolbar-success');
  el.dataset.successCat = category;

  const canComment = !!(item && item.type === 'text');
  el.innerHTML = canComment
    ? '<span class="ch-toolbar-success-text">✓ Guardado</span>' +
      '<button class="ch-toolbar-success-comment" type="button">+ agregar comentario</button>'
    : '<span class="ch-toolbar-success-text">✓ Guardado</span>';

  // Capture the element instead of relying on the (possibly reassigned) global:
  // a new selection would swap toolbarEl to a fresh toolbar, and
  // removeToolbar() would close that one instead of this toast.
  function dismiss() {
    if (el.parentNode) el.parentNode.removeChild(el);
    if (toolbarEl === el) toolbarEl = null;
  }

  if (canComment) {
    // No auto-dismiss timer here: the user gets as long as they need to
    // notice and click "+ agregar comentario" (and, once expanded, as long
    // as they need to type). It's still closed by every existing teardown
    // path — outside click, Escape, scroll, or making a new selection.
    el.querySelector('.ch-toolbar-success-comment').addEventListener('click', (e) => {
      e.stopPropagation();
      expandToastToCommentForm(el, contextId, item.id, dismiss);
    });
  } else {
    setTimeout(dismiss, TOAST_DISMISS_MS);
  }
}

/**
 * Morph a fast-save success toast into a one-line comment input in-place
 * (feature 031). Escape / click-outside already dismiss it without saving —
 * both paths already tear down `toolbarEl` (the toast IS the toolbar element,
 * just with its innerHTML swapped), via the pre-existing global mousedown
 * listener and the toolbar's own keydown listener. Only the save path (Enter
 * or the button) needs wiring here.
 */
function expandToastToCommentForm(toastEl, contextId, itemId, dismiss) {
  toastEl.innerHTML =
    '<input class="ch-toolbar-comment-input" type="text" placeholder="Comentario…" />' +
    '<button class="ch-toolbar-comment-save" type="button">Guardar</button>';
  const input = toastEl.querySelector('.ch-toolbar-comment-input');
  const saveBtn = toastEl.querySelector('.ch-toolbar-comment-save');

  async function save() {
    const comment = input.value.trim();
    try {
      if (comment) await Store.updateItem(contextId, itemId, { comment });
    } catch (err) {
      console.error('[CH] comment save error:', err);
    }
    dismiss();
  }

  saveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    save();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    }
  });
  input.focus();
}

function removeToolbar() {
  if (toolbarEl && toolbarEl.parentNode) toolbarEl.parentNode.removeChild(toolbarEl);
  toolbarEl = null;
}

const TRUNCATE_AT = 150;
const PREVIEW_LEN = 120;

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
    <div class="ch-quote" data-role="quote">
      <div class="ch-quote-header">
        <span class="ch-quote-chip" data-role="quote-chip"></span>
        <span class="ch-quote-meta">
          <span class="ch-quote-len" data-role="quote-len" hidden></span>
          <button class="ch-quote-toggle" data-role="quote-toggle" type="button" hidden></button>
        </span>
      </div>
      <div class="ch-quote-text" data-role="quote-text"></div>
    </div>

    <div class="ch-capture-row">
      <div class="ch-combo">
        <div class="ch-combo-pill">
          <span class="ch-combo-dot" data-role="dot"></span>
          <input class="ch-combo-input" data-role="combo" type="text"
                 placeholder="Contexto…" autocomplete="off" />
          <button class="ch-combo-chevron" data-role="chevron" type="button">▾</button>
        </div>
        <div class="ch-combo-menu" data-role="menu" hidden></div>
      </div>
      <div class="ch-cat-pill">
        <span class="ch-cat-dot" data-role="cat-dot"></span>
        <select class="ch-cat-sel" data-role="cat-select">
          <option value="title">Título</option>
          <option value="idea">Idea</option>
          <option value="argument">Argumento</option>
          <option value="evidence">Evidencia</option>
        </select>
      </div>
    </div>

    <div class="ch-nest" data-role="nest" hidden>
      <label class="ch-nest-label" for="ch-nest-sel">Anidar bajo</label>
      <select class="ch-nest-sel" data-role="nest-select" id="ch-nest-sel"></select>
    </div>

    <div class="ch-comment-row" data-role="comment-row" hidden>
      <input class="ch-comment-input" data-role="comment-input" type="text"
             placeholder="Comentario (opcional)" autocomplete="off" />
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
async function openPopup(rect, initialCategory = 'idea') {
  removePopup();
  const contexts = await Store.listContexts();

  popEl = document.createElement("div");
  popEl.className = "ch-root ch-pop";
  popEl.innerHTML = popupSkeleton();
  position(popEl, rect);
  document.body.appendChild(popEl);
  const els = {
    tag: popEl.querySelector('[data-role="ctx-tag"]'),
    dot: popEl.querySelector('[data-role="dot"]'),
    combo: popEl.querySelector('[data-role="combo"]'),
    chevron: popEl.querySelector('[data-role="chevron"]'),
    menu: popEl.querySelector('[data-role="menu"]'),
    catDot: popEl.querySelector('[data-role="cat-dot"]'),
    catSelect: popEl.querySelector('[data-role="cat-select"]'),
    nest: popEl.querySelector('[data-role="nest"]'),
    nestSelect: popEl.querySelector('[data-role="nest-select"]'),
    commentRow: popEl.querySelector('[data-role="comment-row"]'),
    commentInput: popEl.querySelector('[data-role="comment-input"]'),
    microcopy: popEl.querySelector('[data-role="microcopy"]'),
    cancel: popEl.querySelector('[data-role="cancel"]'),
    save: popEl.querySelector('[data-role="save"]'),
    status: popEl.querySelector('[data-role="status"]'),
    quote: popEl.querySelector('[data-role="quote"]'),
    quoteChip: popEl.querySelector('[data-role="quote-chip"]'),
    quoteText: popEl.querySelector('[data-role="quote-text"]'),
    quoteLen: popEl.querySelector('[data-role="quote-len"]'),
    quoteToggle: popEl.querySelector('[data-role="quote-toggle"]'),
  };

  let category = initialCategory;
  let quoteExpanded = false;
  let selectedCtx = contextForThisPage(contexts);

  /** Render truncated or expanded text inside the quote block. */
  function renderQuoteText() {
    const isLong = savedText.length > TRUNCATE_AT;
    els.quoteText.textContent =
      isLong && !quoteExpanded
        ? savedText.slice(0, PREVIEW_LEN) + "…"
        : savedText;
    els.quoteText.classList.toggle("expanded", quoteExpanded);
    els.quoteLen.hidden = !isLong;
    els.quoteLen.textContent = savedText.length + " chars";
    els.quoteToggle.hidden = !isLong;
    els.quoteToggle.textContent = quoteExpanded ? "colapsar" : "ver todo";
  }

  /** Sync quote border color and category chip with the active category. */
  function updateQuotePreview() {
    const meta = Store.CATEGORIES[category];
    els.quote.style.setProperty("--ch-quote-border", meta.dot);
    els.quoteChip.style.setProperty("--chip-dot", meta.dot);
    els.quoteChip.style.setProperty("--chip-bg", meta.hlBg);
    els.quoteChip.style.setProperty("--chip-fg", meta.hlFg);
    els.quoteChip.textContent = meta.label;
    renderQuoteText();
  }

  els.quoteToggle.addEventListener("click", () => {
    quoteExpanded = !quoteExpanded;
    renderQuoteText();
  });

  function paintCatDot() {
    els.catDot.style.background = Store.CATEGORIES[category].dot;
  }
  els.catSelect.value = category;
  paintCatDot();
  els.catSelect.addEventListener("change", () => {
    category = els.catSelect.value;
    paintCatDot();
    updateQuotePreview();
    refreshNest();
  });

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
    els.commentRow.hidden = !isText;
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
      subs
        .map((s) => {
          const label = s.text.length > 40 ? s.text.slice(0, 40) + "…" : s.text;
          return `<option value="${s.id}">${label}</option>`;
        })
        .join("");
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
    const typed = (filter || "").trim();
    if (typed && !contexts.some((c) => c.name.toLowerCase() === typed.toLowerCase())) {
      const opt = document.createElement("div");
      opt.className = "ch-combo-opt";
      opt.innerHTML = `<span class="new">+ Crear «${typed}»</span>`;
      opt.addEventListener("mousedown", (e) => {
        e.preventDefault();
        selectedCtx = null;
        els.menu.hidden = true;
        paintContext();
        refreshNest();
      });
      els.menu.appendChild(opt);
    }
    if (!matches.length && !typed) {
      const hint = document.createElement("div");
      hint.className = "ch-combo-empty";
      hint.textContent = "Escribe un nombre para crear un contexto";
      els.menu.appendChild(hint);
    }
  }

  if (selectedCtx) els.combo.value = selectedCtx.name;
  paintContext();
  updateQuotePreview();
  await refreshNest();

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
      const capturedUrl = adapter.getSourceUrl();
      let ctx = selectedCtx;
      if (!ctx) {
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
      const comment = isText && els.commentInput ? els.commentInput.value.trim() : null;
      const savedItem = await Store.addItem(ctx.id, {
        text: savedText,
        category,
        linkedSubtitleId,
        sourceUrl: capturedUrl,
        ...captureFields(),
        comment,
      });
      adapter.afterSave(savedItem, savedRange, { category, ctxId: ctx.id, fast: false, capturedUrl });
      showStatus(els.status, "Guardado ✓", false);
      // Capture this popup instead of calling teardown() (which reads the
      // global popEl/toolbarEl) — a new selection within these 500ms could
      // open a fresh popup or toolbar that this timeout must not touch.
      const thisPopEl = popEl;
      setTimeout(() => {
        if (thisPopEl.parentNode) thisPopEl.parentNode.removeChild(thisPopEl);
        if (popEl === thisPopEl) popEl = null;
      }, 500);
    } catch (err) {
      console.error(err);
      showStatus(els.status, "No se pudo guardar.", true);
    }
  }

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
  removeToolbar();
}

function showStatus(el, msg, isError) {
  el.hidden = false;
  el.textContent = msg;
  el.classList.toggle("ch-status-error", !!isError);
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

/**
 * Nudge an already-positioned floating element back inside the current
 * viewport bounds, in place — used on window "resize" (see top of file) so
 * opening the side panel (which shrinks the page viewport) can't leave a
 * toolbar/popup sitting beyond the new right edge.
 */
function reclampToViewport(el) {
  if (!el) return;
  const margin = 8;
  const rect = el.getBoundingClientRect();
  let left = rect.left;
  let top = rect.top;
  const maxLeft = window.innerWidth - rect.width - margin;
  if (left > maxLeft) left = Math.max(margin, maxLeft);
  if (left < margin) left = margin;
  const maxTop = window.innerHeight - rect.height - margin;
  if (top > maxTop) top = Math.max(margin, maxTop);
  if (top < margin) top = margin;
  el.style.left = Math.round(left) + "px";
  el.style.top = Math.round(top) + "px";
}
