/**
 * sidebar.js — side-panel controller (ES module entry point).
 * ---------------------------------------------------------------------------
 * Holds the panel state (contexts, selection, mode) and wires the feature
 * modules together:
 *   - rail.js    → the context rail
 *   - vista.js   → the Markdown preview tab
 *   - editor.js  → the Monaco editor tab
 *   - theme.js   → light/dark toggle
 *   - history.js → undo/redo stack
 *   - find.js    → floating find/replace bar
 * Data flows through chrome.storage.local, accessed via store.js (Store).
 * ---------------------------------------------------------------------------
 */
import { createElement, Sparkles, Download, ChevronDown } from "lucide";
import { $ } from "./sidebar/dom.js";
import { Store } from "./sidebar/store.js";
import { initTheme } from "./sidebar/theme.js";
import { initOnboarding } from "./sidebar/onboarding.js";
import { renderRail } from "./sidebar/rail.js";
import { renderVista, createDocEditor } from "./sidebar/vista.js";
import { createEditorController } from "./sidebar/editor.js";
import { createHistoryManager } from "./sidebar/history.js";
import { createFindBar } from "./sidebar/find.js";
import { confirmDelete } from "./sidebar/modal.js";
import { createAnchorStatus } from "./sidebar/anchor-status.js";
import { EXPORT_FORMATS } from "./sidebar/export-formats.js";
import { createExportMenu } from "./sidebar/export-menu.js";
import { goToSource } from "./sidebar/source-nav.js";

const railList = $("#rail-list");
const railAdd = $("#rail-add");
const ctxHeader = $("#ctx-header");
const bodyEl = $("#body");
const themeToggle = $("#theme-toggle");
const onboardingHelpBtn = $("#onboarding-help-btn");

// ---- State ----
let contexts = [];
let selectedId = null;
let mode = "vista"; // "vista" | "vista-edit" | "editor"
const editor = createEditorController();
const docEditor = createDocEditor();
const historyMgr = createHistoryManager();
const findBar = createFindBar();
const anchorStatus = createAnchorStatus();
const exportMenu = createExportMenu();

// =======================================================================
//  Init
// =======================================================================
document.addEventListener("DOMContentLoaded", async () => {
  initTheme(themeToggle);
  initOnboarding(onboardingHelpBtn);
  railAdd.addEventListener("click", onCreateContext);
  document.addEventListener("keydown", onGlobalKeydown);
  bodyEl.addEventListener("click", onBodyClick);
  anchorStatus.init();

  // Pre-select the context requested by a fast-save from the capture toolbar.
  const nav = await chrome.storage.local.get('CH_NAV');
  if (nav.CH_NAV) {
    selectedId = nav.CH_NAV;
    chrome.storage.local.remove('CH_NAV');
  }

  render();
});

// Live-refresh from page saves, but not while editing (avoid clobbering).
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;

  // Navigate to context after a fast-save from the capture toolbar.
  if (changes.CH_NAV?.newValue) {
    onSelectContext(changes.CH_NAV.newValue);
    chrome.storage.local.remove('CH_NAV');
  }

  if (!changes[Store.STORAGE_KEY]) return;

  // Detect items added externally (content script capture) and push an undo
  // snapshot of the state that existed BEFORE the capture. Also invalidate
  // the Editor/Vista-edit buffers for affected contexts so a capture made
  // from another tab/page shows up without the user having to switch modes —
  // unless that mode currently has unsaved edits pending, to avoid clobbering.
  const oldCtxs = changes[Store.STORAGE_KEY].oldValue?.contexts || {};
  const newCtxs = changes[Store.STORAGE_KEY].newValue?.contexts || {};
  let affectedSelected = false;
  for (const [id, newCtx] of Object.entries(newCtxs)) {
    const oldCtx = oldCtxs[id];
    if (oldCtx && newCtx.items.length > oldCtx.items.length) {
      historyMgr.push(id, serialize(oldCtx));
      if (!editor.isDirty(id)) editor.invalidate(id);
      if (id === selectedId) affectedSelected = true;
    }
  }

  if (mode === "vista") {
    render();
    return;
  }

  contexts = await Store.listContexts();
  if (!affectedSelected) return;

  if (mode === "editor" && !editor.isDirty(selectedId)) {
    await renderMain();
  } else if (mode === "vista-edit" && !docEditor.isDirty(selectedId)) {
    await renderMain();
  } else {
    const ctx = selectedContext();
    const counter = ctxHeader.querySelector(".counter");
    if (ctx && counter) {
      const c = countItems(ctx);
      counter.textContent = `${c.total} ítems · ${c.sub} subt · ${c.txt} txt`;
    }
  }
});

// =======================================================================
//  History helpers
// =======================================================================

function serialize(ctx) {
  return JSON.stringify({ name: ctx.name, items: ctx.items });
}

async function restore(ctxId, snap) {
  const { name, items } = JSON.parse(snap);
  const data = await Store.readAll();
  if (!data.contexts[ctxId]) return;
  data.contexts[ctxId].name = name;
  data.contexts[ctxId].items = items;
  await Store.writeAll(data);
}

/**
 * Save wrapper that snapshots the current stored state before writing.
 * Passed as onSave to both docEditor and editor controllers.
 */
async function saveWithHistory(ctxId, md) {
  const ctx = await Store.getContext(ctxId);
  if (ctx) historyMgr.push(ctxId, serialize(ctx));
  await Store.replaceContextFromMarkdown(ctxId, md);
}

// =======================================================================
//  Render orchestration
// =======================================================================
async function render() {
  contexts = await Store.listContexts();
  if (contexts.length && !contexts.some((c) => c.id === selectedId)) {
    selectedId = contexts[0].id;
  }
  if (!contexts.length) selectedId = null;

  renderRail(railList, contexts, selectedId, onSelectContext, onDeleteContext);
  await renderMain();
}

function selectedContext() {
  return contexts.find((c) => c.id === selectedId) || null;
}

async function onSelectContext(id) {
  if (mode === "editor") {
    await editor.flush(saveWithHistory);
    contexts = await Store.listContexts();
  }
  if (mode === "vista-edit") {
    await docEditor.flush();
    contexts = await Store.listContexts();
  }
  findBar.dispose();
  selectedId = id;
  mode = "vista";
  renderRail(railList, contexts, selectedId, onSelectContext, onDeleteContext);
  await renderMain();
}

async function onDeleteContext(id) {
  const ctx = contexts.find((c) => c.id === id);
  const confirmed = await confirmDelete(ctx?.name ?? "este contexto");
  if (!confirmed) return;

  if (mode === "editor" && selectedId === id) await editor.flush(saveWithHistory);
  if (mode === "vista-edit" && selectedId === id) await docEditor.flush();
  editor.invalidate(id);
  docEditor.dispose();
  findBar.dispose();
  historyMgr.invalidate(id);
  await Store.deleteContext(id);
  if (selectedId === id) selectedId = null;
  await render();
}

async function onCreateContext() {
  if (mode === "editor") await editor.flush(saveWithHistory);
  if (mode === "vista-edit") await docEditor.flush();
  findBar.dispose();
  const ctx = await Store.createContext("Nuevo contexto");
  selectedId = ctx.id;
  mode = "vista";
  await render();
}

// =======================================================================
//  Main — header + body
// =======================================================================
async function renderMain() {
  const ctx = selectedContext();
  if (!ctx) {
    editor.dispose();
    anchorStatus.detach();
    exportMenu.dispose();
    ctxHeader.hidden = true;
    const stateEl = document.createElement("div");
    stateEl.className = "state";
    const glyph = document.createElement("div");
    glyph.className = "glyph";
    const sparklesIcon = createElement(Sparkles, { width: 20, height: 20 });
    sparklesIcon.style.pointerEvents = "none";
    glyph.appendChild(sparklesIcon);
    const stateTitle = document.createElement("div");
    stateTitle.className = "title";
    stateTitle.textContent = "Sin contextos todavía";
    const stateHint = document.createElement("div");
    stateHint.className = "hint";
    stateHint.textContent = 'Crea uno con "+" o resalta texto en una página.';
    stateEl.append(glyph, stateTitle, stateHint);
    bodyEl.innerHTML = "";
    bodyEl.appendChild(stateEl);
    return;
  }
  renderHeader(ctx);
  if (mode === "editor") {
    anchorStatus.detach();
    editor.mount(bodyEl, ctx, {
      onSync: afterEditorSync,
      onSave: saveWithHistory,
    });
  } else if (mode === "vista-edit") {
    anchorStatus.detach();
    editor.dispose();
    await docEditor.mount(bodyEl, ctx, {
      onSync: afterDocEditorSync,
      onEscape: () => switchMode("vista"),
      onSave: saveWithHistory,
      onDirty: () => setUnsavedDot(true),
      onClean: () => setUnsavedDot(false),
    });
  } else {
    editor.dispose();
    docEditor.dispose();
    findBar.dispose();
    renderVista(bodyEl, ctx);
    anchorStatus.attach(bodyEl, ctx);
  }
}

/** Delegated click handler for the Vista's per-page "go to source" icons. */
function onBodyClick(e) {
  const btn = e.target.closest(".vista-source-link");
  if (!btn) return;
  goToSource({ sourceUrl: btn.dataset.sourceUrl, itemId: btn.dataset.itemId });
}

function countItems(ctx) {
  const sub = ctx.items.filter((i) => i.type === "subtitle").length;
  const txt = ctx.items.filter((i) => i.type === "text").length;
  return { total: ctx.items.length, sub, txt };
}

function renderHeader(ctx) {
  exportMenu.dispose(); // header is about to be rebuilt — drop any open menu tied to the old button
  const counts = countItems(ctx);
  ctxHeader.hidden = false;
  ctxHeader.innerHTML = "";

  // Row 1: color dot + name (dbl-click to rename) + unsaved dot + export menu
  const row1 = document.createElement("div");
  row1.className = "ctx-title-row";
  const dot = document.createElement("span");
  dot.className = "ctx-dot";
  dot.style.background = ctx.color || "#5b57e8";
  const name = document.createElement("div");
  name.className = "ctx-name";
  name.textContent = ctx.name;
  name.title = "Doble clic para renombrar";
  name.addEventListener("dblclick", () => startRename(ctx, name));

  // Unsaved indicator (visible only in vista-edit mode when dirty).
  const unsavedDot = document.createElement("span");
  unsavedDot.className = "unsaved-dot";
  unsavedDot.textContent = "●";
  unsavedDot.hidden = true;
  unsavedDot.setAttribute("aria-label", "Cambios sin guardar");

  const exportBtn = document.createElement("button");
  exportBtn.className = "btn export ghost";
  exportBtn.title = "Exportar";
  exportBtn.setAttribute("aria-label", "Exportar");
  exportBtn.setAttribute("aria-haspopup", "menu");
  exportBtn.setAttribute("aria-expanded", "false");
  const exportLabel = document.createElement("span");
  exportLabel.textContent = "Exportar";
  const dlIcon = createElement(Download, { width: 13, height: 13 });
  dlIcon.style.pointerEvents = "none";
  const chevIcon = createElement(ChevronDown, { width: 12, height: 12 });
  chevIcon.style.pointerEvents = "none";
  exportBtn.append(dlIcon, exportLabel, chevIcon);
  exportBtn.addEventListener("click", () => {
    exportMenu.toggle(exportBtn, EXPORT_FORMATS, (formatId) => downloadExport(ctx, formatId));
  });

  row1.append(dot, name, unsavedDot, exportBtn);

  // Row 2: counter + Vista/Editor segmented toggle
  const row2 = document.createElement("div");
  row2.className = "ctx-meta-row";
  const counter = document.createElement("span");
  counter.className = "counter";
  counter.textContent = `${counts.total} ítems · ${counts.sub} subt · ${counts.txt} txt`;
  const seg = document.createElement("div");
  seg.className = "segmented";
  seg.append(
    segBtn("Vista", mode === "vista" || mode === "vista-edit", () => switchMode("vista")),
    segBtn("Editor", mode === "editor", () => switchMode("editor"))
  );
  row2.append(counter, seg);

  ctxHeader.append(row1, row2);
}

/** Show/hide the .unsaved-dot in the current header (vista-edit only). */
function setUnsavedDot(visible) {
  const dot = ctxHeader.querySelector(".unsaved-dot");
  if (dot) dot.hidden = !visible;
}

function segBtn(label, on, onClick) {
  const b = document.createElement("button");
  if (on) b.className = "on";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

async function startRename(ctx, nameEl) {
  const input = document.createElement("input");
  input.className = "search";
  input.value = ctx.name;
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  const commit = async () => {
    // Snapshot before renaming so it's undoable.
    const current = await Store.getContext(ctx.id);
    if (current) historyMgr.push(ctx.id, serialize(current));
    await Store.renameContext(ctx.id, input.value || ctx.name);
    editor.invalidate(ctx.id);
    await render();
  };
  input.addEventListener("blur", commit, { once: true });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape") render();
  });
}

async function afterDocEditorSync() {
  editor.invalidate(selectedId);
  contexts = await Store.listContexts();
  const ctx = selectedContext();
  if (!ctx) return;
  renderRail(railList, contexts, selectedId, onSelectContext, onDeleteContext);
  const counter = ctxHeader.querySelector(".counter");
  if (counter) {
    const c = countItems(ctx);
    counter.textContent = `${c.total} ítems · ${c.sub} subt · ${c.txt} txt`;
  }
}

async function switchMode(next) {
  if (next === mode) return;
  if (mode === "editor") {
    await editor.flush(saveWithHistory);
    contexts = await Store.listContexts();
  }
  if (mode === "vista-edit") {
    await docEditor.flush();
    contexts = await Store.listContexts();
  }
  // Snapshot BEFORE entering Monaco so the full edit session is undoable.
  if (next === "editor" && selectedId) {
    const ctx = selectedContext();
    if (ctx) historyMgr.push(selectedId, serialize(ctx));
  }
  findBar.dispose();
  mode = next;
  await renderMain();
}

async function afterEditorSync() {
  contexts = await Store.listContexts();
  const ctx = selectedContext();
  if (!ctx || mode !== "editor") return;
  renderRail(railList, contexts, selectedId, onSelectContext, onDeleteContext);
  const counter = ctxHeader.querySelector(".counter");
  if (counter) {
    const c = countItems(ctx);
    counter.textContent = `${c.total} ítems · ${c.sub} subt · ${c.txt} txt`;
  }
}

// =======================================================================
//  Global keyboard handler
// =======================================================================

function onGlobalKeydown(e) {
  const mod = e.metaKey || e.ctrlKey;

  // ── Undo / Redo ──────────────────────────────────────────────────────
  if (mod && e.code === "KeyZ" && !e.altKey) {
    // Let Monaco handle its own undo natively.
    if (mode === "editor") return;
    // Let the browser handle undo when a text field has focus.
    const active = document.activeElement;
    if (active && (
      active.classList.contains("vista-edit-doc") ||
      active.classList.contains("find-input") ||
      active.classList.contains("replace-input") ||
      active.classList.contains("search")
    )) return;

    e.preventDefault();
    applyUndoRedo(e.shiftKey);
    return;
  }

  // ── Format Document (Shift+Alt+F) ────────────────────────────────────
  if (e.shiftKey && e.altKey && e.code === "KeyF") {
    e.preventDefault();
    applyFormat();
    return;
  }

  // ── Find / Replace (Cmd+F / Ctrl+F) ──────────────────────────────────
  if (mod && e.code === "KeyF" && !e.shiftKey && !e.altKey) {
    // Monaco handles its own find natively — don't intercept.
    if (mode === "editor") return;
    if (mode === "vista-edit") {
      e.preventDefault();
      openFind();
    }
    // In vista (preview) mode: do nothing.
    return;
  }
}

// =======================================================================
//  Undo / Redo
// =======================================================================

async function applyUndoRedo(isRedo) {
  if (!selectedId) return;
  const ctx = await Store.getContext(selectedId);
  if (!ctx) return;

  const current = serialize(ctx);
  const snap = isRedo
    ? historyMgr.redo(selectedId, current)
    : historyMgr.undo(selectedId, current);

  if (!snap) return; // stack empty

  await restore(selectedId, snap);
  await render();
}

// =======================================================================
//  Format Document
// =======================================================================

async function applyFormat() {
  const ctx = selectedContext();
  if (!ctx) return;

  if (mode === "vista-edit") {
    const ta = bodyEl.querySelector(".vista-edit-doc");
    if (!ta) return;
    const parsed = Store.parseMd(ta.value);
    const formatted = Store.buildMd({
      name: parsed.name || ctx.name,
      items: parsed.items,
    });
    if (formatted === ta.value) return;
    ta.value = formatted;
    ta.dispatchEvent(new Event("input")); // triggers auto-save
  } else if (mode === "editor") {
    editor.applyFormat(ctx);
  }
}

// =======================================================================
//  Find / Replace
// =======================================================================

function openFind() {
  if (mode !== "vista-edit") return;
  findBar.mount(bodyEl, () => bodyEl.querySelector(".vista-edit-doc"), {
    onBeforeReplace: async () => {
      const ctx = await Store.getContext(selectedId);
      if (ctx) historyMgr.push(selectedId, serialize(ctx));
    },
  });
}

// =======================================================================
//  Helpers
// =======================================================================

/**
 * Resolve and download a context in the chosen export format.
 * Markdown keeps today's live-buffer behavior (reflects unsaved vista-edit/
 * editor changes); every other format reads the persisted state, since only
 * Markdown has a "buffer" concept (spec 028 AC-15).
 */
async function downloadExport(ctx, formatId) {
  const format = EXPORT_FORMATS.find((f) => f.id === formatId) || EXPORT_FORMATS[0];
  let content;
  if (formatId === "markdown") {
    const liveDocMd =
      mode === "vista-edit" ? bodyEl.querySelector(".vista-edit-doc")?.value : null;
    content = liveDocMd || (mode === "editor" && editor.peek(ctx.id)) || format.build(ctx);
  } else {
    const freshCtx = (await Store.getContext(ctx.id)) || ctx;
    content = format.build(freshCtx);
  }
  const blob = new Blob([content], { type: format.mime });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: `${sanitizeFilename(ctx.name)}.${format.extension}`,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sanitizeFilename(name) {
  return (
    (name || "context")
      .trim()
      .replace(/[^a-z0-9_\- ]/gi, "")
      .replace(/\s+/g, "_")
      .slice(0, 60) || "context"
  );
}
