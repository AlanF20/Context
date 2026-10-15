/**
 * pdf-entry.js — "Abrir en Active Reading" banner (feature 37).
 * ---------------------------------------------------------------------------
 * Chrome's native PDF viewer can't host the capture UI. When the active tab's
 * URL looks like a PDF (".pdf" path), the panel offers to reopen it in the
 * extension's viewer in the same tab. Manual only — never auto-redirects.
 * PDFs without a ".pdf" URL use the extension icon's context menu instead.
 * ---------------------------------------------------------------------------
 */
import { VIEWER_PATH, buildViewerUrl, looksLikePdfUrl } from "../viewer/source.js";

/** @param {HTMLElement} bannerEl container with a `.pdf-entry-open` button */
export function initPdfEntry(bannerEl) {
  const openBtn = bannerEl.querySelector(".pdf-entry-open");
  let activeTab = null;

  async function refresh() {
    try {
      [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    } catch (_) {
      activeTab = null;
    }
    bannerEl.hidden = !(activeTab && looksLikePdfUrl(activeTab.url));
  }

  openBtn.addEventListener("click", async () => {
    if (!activeTab || !looksLikePdfUrl(activeTab.url)) return;
    const url = buildViewerUrl(chrome.runtime.getURL(VIEWER_PATH), activeTab.url);
    await chrome.tabs.update(activeTab.id, { url });
    bannerEl.hidden = true;
  });

  chrome.tabs.onActivated.addListener(refresh);
  chrome.tabs.onUpdated.addListener((_tabId, info) => {
    if (info.url || info.status === "complete") refresh();
  });
  refresh();
}
