/**
 * sidebar.js — side-panel controller (ES module entry point).
 * ---------------------------------------------------------------------------
 * Holds the panel state (contexts, selection, mode) and wires the feature
 * modules together:
 *   - rail.js    → the context rail
 *   - vista.js   → the Markdown preview tab
 *   - editor.js  → the Monaco editor tab
 *   - theme.js   → light/dark toggle
 * Data flows through window.ContextStore (storage.js), re-exported by store.js.
 * ---------------------------------------------------------------------------
 */
import { createElement, Sparkles, Download, Pencil } from "lucide";
import { $ } from "./sidebar/dom.js";
import { Store } from "./sidebar/store.js";
import { initTheme } from "./sidebar/theme.js";
import { renderRail } from "./sidebar/rail.js";
import { renderVista, createDocEditor } from "./sidebar/vista.js";
import { createEditorController } from "./sidebar/editor.js";

const railList = $("#rail-list");
const railAdd = $("#rail-add");
const ctxHeader = $("#ctx-header");
const bodyEl = $("#body");
const themeToggle = $("#theme-toggle");

// ---- State ----
let contexts = [];
let selectedId = null;
let mode = "vista"; // "vista" | "vista-edit" | "editor"
const editor = createEditorController();
const docEditor = createDocEditor();

// =======================================================================
//  Init
// =======================================================================
document.addEventListener("DOMContentLoaded", () => {
  initTheme(themeToggle);
  railAdd.addEventListener("click", onCreateContext);
  render();
});

// Live-refresh from page saves, but not while editing (avoid clobbering text).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[Store.STORAGE_KEY] && mode === "vista") {
    render();
  }
});

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
  if (mode === "editor") await editor.flush();
  if (mode === "vista-edit") await docEditor.flush();
  selectedId = id;
  mode = "vista";
  renderRail(railList, contexts, selectedId, onSelectContext, onDeleteContext);
  await renderMain();
}

async function onDeleteContext(id) {
  if (mode === "editor" && selectedId === id) await editor.flush();
  if (mode === "vista-edit" && selectedId === id) await docEditor.flush();
  editor.invalidate(id);
  docEditor.dispose();
  await Store.deleteContext(id);
  if (selectedId === id) selectedId = null;
  await render();
}

async function onCreateContext() {
  if (mode === "editor") await editor.flush();
  if (mode === "vista-edit") await docEditor.flush();
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
    editor.mount(bodyEl, ctx, { onSync: afterEditorSync });
  } else if (mode === "vista-edit") {
    editor.dispose();
    await docEditor.mount(bodyEl, ctx, {
      onSync: afterDocEditorSync,
      onEscape: () => switchMode("vista"),
    });
  } else {
    editor.dispose();
    docEditor.dispose();
    renderVista(bodyEl, ctx);
  }
}

function countItems(ctx) {
  const sub = ctx.items.filter((i) => i.type === "subtitle").length;
  const txt = ctx.items.filter((i) => i.type === "text").length;
  return { total: ctx.items.length, sub, txt };
}

function renderHeader(ctx) {
  const counts = countItems(ctx);
  ctxHeader.hidden = false;
  ctxHeader.innerHTML = "";

  // Row 1: color dot + name (dbl-click to rename) + .md download
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
  const mdBtn = document.createElement("button");
  mdBtn.className = "btn md ghost";
  mdBtn.title = "Descargar como Markdown";
  mdBtn.setAttribute("aria-label", "Descargar como Markdown");
  const dlIcon = createElement(Download, { width: 13, height: 13 });
  dlIcon.style.pointerEvents = "none";
  mdBtn.append(makeMdMark(), dlIcon);
  mdBtn.addEventListener("click", () => downloadMd(ctx));

  if (mode === "vista") {
    const editBtn = document.createElement("button");
    editBtn.className = "icon-btn";
    editBtn.title = "Editar documento";
    editBtn.setAttribute("aria-label", "Editar documento");
    const pencilIcon = createElement(Pencil, { width: 14, height: 14 });
    pencilIcon.style.pointerEvents = "none";
    editBtn.appendChild(pencilIcon);
    editBtn.addEventListener("click", () => switchMode("vista-edit"));
    row1.append(dot, name, mdBtn, editBtn);
  } else if (mode === "vista-edit") {
    const doneBtn = document.createElement("button");
    doneBtn.className = "btn ghost";
    doneBtn.textContent = "Listo";
    doneBtn.addEventListener("click", () => switchMode("vista"));
    row1.append(dot, name, mdBtn, doneBtn);
  } else {
    row1.append(dot, name, mdBtn);
  }

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

function segBtn(label, on, onClick) {
  const b = document.createElement("button");
  if (on) b.className = "on";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

/** Inline-rename the context from its title element. */
async function startRename(ctx, nameEl) {
  const input = document.createElement("input");
  input.className = "search";
  input.value = ctx.name;
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  const commit = async () => {
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

/** Called after each debounced save from the inline doc editor — refreshes rail + counter. */
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
  if (mode === "editor") await editor.flush();
  if (mode === "vista-edit") {
    await docEditor.flush();
    contexts = await Store.listContexts(); // refresh after save
  }
  mode = next;
  await renderMain();
}

/** After a live editor sync: refresh the rail + counter without resetting the
 *  editor (which would move the cursor). */
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
//  Helpers
// =======================================================================

/** Canonical Markdown mark SVG badge (M with down-arrow in a rounded rect). */
function makeMdMark() {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 208 128");
  svg.setAttribute("width", "28");
  svg.setAttribute("height", "28");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("class", "md-mark");
  svg.setAttribute("aria-hidden", "true");
  const rect = document.createElementNS(NS, "rect");
  rect.setAttribute("width", "198");
  rect.setAttribute("height", "118");
  rect.setAttribute("x", "5");
  rect.setAttribute("y", "5");
  rect.setAttribute("ry", "10");
  rect.setAttribute("stroke", "currentColor");
  rect.setAttribute("stroke-width", "10");
  rect.setAttribute("fill", "none");
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", "M30 98V30h20l20 25 20-25h20v68H90V59L70 84 50 59v39zm125 0l-30-33h20V30h20v35h20z");
  svg.append(rect, path);
  return svg;
}

// =======================================================================
//  Export
// =======================================================================
function downloadMd(ctx) {
  // Prefer the live in-flight buffer when editing, else the stored document.
  const liveDocMd = mode === "vista-edit"
    ? document.querySelector(".vista-edit-doc")?.value
    : null;
  const md = liveDocMd || (mode === "editor" && editor.peek(ctx.id)) || Store.buildMd(ctx);
  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: `${sanitizeFilename(ctx.name)}.md`,
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
