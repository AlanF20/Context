// Feature 37 — Markdown contract for PDF items: "_Fuente: file.pdf, p. N_".
import { describe, it, expect } from "vitest";
import { Store } from "../src/sidebar/store.js";

const pdfItem = (over = {}) => ({
  id: "i1",
  type: "text",
  category: "idea",
  text: "La memoria de trabajo tiene capacidad limitada.",
  sourceUrl: "https://x.org/baddeley-2003.pdf",
  source: "baddeley-2003.pdf",
  sourceTitle: "baddeley-2003.pdf",
  page: 12,
  ...over,
});

describe("buildMd — PDF source line", () => {
  it("emits the file name and page right after the note", () => {
    const md = Store.buildMd({ name: "Memoria", items: [pdfItem()] });
    expect(md).toBe(
      "# Memoria\n\n🟡 La memoria de trabajo tiene capacidad limitada.\n_Fuente: baddeley-2003.pdf, p. 12_\n"
    );
  });

  it("puts the source line after the comment block", () => {
    const md = Store.buildMd({ name: "M", items: [pdfItem({ comment: "mi nota" })] });
    expect(md).toContain("🟡 La memoria de trabajo tiene capacidad limitada.\n> mi nota\n_Fuente: baddeley-2003.pdf, p. 12_\n");
  });

  it("never emits it for subtitles", () => {
    const md = Store.buildMd({
      name: "M",
      items: [{ id: "s", type: "subtitle", category: "title", text: "Capítulo 1", page: 3, sourceTitle: "a.pdf" }],
    });
    expect(md).toBe("# M\n\n## Capítulo 1\n");
  });

  it("leaves contexts without PDF items byte-identical", () => {
    const ctx = {
      name: "Cortisol",
      items: [
        { type: "subtitle", category: "title", text: "Sueño" },
        { type: "text", category: "evidence", text: "Dato", source: "nih.gov", sourceUrl: "https://nih.gov/x", comment: "c" },
      ],
    };
    expect(Store.buildMd(ctx)).toBe("# Cortisol\n\n## Sueño\n\n🟢 Dato\n> c\n");
  });

  it("escapes underscores in the file name and parseMd restores them", () => {
    const item = pdfItem({ sourceTitle: "my_paper_v2.pdf", source: "my_paper_v2.pdf" });
    const md = Store.buildMd({ name: "M", items: [item] });
    expect(md).toContain("_Fuente: my\\_paper\\_v2.pdf, p. 12_");
    const parsed = Store.parseMd(md).items[0];
    expect(parsed.source).toBe("my_paper_v2.pdf");
    expect(parsed.page).toBe(12);
  });
});

describe("parseMd — PDF source line", () => {
  it("handles commas in the file name", () => {
    const { items } = Store.parseMd("🟡 nota\n_Fuente: a, b.pdf, p. 3_\n");
    expect(items[0]).toMatchObject({ source: "a, b.pdf", page: 3 });
  });

  it("keeps the legacy domain-only form without a page", () => {
    const { items } = Store.parseMd("🟡 nota\n_Fuente: ejemplo.com_\n");
    expect(items[0].source).toBe("ejemplo.com");
    expect("page" in items[0]).toBe(false);
  });

  it("round-trips text, category, comment, source and page", () => {
    const ctx = {
      name: "M",
      items: [
        pdfItem({ comment: "uno" }),
        pdfItem({ id: "i2", category: "evidence", text: "Otra", page: 4, comment: null }),
      ],
    };
    const { items } = Store.parseMd(Store.buildMd(ctx));
    expect(items).toEqual([
      { type: "text", category: "idea", text: ctx.items[0].text, comment: "uno", source: "baddeley-2003.pdf", page: 12 },
      { type: "text", category: "evidence", text: "Otra", source: "baddeley-2003.pdf", page: 4 },
    ]);
  });
});
