/**
 * capture/paint.js — highlight painter (CSS Custom Highlight API).
 * Zero DOM mutation: ranges are registered under `ch-hl-{category}` and
 * styled via `::highlight(...)` in content.css.
 */

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
export function paintRange(range, category, itemId) {
  if (!highlightApiAvailable() || !range || !itemId) return;
  unpaintItem(itemId);
  const cat = HL_CATEGORIES.includes(category) ? category : 'idea';
  categoryHighlight(cat).add(range);
  paintedRanges.set(itemId, { category: cat, range });
}

export function unpaintItem(itemId) {
  const rec = paintedRanges.get(itemId);
  if (!rec) return;
  if (highlightApiAvailable()) categoryHighlight(rec.category).delete(rec.range);
  paintedRanges.delete(itemId);
}

/** Snapshot of [itemId, { category, range }] pairs currently painted. */
export function paintedEntries() {
  return [...paintedRanges];
}

export function isPainted(itemId) {
  return paintedRanges.has(itemId);
}

/**
 * Scroll a painted item's highlight into view (feature 32 — "go to source").
 * Ranges don't expose scrollIntoView themselves, so this targets the parent
 * element of the range's start container. Returns false if the item isn't
 * currently painted (caller decides whether to defer/retry).
 */
export function scrollToItem(itemId) {
  const rec = paintedRanges.get(itemId);
  if (!rec) return false;
  const node = rec.range.startContainer;
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  if (!el || typeof el.scrollIntoView !== 'function') return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return true;
}

export function clearAllPaint() {
  if (highlightApiAvailable()) {
    for (const cat of HL_CATEGORIES) {
      const hl = CSS.highlights.get(HL_NAME_PREFIX + cat);
      if (hl) hl.clear();
    }
  }
  paintedRanges.clear();
}
