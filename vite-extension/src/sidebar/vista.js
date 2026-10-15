/**
 * vista.js — two exported surfaces for the Vista tab:
 *
 *  renderVista(mountEl, ctx)
 *    Renders a rich Markdown preview of the whole context using marked + DOMPurify.
 *    Read-only; no per-item edit/delete buttons.
 *
 *  createDocEditor()
 *    Returns a controller { mount, flush, dispose } that replaces the body with
 *    a full-document <textarea> editor (debounced auto-save, Escape to exit).
 *
 *  mount() options:
 *    onSync()        — called after each successful save (refresh rail/counter).
 *    onEscape()      — called when the user presses Escape.
 *    onSave(id, md)  — async; replaces the direct Store.replaceContextFromMarkdown
 *                      call so sidebar.js can inject history snapshotting.
 *    onDirty()       — called on the first 'input' event (debounce in flight).
 *    onClean()       — called after each successful save.
 */
import { createElement, ExternalLink } from "lucide";
import { Store } from "./store.js";
import { renderMarkdown } from "./markdown.js";
import pennyDrawing from "../assets/penny-drawing.png";

function emptyState() {
  const s = document.createElement("div");
  s.className = "state";
  const mascot = document.createElement("img");
  mascot.className = "state-mascot";
  mascot.src = pennyDrawing;
  mascot.alt = "";
  const title = document.createElement("div");
  title.className = "title";
  title.textContent = "Contexto vacío";
  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent = 'Resalta texto en una página y pulsa "+" para llenarlo.';
  s.append(mascot, title, hint);
  return s;
}

/**
 * Partition items into consecutive runs sharing the same sourceUrl (feature
 * 32). Items without a sourceUrl (hand-typed via the document editor) form
 * their own run(s) but never get a navigation header — there is no page to
 * go back to.
 */
export function groupItemsBySource(items) {
  const groups = [];
  for (const item of items) {
    const sourceUrl = item.sourceUrl || "";
    const last = groups[groups.length - 1];
    if (last && last.sourceUrl === sourceUrl) {
      last.items.push(item);
    } else {
      groups.push({ sourceUrl, items: [item] });
    }
  }
  return groups;
}

/**
 * One navigation control per page group: an icon plus the short hostname as
 * visible text (never the full URL/scheme). Clicking asks sidebar.js (via
 * data attributes, no closures here) to focus or open the source tab and
 * scroll to this group's first highlight.
 */
function sourceGroupHeader(group) {
  const first = group.items[0];
  // PDF groups (feature 37) are labeled by file name: file:// URLs have no
  // hostname, and the PDF's host says little about which document it is.
  const isPdf = Store.isPdfItem(first);
  const hostname = isPdf
    ? first.sourceTitle || Store.pdfFilename(group.sourceUrl)
    : Store.hostnameFromUrl(group.sourceUrl);
  const header = document.createElement("div");
  header.className = "vista-source-header";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "vista-source-link";
  btn.setAttribute("aria-label", `Ir a ${hostname}`);
  btn.title = hostname;
  btn.dataset.sourceUrl = group.sourceUrl;
  btn.dataset.itemId = first.id;
  if (isPdf) btn.dataset.page = String(first.page);
  const icon = createElement(ExternalLink, { width: 13, height: 13 });
  icon.style.pointerEvents = "none";
  const label = document.createElement("span");
  label.className = "vista-source-label";
  label.textContent = hostname;
  btn.append(icon, label);
  header.appendChild(btn);
  return header;
}

/** Render the context as a rich Markdown preview into mountEl, grouped by page of origin. */
export function renderVista(mountEl, ctx) {
  mountEl.innerHTML = "";
  if (!ctx || !ctx.items.length) {
    mountEl.appendChild(emptyState());
    return;
  }
  const root = document.createElement("div");
  root.className = "vista-md-preview md";
  for (const group of groupItemsBySource(ctx.items)) {
    if (group.sourceUrl) root.appendChild(sourceGroupHeader(group));
    const section = document.createElement("div");
    section.className = "vista-source-group";
    section.innerHTML = renderMarkdown(Store.buildMdFragment(group.items));
    root.appendChild(section);
  }
  mountEl.appendChild(root);
}

/**
 * createDocEditor() — stateful controller for the inline full-document editor.
 * Call mount() to show the textarea, flush() to save before navigating away,
 * and dispose() to clean up timers and refs.
 */
export function createDocEditor() {
  let syncTimer = null;
  let currentCtxId = null;
  let taRef = null;
  let onSaveRef = null;
  let onCleanRef = null;
  let dirtySignalled = false;

  async function save(value, { onSync, onClean } = {}) {
    if (!currentCtxId) return;
    if (onSaveRef) {
      await onSaveRef(currentCtxId, value);
    } else {
      await Store.replaceContextFromMarkdown(currentCtxId, value);
    }
    if (onSync) onSync();
    if (onClean) onClean();
    if (onCleanRef) onCleanRef();
  }

  async function mount(mountEl, ctx, { onSync, onEscape, onSave, onDirty, onClean } = {}) {
    dispose();
    currentCtxId = ctx.id;
    onSaveRef = onSave || null;
    onCleanRef = onClean || null;

    const ta = document.createElement("textarea");
    ta.className = "vista-edit-doc";
    ta.value = Store.buildMd(ctx);
    ta.setAttribute("aria-label", "Editor de documento Markdown");
    ta.setAttribute("spellcheck", "false");
    taRef = ta;

    mountEl.innerHTML = "";
    mountEl.appendChild(ta);
    ta.focus();

    dirtySignalled = false;

    ta.addEventListener("input", () => {
      if (!dirtySignalled) {
        dirtySignalled = true;
        if (onDirty) onDirty();
      }
      clearTimeout(syncTimer);
      syncTimer = setTimeout(async () => {
        dirtySignalled = false;
        await save(ta.value, { onSync, onClean });
      }, 400);
    });

    ta.addEventListener("blur", async () => {
      clearTimeout(syncTimer);
      if (!dirtySignalled) return;
      dirtySignalled = false;
      await save(ta.value, { onSync, onClean });
    });

    ta.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (onEscape) onEscape();
      }
    });
  }

  /**
   * Persist the textarea's current value. Merely mounting it and leaving
   * without typing must NOT trigger a save (same failure mode as the Editor
   * controller, feature 34) — skip when there are no pending changes.
   */
  async function flush() {
    clearTimeout(syncTimer);
    if (!taRef || !currentCtxId || !dirtySignalled) return;
    dirtySignalled = false;
    await save(taRef.value);
  }

  function dispose() {
    clearTimeout(syncTimer);
    syncTimer = null;
    currentCtxId = null;
    taRef = null;
    onSaveRef = null;
    onCleanRef = null;
    dirtySignalled = false;
  }

  /** Current textarea value, or null when not mounted. */
  function getCurrentValue() {
    return taRef ? taRef.value : null;
  }

  /** True when ctxId is currently mounted and has unsaved changes pending. */
  function isDirty(ctxId) {
    return ctxId === currentCtxId && dirtySignalled;
  }

  return { mount, flush, dispose, getCurrentValue, isDirty };
}
