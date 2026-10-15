/**
 * viewer-tabs.js — find tabs showing the extension's PDF viewer (feature 37).
 * Viewer tab URLs are chrome-extension:// pages, which chrome.tabs.query({url})
 * can't match by PDF; chrome.runtime.getContexts (Chrome 116+) lists them with
 * their document URL without needing the "tabs" permission.
 */
import { VIEWER_PATH, parseViewerUrl } from "../viewer/source.js";

/** Open viewer pages: [{ tabId, file }]. */
export async function listViewerTabs() {
  if (!chrome.runtime.getContexts) return [];
  const viewerUrl = chrome.runtime.getURL(VIEWER_PATH);
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["TAB"] });
  return contexts
    .filter((c) => c.tabId >= 0 && (c.documentUrl || "").startsWith(viewerUrl))
    .map((c) => ({ tabId: c.tabId, file: parseViewerUrl(c.documentUrl).file }));
}
