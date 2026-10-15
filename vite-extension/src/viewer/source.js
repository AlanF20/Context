/**
 * viewer/source.js — pure helpers for PDF viewer URLs (feature 37).
 * ---------------------------------------------------------------------------
 *   src/viewer.html?file=<encoded PDF url>#page=N&item=<itemId>
 *
 * Imported by the viewer, the side panel and the service worker. Must not
 * import pdfjs-dist (the panel would pull the whole PDF engine in).
 * ---------------------------------------------------------------------------
 */

export const VIEWER_PATH = 'src/viewer.html';

/** URL schemes the viewer can open (blob:/data: are out of scope). */
const OPENABLE = /^(https?|file):/i;

/** PDF URL without its fragment — the form stored as item.sourceUrl. */
export function stripHash(url) {
  return String(url || '').split('#')[0];
}

/** True when the viewer can be offered for this tab URL. */
export function isOpenableUrl(url) {
  return OPENABLE.test(String(url || ''));
}

/** Heuristic for the side panel button: the URL path ends in ".pdf". */
export function looksLikePdfUrl(url) {
  return isOpenableUrl(url) && /\.pdf($|[?#])/i.test(String(url));
}

/**
 * Build a viewer URL. `base` is the extension's viewer page URL
 * (chrome.runtime.getURL(VIEWER_PATH)); passed in so this stays pure/testable.
 */
export function buildViewerUrl(base, pdfUrl, { page, itemId } = {}) {
  let url = base + '?file=' + encodeURIComponent(stripHash(pdfUrl));
  const hash = [];
  if (Number.isInteger(page) && page >= 1) hash.push('page=' + page);
  if (itemId) hash.push('item=' + encodeURIComponent(itemId));
  if (hash.length) url += '#' + hash.join('&');
  return url;
}

/** Inverse of buildViewerUrl: { file, page, itemId } (missing parts are null). */
export function parseViewerUrl(url) {
  const out = { file: null, page: null, itemId: null };
  let u;
  try {
    u = new URL(url);
  } catch (_) {
    return out;
  }
  const file = u.searchParams.get('file');
  out.file = file ? stripHash(file) : null;
  const hash = new URLSearchParams(u.hash.replace(/^#/, ''));
  const page = Number(hash.get('page'));
  out.page = Number.isInteger(page) && page >= 1 ? page : null;
  out.itemId = hash.get('item') || null;
  return out;
}
