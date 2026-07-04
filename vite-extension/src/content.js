/**
 * content.js — in-page capture (DESIGN_SPEC §2.1)
 * ---------------------------------------------------------------------------
 *   1. Watch text selections.
 *   2. Show a tiny floating "+" icon near the selection.
 *   3. On click, expand into a one-gesture capture popup: context combobox
 *      (type to create), 4 category swatches, optional nest-under-subtitle
 *      select, and Cancel / Save (Enter saves).
 *   4. Persist via storage.js → chrome.storage.local.
 *   5. Mark the saved selection on the page with `.ch-hl`.
 *
 * Vite bundles this as an IIFE for the MV3 content script context.
 * storage.js is tree-shaken and inlined into this bundle.
 * ---------------------------------------------------------------------------
 */
// content-storage.js is a separate copy of storage.js used only by this content
// script. If both content.js and sidebar.js import the same storage.js, Rollup
// extracts it as a shared chunk and CRXJS marks it as a web accessible resource.
// Chrome then executes that WAR without chrome.storage access. Separate copies
// avoid the shared chunk entirely.
import * as Store from './content-storage.js';
import { findMatch } from './anchor.js';

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

// ----- list → Markdown conversion -----

/**
 * Convert a DocumentFragment from Range.cloneContents() to Markdown.
 * Returns null when the fragment contains no list elements so the caller
 * can fall back to sel.toString().trim().
 */
function fragmentToMarkdown(fragment) {
  if (!fragment.querySelector("ul, ol, li")) return null;
  const md = _childrenToMd(fragment, 0);
  return md.replace(/\n{3,}/g, "\n\n").trim();
}

function _nodeToMd(node, indent) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const tag = node.tagName.toLowerCase();
  switch (tag) {
    case "ul": return _listToMd(node, indent, false);
    case "ol": return _listToMd(node, indent, true);
    case "li": return _liToMd(node, indent, false, 1); // standalone li (partial selection)
    case "br": return "\n";
    case "p":
    case "div":
    case "section":
    case "article": {
      const inner = _childrenToMd(node, indent).trim();
      return inner ? inner + "\n\n" : "";
    }
    case "h1": return "# " + node.textContent.trim() + "\n\n";
    case "h2": return "## " + node.textContent.trim() + "\n\n";
    case "h3":
    case "h4":
    case "h5":
    case "h6": return "### " + node.textContent.trim() + "\n\n";
    case "strong":
    case "b": return "**" + _childrenToMd(node, indent) + "**";
    case "em":
    case "i": return "_" + _childrenToMd(node, indent) + "_";
    case "code": return "`" + node.textContent + "`";
    case "dt": return "**" + node.textContent.trim() + "**\n";
    case "dd": return "  " + node.textContent.trim() + "\n";
    case "table": return node.textContent.trim() + "\n\n"; // fallback: no table Markdown
    default: return _childrenToMd(node, indent);
  }
}

function _listToMd(listNode, indent, ordered) {
  const parts = [];
  let n = 1;
  for (const child of listNode.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE && child.tagName.toLowerCase() === "li") {
      parts.push(_liToMd(child, indent, ordered, n));
      if (ordered) n++;
    }
  }
  return parts.join("\n") + "\n";
}

function _liToMd(li, indent, ordered, n) {
  const pad = "  ".repeat(indent);
  const bullet = ordered ? n + ". " : "- ";
  let inlineText = "";
  const nested = [];
  for (const child of li.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const t = child.tagName.toLowerCase();
      if (t === "ul" || t === "ol") {
        nested.push(_listToMd(child, indent + 1, t === "ol"));
        continue;
      }
    }
    inlineText += _nodeToMd(child, indent);
  }
  const firstLine = pad + bullet + inlineText.trim();
  return nested.length ? firstLine + "\n" + nested.join("") : firstLine;
}

function _childrenToMd(node, indent) {
  let out = "";
  for (const child of node.childNodes) out += _nodeToMd(child, indent);
  return out;
}

// ----- selection detection -----
document.addEventListener("mouseup", (e) => {
  if (isOwnUi(e.target)) return;
  setTimeout(() => {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : "";
    if (text) {
      const range = sel.rangeCount ? sel.getRangeAt(0) : null;
      const mdText = range ? fragmentToMarkdown(range.cloneContents()) : null;
      savedText = mdText !== null ? mdText : text;
      savedRawText = text; // always the plain DOM text — used for re-anchoring on reload
      savedRange = range ? range.cloneRange() : null;
      const rect = getRect(sel);
      if (rect) showToolbar(rect);
    } else {
      removeToolbar();
      removePopup();
    }
  }, 0);
});

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
    const capturedUrl = location.href;
    const { rangePrefix, rangeSuffix, rangeStart, rangeEnd } = extractRangeContext(savedRange);
    const savedItem = await Store.addItem(ctx.id, {
      text: savedText,
      category,
      linkedSubtitleId: null,
      sourceUrl: capturedUrl,
      rangePrefix,
      rangeSuffix,
      rangeStart,
      rangeEnd,
      rangeText: savedRawText !== savedText ? savedRawText : null,
    });
    // A SPA navigation during the await above would move `location.href` and
    // reset the anchoring session to the new URL — painting/anchoring the old
    // item there would attribute it to the wrong page (spec 027 review).
    if (location.href === capturedUrl) highlightSavedRange(category, savedItem);
    chrome.runtime.sendMessage({ type: 'CH_OPEN_PANEL_CTX', ctxId: ctx.id }).catch(() => {});
    showToolbarSuccess(category);
  } catch (err) {
    console.error('[CH] fast-save error:', err);
    removeToolbar();
  }
}

function showToolbarSuccess(category) {
  if (!toolbarEl) return;
  const el = toolbarEl;
  el.classList.add('ch-toolbar-success');
  el.dataset.successCat = category;
  el.innerHTML = '<span class="ch-toolbar-success-text">✓ Guardado</span>';
  // Capture the element instead of relying on the (possibly reassigned) global:
  // a new selection within this timeout would swap toolbarEl to a fresh
  // toolbar, and removeToolbar() would close that one instead of this toast.
  setTimeout(() => {
    if (el.parentNode) el.parentNode.removeChild(el);
    if (toolbarEl === el) toolbarEl = null;
  }, 450);
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
      const capturedUrl = location.href;
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
      const { rangePrefix, rangeSuffix, rangeStart, rangeEnd } = extractRangeContext(savedRange);
      const savedItem = await Store.addItem(ctx.id, {
        text: savedText,
        category,
        linkedSubtitleId,
        sourceUrl: capturedUrl,
        rangePrefix,
        rangeSuffix,
        rangeStart,
        rangeEnd,
        rangeText: savedRawText !== savedText ? savedRawText : null,
      });
      // See fastSave: a navigation during the awaits above must not attribute
      // this item's live paint/anchor to whatever page loaded in the meantime.
      if (location.href === capturedUrl) highlightSavedRange(category, savedItem);
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

// ----- range selectors (persistence metadata) -----

/**
 * Extract anchoring metadata from a Range at save time:
 *   rangePrefix / rangeSuffix — up to 50 chars of surrounding text
 *   (TextQuoteSelector); rangeStart / rangeEnd — character offsets of the
 *   selection over the concatenated text-node content of document.body
 *   (TextPositionSelector). All fields null on error or missing range.
 */
function extractRangeContext(range) {
  if (!range) {
    return { rangePrefix: null, rangeSuffix: null, rangeStart: null, rangeEnd: null };
  }
  try {
    const preRange = document.createRange();
    preRange.setStart(document.body, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    const before = preRange.toString();

    const postRange = document.createRange();
    postRange.setStart(range.endContainer, range.endOffset);
    postRange.setEnd(document.body, document.body.childNodes.length);
    const after = postRange.toString();

    // The stored quote is trimmed (savedRawText = sel.toString().trim()), but
    // `range` is the raw, untrimmed selection. Re-align the offsets/prefix/
    // suffix to the TRIMMED text so they share a coordinate space with
    // item.text/rangeText — otherwise level 0 (position) never matches and
    // level 1's prefix+quote+suffix anchor silently breaks whenever the
    // selection has boundary whitespace (common with drag-selections).
    const rawRangeText = range.toString();
    const trimmed = rawRangeText.trim();
    const leadTrim = rawRangeText.length - rawRangeText.replace(/^\s+/, "").length;

    // Range.toString() concatenates text nodes with no separators — the same
    // coordinate space buildTextIndex() produces, so these offsets remain
    // directly comparable on revisit (level 0 of the anchoring pipeline).
    return {
      rangePrefix: (before + rawRangeText.slice(0, leadTrim)).slice(-50),
      rangeSuffix: (rawRangeText.slice(leadTrim + trimmed.length) + after).slice(0, 50),
      rangeStart: before.length + leadTrim,
      rangeEnd: before.length + leadTrim + trimmed.length,
    };
  } catch (_) {
    return { rangePrefix: null, rangeSuffix: null, rangeStart: null, rangeEnd: null };
  }
}

// ----- text index (page text ↔ DOM ranges) -----

// Pathological pages (infinite feeds) are indexed only up to this many chars.
const INDEX_CHAR_CAP = 2_000_000;

/**
 * Collect the text nodes under root with their cumulative character offsets.
 * Offsets are contiguous (no separators) so they line up with Range.toString()
 * and with the rangeStart/rangeEnd offsets captured at save time.
 */
function buildTextIndex(root) {
  const nodes = [];
  let offset = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    nodes.push({ node, start: offset });
    offset += node.textContent.length;
    if (offset > INDEX_CHAR_CAP) break;
  }
  return nodes;
}

/** Map a character position in the concatenated text back to a {node, offset}. */
function posToNodeOffset(textNodes, pos) {
  for (let i = textNodes.length - 1; i >= 0; i--) {
    if (textNodes[i].start <= pos) {
      return { node: textNodes[i].node, offset: pos - textNodes[i].start };
    }
  }
  return null;
}

/** Build a DOM Range for raw [start, end) offsets over the index. */
function rangeFromOffsets(textNodes, start, end) {
  const s = posToNodeOffset(textNodes, start);
  const e = posToNodeOffset(textNodes, end);
  if (!s || !e) return null;
  try {
    const r = document.createRange();
    r.setStart(s.node, Math.min(s.offset, s.node.textContent.length));
    r.setEnd(e.node, Math.min(e.offset, e.node.textContent.length));
    return r.collapsed ? null : r;
  } catch (_) {
    return null;
  }
}

// ----- painter (CSS Custom Highlight API — zero DOM mutation) -----

const HL_NAME_PREFIX = 'ch-hl-';
const HL_CATEGORIES = ['title', 'idea', 'argument', 'evidence'];
// itemId -> { category, range } — replaces the old data-ch-id attribute.
const paintedRanges = new Map();

function highlightApiAvailable() {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';
}

function categoryHighlight(category) {
  const name = HL_NAME_PREFIX + category;
  let hl = CSS.highlights.get(name);
  if (!hl) {
    hl = new Highlight();
    CSS.highlights.set(name, hl);
  }
  return hl;
}

/** Paint a Range for an item, replacing any previous paint for the same id. */
function paintRange(range, category, itemId) {
  if (!highlightApiAvailable() || !range || !itemId) return;
  unpaintItem(itemId);
  const cat = HL_CATEGORIES.includes(category) ? category : 'idea';
  categoryHighlight(cat).add(range);
  paintedRanges.set(itemId, { category: cat, range });
}

function unpaintItem(itemId) {
  const rec = paintedRanges.get(itemId);
  if (!rec) return;
  if (highlightApiAvailable()) categoryHighlight(rec.category).delete(rec.range);
  paintedRanges.delete(itemId);
}

function clearAllPaint() {
  if (highlightApiAvailable()) {
    for (const cat of HL_CATEGORIES) {
      const hl = CSS.highlights.get(HL_NAME_PREFIX + cat);
      if (hl) hl.clear();
    }
  }
  paintedRanges.clear();
}

// ----- live highlight on save -----

function highlightSavedRange(category, item) {
  if (!savedRange || !item) return;
  paintRange(savedRange.cloneRange(), category, item.id);
  noteLiveAnchor(item);
}

// ----- anchoring session (per-URL epoch state machine) -----
//
// IDLE → ANCHORING (initial pass + MutationObserver-driven passes) → DONE.
// Pending items are retried on mutation bursts until MAX_PASSES; after the
// grace window they soft-fail (reported to the panel) but stay retryable, so
// lazy-loaded content can still anchor late. A URL change starts a new epoch.

const DEBOUNCE_MS = 350;
const IDLE_TIMEOUT_MS = 1000;
const GRACE_MS = 5000;
const SOFT_FAIL_PASSES = 3;
const MAX_PASSES = 50;
const PREFILTER_PROBE_LEN = 30;
const MUTATION_BUFFER_CAP = 65536;

const session = {
  url: null,
  items: new Map(),     // itemId -> item (all candidates for this URL)
  pending: new Set(),   // itemIds not currently anchored
  statuses: new Map(),  // itemId -> 'pending' | 'anchored' | 'failed'
  observer: null,
  debounceTimer: null,
  idleScheduled: false,
  passes: 0,
  graceDeadline: 0,
  softFailTimer: null,
  buffer: '',
  bufferOverflow: false,
};

function quoteOf(item) {
  // List captures store Markdown in item.text; item.rangeText has the raw DOM text.
  return (item && (item.rangeText || item.text)) || '';
}

/** Start (or restart) the anchoring session for the current URL. */
async function startAnchorSession() {
  stopObserver();
  clearTimeout(session.softFailTimer);
  clearAllPaint();
  session.url = location.href;
  session.items.clear();
  session.pending.clear();
  session.statuses.clear();
  session.passes = 0;
  session.graceDeadline = Date.now() + GRACE_MS;

  try {
    const data = await Store.readAll();
    for (const ctx of Object.values(data.contexts)) {
      for (const it of ctx.items || []) {
        if (it.sourceUrl === session.url && it.rangePrefix != null) {
          session.items.set(it.id, it);
          session.pending.add(it.id);
          session.statuses.set(it.id, 'pending');
        }
      }
    }
  } catch (err) {
    console.warn('[CH] anchor session init error:', err);
    return;
  }

  notifyAnchorStatus();
  if (!session.pending.size) return; // never observe URLs with no items

  // Defensive re-clear: if another startAnchorSession() call overlapped this
  // one (both awaiting Store.readAll() around the same URL change) and lost
  // the race to install its own timer first, this prevents that timer from
  // being orphaned (uncleared, still scheduled) when this call overwrites
  // the field — an orphaned timer would soft-fail items on the wrong clock.
  clearTimeout(session.softFailTimer);
  session.softFailTimer = setTimeout(markPendingAsFailed, GRACE_MS);
  scheduleIdlePass();
  startObserver();
}

function markPendingAsFailed() {
  let changed = false;
  for (const id of session.pending) {
    if (session.statuses.get(id) !== 'failed') {
      session.statuses.set(id, 'failed');
      changed = true;
    }
  }
  if (changed) notifyAnchorStatus();
}

function scheduleIdlePass() {
  if (session.idleScheduled) return;
  session.idleScheduled = true;
  const run = () => {
    session.idleScheduled = false;
    runAnchorPass();
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
  } else {
    setTimeout(run, 100);
  }
}

/**
 * Detect painted ranges killed by DOM replacement (framework re-renders
 * collapse live Ranges) and put their items back in play.
 */
function revalidatePainted() {
  let requeued = false;
  for (const [id, rec] of [...paintedRanges]) {
    if (rec.range.collapsed || !rec.range.startContainer.isConnected) {
      unpaintItem(id);
      if (session.items.has(id)) {
        session.pending.add(id);
        session.statuses.set(id, 'pending');
        requeued = true;
      }
    }
  }
  if (requeued) notifyAnchorStatus();
  return requeued;
}

/** One full anchoring pass: index the page once, try every pending item. */
function runAnchorPass() {
  if (location.href !== session.url) {
    startAnchorSession();
    return;
  }
  revalidatePainted();
  if (!session.pending.size) {
    maybeStopObserver();
    return;
  }
  session.passes++;
  if (session.passes > MAX_PASSES) {
    stopObserver();
    markPendingAsFailed();
    return;
  }

  const textNodes = buildTextIndex(document.body);
  const raw = textNodes.map((n) => n.node.textContent).join('');
  let changed = false;

  for (const id of [...session.pending]) {
    const item = session.items.get(id);
    const quote = quoteOf(item);
    if (!quote) {
      session.pending.delete(id);
      session.statuses.set(id, 'failed');
      changed = true;
      continue;
    }
    const hit = findMatch(raw, {
      quote,
      prefix: item.rangePrefix || '',
      suffix: item.rangeSuffix || '',
      hintStart: item.rangeStart,
      hintEnd: item.rangeEnd,
    });
    if (!hit) continue;
    const range = rangeFromOffsets(textNodes, hit.start, hit.end);
    if (!range) continue;
    paintRange(range, item.category, id);
    session.pending.delete(id);
    if (session.statuses.get(id) !== 'anchored') {
      session.statuses.set(id, 'anchored'); // late anchors upgrade a soft-fail
      changed = true;
    }
  }

  // After the grace window, report still-unanchored items to the panel
  // (they stay retryable until MAX_PASSES).
  if (session.passes >= SOFT_FAIL_PASSES || Date.now() >= session.graceDeadline) {
    for (const id of session.pending) {
      if (session.statuses.get(id) !== 'failed') {
        session.statuses.set(id, 'failed');
        changed = true;
      }
    }
  }

  maybeStopObserver();
  if (changed) notifyAnchorStatus();
}

/** Record a just-saved item as anchored for the panel status strip. */
function noteLiveAnchor(item) {
  if (!item || !item.id) return;
  if (session.url === null) session.url = location.href;
  if (session.url !== location.href) return;
  session.items.set(item.id, item);
  session.pending.delete(item.id);
  session.statuses.set(item.id, 'anchored');
  notifyAnchorStatus();
}

// ----- MutationObserver (dynamic pages: SPA renders, lazy-load) -----

function startObserver() {
  if (session.observer) return;
  // The Highlight API painter never mutates the DOM, so every record here is a
  // page-driven change — no self-write guard needed.
  session.observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const n of m.addedNodes) {
        if (session.bufferOverflow) break;
        const t = n.textContent || '';
        if (session.buffer.length + t.length > MUTATION_BUFFER_CAP) {
          session.buffer = '';
          session.bufferOverflow = true;
        } else {
          session.buffer += t;
        }
      }
    }
    clearTimeout(session.debounceTimer);
    session.debounceTimer = setTimeout(onMutationBurst, DEBOUNCE_MS);
  });
  session.observer.observe(document.body, { childList: true, subtree: true });
}

function stopObserver() {
  if (session.observer) {
    session.observer.disconnect();
    session.observer = null;
  }
  clearTimeout(session.debounceTimer);
  session.debounceTimer = null;
  session.buffer = '';
  session.bufferOverflow = false;
}

/** Disconnect once nothing is pending and the initial grace window is over. */
function maybeStopObserver() {
  if (!session.pending.size && Date.now() >= session.graceDeadline) stopObserver();
}

/** Cheap gate: only run a full pass if the added text can contain a pending quote. */
function prefilterHit(probe) {
  if (!probe) return false;
  const squash = (s) => s.replace(/\s+/g, ' ').toLowerCase();
  const hay = squash(probe);
  for (const id of session.pending) {
    const q = squash(quoteOf(session.items.get(id)).slice(0, PREFILTER_PROBE_LEN));
    if (q && hay.includes(q)) return true;
  }
  return false;
}

function onMutationBurst() {
  if (location.href !== session.url) {
    startAnchorSession(); // SPA navigations almost always mutate the DOM
    return;
  }
  const probe = session.buffer;
  const overflow = session.bufferOverflow;
  session.buffer = '';
  session.bufferOverflow = false;

  let needsPass = revalidatePainted();
  if (!needsPass && session.pending.size) {
    needsPass = overflow || prefilterHit(probe);
  }
  if (needsPass) scheduleIdlePass();
  else maybeStopObserver();
}

// ----- messaging (panel status + highlight removal) -----

function notifyAnchorStatus() {
  try {
    // Fire-and-forget: only lands if the side panel is open.
    chrome.runtime
      .sendMessage({
        type: 'CH_ANCHOR_STATUS',
        url: session.url,
        statuses: Object.fromEntries(session.statuses),
      })
      .catch(() => {});
  } catch (_) {
    /* extension context invalidated — ignore */
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'CH_REMOVE_HL') {
    unpaintItem(msg.itemId);
    session.items.delete(msg.itemId);
    session.pending.delete(msg.itemId);
    if (session.statuses.delete(msg.itemId)) notifyAnchorStatus();
    maybeStopObserver();
  }
  if (msg && msg.type === 'CH_GET_ANCHOR_STATUS') {
    sendResponse({ url: location.href, statuses: Object.fromEntries(session.statuses) });
  }
});

// ----- SPA navigation detection (no manifest changes) -----

function checkUrlChange() {
  if (location.href !== session.url) startAnchorSession();
}

function watchUrlChanges() {
  const deferredCheck = () => setTimeout(checkUrlChange, 0);
  // Navigation API (Chrome 102+) covers pushState/replaceState/back/forward.
  // Availability in content-script isolated worlds is feature-detected here;
  // plan B (chrome.webNavigation in background) is documented in spec 027.
  if (window.navigation && typeof window.navigation.addEventListener === 'function') {
    try {
      window.navigation.addEventListener('currententrychange', deferredCheck);
    } catch (_) {
      setInterval(checkUrlChange, 1500);
    }
  } else {
    setInterval(checkUrlChange, 1500); // slow poll only without Navigation API
  }
  window.addEventListener('popstate', deferredCheck);
  window.addEventListener('hashchange', deferredCheck);
}

// ----- initialization: anchor saved highlights for this page -----
watchUrlChanges();
startAnchorSession();

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
