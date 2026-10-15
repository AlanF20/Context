/**
 * export-formats.js — registry of downloadable export formats.
 *
 * Each entry is { id, label, extension, mime, build(ctx) }. Adding a future
 * format (e.g. one gated behind auth) means appending an entry here, not
 * touching the menu component or its wiring in sidebar.js.
 */
import { Store } from "./store.js";

/** Strip a field for safe use inside a single TSV row. */
function escapeTsvField(value) {
  return String(value || "")
    .replace(/\t/g, " ")
    .replace(/\r?\n/g, " ")
    .trim();
}

/** Lowercase, underscore-joined tag token (distinct from sanitizeFilename, which keeps case). */
function sanitizeTag(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function categoryLabel(category) {
  const meta = Store.categoryMeta(category);
  return meta ? meta.label : "Nota";
}

/** Map each text item's id -> its parent subtitle's text (or null). */
function parentSubtitleTextById(ctx) {
  const byId = {};
  for (const it of ctx.items) {
    if (it.type !== "text") continue;
    if (!it.linkedSubtitleId) {
      byId[it.id] = null;
      continue;
    }
    const parent = ctx.items.find((s) => s.id === it.linkedSubtitleId);
    byId[it.id] = parent ? parent.text : null;
  }
  return byId;
}

/**
 * Build the Anki-importable TSV rows for a context: one row per `text` item
 * (idea/argument/evidence) and one summary row per `subtitle` that has at
 * least one child, per spec 028 AC-06/AC-07.
 */
function buildAnkiRows(ctx) {
  const parentTextById = parentSubtitleTextById(ctx);
  const childrenBySubtitle = {};
  for (const it of ctx.items) {
    if (it.type === "text" && it.linkedSubtitleId) {
      (childrenBySubtitle[it.linkedSubtitleId] ||= []).push(it);
    }
  }
  const ctxTag = sanitizeTag(ctx.name);
  const rows = [];

  for (const it of ctx.items) {
    if (it.type === "text") {
      const label = categoryLabel(it.category);
      const parentText = parentTextById[it.id];
      const front = parentText
        ? `¿Qué ${label} se capturó sobre "${parentText}"?`
        : `¿Qué ${label} se capturó en ${ctx.name}?`;
      const back = [
        it.text,
        it.comment ? `Comentario: ${it.comment}` : null,
        it.source ? `Fuente: ${it.source}${Store.isPdfItem(it) ? `, p. ${it.page}` : ""}` : null,
      ]
        .filter(Boolean)
        .join(" — ");
      const tags = [it.category, it.source ? sanitizeTag(it.source) : null, ctxTag]
        .filter(Boolean)
        .join(" ");
      rows.push([front, back, tags].map(escapeTsvField));
    } else if (it.type === "subtitle") {
      const kids = childrenBySubtitle[it.id] || [];
      if (!kids.length) continue; // subtitles without children get no card
      const front = `¿De qué trata la sección "${it.text}"?`;
      const back = kids.map((k) => `${categoryLabel(k.category)}: ${k.text}`).join(" / ");
      const tags = ["subtitle", ctxTag].join(" ");
      rows.push([front, back, tags].map(escapeTsvField));
    }
  }
  return rows;
}

/** Serialize a context to an Anki-importable plain-text TSV deck. */
export function buildAnkiExport(ctx) {
  if (!ctx) return "";
  const header = ["#separator:tab", "#html:false", "#tags column:3"].join("\n");
  const rows = buildAnkiRows(ctx).map((row) => row.join("\t"));
  return header + "\n" + rows.join("\n") + "\n";
}

export const EXPORT_FORMATS = [
  {
    id: "markdown",
    label: "Markdown (.md)",
    extension: "md",
    mime: "text/markdown",
    build: (ctx) => Store.buildMd(ctx),
  },
  {
    id: "anki",
    label: "Tarjetas Anki (.txt)",
    extension: "anki.txt",
    mime: "text/plain",
    build: (ctx) => buildAnkiExport(ctx),
  },
];
