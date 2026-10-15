/**
 * storage.js
 * ---------------------------------------------------------------------------
 * Data layer over chrome.storage.local. ES module — import named exports
 * directly in content.js and popup.js; Vite bundles each entry separately.
 *
 * All state lives in chrome.storage.local under STORAGE_KEY. Importing this
 * module in two different extension contexts (content script, popup) does NOT
 * create a shared in-memory state — each bundle gets its own copy of the code.
 * The persistent storage key is the actual shared data bus.
 * ---------------------------------------------------------------------------
 */

export const STORAGE_KEY = "contextHighlighter";

function uid(prefix) {
  return (
    (prefix || "id") +
    "_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 8)
  );
}
export { uid };

// Brand accents assigned to contexts in creation order (list chips).
export const BRAND_COLORS = [
  "#5b57e8",
  "#e2a23b",
  "#3da35d",
  "#4a7fd0",
  "#b85cc0",
  "#d4564f",
  "#2aa6a0",
];

// Per-domain source dot colors (internal — not exported).
const DOMAIN_COLORS = {
  "examine.com": "#3da35d",
  "ncbi.nlm.nih.gov": "#4a7fd0",
  "hubermanlab.com": "#1a1a1a",
  "sleepfoundation.org": "#7a5cd0",
  "nature.com": "#d4564f",
  "pubmed.gov": "#2aa6a0",
};
const DOMAIN_FALLBACK = "#8a8a92";

// Each highlight has a semantic CATEGORY that drives: the item `type`
// (title -> subtitle/heading; the rest -> text/paragraph), the dot/swatch
// color in the UI, the on-page highlight colors, and the Markdown emoji
// prefix used to round-trip the color through .md.
export const CATEGORIES = {
  title: {
    id: "title",
    label: "Título",
    type: "subtitle",
    emoji: "",
    dot: "#d4564f",
    hlBg: "#f6b8c4",
    hlFg: "#5a1020",
  },
  idea: {
    id: "idea",
    label: "Idea",
    type: "text",
    emoji: "🟡",
    dot: "#e2a23b",
    hlBg: "#fdeaa8",
    hlFg: "#6a5413",
  },
  argument: {
    id: "argument",
    label: "Argumento",
    type: "text",
    emoji: "🔵",
    dot: "#4a7fd0",
    hlBg: "#bcd3f5",
    hlFg: "#14315f",
  },
  evidence: {
    id: "evidence",
    label: "Evidencia",
    type: "text",
    emoji: "🟢",
    dot: "#3da35d",
    hlBg: "#bfe6c8",
    hlFg: "#16432a",
  },
};

// Emoji -> category (only the three text categories carry an emoji, internal).
const EMOJI_TO_CAT = { "🟡": "idea", "🔵": "argument", "🟢": "evidence" };

/** Category metadata (or null for legacy/neutral items). */
export function categoryMeta(cat) {
  return CATEGORIES[cat] || null;
}

/** Item type implied by a category. */
export function typeForCategory(cat) {
  return CATEGORIES[cat] ? CATEGORIES[cat].type : "text";
}

/** Color for a source domain string (e.g. "ncbi.nlm.nih.gov"). */
export function domainColor(source) {
  if (!source) return DOMAIN_FALLBACK;
  const key = String(source).replace(/^www\./, "").toLowerCase();
  return DOMAIN_COLORS[key] || DOMAIN_FALLBACK;
}

/** Reduce a URL (or already-bare host) to a clean hostname. */
export function hostnameFromUrl(url) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (_) {
    return String(url)
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .replace(/^www\./, "");
  }
}

// --- PDF sources (feature 37) ---

/** True for items captured in the extension's PDF viewer (they carry a page). */
export function isPdfItem(it) {
  return !!it && Number.isInteger(it.page) && it.page >= 1;
}

/**
 * Human-readable file name for a PDF URL (http(s) or file://): the last path
 * segment, percent-decoded. Falls back to the hostname, then a generic label,
 * so a group header is never empty.
 */
export function pdfFilename(url) {
  if (!url) return "documento.pdf";
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() || "";
    let name = last;
    try {
      name = decodeURIComponent(last);
    } catch (_) {
      /* malformed escape — keep the raw segment */
    }
    return name || u.hostname.replace(/^www\./, "") || "documento.pdf";
  } catch (_) {
    const last = String(url).split(/[?#]/)[0].split("/").filter(Boolean).pop();
    return last || "documento.pdf";
  }
}

/** Optional PDF fields for an item; empty object for web items (shape unchanged). */
function pdfFields(page, sourceTitle) {
  if (!(Number.isInteger(page) && page >= 1)) return {};
  return { page, sourceTitle: sourceTitle ? String(sourceTitle) : null };
}

// --- Low-level read/write of the whole document ---

export function readAll() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (res) => {
      const data = res && res[STORAGE_KEY];
      resolve(data && data.contexts ? data : { contexts: {} });
    });
  });
}

export function writeAll(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: data }, () => resolve(data));
  });
}

/** Whether the onboarding modal has already been dismissed once. */
export async function hasSeenOnboarding() {
  const data = await readAll();
  return !!data.onboardingSeen;
}

/** Persist that the onboarding modal has been dismissed. */
export async function markOnboardingSeen() {
  const data = await readAll();
  data.onboardingSeen = true;
  await writeAll(data);
}

// --- Context operations ---

/** Return all contexts as an array, newest first. */
export async function listContexts() {
  const data = await readAll();
  return Object.values(data.contexts).sort(
    (a, b) => b.createdAt - a.createdAt
  );
}

/** Create a new context and return it. Assigns a brand color in order. */
export async function createContext(name) {
  const data = await readAll();
  const used = Object.keys(data.contexts).length;
  const ctx = {
    id: uid("ctx"),
    name: (name || "Untitled").trim(),
    color: BRAND_COLORS[used % BRAND_COLORS.length],
    createdAt: Date.now(),
    items: [],
  };
  data.contexts[ctx.id] = ctx;
  await writeAll(data);
  return ctx;
}

/** Fetch a single context by id (or null). */
export async function getContext(contextId) {
  const data = await readAll();
  return data.contexts[contextId] || null;
}

/** Return just the "subtitle" items of a context (for the nest dropdown). */
export async function listSubtitles(contextId) {
  const ctx = await getContext(contextId);
  if (!ctx) return [];
  return ctx.items.filter((it) => it.type === "subtitle");
}

/**
 * Append a captured highlight to a context's flat, ordered item list.
 * @param {string} contextId
 * @param {object} opts
 * @param {string}  opts.text
 * @param {"subtitle"|"text"} opts.type
 * @param {string|null} [opts.linkedSubtitleId]
 * @param {string} [opts.sourceUrl]
 * @param {string|null} [opts.rangePrefix]  — up to 50 chars before the selection (TextQuoteSelector)
 * @param {string|null} [opts.rangeSuffix]  — up to 50 chars after the selection (TextQuoteSelector)
 * @param {number|null} [opts.rangeStart]   — selection start offset over the page text (TextPositionSelector)
 * @param {number|null} [opts.rangeEnd]     — selection end offset over the page text (TextPositionSelector)
 * @param {string|null} [opts.comment]      — user's own annotation, text items only
 * @param {number} [opts.page]              — PDF page (1-based); only for PDF viewer captures
 * @param {string} [opts.sourceTitle]       — PDF file name shown in the panel
 * @returns {Promise<object>} the saved item
 */
export async function addItem(contextId, opts) {
  const data = await readAll();
  const ctx = data.contexts[contextId];
  if (!ctx) throw new Error("Context not found: " + contextId);

  const sourceUrl = opts.sourceUrl || "";
  const category = CATEGORIES[opts.category] ? opts.category : null;
  const type = category
    ? typeForCategory(category)
    : opts.type === "subtitle"
    ? "subtitle"
    : "text";

  const item = {
    id: uid("item"),
    type,
    category,
    text: (opts.text || "").trim(),
    linkedSubtitleId:
      type === "text" && opts.linkedSubtitleId ? opts.linkedSubtitleId : null,
    source: opts.source || hostnameFromUrl(sourceUrl),
    sourceUrl,
    comment: type === "text" && opts.comment ? String(opts.comment).trim() || null : null,
    createdAt: Date.now(),
    rangePrefix: opts.rangePrefix != null ? String(opts.rangePrefix).slice(0, 50) : null,
    rangeSuffix: opts.rangeSuffix != null ? String(opts.rangeSuffix).slice(0, 50) : null,
    // Raw DOM text for re-anchoring when item.text is Markdown (e.g. list captures).
    rangeText: opts.rangeText != null ? String(opts.rangeText) : null,
    // TextPositionSelector: character offsets over the page's concatenated
    // text-node content, captured at save time (anchoring fast path).
    rangeStart: Number.isInteger(opts.rangeStart) ? opts.rangeStart : null,
    rangeEnd: Number.isInteger(opts.rangeEnd) ? opts.rangeEnd : null,
    ...pdfFields(opts.page, opts.sourceTitle),
  };

  // NOTE: duplicates are allowed by design — we never dedupe here.
  if (item.linkedSubtitleId) {
    const subIdx = ctx.items.findIndex((i) => i.id === item.linkedSubtitleId);
    if (subIdx !== -1) {
      let insertAt = subIdx + 1;
      while (
        insertAt < ctx.items.length &&
        ctx.items[insertAt].type === "text"
      ) {
        insertAt++;
      }
      ctx.items.splice(insertAt, 0, item);
      await writeAll(data);
      return item;
    }
  }
  ctx.items.push(item);
  await writeAll(data);
  return item;
}

// --- Editing operations ---

/** Delete a context entirely. */
export async function deleteContext(contextId) {
  const data = await readAll();
  delete data.contexts[contextId];
  await writeAll(data);
}

/** Rename a context. */
export async function renameContext(contextId, name) {
  const data = await readAll();
  const ctx = data.contexts[contextId];
  if (!ctx) throw new Error("Context not found: " + contextId);
  ctx.name = (name || "Untitled").trim();
  await writeAll(data);
  return ctx;
}

/**
 * Patch a single item. Accepts any of: text, type, linkedSubtitleId.
 * Enforces invariants: subtitles never carry a linkedSubtitleId,
 * an item cannot be nested under itself.
 */
export async function updateItem(contextId, itemId, patch) {
  const data = await readAll();
  const ctx = data.contexts[contextId];
  if (!ctx) throw new Error("Context not found: " + contextId);
  const item = ctx.items.find((i) => i.id === itemId);
  if (!item) throw new Error("Item not found: " + itemId);

  if (typeof patch.text === "string") item.text = patch.text.trim();

  if ("category" in patch) {
    item.category = CATEGORIES[patch.category] ? patch.category : null;
    if (item.category) item.type = typeForCategory(item.category);
  }

  if (patch.type === "subtitle" || patch.type === "text") {
    item.type = patch.type;
    if (item.type === "subtitle") item.linkedSubtitleId = null;
  }

  if ("linkedSubtitleId" in patch) {
    const id = patch.linkedSubtitleId || null;
    item.linkedSubtitleId =
      item.type === "text" && id && id !== item.id ? id : null;
  }

  if ("comment" in patch && item.type === "text") {
    item.comment = patch.comment ? String(patch.comment).trim() || null : null;
  }

  await writeAll(data);
  return item;
}

/**
 * Delete an item. If it's a subtitle, any normal-text items nested under it
 * are detached (linkedSubtitleId -> null) rather than deleted.
 */
export async function deleteItem(contextId, itemId) {
  const data = await readAll();
  const ctx = data.contexts[contextId];
  if (!ctx) throw new Error("Context not found: " + contextId);

  const removed = ctx.items.find((i) => i.id === itemId);
  ctx.items = ctx.items.filter((i) => i.id !== itemId);

  if (removed && removed.type === "subtitle") {
    for (const it of ctx.items) {
      if (it.linkedSubtitleId === itemId) it.linkedSubtitleId = null;
    }
  }
  await writeAll(data);
  return ctx;
}

/** Move an item one slot up (-1) or down (+1) in the sequential list. */
export async function moveItem(contextId, itemId, delta) {
  const data = await readAll();
  const ctx = data.contexts[contextId];
  if (!ctx) throw new Error("Context not found: " + contextId);

  const i = ctx.items.findIndex((it) => it.id === itemId);
  const j = i + delta;
  if (i === -1 || j < 0 || j >= ctx.items.length) return ctx;
  [ctx.items[i], ctx.items[j]] = [ctx.items[j], ctx.items[i]];

  await writeAll(data);
  return ctx;
}

/** Identity key used to match a parsed item back to a pre-existing one in replaceContextFromMarkdown. */
function itemMatchKey(it) {
  return JSON.stringify([it.type, it.category || "", it.text]);
}

/**
 * Rebuild a context's items from raw Markdown text (the editor "live sync"
 * path, now only triggered by an explicit save — Cmd+S or a navigate-away
 * flush, never by a keystroke timer). Delegates to parseMd() so the store
 * and editor share one contract.
 *
 * Markdown carries no ids, so reconciling old items against the freshly
 * parsed ones happens in two passes:
 *
 *   1. Exact match — a line whose (type, category, text) is byte-identical
 *      to one that existed before is the SAME item in every sense: id,
 *      source/sourceUrl, AND its DOM-anchor metadata (rangePrefix/
 *      rangeSuffix/rangeText/rangeStart/rangeEnd) all carry over untouched.
 *   2. Positional fallback — among whatever's left unmatched after pass 1,
 *      pair leftover parsed lines with leftover old items in document order.
 *      A line the user actually edited no longer matches by content, but is
 *      still "the same highlight, just reworded": its id/source/sourceUrl
 *      carry over so it keeps its page association (go-to-source, detected
 *      context) even though its DOM-anchor fields reset to null — the old
 *      anchor pointed at text that no longer exists, so it can't be trusted
 *      for re-highlighting (spec 004/027, unchanged).
 *
 * A truly new line (no leftover old item to pair with) gets a fresh id and
 * no anchor/sourceUrl at all. Without any of this, every save wiped
 * sourceUrl/anchors for EVERY item in the context, breaking re-highlight and
 * "go to source" for pages the user never touched in that edit.
 */
export async function replaceContextFromMarkdown(contextId, md) {
  const data = await readAll();
  const ctx = data.contexts[contextId];
  if (!ctx) throw new Error("Context not found: " + contextId);

  const parsed = parseMd(md);
  if (parsed.name) ctx.name = parsed.name;

  const exactPool = new Map();
  for (const it of ctx.items) {
    const key = itemMatchKey(it);
    if (!exactPool.has(key)) exactPool.set(key, []);
    exactPool.get(key).push(it);
  }

  const matched = new Array(parsed.items.length).fill(null);
  const isExactMatch = new Array(parsed.items.length).fill(false);
  const claimed = new Set();
  parsed.items.forEach((it, i) => {
    const bucket = exactPool.get(itemMatchKey(it));
    const old = bucket && bucket.length ? bucket.shift() : null;
    if (old) {
      matched[i] = old;
      isExactMatch[i] = true;
      claimed.add(old);
    }
  });

  const leftoverOld = ctx.items.filter((it) => !claimed.has(it));
  let cursor = 0;
  for (let i = 0; i < matched.length; i++) {
    if (!matched[i] && cursor < leftoverOld.length) {
      matched[i] = leftoverOld[cursor++];
    }
  }

  ctx.items = parsed.items.map((it, i) => {
    const old = matched[i];
    const keepAnchor = isExactMatch[i];
    return {
      id: old ? old.id : uid("item"),
      type: it.type,
      category: it.category || null,
      text: it.text,
      linkedSubtitleId: null,
      source: it.source || (old ? old.source : "") || "",
      sourceUrl: old ? old.sourceUrl : "",
      comment: it.type === "text" ? it.comment || null : null,
      createdAt: old ? old.createdAt : Date.now(),
      rangePrefix: keepAnchor ? old.rangePrefix : null,
      rangeSuffix: keepAnchor ? old.rangeSuffix : null,
      rangeText: keepAnchor ? old.rangeText : null,
      rangeStart: keepAnchor ? old.rangeStart : null,
      rangeEnd: keepAnchor ? old.rangeEnd : null,
      // PDF page/file name (feature 37): an edited "p. N" in the _Fuente:_
      // line wins; otherwise they carry over like sourceUrl does.
      ...pdfFields(
        Number.isInteger(it.page) ? it.page : old ? old.page : undefined,
        old ? old.sourceTitle : null
      ),
    };
  });
  await writeAll(data);
  return ctx;
}

// --- Export ---

/**
 * Render one context into a structured plain-text string.
 *
 * Layout: subtitles become UPPERCASE headers with "=" underlines; normal-text
 * items linked to a subtitle are printed under it; unlinked text items are
 * fenced with dashed separators.
 */
export function exportContextToText(ctx) {
  if (!ctx) return "";
  const lines = [];
  const SEP = "------------------------------------------------------------";

  lines.push(ctx.name);
  lines.push("=".repeat(Math.max(ctx.name.length, 3)));
  lines.push("");

  const childrenBySubtitle = {};
  for (const it of ctx.items) {
    if (it.type === "text" && it.linkedSubtitleId) {
      (childrenBySubtitle[it.linkedSubtitleId] ||= []).push(it);
    }
  }

  for (const it of ctx.items) {
    if (it.type === "subtitle") {
      lines.push("");
      lines.push(it.text.toUpperCase());
      lines.push("=".repeat(Math.max(it.text.length, 3)));
      lines.push("");
      const kids = childrenBySubtitle[it.id] || [];
      for (const kid of kids) {
        lines.push(kid.text);
        lines.push("");
      }
    } else if (it.type === "text" && !it.linkedSubtitleId) {
      lines.push(SEP);
      lines.push(it.text);
      lines.push(SEP);
      lines.push("");
    }
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/**
 * Serialize a context to Markdown (buildMd contract, spec §4).
 *
 *   # {context.name}
 *   ## {subtitle.text}
 *   {emoji} {text.text}
 *   > {text.comment}
 *   _Fuente: {file name}, p. {page}_   ← PDF text items only (feature 37)
 */
/**
 * Serialize a bare list of items (no context title line) to Markdown, using
 * the same per-item rules as buildMd. Used by buildMd itself, and by the
 * Vista's per-source-page grouping (feature 32) to render one page's worth
 * of items as an independent Markdown fragment.
 */
export function buildMdFragment(items) {
  const lines = [];
  for (const it of items || []) {
    if (it.type === "subtitle") {
      lines.push("## " + it.text, "");
    } else {
      const meta = CATEGORIES[it.category];
      const prefix = meta && meta.emoji ? meta.emoji + " " : "";
      // Multi-line items (captured Markdown lists): omit the emoji prefix so
      // list markers (- / 1.) remain at the start of each line and are parsed
      // correctly by Markdown renderers. Category is preserved in storage.
      lines.push(it.text.includes("\n") ? it.text : prefix + it.text);
      // The comment rides directly under the item's own line (no blank line
      // between them) so parseMd's adjacency rule (see below) can attach it
      // back to this same item instead of reading it as a new one.
      if (it.comment) {
        for (const commentLine of it.comment.split("\n")) {
          lines.push("> " + commentLine);
        }
      }
      // PDF notes cite file + page. Subtitles never get this line: parseMd
      // would attach it to the previous TEXT item instead.
      if (isPdfItem(it)) lines.push(pdfSourceLine(it));
      lines.push("");
    }
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/** "_Fuente: paper.pdf, p. 12_", with "_" escaped so it can't break the emphasis. */
function pdfSourceLine(it) {
  const name = it.sourceTitle || it.source || pdfFilename(it.sourceUrl);
  return "_Fuente: " + name.replace(/_/g, "\\_") + ", p. " + it.page + "_";
}

/** Parse the inside of a "_Fuente: …_" line into { source, page? }. */
function parseSourceLine(raw) {
  const text = raw.trim().replace(/\\_/g, "_");
  const m = text.match(/^(.*?),\s*p\.\s*(\d+)$/);
  if (m && Number(m[2]) >= 1) return { source: m[1].trim(), page: Number(m[2]) };
  return { source: text };
}

export function buildMd(ctx) {
  if (!ctx) return "";
  const lines = ["# " + (ctx.name || "Untitled"), "", buildMdFragment(ctx.items)];
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// Back-compat alias.
export const exportContextToMarkdown = buildMd;

/**
 * Parse Markdown -> { name, items }. Pure & sync (spec §4, parseMd contract).
 *
 *   "# …"           -> name
 *   "## …" / "### …" -> { type:'subtitle', text }
 *   "_Fuente: X_"   -> attaches source to the LAST text item
 *   "_Fuente: X, p. N_" -> also sets that item's PDF page (feature 37)
 *   "> …" right after a text item's own line (no blank line between) -> the
 *                      user's comment on THAT item (feature 031); a "> …"
 *                      block with no adjacent text item falls back to the
 *                      legacy behavior of starting its own new text item
 *                      (hand-typed Markdown pre-dating this feature)
 *   any other line  -> { type:'text', text }
 */
export function parseMd(md) {
  let name = null;
  const items = [];
  let inBlockquote = false;
  let blockquoteMode = null; // 'comment' | 'legacy' — only meaningful while inBlockquote
  let lastWasTextLine = false; // true right after pushing a plain (non-quoted) text item

  for (const raw of String(md || "").split("\n")) {
    const line = raw.trim();
    if (!line) {
      inBlockquote = false;
      lastWasTextLine = false;
      continue;
    }

    const fuente = line.match(/^_Fuente:\s*(.+?)_$/i);
    if (/^#\s+/.test(line)) {
      inBlockquote = false;
      lastWasTextLine = false;
      name = line.replace(/^#\s+/, "").trim();
    } else if (/^#{2,6}\s+/.test(line)) {
      inBlockquote = false;
      lastWasTextLine = false;
      items.push({
        type: "subtitle",
        category: "title",
        text: line.replace(/^#{2,6}\s+/, "").trim(),
      });
    } else if (fuente) {
      inBlockquote = false;
      lastWasTextLine = false;
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i].type === "text") {
          const { source, page } = parseSourceLine(fuente[1]);
          items[i].source = source;
          if (page) items[i].page = page;
          break;
        }
      }
    } else if (/^>/.test(line)) {
      const bqText = line.replace(/^>\s*/, "");
      if (!inBlockquote) {
        const last = items[items.length - 1];
        if (lastWasTextLine && last && last.type === "text") {
          // Adjacent to a text item's own line -> this is its comment.
          last.comment = bqText;
          blockquoteMode = "comment";
        } else {
          // Legacy path (no buildMd output takes this shape anymore): a
          // blockquote with no adjacent text item starts its own new item,
          // extracting category from an emoji prefix like plain lines do.
          let text = bqText;
          let category = null;
          for (const emoji of Object.keys(EMOJI_TO_CAT)) {
            if (text.startsWith(emoji)) {
              category = EMOJI_TO_CAT[emoji];
              text = text.slice(emoji.length).trim();
              break;
            }
          }
          items.push({ type: "text", category, text });
          blockquoteMode = "legacy";
        }
        inBlockquote = true;
      } else if (blockquoteMode === "comment") {
        // Continuation: append to the same item's comment.
        const last = items[items.length - 1];
        if (last && last.type === "text") {
          last.comment = last.comment ? last.comment + "\n" + bqText : bqText;
        }
      } else {
        // Continuation: append to the last (legacy) item's text.
        const last = items[items.length - 1];
        if (last && last.type === "text") last.text += "\n" + bqText;
      }
      lastWasTextLine = false;
    } else {
      inBlockquote = false;
      lastWasTextLine = true;
      let text = line;
      let category = null;
      for (const emoji of Object.keys(EMOJI_TO_CAT)) {
        if (text.startsWith(emoji)) {
          category = EMOJI_TO_CAT[emoji];
          text = text.slice(emoji.length).trim();
          break;
        }
      }
      items.push({ type: "text", category, text });
    }
  }
  return { name, items };
}
