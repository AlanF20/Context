/**
 * background.js  (MV3 service worker)
 * ---------------------------------------------------------------------------
 * Sole job: make clicking the toolbar icon open the side panel.
 *
 * With `openPanelOnActionClick: true`, Chrome opens the panel declared in
 * manifest's `side_panel.default_path` (sidebar.html) whenever the user clicks
 * the extension's action icon. No popup is involved.
 * ---------------------------------------------------------------------------
 */
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error("[ContextHighlighter] sidePanel:", err));
});

// Also set it on browser startup so behaviour survives worker restarts.
chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
});
