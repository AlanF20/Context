// Feature 37 — Anki cards cite the PDF page next to the file name.
import { describe, it, expect } from "vitest";
import { buildAnkiExport } from "../src/sidebar/export-formats.js";

function backOf(tsv, text) {
  const row = tsv
    .split("\n")
    .slice(3)
    .map((l) => l.split("\t"))
    .find((r) => (r[1] || "").startsWith(text));
  return row && row[1];
}

describe("buildAnkiExport — PDF items", () => {
  const ctx = {
    id: "c",
    name: "Memoria",
    items: [
      { id: "a", type: "text", category: "idea", text: "Nota PDF", source: "paper.pdf", sourceTitle: "paper.pdf", page: 7 },
      { id: "b", type: "text", category: "idea", text: "Nota web", source: "nih.gov" },
    ],
  };

  it("appends ', p. N' for PDF items", () => {
    expect(backOf(buildAnkiExport(ctx), "Nota PDF")).toBe("Nota PDF — Fuente: paper.pdf, p. 7");
  });

  it("leaves web items unchanged", () => {
    expect(backOf(buildAnkiExport(ctx), "Nota web")).toBe("Nota web — Fuente: nih.gov");
  });
});
