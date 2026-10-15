/**
 * background.js — MV3 service worker.
 * Opens the side panel when the user clicks the extension icon, and offers
 * "Abrir en Active Reading" on the icon's context menu to reopen the current
 * tab's PDF in the extension's own viewer (feature 37).
 */
import { VIEWER_PATH, buildViewerUrl, isOpenableUrl } from './viewer/source.js';

const OPEN_PDF_MENU_ID = 'ch-open-pdf';

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: OPEN_PDF_MENU_ID,
    title: 'Abrir PDF en Active Reading',
    contexts: ['action'],
  });
});

// Manual entry only: Chrome's native viewer stays the default for every PDF.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== OPEN_PDF_MENU_ID || !tab || tab.id == null) return;
  if (!isOpenableUrl(tab.url)) return;
  chrome.tabs.update(tab.id, { url: buildViewerUrl(chrome.runtime.getURL(VIEWER_PATH), tab.url) });
});

// Open the side panel and signal the sidebar to navigate to the captured context.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'CH_OPEN_PANEL_CTX' && sender.tab?.id) {
    chrome.sidePanel.open({ tabId: sender.tab.id });
    chrome.storage.local.set({ CH_NAV: msg.ctxId });
  }
});
