import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../src/sidebar/store.js";

/**
 * Fixture mirrors real ctx.items shapes for the pure buildMd/parseMd tests
 * below — no chrome.storage involved, per project convention (see the
 * separate describe block further down for the addItem/updateItem tests,
 * which DO touch chrome.storage.local via a hand-rolled mock).
 */
function fixtureContext(items) {
  return { id: "ctx1", name: "Cortisol", color: "#5b57e8", createdAt: 0, items };
}

describe("buildMd — comment serialization", () => {
  it("adds a '> comment' line directly under a text item's own line, no blank line between", () => {
    const ctx = fixtureContext([
      { id: "t1", type: "text", category: "idea", text: "Texto A", comment: "Mi comentario" },
    ]);
    expect(Store.buildMd(ctx)).toBe("# Cortisol\n\n🟡 Texto A\n> Mi comentario\n");
  });

  it("splits a multi-line comment into one '> ' line per line", () => {
    const ctx = fixtureContext([
      { id: "t1", type: "text", category: "evidence", text: "Texto B", comment: "linea1\nlinea2" },
    ]);
    expect(Store.buildMd(ctx)).toBe("# Cortisol\n\n🟢 Texto B\n> linea1\n> linea2\n");
  });

  it("adds no new line for an item with no comment (no regression)", () => {
    const ctx = fixtureContext([
      { id: "t1", type: "text", category: "argument", text: "Texto C", comment: null },
    ]);
    expect(Store.buildMd(ctx)).toBe("# Cortisol\n\n🔵 Texto C\n");
  });

  it("never emits a comment line for a subtitle, even if comment is set on the object", () => {
    const ctx = fixtureContext([
      { id: "s1", type: "subtitle", category: "title", text: "Encabezado", comment: "no debería salir" },
    ]);
    expect(Store.buildMd(ctx)).toBe("# Cortisol\n\n## Encabezado\n");
  });
});

describe("parseMd — comment adjacency rule", () => {
  it("attaches a '>' block immediately after a text item's line as that item's comment", () => {
    const md = "# Ctx\n\n🟡 Texto A\n> Mi comentario\n\n🔵 Texto B\n\n";
    const { items } = Store.parseMd(md);
    expect(items[0]).toMatchObject({ type: "text", text: "Texto A", comment: "Mi comentario" });
    expect(items[1]).toMatchObject({ type: "text", text: "Texto B" });
    expect(items[1].comment).toBeUndefined();
  });

  it("joins consecutive '>' continuation lines into one multi-line comment", () => {
    const md = "# Ctx\n\n🟢 Texto\n> linea1\n> linea2\n\n";
    const { items } = Store.parseMd(md);
    expect(items[0].comment).toBe("linea1\nlinea2");
  });

  it("does not bleed a comment into the next item after a blank line", () => {
    const md = "# Ctx\n\n🟡 Texto A\n> comentario A\n\n🔵 Texto B\n\n";
    const { items } = Store.parseMd(md);
    expect(items[0].comment).toBe("comentario A");
    expect(items[1].comment).toBeUndefined();
  });

  it("falls back to the legacy behavior — a new text item — for a '>' block at the start of the document", () => {
    const md = "# Ctx\n\n> 🔵 bloque legado\n> continuacion\n\n";
    const { items } = Store.parseMd(md);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: "text", category: "argument", text: "bloque legado\ncontinuacion" });
    expect(items[0].comment).toBeUndefined();
  });

  it("falls back to the legacy behavior for a '>' block immediately after a subtitle (no adjacent text item)", () => {
    const md = "# Ctx\n\n## Subtitulo\n\n> 🟢 bloque legado\n\n";
    const { items } = Store.parseMd(md);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ type: "subtitle", text: "Subtitulo" });
    expect(items[1]).toMatchObject({ type: "text", category: "evidence", text: "bloque legado" });
  });

  it("round-trips: parseMd(buildMd(ctx)) reproduces the same comment per item", () => {
    const ctx = fixtureContext([
      { id: "s1", type: "subtitle", category: "title", text: "Sección" },
      { id: "t1", type: "text", category: "idea", text: "Con comentario", comment: "nota" },
      { id: "t2", type: "text", category: "argument", text: "Sin comentario", comment: null },
    ]);
    const { items } = Store.parseMd(Store.buildMd(ctx));
    expect(items[1]).toMatchObject({ type: "text", text: "Con comentario", comment: "nota" });
    expect(items[2].comment).toBeUndefined();
  });

  it("does not regress a captured multi-line list item's own text when it has no comment", () => {
    // Pre-existing limitation (not introduced by this feature): buildMd emits a
    // captured list's raw multi-line text with no wrapping, and parseMd has no
    // continuation rule for plain (non-'>') lines, so each line becomes its own
    // item on re-parse. This test only pins that the comment feature doesn't
    // change that pre-existing behavior either way.
    const ctx = fixtureContext([
      { id: "t1", type: "text", category: null, text: "- item1\n- item2", comment: null },
    ]);
    const before = Store.buildMd(ctx);
    const ctxNoComment = fixtureContext([
      { id: "t1", type: "text", category: null, text: "- item1\n- item2" },
    ]);
    expect(before).toBe(Store.buildMd(ctxNoComment));
  });
});

describe("addItem / updateItem — comment field (chrome.storage.local mock)", () => {
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

  it("trims and stores opts.comment on a text item", async () => {
    const item = await Store.addItem(ctx.id, { text: "Texto", category: "idea", comment: "  nota  " });
    expect(item.comment).toBe("nota");
  });

  it("defaults comment to null when omitted", async () => {
    const item = await Store.addItem(ctx.id, { text: "Texto", category: "idea" });
    expect(item.comment).toBeNull();
  });

  it("forces comment to null on a subtitle item even if opts.comment is set", async () => {
    const item = await Store.addItem(ctx.id, { text: "Encabezado", category: "title", comment: "x" });
    expect(item.comment).toBeNull();
  });

  it("updateItem patches comment on an existing text item", async () => {
    const item = await Store.addItem(ctx.id, { text: "Texto", category: "idea" });
    const updated = await Store.updateItem(ctx.id, item.id, { comment: "editado" });
    expect(updated.comment).toBe("editado");
  });

  it("updateItem ignores a comment patch on a subtitle item", async () => {
    const sub = await Store.addItem(ctx.id, { text: "Encabezado", category: "title" });
    const updated = await Store.updateItem(ctx.id, sub.id, { comment: "x" });
    expect(updated.comment).toBeNull();
  });

  it("updateItem normalizes an empty comment string to null", async () => {
    const item = await Store.addItem(ctx.id, { text: "Texto", category: "idea", comment: "algo" });
    const updated = await Store.updateItem(ctx.id, item.id, { comment: "" });
    expect(updated.comment).toBeNull();
  });

  it("replaceContextFromMarkdown copies comment onto reconstructed text items", async () => {
    const md = "# Prueba\n\n🟡 Texto\n> nota reconstruida\n\n";
    const updatedCtx = await Store.replaceContextFromMarkdown(ctx.id, md);
    expect(updatedCtx.items[0].comment).toBe("nota reconstruida");
  });
});
