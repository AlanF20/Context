/**
 * source-nav.js — "go to source" for a highlight (feature 32).
 *
 * Focuses an already-open tab for the highlight's page, or opens a new one,
 * and asks the content script (via anchor.js's existing session machinery in
 * content.js) to scroll to the exact highlight once it's anchored.
 */

/**
 * @param {object} target
 * @param {string} target.sourceUrl
 * @param {string} target.itemId
 */
export async function goToSource({ sourceUrl, itemId }) {
  if (!sourceUrl) return;

  const tabs = await chrome.tabs.query({ url: sourceUrl });
  const tab = tabs[0];

  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId != null) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
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
