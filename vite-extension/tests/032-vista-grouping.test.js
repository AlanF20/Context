import { describe, it, expect, beforeEach, vi } from "vitest";
import { Store } from "../src/sidebar/store.js";
import { groupItemsBySource } from "../src/sidebar/vista.js";
import { goToSource } from "../src/sidebar/source-nav.js";

function fixtureContext(items) {
  return { id: "ctx1", name: "Cortisol", color: "#5b57e8", createdAt: 0, items };
}

describe("groupItemsBySource — partitions consecutive runs by sourceUrl (feature 32)", () => {
  it("groups 3 consecutive items sharing the same non-empty sourceUrl into a single group", () => {
    const items = [
      { id: "a", sourceUrl: "https://a.com/1" },
      { id: "b", sourceUrl: "https://a.com/1" },
      { id: "c", sourceUrl: "https://a.com/1" },
    ];
    const groups = groupItemsBySource(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].sourceUrl).toBe("https://a.com/1");
    expect(groups[0].items).toHaveLength(3);
  });

  it("starts a new group on every sourceUrl change, preserving item order", () => {
    const items = [
      { id: "a", sourceUrl: "https://a.com" },
      { id: "b", sourceUrl: "https://b.com" },
      { id: "c", sourceUrl: "https://a.com" },
    ];
    const groups = groupItemsBySource(items);
    expect(groups.map((g) => g.sourceUrl)).toEqual(["https://a.com", "https://b.com", "https://a.com"]);
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([["a"], ["b"], ["c"]]);
  });

  it("treats items with empty/missing sourceUrl as their own group(s), distinct from real sources", () => {
    const items = [
      { id: "a", sourceUrl: "" },
      { id: "b" }, // no sourceUrl at all (hand-typed via document editor)
      { id: "c", sourceUrl: "https://a.com" },
    ];
    const groups = groupItemsBySource(items);
    expect(groups).toHaveLength(2);
    expect(groups[0].sourceUrl).toBe("");
    expect(groups[0].items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(groups[1].sourceUrl).toBe("https://a.com");
  });

  it("returns an empty array for an empty item list", () => {
    expect(groupItemsBySource([])).toEqual([]);
  });
});

describe("buildMdFragment / buildMd — no regression from the extraction (feature 32)", () => {
  it("buildMd(ctx) output is unchanged for a mix of subtitle/text/comment items", () => {
    const ctx = fixtureContext([
      { id: "s1", type: "subtitle", category: "title", text: "Sección" },
      { id: "t1", type: "text", category: "idea", text: "Con comentario", comment: "nota" },
      { id: "t2", type: "text", category: "argument", text: "Sin comentario", comment: null },
    ]);
    expect(Store.buildMd(ctx)).toBe(
      "# Cortisol\n\n## Sección\n\n🟡 Con comentario\n> nota\n\n🔵 Sin comentario\n"
    );
  });

  it("buildMd(ctx) with an empty items array still just prints the title line", () => {
    expect(Store.buildMd(fixtureContext([]))).toBe("# Cortisol\n");
  });

  it("buildMdFragment(items) omits the '# name' title line but matches buildMd's per-item formatting", () => {
    const items = [{ id: "t1", type: "text", category: "evidence", text: "Dato" }];
    expect(Store.buildMdFragment(items)).toBe("🟢 Dato\n");
    expect(Store.buildMd(fixtureContext(items))).toBe("# Cortisol\n\n🟢 Dato\n");
  });

  it("buildMdFragment(items) round-trips through parseMd like buildMd does", () => {
    const items = [
      { id: "s1", type: "subtitle", category: "title", text: "Sub" },
      { id: "t1", type: "text", category: "idea", text: "Nota" },
    ];
    const { items: parsed } = Store.parseMd(Store.buildMdFragment(items));
    expect(parsed).toMatchObject([
      { type: "subtitle", text: "Sub" },
      { type: "text", text: "Nota" },
    ]);
  });
});

describe("goToSource — focus-existing-tab vs. create-new-tab decision (feature 32)", () => {
  let storageData;

  beforeEach(() => {
    storageData = {};
    global.chrome = {
      tabs: {
        query: vi.fn(),
        update: vi.fn().mockResolvedValue(undefined),
        sendMessage: vi.fn().mockResolvedValue(undefined),
        create: vi.fn().mockResolvedValue(undefined),
      },
      windows: {
        update: vi.fn().mockResolvedValue(undefined),
      },
      storage: {
        local: {
          set: vi.fn((obj) => {
            Object.assign(storageData, obj);
            return Promise.resolve();
          }),
        },
      },
    };
  });

  it("does nothing when sourceUrl is empty (no page to go back to)", async () => {
    await goToSource({ sourceUrl: "", itemId: "x" });
    expect(chrome.tabs.query).not.toHaveBeenCalled();
  });

  it("focuses the existing tab and window, and messages the content script directly, when a matching tab is open", async () => {
    chrome.tabs.query.mockResolvedValue([{ id: 7, windowId: 3 }]);
    await goToSource({ sourceUrl: "https://a.com", itemId: "item1" });

    expect(chrome.tabs.query).toHaveBeenCalledWith({ url: "https://a.com" });
    expect(chrome.tabs.update).toHaveBeenCalledWith(7, { active: true });
    expect(chrome.windows.update).toHaveBeenCalledWith(3, { focused: true });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, { type: "CH_SCROLL_TO_ITEM", itemId: "item1" });
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it("stashes the scroll target and creates a new tab when no matching tab is open", async () => {
    chrome.tabs.query.mockResolvedValue([]);
    await goToSource({ sourceUrl: "https://a.com", itemId: "item2" });

    expect(chrome.storage.local.set).toHaveBeenCalledWith({ CH_SCROLL_TARGET: "item2" });
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "https://a.com" });
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });
});
