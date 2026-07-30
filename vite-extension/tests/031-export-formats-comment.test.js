import { describe, it, expect } from "vitest";
import { buildAnkiExport } from "../src/sidebar/export-formats.js";

function fixtureContext(items) {
  return { id: "ctx1", name: "Cortisol", color: "#5b57e8", createdAt: 0, items };
}

function parseDeck(tsv) {
  return tsv
    .split("\n")
    .slice(3)
    .filter((l) => l.length > 0)
    .map((l) => l.split("\t"));
}

describe("buildAnkiRows — comment in the Back field (feature 031)", () => {
  it("inserts 'Comentario: {comment}' between the text and the 'Fuente:' segment", () => {
    const ctx = fixtureContext([
      {
        id: "t1",
        type: "text",
        category: "idea",
        text: "Alcanza su pico ~30 min tras despertar.",
        linkedSubtitleId: null,
        source: "ncbi.nlm.nih.gov",
        comment: "revisar en el próximo repaso",
      },
    ]);
    const [row] = parseDeck(buildAnkiExport(ctx));
    expect(row[1]).toBe(
      "Alcanza su pico ~30 min tras despertar. — Comentario: revisar en el próximo repaso — Fuente: ncbi.nlm.nih.gov"
    );
  });

  it("omits the comment segment entirely when the item has none (no regression)", () => {
    const ctx = fixtureContext([
      {
        id: "t1",
        type: "text",
        category: "evidence",
        text: "Estudio X confirma Y",
        linkedSubtitleId: null,
        source: "nature.com",
        comment: null,
      },
    ]);
    const [row] = parseDeck(buildAnkiExport(ctx));
    expect(row[1]).toBe("Estudio X confirma Y — Fuente: nature.com");
  });

  it("shows the comment even when there is no source", () => {
    const ctx = fixtureContext([
      {
        id: "t1",
        type: "text",
        category: "argument",
        text: "Sin fuente",
        linkedSubtitleId: null,
        source: "",
        comment: "nota suelta",
      },
    ]);
    const [row] = parseDeck(buildAnkiExport(ctx));
    expect(row[1]).toBe("Sin fuente — Comentario: nota suelta");
  });

  it("collapses tabs/newlines inside a comment like any other TSV field", () => {
    const ctx = fixtureContext([
      {
        id: "t1",
        type: "text",
        category: "idea",
        text: "Texto",
        linkedSubtitleId: null,
        source: "",
        comment: "con\ttab y\nsalto",
      },
    ]);
    const [row] = parseDeck(buildAnkiExport(ctx));
    expect(row[1]).toBe("Texto — Comentario: con tab y salto");
    expect(row).toHaveLength(3);
  });
});
