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
 */
import { createElement, NotebookPen } from "lucide";
import { Store } from "./store.js";
import { renderMarkdown } from "./markdown.js";

function emptyState() {
  const s = document.createElement("div");
  s.className = "state";
  const glyph = document.createElement("div");
  glyph.className = "glyph";
  const icon = createElement(NotebookPen, { width: 20, height: 20 });
  icon.style.pointerEvents = "none";
  glyph.appendChild(icon);
  const title = document.createElement("div");
  title.className = "title";
  title.textContent = "Contexto vacío";
  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent = 'Resalta texto en una página y pulsa "+" para llenarlo.';
  s.append(glyph, title, hint);
  return s;
}

/** Render the context as a rich Markdown preview into mountEl. */
export function renderVista(mountEl, ctx) {
  mountEl.innerHTML = "";
  if (!ctx || !ctx.items.length) {
    mountEl.appendChild(emptyState());
    return;
  }
  const div = document.createElement("div");
  div.className = "vista-md-preview md";
  div.innerHTML = renderMarkdown(Store.buildMd(ctx));
  mountEl.appendChild(div);
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

  async function save(value, onSync) {
    if (!currentCtxId) return;
    await Store.replaceContextFromMarkdown(currentCtxId, value);
    if (onSync) onSync();
  }

  /** Replace mountEl body with a <textarea> pre-filled with the context Markdown. */
  async function mount(mountEl, ctx, { onSync, onEscape } = {}) {
    dispose();
    currentCtxId = ctx.id;

    const ta = document.createElement("textarea");
    ta.className = "vista-edit-doc";
    ta.value = Store.buildMd(ctx);
    ta.setAttribute("aria-label", "Editor de documento Markdown");
    ta.setAttribute("spellcheck", "false");
    taRef = ta;

    mountEl.innerHTML = "";
    mountEl.appendChild(ta);
    ta.focus();

    ta.addEventListener("input", () => {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => save(ta.value, onSync), 400);
    });
    ta.addEventListener("blur", () => {
      clearTimeout(syncTimer);
      save(ta.value, onSync);
    });
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (onEscape) onEscape();
      }
    });
  }

  /** Immediately persist the current textarea value (call before navigating away). */
  async function flush() {
    clearTimeout(syncTimer);
    if (taRef && currentCtxId) {
      await save(taRef.value);
    }
  }

  /** Clear timer and refs without saving (use only when destroying the editor). */
  function dispose() {
    clearTimeout(syncTimer);
    syncTimer = null;
    currentCtxId = null;
    taRef = null;
  }

  return { mount, flush, dispose };
}
