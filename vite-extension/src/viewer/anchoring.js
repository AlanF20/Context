/**
 * viewer/anchoring.js — per-page re-anchoring of PDF highlights (feature 37).
 * ---------------------------------------------------------------------------
 * Unlike the web content script (one index over document.body, retried on DOM
 * mutations), PDF.js renders pages lazily and recreates text layers as pages
 * enter/leave its render buffer. So anchoring is event-driven per page:
 *
 *   textlayerrendered(page N) → index that page's .textLayer → findMatch
 *   for every item on page N → paint.
 *
 * Status per item: 'pending' until its page has rendered at least once, then
 * 'anchored' or 'failed'. Same message contract as content.js
 * (CH_ANCHOR_STATUS), so the panel's strip works unchanged.
 * ---------------------------------------------------------------------------
 */
import { findMatch } from '../anchor.js';
import { buildTextIndex, rangeFromOffsets } from '../capture/ranges.js';
import { paintRange, unpaintItem, paintedEntries, scrollToItem } from '../capture/paint.js';

/** Painted AND still in the DOM (PDF.js drops text layers of far-away pages). */
function isPaintedLive(itemId) {
  return paintedEntries().some(([id, rec]) => id === itemId && rec.range.startContainer.isConnected);
}

function quoteOf(item) {
  return (item && (item.rangeText || item.text)) || '';
}

/**
 * @param {object} opts
 * @param {string} opts.pdfUrl          item.sourceUrl of this document
 * @param {object} opts.viewer          PDF.js PDFViewer
 * @param {object} opts.eventBus        PDF.js EventBus
 * @param {object[]} opts.items         saved items for this PDF (with integer page)
 */
export function createPdfAnchoring({ pdfUrl, viewer, eventBus, items }) {
  const byId = new Map();
  const statuses = new Map();
  let scrollTarget = null;

  for (const it of items) track(it, 'pending');

  function track(item, status) {
    byId.set(item.id, item);
    statuses.set(item.id, status);
  }

  function notify() {
    try {
      chrome.runtime
        .sendMessage({ type: 'CH_ANCHOR_STATUS', url: pdfUrl, statuses: Object.fromEntries(statuses) })
        .catch(() => {});
    } catch (_) {
      /* extension context invalidated — ignore */
    }
  }

  /** Anchor every tracked item of `pageNumber` inside its freshly rendered text layer. */
  function anchorPage(pageNumber, textLayerDiv) {
    const onPage = [...byId.values()].filter((it) => it.page === pageNumber);
    if (!onPage.length || !textLayerDiv) return;
    const textNodes = buildTextIndex(textLayerDiv);
    const raw = textNodes.map((n) => n.node.textContent).join('');
    let changed = false;

    for (const item of onPage) {
      const quote = quoteOf(item);
      const hit = quote
        ? findMatch(raw, {
            quote,
            prefix: item.rangePrefix || '',
            suffix: item.rangeSuffix || '',
            hintStart: item.rangeStart,
            hintEnd: item.rangeEnd,
          })
        : null;
      const range = hit ? rangeFromOffsets(textNodes, hit.start, hit.end) : null;
      const next = range ? 'anchored' : 'failed';
      if (range) paintRange(range, item.category, item.id);
      if (statuses.get(item.id) !== next) {
        statuses.set(item.id, next);
        changed = true;
      }
      if (range && scrollTarget === item.id) {
        scrollTarget = null;
        scrollToItem(item.id);
      }
    }
    if (changed) notify();
  }

  eventBus.on('textlayerrendered', ({ source, pageNumber, error }) => {
    if (error) return;
    anchorPage(pageNumber, source?.textLayer?.div);
  });

  return {
    /** Snapshot for CH_GET_ANCHOR_STATUS. */
    statuses: () => Object.fromEntries(statuses),

    /** A just-captured item is painted live; record it as anchored. */
    noteLive(item) {
      if (!item || !item.id) return;
      track(item, 'anchored');
      notify();
    },

    /** Item deleted in the panel. */
    remove(itemId) {
      unpaintItem(itemId);
      byId.delete(itemId);
      if (statuses.delete(itemId)) notify();
    },

    /** Scroll to an item now, or once its page renders and it anchors. */
    scrollTo(itemId) {
      if (isPaintedLive(itemId) && scrollToItem(itemId)) return;
      const item = byId.get(itemId);
      if (!item) return;
      scrollTarget = itemId;
      viewer.currentPageNumber = item.page;
    },

    notify,
  };
}
