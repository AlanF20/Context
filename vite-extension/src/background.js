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
