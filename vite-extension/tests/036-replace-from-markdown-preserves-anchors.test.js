// Bug report: editing a single line in the Editor tab wiped sourceUrl/
// rangePrefix/rangeSuffix/rangeText/rangeStart/rangeEnd for EVERY item in
// the context, not just the edited line — because
// Store.replaceContextFromMarkdown() rebuilt the whole item list from
// scratch on each sync, with no way to tell an untouched line apart from a
// freshly typed one. That silently un-anchored highlights (and their "go to
// source" URL) on every other page the context referenced.
//
// Feature 34 already covers (and pins, tests/034-flush-clean-noop.test.js)
// the narrower case of leaving the Editor tab without typing anything.
//
// Follow-up request: even a line whose text WAS genuinely edited should keep
// its sourceUrl/source/id (only its DOM-position anchor, which can no longer
// be trusted against the new text, resets) — reconciliation is now two
// passes: exact (type, category, text) match first (keeps everything,
// anchor included), then a positional fallback among whatever's left
// unmatched, pairing an edited line with the old item it most likely used to
// be.
import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../src/sidebar/store.js";

describe("replaceContextFromMarkdown — reconciles by (type, category, text) instead of rebuilding blindly", () => {
  let ctx;

  beforeEach(async () => {
    let data = { contextHighlighter: { contexts: {} } };
    global.chrome = {
      storage: {
        local: {
          get: (key, cb) => cb({ [key]: data[key] }),
          set: (obj, cb) => {
            Object.assign(data, obj);
            if (cb) cb();
          },
        },
      },
    };
    ctx = await Store.createContext("Prueba");
  });

  it("an untouched item keeps its id, sourceUrl and anchor metadata across a save that only edits another line", async () => {
    const kept = await Store.addItem(ctx.id, {
      text: "Dato A",
      category: "evidence",
      sourceUrl: "https://a.example/article",
      rangePrefix: "prefix-a",
      rangeSuffix: "suffix-a",
      rangeStart: 10,
      rangeEnd: 20,
    });
    const edited = await Store.addItem(ctx.id, {
      text: "Dato B",
      category: "idea",
      sourceUrl: "https://b.example/article",
      rangePrefix: "prefix-b",
      rangeSuffix: "suffix-b",
      rangeStart: 30,
      rangeEnd: 40,
    });

    const md = Store.buildMd({ name: "Prueba", items: [kept, { ...edited, text: "Dato B editado" }] });
    const updatedCtx = await Store.replaceContextFromMarkdown(ctx.id, md);

    const keptResult = updatedCtx.items.find((it) => it.text === "Dato A");
    expect(keptResult.id).toBe(kept.id);
    expect(keptResult.sourceUrl).toBe("https://a.example/article");
    expect(keptResult.rangePrefix).toBe("prefix-a");
    expect(keptResult.rangeSuffix).toBe("suffix-a");
    expect(keptResult.rangeStart).toBe(10);
    expect(keptResult.rangeEnd).toBe(20);
  });

  it("an item whose OWN text was genuinely edited keeps its id and sourceUrl, but its DOM anchor resets (spec 004/027)", async () => {
    const edited = await Store.addItem(ctx.id, {
      text: "Dato B",
      category: "idea",
      sourceUrl: "https://b.example/article",
      rangePrefix: "prefix-b",
      rangeSuffix: "suffix-b",
      rangeStart: 30,
      rangeEnd: 40,
    });

    const md = Store.buildMd({ name: "Prueba", items: [{ ...edited, text: "Dato B editado" }] });
    const updatedCtx = await Store.replaceContextFromMarkdown(ctx.id, md);

    const result = updatedCtx.items.find((it) => it.text === "Dato B editado");
    expect(result.id).toBe(edited.id);
    expect(result.sourceUrl).toBe("https://b.example/article");
    expect(result.rangePrefix).toBeNull();
    expect(result.rangeSuffix).toBeNull();
    expect(result.rangeStart).toBeNull();
    expect(result.rangeEnd).toBeNull();
  });

  it("editing TWO items' text in the same save pairs each edited line with its own old item, in document order", async () => {
    const a = await Store.addItem(ctx.id, { text: "Dato A", category: "evidence", sourceUrl: "https://a.example/1" });
    const b = await Store.addItem(ctx.id, { text: "Dato B", category: "idea", sourceUrl: "https://b.example/2" });

    const md = Store.buildMd({
      name: "Prueba",
      items: [
        { ...a, text: "Dato A editado" },
        { ...b, text: "Dato B editado" },
      ],
    });
    const updatedCtx = await Store.replaceContextFromMarkdown(ctx.id, md);

    const resultA = updatedCtx.items.find((it) => it.text === "Dato A editado");
    const resultB = updatedCtx.items.find((it) => it.text === "Dato B editado");
    expect(resultA.sourceUrl).toBe("https://a.example/1");
    expect(resultB.sourceUrl).toBe("https://b.example/2");
  });

  it("a brand-new line appended by the user gets no anchor, without touching any existing item", async () => {
    const kept = await Store.addItem(ctx.id, {
      text: "Dato A",
      category: "evidence",
      sourceUrl: "https://a.example/article",
      rangeStart: 10,
      rangeEnd: 20,
    });

    const md = Store.buildMd({ name: "Prueba", items: [kept] }) + "\n🔵 Nota nueva del usuario\n";
    const updatedCtx = await Store.replaceContextFromMarkdown(ctx.id, md);

    expect(updatedCtx.items).toHaveLength(2);
    const keptResult = updatedCtx.items.find((it) => it.text === "Dato A");
    expect(keptResult.id).toBe(kept.id);
    expect(keptResult.sourceUrl).toBe("https://a.example/article");
    expect(keptResult.rangeStart).toBe(10);

    const newResult = updatedCtx.items.find((it) => it.text === "Nota nueva del usuario");
    expect(newResult.sourceUrl).toBe("");
    expect(newResult.rangeStart).toBeNull();
  });

  it("duplicate identical lines are matched in document order, one old item per new line", async () => {
    const a = await Store.addItem(ctx.id, { text: "Repetido", category: "idea", sourceUrl: "https://x.example/1" });
    const b = await Store.addItem(ctx.id, { text: "Repetido", category: "idea", sourceUrl: "https://x.example/2" });

    const md = Store.buildMd({ name: "Prueba", items: [a, b] });
    const updatedCtx = await Store.replaceContextFromMarkdown(ctx.id, md);

    expect(updatedCtx.items.map((it) => it.sourceUrl)).toEqual([
      "https://x.example/1",
      "https://x.example/2",
    ]);
  });
});
