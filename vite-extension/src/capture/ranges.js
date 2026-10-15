/**
 * capture/ranges.js — Range ↔ text-offset helpers used for anchoring.
 * ---------------------------------------------------------------------------
 * Coordinate space: the concatenation of every text node under `root` in
 * TreeWalker order with NO separators — the same string Range.toString()
 * produces. The web content script uses document.body as root; the PDF
 * viewer uses the text layer of a single page (feature 37).
 * ---------------------------------------------------------------------------
 */

const EMPTY_CONTEXT = { rangePrefix: null, rangeSuffix: null, rangeStart: null, rangeEnd: null };

/**
 * Extract anchoring metadata from a Range at save time:
 *   rangePrefix / rangeSuffix — up to 50 chars of surrounding text
 *   (TextQuoteSelector); rangeStart / rangeEnd — character offsets of the
 *   selection over the concatenated text-node content of `root`
 *   (TextPositionSelector). All fields null on error or missing range.
 */
export function extractRangeContext(range, root = document.body) {
  if (!range || !root) return { ...EMPTY_CONTEXT };
  try {
    const preRange = document.createRange();
    preRange.setStart(root, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    const before = preRange.toString();

    const postRange = document.createRange();
    postRange.setStart(range.endContainer, range.endOffset);
    postRange.setEnd(root, root.childNodes.length);
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
    return { ...EMPTY_CONTEXT };
  }
}

// Pathological pages (infinite feeds) are indexed only up to this many chars.
const INDEX_CHAR_CAP = 2_000_000;

/**
 * Collect the text nodes under root with their cumulative character offsets.
 * Offsets are contiguous (no separators) so they line up with Range.toString()
 * and with the rangeStart/rangeEnd offsets captured at save time.
 */
export function buildTextIndex(root) {
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
export function rangeFromOffsets(textNodes, start, end) {
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
