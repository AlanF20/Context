/**
 * anchor-status.js — "no encontrado en la página" strip for the Vista.
 * ---------------------------------------------------------------------------
 * Shows which items of the selected context failed to re-anchor on the ACTIVE
 * tab. The state is ephemeral per tab/visit and is NEVER persisted: it arrives
 * from the content script via hybrid messaging —
 *   push: CH_ANCHOR_STATUS broadcasts on every anchoring change
 *   pull: CH_GET_ANCHOR_STATUS query on render / tab switch / tab load
 * A rejected sendMessage (chrome://, Web Store, PDFs) means "page not open
 * here" — the strip stays hidden and no error is raised.
 * ---------------------------------------------------------------------------
 */

/** Controller managing the strip; wire with init() once, attach() per render. */
export function createAnchorStatus() {
  let statuses = null; // { itemId: 'pending'|'anchored'|'failed' } | null = unknown
  let mountEl = null;
  let ctxRef = null;
  let activeTabId = null;

  function init() {
    // CH_ANCHOR_STATUS is a fire-and-forget broadcast from every tab's content
    // script, not just the active one — a background tab's push must not
    // overwrite the strip showing the active tab's state.
    chrome.runtime.onMessage.addListener((msg, sender) => {
      if (msg && msg.type === "CH_ANCHOR_STATUS") {
        if (activeTabId != null && sender?.tab?.id != null && sender.tab.id !== activeTabId) {
          return;
        }
        statuses = msg.statuses || {};
        renderStrip();
      }
    });
    chrome.tabs.onActivated.addListener(() => queryActiveTab());
    chrome.tabs.onUpdated.addListener((_tabId, info) => {
      if (info.status === "complete") queryActiveTab();
    });
    queryActiveTab();
  }

  /** Pull the anchor state from the active tab's content script. */
  async function queryActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || tab.id == null) throw new Error("no active tab");
      activeTabId = tab.id;
      const resp = await chrome.tabs.sendMessage(tab.id, { type: "CH_GET_ANCHOR_STATUS" });
      statuses = (resp && resp.statuses) || {};
    } catch (_) {
      statuses = null; // no content script in the tab → "page not open" state
    }
    renderStrip();
  }

  /** Bind the strip to the Vista body for the given context (vista mode only). */
  function attach(el, ctx) {
    mountEl = el;
    ctxRef = ctx;
    renderStrip();
    queryActiveTab();
  }

  /** Unbind when leaving vista mode so pushes can't paint over other modes. */
  function detach() {
    mountEl = null;
    ctxRef = null;
  }

  function renderStrip() {
    if (!mountEl || !ctxRef) return;
    const existing = mountEl.querySelector(".anchor-strip");
    const failed = [];
    if (statuses) {
      for (const it of ctxRef.items || []) {
        if (statuses[it.id] === "failed") failed.push(it);
      }
    }
    if (!failed.length) {
      if (existing) existing.remove();
      return;
    }

    const strip = existing || document.createElement("div");
    strip.className = "anchor-strip";
    strip.innerHTML = "";

    const title = document.createElement("div");
    title.className = "anchor-strip-title";
    title.textContent =
      failed.length === 1
        ? "1 resaltado no encontrado en la página"
        : `${failed.length} resaltados no encontrados en la página`;
    strip.appendChild(title);

    const list = document.createElement("ul");
    list.className = "anchor-strip-list";
    for (const it of failed) {
      const li = document.createElement("li");
      const t = (it.text || "").replace(/\s+/g, " ").trim();
      li.textContent = t.length > 60 ? t.slice(0, 60) + "…" : t;
      list.appendChild(li);
    }
    strip.appendChild(list);

    if (!existing) mountEl.prepend(strip);
  }

  return { init, attach, detach };
}
