// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExportMenu } from "../src/sidebar/export-menu.js";

const FORMATS = [
  { id: "markdown", label: "Markdown (.md)" },
  { id: "anki", label: "Tarjetas Anki (.txt)" },
];

function makeAnchor() {
  const btn = document.createElement("button");
  btn.setAttribute("aria-expanded", "false");
  document.body.appendChild(btn);
  return btn;
}

let exportMenu;

beforeEach(() => {
  exportMenu = createExportMenu();
});

afterEach(() => {
  exportMenu.dispose();
  document.body.innerHTML = "";
});

describe("createExportMenu", () => {
  it("renders one menuitem per format, using each format's label", () => {
    const anchor = makeAnchor();
    exportMenu.toggle(anchor, FORMATS, () => {});

    const menu = document.querySelector('[role="menu"]');
    const items = [...document.querySelectorAll('[role="menuitem"]')];
    expect(menu).not.toBeNull();
    expect(items.map((el) => el.textContent)).toEqual([
      "Markdown (.md)",
      "Tarjetas Anki (.txt)",
    ]);
  });

  it("sets aria-expanded=true on the anchor while the menu is open", () => {
    const anchor = makeAnchor();
    exportMenu.toggle(anchor, FORMATS, () => {});
    expect(anchor.getAttribute("aria-expanded")).toBe("true");
  });

  it("clicking a menu item calls onSelect with that format's id and closes the menu", () => {
    const anchor = makeAnchor();
    const onSelect = vi.fn();
    exportMenu.toggle(anchor, FORMATS, onSelect);

    const items = [...document.querySelectorAll('[role="menuitem"]')];
    items[1].click(); // "Tarjetas Anki (.txt)"

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("anki");
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(anchor.getAttribute("aria-expanded")).toBe("false");
  });

  it("toggling the same anchor again closes the menu without calling onSelect", () => {
    const anchor = makeAnchor();
    const onSelect = vi.fn();
    exportMenu.toggle(anchor, FORMATS, onSelect);
    exportMenu.toggle(anchor, FORMATS, onSelect);

    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("opening the menu on a different anchor closes the one already open elsewhere", () => {
    const anchorA = makeAnchor();
    const anchorB = makeAnchor();
    exportMenu.toggle(anchorA, FORMATS, () => {});
    exportMenu.toggle(anchorB, FORMATS, () => {});

    expect(anchorA.getAttribute("aria-expanded")).toBe("false");
    expect(anchorB.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(1);
  });

  it("Escape closes the menu and returns focus to the anchor", () => {
    const anchor = makeAnchor();
    exportMenu.toggle(anchor, FORMATS, () => {});

    const menu = document.querySelector('[role="menu"]');
    menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(anchor);
  });

  it("ArrowDown/ArrowUp cycles focus between menu items", () => {
    const anchor = makeAnchor();
    exportMenu.toggle(anchor, FORMATS, () => {});

    const menu = document.querySelector('[role="menu"]');
    const items = [...document.querySelectorAll('[role="menuitem"]')];
    expect(document.activeElement).toBe(items[0]);

    menu.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(items[1]);

    menu.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(items[0]); // wraps around

    menu.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(document.activeElement).toBe(items[1]); // wraps the other way
  });

  it("clicking outside the menu closes it", () => {
    const anchor = makeAnchor();
    exportMenu.toggle(anchor, FORMATS, () => {});

    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it("dispose() removes the menu and resets aria-expanded", () => {
    const anchor = makeAnchor();
    exportMenu.toggle(anchor, FORMATS, () => {});

    exportMenu.dispose();

    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(anchor.getAttribute("aria-expanded")).toBe("false");
  });
});
