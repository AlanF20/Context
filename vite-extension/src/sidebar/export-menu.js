/**
 * export-menu.js — minimal floating menu for the "Exportar" header button.
 *
 * createExportMenu() returns { toggle, dispose }. toggle(anchorEl, formats,
 * onSelect) opens (or closes, if already open for that anchor) a role="menu"
 * positioned under anchorEl; onSelect(formatId) fires once per pick.
 */

export function createExportMenu() {
  let menuEl = null;
  let anchorRef = null;
  let onKeydown = null;
  let onDocMousedown = null;

  function isOpenFor(anchorEl) {
    return menuEl !== null && anchorRef === anchorEl;
  }

  function dispose() {
    if (menuEl) menuEl.remove();
    if (onDocMousedown) document.removeEventListener("mousedown", onDocMousedown, true);
    const anchor = anchorRef;
    menuEl = null;
    anchorRef = null;
    onKeydown = null;
    onDocMousedown = null;
    if (anchor) anchor.setAttribute("aria-expanded", "false");
  }

  function open(anchorEl, formats, onSelect) {
    dispose();
    anchorRef = anchorEl;
    anchorEl.setAttribute("aria-expanded", "true");

    menuEl = document.createElement("div");
    menuEl.className = "export-menu";
    menuEl.setAttribute("role", "menu");

    const items = formats.map((fmt) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "export-menu-item";
      item.setAttribute("role", "menuitem");
      item.textContent = fmt.label;
      item.addEventListener("click", () => {
        const anchor = anchorRef;
        dispose();
        anchor?.focus();
        onSelect(fmt.id);
      });
      menuEl.appendChild(item);
      return item;
    });

    document.body.appendChild(menuEl);

    const rect = anchorEl.getBoundingClientRect();
    menuEl.style.top = `${rect.bottom + 4}px`;
    menuEl.style.right = `${document.documentElement.clientWidth - rect.right}px`;

    let focusIdx = 0;
    items[0]?.focus();

    onKeydown = (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        focusIdx = (focusIdx + 1) % items.length;
        items[focusIdx].focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        focusIdx = (focusIdx - 1 + items.length) % items.length;
        items[focusIdx].focus();
      } else if (e.key === "Escape" || e.key === "Tab") {
        e.preventDefault();
        const anchor = anchorRef;
        dispose();
        anchor?.focus();
      }
    };
    onDocMousedown = (e) => {
      if (menuEl && !menuEl.contains(e.target) && e.target !== anchorEl) dispose();
    };
    menuEl.addEventListener("keydown", onKeydown);
    document.addEventListener("mousedown", onDocMousedown, true);
  }

  return {
    toggle(anchorEl, formats, onSelect) {
      if (isOpenFor(anchorEl)) {
        dispose();
        return;
      }
      open(anchorEl, formats, onSelect);
    },
    dispose,
  };
}
