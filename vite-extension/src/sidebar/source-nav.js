/**
 * source-nav.js — "go to source" for a highlight (feature 32).
 *
 * Focuses an already-open tab for the highlight's page, or opens a new one,
 * and asks the content script (via anchor.js's existing session machinery in
 * content.js) to scroll to the exact highlight once it's anchored.
 *
 * PDF highlights (feature 37) go to the extension's own viewer instead —
 * never to the raw PDF URL, which Chrome would open in its native viewer.
 */
import { VIEWER_PATH, buildViewerUrl } from "../viewer/source.js";
import { listViewerTabs } from "./viewer-tabs.js";

async function focusTab(tabId, windowId) {
  await chrome.tabs.update(tabId, { active: true });
  if (windowId != null) await chrome.windows.update(windowId, { focused: true });
}

/** Focus the viewer already showing this PDF, or open it at the item's page. */
async function goToPdfSource({ sourceUrl, itemId, page }) {
  const open = (await listViewerTabs()).find((v) => v.file === sourceUrl);
  if (open) {
    const tab = await chrome.tabs.get(open.tabId);
    await focusTab(tab.id, tab.windowId);
    await chrome.tabs.sendMessage(tab.id, { type: "CH_SCROLL_TO_ITEM", itemId }).catch(() => {});
    return;
  }
  // The viewer reads #page=…&item=… itself on load: no relay flag needed.
  await chrome.tabs.create({
    url: buildViewerUrl(chrome.runtime.getURL(VIEWER_PATH), sourceUrl, { page, itemId }),
  });
}

/**
 * @param {object} target
 * @param {string} target.sourceUrl
 * @param {string} target.itemId
 * @param {number|null} [target.page] — set for PDF items
 */
export async function goToSource({ sourceUrl, itemId, page = null }) {
  if (!sourceUrl) return;
  if (Number.isInteger(page) && page >= 1) return goToPdfSource({ sourceUrl, itemId, page });

  const tabs = await chrome.tabs.query({ url: sourceUrl });
  const tab = tabs[0];

  if (tab) {
    await focusTab(tab.id, tab.windowId);
    // The content script is already alive in this case, so a direct message
    // is safe (no race with attaching its onMessage listener).
    await chrome.tabs.sendMessage(tab.id, { type: "CH_SCROLL_TO_ITEM", itemId }).catch(() => {});
    return;
  }

  // No open tab: stash the target before creating one, since the new
  // content script's onMessage listener won't be attached yet when the tab
  // is created — content.js's startAnchorSession() reads this flag itself
  // once it starts, avoiding the race a fire-and-forget message would hit.
  await chrome.storage.local.set({ CH_SCROLL_TARGET: itemId });
  await chrome.tabs.create({ url: sourceUrl });
}
