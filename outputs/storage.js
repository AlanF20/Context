/**
 * storage.js
 * ---------------------------------------------------------------------------
 * Single source of truth for reading/writing the extension's data.
 *
 * THE BRIDGE:
 *   This file is loaded in BOTH worlds:
 *     1. As a content script (declared before content.js in manifest.json),
 *        so the in-page selection UI can write captured highlights.
 *     2. As a <script> in popup.html, so the toolbar UI can read contexts
 *        and build exports.
 *   Because both worlds talk to the SAME chrome.storage.local key, the data
 *   the content script saves is instantly visible to the popup, and vice
 *   versa. chrome.storage.local IS the bridge — no message passing needed.
 *
 * DATA MODEL (intentionally flat & minimal for the MVP):
 *   {
 *     contexts: {
 *       "<contextId>": {
 *         id:        string,
 *         name:      string,
 *         createdAt: number,
 *         items: [               // ordered sequentially as the user saves
 *           {
 *             id:               string,
 *             type:             "subtitle" | "text",
 *             text:             string,
 *             linkedSubtitleId: string | null,  // only meaningful for "text"
 *             sourceUrl:        string,
 *             createdAt:        number
 *           }
 *         ]
 *       }
 *     }
 *   }
 * ---------------------------------------------------------------------------
 */
(function (global) {
  "use strict";

  const STORAGE_KEY = "contextHighlighter";

  // Small id helper — good enough for a local-only MVP.
  function uid(prefix) {
    return (
      (prefix || "id") +
      "_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 8)
    );
  }

  // --- Color helpers (design spec §1) -------------------------------------

  // Brand accents assigned to contexts in creation order (rail chips).
  const BRAND_COLORS = [
    "#5b57e8", // indigo
    "#e2a23b", // amber
    "#3da35d", // green
    "#4a7fd0", // blue
    "#b85cc0", // magenta
    "#d4564f", // red
    "#2aa6a0", // teal
  ];

  // Per-domain source dot colors.
  const DOMAIN_COLORS = {
    "examine.com": "#3da35d",
    "ncbi.nlm.nih.gov": "#4a7fd0",
    "hubermanlab.com": "#1a1a1a",
    "sleepfoundation.org": "#7a5cd0",
    "nature.com": "#d4564f",
    "pubmed.gov": "#2aa6a0",
  };
  const DOMAIN_FALLBACK = "#8a8a92";

  // --- Highlight categories (color-coding system) -------------------------
  // Each highlight has a semantic CATEGORY that drives: the item `type`
  // (title -> subtitle/heading; the rest -> text/paragraph), the dot/swatch
  // color in the UI, the on-page highlight colors, and the Markdown emoji
  // prefix used to round-trip the color through .md.
  //
  //   title    pink/red  -> titles & subtitles   (## heading, no emoji)
  //   idea     yellow    -> important ideas       (🟡)
  //   argument blue      -> key arguments         (🔵)
  //   evidence green     -> evidence / data        (🟢)
  const CATEGORIES = {
    title: {
      id: "title",
      label: "Título",
      type: "subtitle",
      emoji: "", // titles serialize as "## ...", not an emoji
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
  // Emoji -> category (only the three text categories carry an emoji).
  const EMOJI_TO_CAT = { "🟡": "idea", "🔵": "argument", "🟢": "evidence" };

  /** Category metadata (or null for legacy/neutral items). */
  function categoryMeta(cat) {
    return CATEGORIES[cat] || null;
  }
  /** Item type implied by a category. */
  function typeForCategory(cat) {
    return CATEGORIES[cat] ? CATEGORIES[cat].type : "text";
  }

  /** Color for a source domain string (e.g. "ncbi.nlm.nih.gov"). */
  function domainColor(source) {
    if (!source) return DOMAIN_FALLBACK;
    const key = String(source).replace(/^www\./, "").toLowerCase();
    return DOMAIN_COLORS[key] || DOMAIN_FALLBACK;
  }

  /** Reduce a URL (or already-bare host) to a clean hostname. */
  function hostnameFromUrl(url) {
    if (!url) return "";
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch (_) {
      return String(url).replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
    }
  }

  // --- Low-level read/write of the whole document -------------------------

  function readAll() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY, (res) => {
        const data = res && res[STORAGE_KEY];
        resolve(data && data.contexts ? data : { contexts: {} });
      });
    });
  }

  function writeAll(data) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: data }, () => resolve(data));
    });
  }

  // --- Context operations -------------------------------------------------

  /** Return all contexts as an array, newest first. */
  async function listContexts() {
    const data = await readAll();
    return Object.values(data.contexts).sort(
      (a, b) => b.createdAt - a.createdAt
    );
  }

  /** Create a new context and return it. Assigns a brand color in order. */
  async function createContext(name) {
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
  async function getContext(contextId) {
    const data = await readAll();
    return data.contexts[contextId] || null;
  }

  /** Return just the "subtitle" items of a context (for the nest dropdown). */
  async function listSubtitles(contextId) {
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
   * @param {string|null} [opts.linkedSubtitleId]  only used when type === "text"
   * @param {string} [opts.sourceUrl]
   * @returns {Promise<object>} the saved item
   */
  async function addItem(contextId, opts) {
    const data = await readAll();
    const ctx = data.contexts[contextId];
    if (!ctx) throw new Error("Context not found: " + contextId);

    const sourceUrl = opts.sourceUrl || "";
    // Category (color) is the primary input; it determines the type.
    // Falls back to the legacy opts.type when no category is given.
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
      // Subtitles are never nested; only normal text may link to a subtitle.
      linkedSubtitleId:
        type === "text" && opts.linkedSubtitleId
          ? opts.linkedSubtitleId
          : null,
      // Bare domain used for the source dot + Markdown "_Fuente:_" line.
      source: opts.source || hostnameFromUrl(sourceUrl),
      sourceUrl: sourceUrl,
      createdAt: Date.now(),
    };

    // NOTE: duplicates are allowed by design — we never dedupe here.
    // If nesting under a subtitle, insert right after that subtitle's group
    // so sequential order (used by buildMd / the Vista) stays correct.
    if (item.linkedSubtitleId) {
      const subIdx = ctx.items.findIndex(
        (i) => i.id === item.linkedSubtitleId
      );
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

  // --- Editing operations -------------------------------------------------

  /** Delete a context entirely. */
  async function deleteContext(contextId) {
    const data = await readAll();
    delete data.contexts[contextId];
    await writeAll(data);
  }

  /** Rename a context. */
  async function renameContext(contextId, name) {
    const data = await readAll();
    const ctx = data.contexts[contextId];
    if (!ctx) throw new Error("Context not found: " + contextId);
    ctx.name = (name || "Untitled").trim();
    await writeAll(data);
    return ctx;
  }

  /**
   * Patch a single item. Accepts any of: text, type, linkedSubtitleId.
   * Enforces invariants:
   *   - subtitles never carry a linkedSubtitleId,
   *   - an item cannot be nested under itself.
   */
  async function updateItem(contextId, itemId, patch) {
    const data = await readAll();
    const ctx = data.contexts[contextId];
    if (!ctx) throw new Error("Context not found: " + contextId);
    const item = ctx.items.find((i) => i.id === itemId);
    if (!item) throw new Error("Item not found: " + itemId);

    if (typeof patch.text === "string") item.text = patch.text.trim();

    // Category drives the type (title -> subtitle, others -> text).
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

    await writeAll(data);
    return item;
  }

  /**
   * Delete an item. If it's a subtitle, any normal-text items nested under it
   * are detached (linkedSubtitleId -> null) rather than deleted.
   */
  async function deleteItem(contextId, itemId) {
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
  async function moveItem(contextId, itemId, delta) {
    const data = await readAll();
    const ctx = data.contexts[contextId];
    if (!ctx) throw new Error("Context not found: " + contextId);

    const i = ctx.items.findIndex((it) => it.id === itemId);
    const j = i + delta;
    if (i === -1 || j < 0 || j >= ctx.items.length) return ctx; // no-op at edges
    [ctx.items[i], ctx.items[j]] = [ctx.items[j], ctx.items[i]];

    await writeAll(data);
    return ctx;
  }

  /**
   * Rebuild a context's items from raw Markdown text (the editor "live sync"
   * path). The context id, color and createdAt are preserved; name comes from
   * the first "# " heading. Delegates to the pure parseMd() so the editor and
   * the store share one parsing contract (spec §4).
   */
  async function replaceContextFromMarkdown(contextId, md) {
    const data = await readAll();
    const ctx = data.contexts[contextId];
    if (!ctx) throw new Error("Context not found: " + contextId);

    const parsed = parseMd(md);
    if (parsed.name) ctx.name = parsed.name;
    ctx.items = parsed.items.map((it) => ({
      id: uid("item"),
      type: it.type,
      category: it.category || null,
      text: it.text,
      linkedSubtitleId: null, // grouping is sequential (subtitle -> texts)
      source: it.source || "",
      sourceUrl: "",
      createdAt: Date.now(),
    }));
    await writeAll(data);
    return ctx;
  }

  // --- Export -------------------------------------------------------------

  /**
   * Render one context into a structured plain-text string.
   *
   * Layout rules:
   *   - Each subtitle becomes an UPPERCASE header with an underline of "=".
   *     Immediately under it we print every normal-text item linked to it.
   *   - Normal-text items with NO linked subtitle are printed in a standalone
   *     block, each wrapped in dashed "----" separators so they stay visually
   *     distinct from neighbouring subtitles.
   *   - Original sequential order is preserved as we walk the item list.
   */
  function exportContextToText(ctx) {
    if (!ctx) return "";
    const lines = [];
    const SEP = "------------------------------------------------------------";

    // Title block.
    lines.push(ctx.name);
    lines.push("=".repeat(Math.max(ctx.name.length, 3)));
    lines.push("");

    // Quick lookup of texts grouped by the subtitle they belong to.
    const childrenBySubtitle = {};
    for (const it of ctx.items) {
      if (it.type === "text" && it.linkedSubtitleId) {
        (childrenBySubtitle[it.linkedSubtitleId] ||= []).push(it);
      }
    }

    for (const it of ctx.items) {
      if (it.type === "subtitle") {
        // Header for the subtitle.
        lines.push("");
        lines.push(it.text.toUpperCase());
        lines.push("=".repeat(Math.max(it.text.length, 3)));
        lines.push("");
        // Its linked normal-text paragraphs, in saved order.
        const kids = childrenBySubtitle[it.id] || [];
        for (const kid of kids) {
          lines.push(kid.text);
          lines.push("");
        }
      } else if (it.type === "text" && !it.linkedSubtitleId) {
        // Unlinked normal text — fence it with dashed separators.
        lines.push(SEP);
        lines.push(it.text);
        lines.push(SEP);
        lines.push("");
      }
      // Linked texts are skipped here; they were printed under their subtitle.
    }

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  /**
   * Serialize a context -> Markdown (spec §4, `buildMd`).
   *
   *   # {context.name}
   *
   *   ## {subtitle.text}
   *
   *   {text.text}
   *
   *   _Fuente: {text.source}_
   *
   * Items are walked sequentially; a subtitle is a group header and the text
   * items that follow it belong to that group (grouping is by order, not by
   * linkedSubtitleId). Triple blank lines collapse to double; trimmed + "\n".
   */
  function buildMd(ctx) {
    if (!ctx) return "";
    const lines = ["# " + (ctx.name || "Untitled"), ""];

    for (const it of ctx.items) {
      if (it.type === "subtitle") {
        // Titles are headings (category "title"); no emoji.
        lines.push("## " + it.text, "");
      } else {
        const meta = CATEGORIES[it.category];
        const prefix = meta && meta.emoji ? meta.emoji + " " : "";
        lines.push(prefix + it.text, "");
        if (it.source) lines.push("_Fuente: " + it.source + "_", "");
      }
    }
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  // Back-compat alias used by older callers.
  const exportContextToMarkdown = buildMd;

  /**
   * Parse Markdown -> { name, items } (spec §4, `parseMd`). Pure & sync so the
   * editor can parse-on-type without touching storage.
   *
   *   "# …"            -> name
   *   "## …" / "### …" -> { type:'subtitle', text }
   *   "_Fuente: X_"    -> attaches source (+derived) to the LAST text item
   *   any other line   -> { type:'text', text } (a leading "> " is stripped)
   */
  function parseMd(md) {
    let name = null;
    const items = [];

    for (const raw of String(md || "").split("\n")) {
      const line = raw.trim();
      if (!line) continue;

      const fuente = line.match(/^_Fuente:\s*(.+?)_$/i);
      if (/^#\s+/.test(line)) {
        name = line.replace(/^#\s+/, "").trim();
      } else if (/^#{2,6}\s+/.test(line)) {
        items.push({
          type: "subtitle",
          category: "title",
          text: line.replace(/^#{2,6}\s+/, "").trim(),
        });
      } else if (fuente) {
        // Attach to the most recent text item.
        for (let i = items.length - 1; i >= 0; i--) {
          if (items[i].type === "text") {
            items[i].source = fuente[1].trim();
            break;
          }
        }
      } else {
        // Detect a leading category emoji (🟡/🔵/🟢) and strip it.
        let text = line.replace(/^>\s+/, "").trim();
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

  // Expose the API on a single global namespace shared by all script worlds.
  global.ContextStore = {
    STORAGE_KEY,
    uid,
    readAll,
    writeAll,
    listContexts,
    createContext,
    getContext,
    listSubtitles,
    addItem,
    deleteContext,
    renameContext,
    updateItem,
    deleteItem,
    moveItem,
    replaceContextFromMarkdown,
    exportContextToText,
    exportContextToMarkdown,
    buildMd,
    parseMd,
    domainColor,
    hostnameFromUrl,
    BRAND_COLORS,
    CATEGORIES,
    categoryMeta,
    typeForCategory,
  };
})(typeof window !== "undefined" ? window : self);
