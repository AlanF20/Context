// Feature 37 — pure helpers for PDF items and viewer URLs.
import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../src/sidebar/store.js";
import {
  buildViewerUrl,
  parseViewerUrl,
  looksLikePdfUrl,
  isOpenableUrl,
  stripHash,
} from "../src/viewer/source.js";

const BASE = "chrome-extension://abc/src/viewer.html";

describe("isPdfItem", () => {
  it("is true only for an integer page >= 1", () => {
    expect(Store.isPdfItem({ page: 1 })).toBe(true);
    expect(Store.isPdfItem({ page: 12 })).toBe(true);
    for (const page of [0, -1, 2.5, "3", null, undefined]) {
      expect(Store.isPdfItem({ page })).toBe(false);
    }
    expect(Store.isPdfItem(null)).toBe(false);
  });
});

describe("pdfFilename", () => {
  it("takes the last path segment and ignores query/hash", () => {
    expect(Store.pdfFilename("https://x.org/a/b/paper.pdf?dl=1#page=2")).toBe("paper.pdf");
  });
  it("percent-decodes file:// paths", () => {
    expect(Store.pdfFilename("file:///Users/me/Mis%20Docs/a%C3%B1o.pdf")).toBe("año.pdf");
  });
  it("never returns an empty label", () => {
    expect(Store.pdfFilename("https://example.org/")).toBe("example.org");
    expect(Store.pdfFilename("")).toBe("documento.pdf");
  });
});

describe("viewer URLs", () => {
  it("round-trips http URLs with page and item", () => {
    const pdf = "https://arxiv.org/pdf/2401.00001v2";
    const url = buildViewerUrl(BASE, pdf, { page: 3, itemId: "item_x" });
    expect(url.startsWith(BASE + "?file=")).toBe(true);
    expect(parseViewerUrl(url)).toEqual({ file: pdf, page: 3, itemId: "item_x" });
  });

  it("round-trips file:// URLs with spaces and unicode", () => {
    const pdf = "file:///Users/me/Mis Docs/año 2024.pdf";
    expect(parseViewerUrl(buildViewerUrl(BASE, pdf)).file).toBe(pdf);
  });

  it("drops the PDF's own #fragment", () => {
    const url = buildViewerUrl(BASE, "https://x.org/a.pdf#page=7");
    expect(parseViewerUrl(url)).toEqual({ file: "https://x.org/a.pdf", page: null, itemId: null });
  });

  it("ignores invalid pages", () => {
    expect(parseViewerUrl(BASE + "?file=x#page=0").page).toBe(null);
    expect(parseViewerUrl(BASE + "?file=x#page=abc").page).toBe(null);
  });

  it("detects PDF-looking and openable tab URLs", () => {
    expect(looksLikePdfUrl("https://x.org/a.PDF")).toBe(true);
    expect(looksLikePdfUrl("file:///tmp/a.pdf?x=1")).toBe(true);
    expect(looksLikePdfUrl("https://x.org/a.pdf.html")).toBe(false);
    expect(looksLikePdfUrl("chrome://extensions/a.pdf")).toBe(false);
    expect(isOpenableUrl("https://x.org/")).toBe(true);
    expect(isOpenableUrl("chrome-extension://abc/x")).toBe(false);
    expect(stripHash("https://x.org/a.pdf#p")).toBe("https://x.org/a.pdf");
  });
});

describe("addItem — PDF fields", () => {
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
    ctx = await Store.createContext("PDFs");
  });

  it("stores page and sourceTitle for valid pages", async () => {
    const it1 = await Store.addItem(ctx.id, {
      text: "x",
      category: "idea",
      sourceUrl: "https://x.org/paper.pdf",
      source: "paper.pdf",
      page: 2,
      sourceTitle: "paper.pdf",
    });
    expect(it1.page).toBe(2);
    expect(it1.sourceTitle).toBe("paper.pdf");
    expect(it1.source).toBe("paper.pdf");
  });

  it("drops invalid pages and leaves web items without PDF fields", async () => {
    for (const page of [0, -1, 2.5, "3"]) {
      const it1 = await Store.addItem(ctx.id, { text: "x", category: "idea", page, sourceTitle: "a.pdf" });
      expect("page" in it1).toBe(false);
      expect("sourceTitle" in it1).toBe(false);
    }
    const web = await Store.addItem(ctx.id, { text: "y", category: "idea", sourceUrl: "https://a.com/x" });
    expect("page" in web).toBe(false);
  });
});
