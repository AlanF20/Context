/**
 * editor.js — the Editor tab: a Monaco Markdown editor that edits the whole
 * document and syncs live back into the structured store.
 *
 * Monaco is bundled locally (vendor/monaco) because MV3 forbids remote code,
 * and is loaded lazily via its AMD loader the first time the editor opens.
 * The editor is always dark, regardless of the panel theme.
 *
 * createEditorController() returns a small stateful API so the main controller
 * doesn't have to know about Monaco internals.
 *
 * mount() options:
 *   onSync(ctx)  — called after each debounced save (refresh rail/counter).
 *   onSave(ctxId, md) — async; replaces the direct Store.replaceContextFromMarkdown
 *                       call so sidebar.js can inject history snapshotting.
 */
import { Store } from "./store.js";
import { escapeHtml } from "./dom.js";
import pennySad from "../assets/penny-sad.png";

export function createEditorController() {
  let editor = null;
  let monacoReady = null;
  let syncTimer = null;
  let currentCtxId = null;
  let tabDirtyEl = null;
  const buffers = {};

  function setStatus(el, md) {
    if (el) el.textContent = `Markdown · UTF-8 · ${md.split("\n").length} líneas`;
  }

  function scheduleSync(ctxId, value, onSave, onSync) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      if (onSave) {
        await onSave(ctxId, value);
      } else {
        await Store.replaceContextFromMarkdown(ctxId, value);
      }
      // Mark clean after successful save.
      if (tabDirtyEl) tabDirtyEl.hidden = true;
      if (onSync) onSync();
    }, 350);
  }

  async function mount(mountEl, ctx, { onSync, onSave } = {}) {
    dispose();
    currentCtxId = ctx.id;
    const md = buffers[ctx.id] != null ? buffers[ctx.id] : Store.buildMd(ctx);

    const wrap = document.createElement("div");
    wrap.className = "editor-wrap";
    wrap.innerHTML =
      '<div class="tab-bar"><span class="dot"></span>' +
      '<span class="tab-title">' + escapeHtml(ctx.name) + '.md' +
        '<span class="tab-dirty" hidden aria-label="Cambios sin guardar">●</span>' +
      '</span>' +
      '<span class="muted">Editando documento completo</span></div>' +
      '<div id="editor"></div>' +
      '<div class="status-bar" id="status-bar"></div>';
    mountEl.innerHTML = "";
    mountEl.appendChild(wrap);

    tabDirtyEl = wrap.querySelector(".tab-dirty");
    const statusBar = wrap.querySelector("#status-bar");
    const host = wrap.querySelector("#editor");
    setStatus(statusBar, md);

    try {
      const monaco = await ensureMonaco();
      editor = monaco.editor.create(host, {
        value: md,
        language: "markdown",
        theme: "ch-md-dark",
        wordWrap: "on",
        minimap: { enabled: false },
        automaticLayout: true,
        scrollBeyondLastLine: false,
        lineNumbers: "on",
        fontFamily:
          '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 13,
        lineHeight: 20,
        padding: { top: 8 },
      });

      editor.onDidChangeModelContent(() => {
        const value = editor.getValue();
        buffers[ctx.id] = value;
        setStatus(statusBar, value);
        // Show dirty indicator on change.
        if (tabDirtyEl) tabDirtyEl.hidden = false;
        scheduleSync(ctx.id, value, onSave, onSync);
      });

      // Cmd+S / Ctrl+S: immediate save, even with no pending changes.
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        flush(onSave, { force: true });
      });
    } catch (err) {
      console.error("[ContextHighlighter] Monaco failed:", err);
      host.innerHTML =
        '<div class="state">' +
        `<img class="state-mascot" src="${pennySad}" alt="" />` +
        '<div class="title">No se pudo cargar el editor</div>' +
        '<div class="hint">Verifica la carpeta vendor/monaco.</div></div>';
    }
  }

  /**
   * Persist the current buffer. Merely mounting Monaco and leaving without
   * typing must NOT trigger a save — replaceContextFromMarkdown rebuilds
   * every item and wipes DOM-anchor metadata, breaking re-highlight on
   * reload for untouched items (feature 34). Skip the save when the buffer
   * isn't dirty, unless `force` is set (explicit Cmd+S).
   */
  async function flush(onSave, { force = false } = {}) {
    clearTimeout(syncTimer);
    if (!editor || !currentCtxId) return;
    const value = editor.getValue();
    buffers[currentCtxId] = value;
    if (!force && !isDirty(currentCtxId)) return;
    if (onSave) {
      await onSave(currentCtxId, value);
    } else {
      await Store.replaceContextFromMarkdown(currentCtxId, value);
    }
    if (tabDirtyEl) tabDirtyEl.hidden = true;
  }

  function dispose() {
    clearTimeout(syncTimer);
    if (editor) {
      editor.dispose();
      editor = null;
    }
    tabDirtyEl = null;
    currentCtxId = null;
  }

  function peek(ctxId) {
    return buffers[ctxId] != null ? buffers[ctxId] : null;
  }

  function invalidate(ctxId) {
    delete buffers[ctxId];
  }

  /** True when ctxId is currently mounted and has unsaved/unsynced changes. */
  function isDirty(ctxId) {
    return ctxId === currentCtxId && !!tabDirtyEl && !tabDirtyEl.hidden;
  }

  /**
   * Normalize the current document via parseMd → buildMd.
   * Uses Monaco's executeEdits so the operation participates in Monaco's
   * own undo stack (Cmd+Z within Monaco can undo the format).
   */
  function applyFormat(ctx) {
    if (!editor) return;
    const current = editor.getValue();
    const parsed = Store.parseMd(current);
    const formatted = Store.buildMd({
      name: parsed.name || (ctx && ctx.name) || "Untitled",
      items: parsed.items,
    });
    if (formatted === current) return; // already normalized
    const model = editor.getModel();
    editor.executeEdits("format", [{ range: model.getFullModelRange(), text: formatted }]);
    editor.pushUndoStop();
  }

  // ---- Monaco lazy loader + theme ----
  function ensureMonaco() {
    if (window.monaco) return Promise.resolve(window.monaco);
    if (monacoReady) return monacoReady;
    monacoReady = new Promise((resolve, reject) => {
      self.MonacoEnvironment = {
        getWorkerUrl: () =>
          chrome.runtime.getURL("vendor/monaco/vs/base/worker/workerMain.js"),
      };
      const req = window.require;
      if (!req) return reject(new Error("Monaco loader.js not found"));
      req.config({ paths: { vs: chrome.runtime.getURL("vendor/monaco/vs") } });
      req(
        ["vs/editor/editor.main"],
        () => {
          defineTheme(window.monaco);
          resolve(window.monaco);
        },
        reject
      );
    });
    return monacoReady;
  }

  function defineTheme(monaco) {
    monaco.editor.defineTheme("ch-md-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "keyword.md", foreground: "7ec8ff", fontStyle: "bold" },
        { token: "keyword", foreground: "7ec8ff", fontStyle: "bold" },
        { token: "strong", foreground: "e6c07b", fontStyle: "bold" },
        { token: "emphasis", foreground: "8aa66b", fontStyle: "italic" },
        { token: "string.link", foreground: "61afef" },
        { token: "variable", foreground: "56b6c2" },
        { token: "comment", foreground: "8aa66b", fontStyle: "italic" },
      ],
      colors: {
        "editor.background": "#1e1e22",
        "editor.foreground": "#d4d4d8",
        "editorLineNumber.foreground": "#54545c",
        "editorLineNumber.activeForeground": "#9b998e",
      },
    });
  }

  return { mount, flush, dispose, peek, invalidate, isDirty, applyFormat };
}
