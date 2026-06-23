/**
 * vista.js — item-by-item Vista renderer with category badges.
 * Replaces the Markdown-rendered preview (buildMd → marked → HTML) with a
 * direct item loop so each highlight gets a .vista-cat-badge in its meta row
 * and inline edit/delete actions (DESIGN_SPEC §2.3, spec_vista_item_actions).
 */
import { Store } from "./store.js";

const CAT_LABEL = {
  title:    "Título",
  idea:     "Idea",
  argument: "Argumento",
  evidence: "Evidencia",
};

function emptyState() {
  const s = document.createElement("div");
  s.className = "state";
  s.innerHTML =
    '<div class="glyph">✎</div>' +
    '<div class="title">Contexto vacío</div>' +
    '<div class="hint">Resalta texto en una página y pulsa "+" para llenarlo.</div>';
  return s;
}

/** Build a single vista item element. */
function buildItem(item, ctxId, onMutate) {
  // Use <li> for semantic list membership
  const el = document.createElement("li");
  el.className = `vista-item vista-item-${item.type}`;
  el.dataset.id = item.id;

  if (item.type === "subtitle") {
    // Semantic heading for section grouping (WCAG SC 1.3.1)
    const content = document.createElement("h3");
    content.className = "vista-item-content";
    content.textContent = item.text;
    el.appendChild(content);
  } else {
    // <p> carries paragraph semantics; data-category drives the left accent
    const content = document.createElement("p");
    content.className = "vista-item-content";
    content.textContent = item.text;
    if (item.category) el.dataset.category = item.category;
    el.appendChild(content);

    // meta row: category badge only (source URL removed per UX decision)
    if (item.category && CAT_LABEL[item.category]) {
      const meta = document.createElement("div");
      meta.className = "vista-item-meta";
      const badge = document.createElement("span");
      badge.className = `vista-cat-badge badge-${item.category}`;
      badge.textContent = CAT_LABEL[item.category];
      meta.appendChild(badge);
      el.appendChild(meta);
    }
  }

  // edit / delete actions — revealed on hover via CSS
  const actions = document.createElement("div");
  actions.className = "vista-actions";

  const editBtn = document.createElement("button");
  editBtn.className = "vista-btn-edit";
  editBtn.title = "Editar";
  editBtn.textContent = "✏";

  const delBtn = document.createElement("button");
  delBtn.className = "vista-btn-delete";
  delBtn.title = "Borrar";
  delBtn.textContent = "✕";

  actions.append(editBtn, delBtn);
  el.appendChild(actions);

  editBtn.addEventListener("click", () => startEdit(el, item, ctxId, onMutate));
  delBtn.addEventListener("click", async () => {
    await Store.deleteItem(ctxId, item.id);
    if (onMutate) onMutate();
  });

  return el;
}

/** Replace the item content with an inline textarea for editing. */
function startEdit(el, item, ctxId, onMutate) {
  const contentEl = el.querySelector(".vista-item-content");
  if (!contentEl) return;
  el.classList.add("editing");

  const ta = document.createElement("textarea");
  ta.className = "vista-edit-ta";
  ta.value = item.text;
  contentEl.replaceWith(ta);
  ta.focus();
  ta.select();

  function restore() {
    const tag = item.type === "subtitle" ? "h3" : "p";
    const restored = document.createElement(tag);
    restored.className = "vista-item-content";
    restored.textContent = item.text;
    ta.replaceWith(restored);
    el.classList.remove("editing");
  }

  async function commit() {
    const newText = ta.value.trim();
    if (newText && newText !== item.text) {
      await Store.updateItem(ctxId, item.id, { text: newText });
      if (onMutate) onMutate();
    } else {
      restore();
    }
  }

  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ta.blur(); }
    if (e.key === "Escape") { ta.removeEventListener("blur", commit); restore(); }
  });
  ta.addEventListener("blur", commit, { once: true });
}

/**
 * Render the Vista for `ctx` into `mountEl`.
 * @param {HTMLElement} mountEl
 * @param {object}      ctx
 * @param {{ onMutate?: () => void }} [opts]
 */
export function renderVista(mountEl, ctx, { onMutate } = {}) {
  // <ul> gives screen readers "list with N items" + arrow-key navigation
  const wrap = document.createElement("ul");
  wrap.className = "vista-list";
  wrap.setAttribute("role", "list");

  if (!ctx.items.length) {
    wrap.appendChild(emptyState());
  } else {
    for (const item of ctx.items) {
      wrap.appendChild(buildItem(item, ctx.id, onMutate));
    }
  }

  mountEl.innerHTML = "";
  mountEl.appendChild(wrap);
}
