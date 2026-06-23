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
 */
import { Store } from "./store.js";
import { escapeHtml } from "./dom.js";

export function createEditorController() {
  let editor = null;
  let monacoReady = null;
  let syncTimer = null;
  let currentCtxId = null;
  const buffers = {}; // per-context edited text (kept so the cursor survives)

  function setStatus(el, md) {
    if (el) el.textContent = `Markdown · UTF-8 · ${md.split("\n").length} líneas`;
  }

  /** Debounced live parse → persist while typing. */
  function scheduleSync(ctxId, value, onSync) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      await Store.replaceContextFromMarkdown(ctxId, value);
      if (onSync) onSync();
    }, 350);
  }

  /** Build the editor chrome and mount Monaco inside `mountEl`. */
  async function mount(mountEl, ctx, { onSync } = {}) {
    dispose();
    currentCtxId = ctx.id;
    const md = buffers[ctx.id] != null ? buffers[ctx.id] : Store.buildMd(ctx);

    const wrap = document.createElement("div");
    wrap.className = "editor-wrap";
    wrap.innerHTML =
      '<div class="tab-bar"><span class="dot"></span>' +
      `<span>${escapeHtml(ctx.name)}.md</span>` +
      '<span class="muted">Editando documento completo</span></div>' +
      '<div id="editor"></div>' +
      '<div class="status-bar" id="status-bar"></div>';
    mountEl.innerHTML = "";
    mountEl.appendChild(wrap);

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
        scheduleSync(ctx.id, value, onSync);
      });
    } catch (err) {
      console.error("[ContextHighlighter] Monaco failed:", err);
      host.innerHTML =
        '<div class="state"><div class="title">No se pudo cargar el editor</div>' +
        '<div class="hint">Verifica la carpeta vendor/monaco.</div></div>';
    }
  }

  /** Persist the current value immediately (used when leaving the editor). */
  async function flush() {
    clearTimeout(syncTimer);
    if (editor && currentCtxId) {
      const value = editor.getValue();
      buffers[currentCtxId] = value;
      await Store.replaceContextFromMarkdown(currentCtxId, value);
    }
  }

  function dispose() {
    if (editor) {
      editor.dispose();
      editor = null;
    }
  }

  /** Current edited text for a context (or null if never edited). */
  function peek(ctxId) {
    return buffers[ctxId] != null ? buffers[ctxId] : null;
  }

  /** Drop a context's buffer so it regenerates from fresh state. */
  function invalidate(ctxId) {
    delete buffers[ctxId];
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
      req.config({ paths: { vs: "vendor/monaco/vs" } });
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

  // Dark theme tuned toward the spec's Markdown syntax colors (§2.4).
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

  return { mount, flush, dispose, peek, invalidate };
}
