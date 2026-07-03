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
    const { rangePrefix, rangeSuffix } = extractRangeContext(savedRange);
    const savedItem = await Store.addItem(ctx.id, {
      text: savedText,
      category,
      linkedSubtitleId: null,
      sourceUrl: location.href,
      rangePrefix,
      rangeSuffix,
      rangeText: savedRawText !== savedText ? savedRawText : null,
    });
    highlightSavedRange(category, savedItem.id);
    chrome.runtime.sendMessage({ type: 'CH_OPEN_PANEL_CTX', ctxId: ctx.id });
    showToolbarSuccess(category);
  } catch (err) {
    console.error('[CH] fast-save error:', err);
    removeToolbar();
  }
}

function showToolbarSuccess(category) {
  if (!toolbarEl) return;
  toolbarEl.classList.add('ch-toolbar-success');
  toolbarEl.dataset.successCat = category;
  toolbarEl.innerHTML = '<span class="ch-toolbar-success-text">✓ Guardado</span>';
  setTimeout(removeToolbar, 450);
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
      const { rangePrefix, rangeSuffix } = extractRangeContext(savedRange);
      const savedItem = await Store.addItem(ctx.id, {
        text: savedText,
        category,
        linkedSubtitleId,
        sourceUrl: location.href,
        rangePrefix,
        rangeSuffix,
        rangeText: savedRawText !== savedText ? savedRawText : null,
      });
      highlightSavedRange(category, savedItem.id);
      showStatus(els.status, "Guardado ✓", false);
      setTimeout(teardown, 500);
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

// ----- TextQuoteSelector helpers (range persistence) -----

/**
 * Extract up to 50 chars of surrounding text from a Range for anchoring.
 * Returns { rangePrefix, rangeSuffix } — both null on error or missing range.
 */
function extractRangeContext(range) {
  if (!range) return { rangePrefix: null, rangeSuffix: null };
  try {
    const preRange = document.createRange();
    preRange.setStart(document.body, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    const rangePrefix = preRange.toString().slice(-50);

    const postRange = document.createRange();
    postRange.setStart(range.endContainer, range.endOffset);
    postRange.setEnd(document.body, document.body.childNodes.length);
    const rangeSuffix = postRange.toString().slice(0, 50);

    return { rangePrefix, rangeSuffix };
  } catch (_) {
    return { rangePrefix: null, rangeSuffix: null };
  }
}

// Separator used between text nodes in the concatenated index string.
// \x00 never appears in real page text, so any indexOf match that spans
// this character must cross a node boundary and is unsafe to highlight.
const SEP = '\x00';

/**
 * Collect visible text nodes under root (excluding .ch-hl children)
 * with their cumulative character offsets.
 * Nodes are logically separated by SEP in the fullText string, so offsets
 * account for +1 per node boundary.
 */
function buildTextIndex(root) {
  const nodes = [];
  let offset = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (n.parentElement && n.parentElement.closest('.ch-hl')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let node;
  while ((node = walker.nextNode())) {
    nodes.push({ node, start: offset });
    offset += node.textContent.length + 1; // +1 for SEP after each node
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

/**
 * Locate item.text in the current DOM using TextQuoteSelector logic.
 * Level 1: anchored search (prefix + exact + suffix).
 * Level 2: exact only if unique on the page.
 * Returns a live Range, or null if not found.
 */
function findRangeForItem(item, textNodes, fullText) {
  const exact = item.text;
  const prefix = item.rangePrefix || '';
  const suffix = item.rangeSuffix || '';

  if (prefix || suffix) {
    const idx = fullText.indexOf(prefix + exact + suffix);
    if (idx !== -1) {
      const exactStart = idx + prefix.length;
      // If the exact portion contains SEP it crosses a node boundary — skip.
      if (!fullText.slice(exactStart, exactStart + exact.length).includes(SEP)) {
        const s = posToNodeOffset(textNodes, exactStart);
        const e = posToNodeOffset(textNodes, exactStart + exact.length);
        if (s && e) {
          const r = document.createRange();
          r.setStart(s.node, s.offset);
          r.setEnd(e.node, e.offset);
          return r;
        }
      }
    }
  }

  // Fallback: unique exact match
  const firstIdx = fullText.indexOf(exact);
  if (
    firstIdx !== -1 &&
    !fullText.slice(firstIdx, firstIdx + exact.length).includes(SEP) &&
    fullText.indexOf(exact, firstIdx + 1) === -1
  ) {
    const s = posToNodeOffset(textNodes, firstIdx);
    const e = posToNodeOffset(textNodes, firstIdx + exact.length);
    if (s && e) {
      const r = document.createRange();
      r.setStart(s.node, s.offset);
      r.setEnd(e.node, e.offset);
      return r;
    }
  }

  return null;
}

/** Wrap a Range in a .ch-hl mark element with a data-ch-id attribute. */
function applyMark(range, category, itemId) {
  const mark = document.createElement('mark');
  mark.className = 'ch-hl ch-hl-' + (category || 'idea');
  mark.dataset.chId = itemId;
  try {
    range.surroundContents(mark);
  } catch (_) {
    try {
      mark.appendChild(range.extractContents());
      range.insertNode(mark);
    } catch (__) {
      // range spans partial element boundaries — skip
    }
  }
}

/** Re-apply all saved highlights for the current page URL on load. */
async function reapplyHighlights() {
  try {
    const currentUrl = location.href;
    const data = await Store.readAll();
    const candidates = [];
    for (const ctx of Object.values(data.contexts)) {
      for (const it of ctx.items || []) {
        if (it.sourceUrl === currentUrl && it.rangePrefix != null) candidates.push(it);
      }
    }
    if (!candidates.length) return;
    for (const item of candidates) {
      // Rebuild text index after each mark insertion to keep positions accurate.
      const textNodes = buildTextIndex(document.body);
      const fullText = textNodes.map(n => n.node.textContent).join(SEP);
      // List captures store Markdown in item.text; item.rangeText has the raw DOM text.
      const searchItem = item.rangeText ? { ...item, text: item.rangeText } : item;
      const range = findRangeForItem(searchItem, textNodes, fullText);
      if (range) {
        applyMark(range, item.category, item.id);
        // Merge empty/fragmented text nodes left by extractContents() so the
        // next iteration's buildTextIndex sees a clean, stable node structure.
        document.body.normalize();
      }
    }
  } catch (err) {
    console.warn('[CH] reapplyHighlights error:', err);
  }
}

/** Remove a highlight <mark> by item id, restoring its text in place. */
function removeHighlightById(itemId) {
  const mark = document.querySelector('[data-ch-id="' + CSS.escape(itemId) + '"]');
  if (!mark || !mark.parentNode) return;
  const parent = mark.parentNode;
  while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
  parent.removeChild(mark);
  parent.normalize();
}

// ----- page highlight -----
function highlightSavedRange(category, itemId) {
  if (!savedRange) return;
  const mark = document.createElement("mark");
  mark.className = "ch-hl ch-hl-" + (category || "idea");
  if (itemId) mark.dataset.chId = itemId;
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

// ----- message listener (remove highlight from page) -----
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'CH_REMOVE_HL') removeHighlightById(msg.itemId);
});

// ----- initialization: re-apply saved highlights for this page -----
if ('requestIdleCallback' in window) {
  requestIdleCallback(() => reapplyHighlights(), { timeout: 2000 });
} else {
  setTimeout(reapplyHighlights, 100);
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
