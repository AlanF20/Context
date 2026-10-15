// Feature 37 — replaceContextFromMarkdown keeps PDF page/sourceTitle the same
// way it already keeps sourceUrl and the anchor (tests/036-…).
import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../src/sidebar/store.js";

describe("replaceContextFromMarkdown — PDF fields", () => {
  let ctx;
  let pdf;
  let web;

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
    ctx = await Store.createContext("PDF");
    pdf = await Store.addItem(ctx.id, {
      text: "Cita del PDF",
      category: "idea",
      sourceUrl: "https://x.org/paper.pdf",
      source: "paper.pdf",
      sourceTitle: "paper.pdf",
      page: 12,
      rangePrefix: "antes",
      rangeSuffix: "después",
      rangeStart: 5,
      rangeEnd: 17,
    });
    web = await Store.addItem(ctx.id, { text: "Nota web", category: "evidence", sourceUrl: "https://a.com/x" });
  });

  async function saveEdited(edit) {
    const md = edit(Store.buildMd(await Store.getContext(ctx.id)));
    await Store.replaceContextFromMarkdown(ctx.id, md);
    return (await Store.getContext(ctx.id)).items;
  }

  it("exact match keeps page, sourceTitle, sourceUrl and anchor", async () => {
    const items = await saveEdited((md) => md.replace("Nota web", "Nota web editada"));
    expect(items[0]).toMatchObject({
      id: pdf.id,
      page: 12,
      sourceTitle: "paper.pdf",
      sourceUrl: "https://x.org/paper.pdf",
      rangePrefix: "antes",
      rangeStart: 5,
    });
    expect("page" in items[1]).toBe(false);
  });

  it("positional match (edited text) keeps page, sourceTitle and sourceUrl", async () => {
    const items = await saveEdited((md) => md.replace("Cita del PDF", "Cita del PDF reescrita"));
    expect(items[0]).toMatchObject({
      id: pdf.id,
      text: "Cita del PDF reescrita",
      page: 12,
      sourceTitle: "paper.pdf",
      sourceUrl: "https://x.org/paper.pdf",
      rangePrefix: null,
    });
  });

  it("an edited page number in the _Fuente:_ line wins", async () => {
    const items = await saveEdited((md) => md.replace("p. 12_", "p. 13_"));
    expect(items[0].page).toBe(13);
    expect(items[0].id).toBe(pdf.id);
    expect(items[1].id).toBe(web.id);
  });
});
