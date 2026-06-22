/**
 * rail.js — the vertical rail of context chips.
 */

/** Two-letter initials for a context name ("Cortisol" -> "Co"). */
function initials(name) {
  const words = (name || "?").trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  const w = words[0] || "?";
  return (w[0] || "?").toUpperCase() + (w[1] ? w[1].toLowerCase() : "");
}

/**
 * Render the rail chips.
 * @param {HTMLElement} listEl   container for the chips
 * @param {object[]} contexts    all contexts
 * @param {string|null} selectedId
 * @param {(id:string)=>void} onSelect
 * @param {(id:string)=>void} onDelete
 */
export function renderRail(listEl, contexts, selectedId, onSelect, onDelete) {
  listEl.innerHTML = "";
  for (const ctx of contexts) {
    const wrap = document.createElement("div");
    wrap.className = "rail-chip-wrap";

    const chip = document.createElement("button");
    chip.className = "rail-chip" + (ctx.id === selectedId ? " active" : "");
    chip.style.background = ctx.color || "#5b57e8";
    chip.textContent = initials(ctx.name);
    chip.title = ctx.name;
    if (ctx.id === selectedId) {
      chip.style.boxShadow =
        "0 0 0 2px var(--bg), 0 0 0 4px " + (ctx.color || "#5b57e8");
    }
    chip.addEventListener("click", () => onSelect(ctx.id));

    const delBtn = document.createElement("button");
    delBtn.className = "rail-chip-del";
    delBtn.title = "Eliminar contexto";
    delBtn.textContent = "✕";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      onDelete(ctx.id);
    });

    wrap.append(chip, delBtn);
    listEl.appendChild(wrap);
  }
}
