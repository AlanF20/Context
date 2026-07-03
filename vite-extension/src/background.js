/**
 * background.js — MV3 service worker.
 * Opens the side panel when the user clicks the extension icon.
 */
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onInstalled.addListener(() => {
  // Future: context menus, onboarding, migration, etc.
});

// Open the side panel and signal the sidebar to navigate to the captured context.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'CH_OPEN_PANEL_CTX' && sender.tab?.id) {
    chrome.sidePanel.open({ tabId: sender.tab.id });
    chrome.storage.local.set({ CH_NAV: msg.ctxId });
  }
});
