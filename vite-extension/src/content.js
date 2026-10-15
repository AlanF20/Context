/**
 * content.js — web page content script (DESIGN_SPEC §2.1)
 * ---------------------------------------------------------------------------
 *   1. Capture UI (selection → toolbar → popup → save) lives in
 *      capture/ui.js, wired here with the web adapter.
 *   2. Re-anchor and paint this page's saved highlights (spec 027), report
 *      their status to the side panel, and react to panel messages.
 *
 * CRXJS wraps this bundle in an IIFE for the MV3 content script context.
 * Every module it imports is inlined (never a shared chunk) — see
 * vite-plugins/isolate-content-script.js and tests/037-content-bundle-guard.
 * ---------------------------------------------------------------------------
 */
// content-storage.js is a separate copy of storage.js used only by this content
// script. If both content.js and sidebar.js import the same storage.js, Rollup
// extracts it as a shared chunk and CRXJS marks it as a web accessible resource.
// Chrome then executes that WAR without chrome.storage access. Separate copies
// avoid the shared chunk entirely.
import * as Store from './content-storage.js';
import { findMatch } from './anchor.js';
import { initCaptureUI } from './capture/ui.js';
import { buildTextIndex, rangeFromOffsets } from './capture/ranges.js';
import {
  paintRange,
  unpaintItem,
  paintedEntries,
  scrollToItem,
  clearAllPaint,
} from './capture/paint.js';

initCaptureUI({
  store: Store,
  getSourceUrl: () => location.href,
  getAnchorRoot: () => document.body,
  afterSave(item, range, { category, ctxId, fast, capturedUrl }) {
    // A SPA navigation during the save's awaits would move `location.href`
    // and reset the anchoring session to the new URL — painting/anchoring the
    // old item there would attribute it to the wrong page (spec 027 review).
    if (location.href === capturedUrl && range && item) {
      paintRange(range.cloneRange(), category, item.id);
      noteLiveAnchor(item);
    }
    if (fast) {
      chrome.runtime.sendMessage({ type: 'CH_OPEN_PANEL_CTX', ctxId }).catch(() => {});
    }
  },
});

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
  // itemId the panel asked us to scroll to once it anchors (feature 32).
  scrollTarget: null,
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
  session.scrollTarget = null;

  try {
    const data = await Store.readAll();
    for (const ctx of Object.values(data.contexts)) {
      for (const it of ctx.items || []) {
        // PDF items (feature 37) are anchored by the extension's own viewer.
        // This script also runs in the tab of Chrome's native PDF viewer,
        // where those items can never anchor and would show as "not found".
        if (Number.isInteger(it.page)) continue;
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

  // Consume the "go to source" relay flag (feature 32): the panel stashes the
  // target itemId here right before opening a NEW tab for a highlight's
  // sourceUrl, since a fire-and-forget runtime message would race the content
  // script attaching its listener. Cleared immediately so it never leaks to
  // an unrelated later navigation.
  try {
    const { CH_SCROLL_TARGET } = await chrome.storage.local.get('CH_SCROLL_TARGET');
    if (CH_SCROLL_TARGET) {
      session.scrollTarget = CH_SCROLL_TARGET;
      chrome.storage.local.remove('CH_SCROLL_TARGET');
    }
  } catch (_) {
    /* extension context invalidated — ignore */
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
  for (const [id, rec] of paintedEntries()) {
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
    if (session.scrollTarget === id) {
      scrollToItem(id);
      session.scrollTarget = null;
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
  if (msg && msg.type === 'CH_SCROLL_TO_ITEM') {
    // Tab was already open: the item may already be anchored (scroll now) or
    // still pending/retrying (defer — runAnchorPass() picks this up the
    // moment it paints). If it's already 'failed' it may still anchor late
    // (soft-fail items stay retryable), so deferring is still correct; if it
    // never does, this simply never fires — no error surfaces to the user.
    if (!scrollToItem(msg.itemId)) session.scrollTarget = msg.itemId;
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
