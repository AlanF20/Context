import { describe, it, expect } from "vitest";
import { Store } from "../src/sidebar/store.js";
import { EXPORT_FORMATS, buildAnkiExport } from "../src/sidebar/export-formats.js";

/**
 * Fixture mirrors the real ctx.items shape (storage.js addItem output), not a
 * mock: buildAnkiExport is pure and only reads plain fields off these objects.
 */
function fixtureContext() {
  return {
    id: "ctx1",
    name: "Cortisol",
    color: "#5b57e8",
    createdAt: 0,
    items: [
      { id: "sub1", type: "subtitle", category: "title", text: "Ritmo circadiano" },
      {
        id: "txt1",
        type: "text",
        category: "idea",
        text: "Alcanza su pico ~30 min tras despertar.",
        linkedSubtitleId: "sub1",
        source: "ncbi.nlm.nih.gov",
      },
      {
        id: "txt2",
        type: "text",
        category: "evidence",
        text: "Estudio X confirma Y",
        linkedSubtitleId: "sub1",
        source: "",
      },
      {
        id: "txt4",
        type: "text",
        category: "idea",
        text: "Texto con\ttab y\nsalto de línea",
        linkedSubtitleId: "sub1",
        source: null,
      },
      { id: "sub2", type: "subtitle", category: "title", text: "Sección vacía" },
      {
        id: "txt3",
        type: "text",
        category: "argument",
        text: "Sin subtítulo padre",
        linkedSubtitleId: null,
        source: "nature.com",
      },
      {
        id: "txt5",
        type: "text",
        category: null,
        text: "Item legado sin categoría",
        linkedSubtitleId: null,
        source: "",
      },
    ],
  };
}

/** Split a generated deck into { header, rows } for assertions. */
function parseDeck(tsv) {
  const lines = tsv.split("\n");
  const header = lines.slice(0, 3);
  const rows = lines
    .slice(3)
    .filter((l) => l.length > 0)
    .map((l) => l.split("\t"));
  return { header, rows };
}

// Item cards ("¿Qué {label} ...") and subtitle summary cards ("¿De qué trata
// la sección ...") share the deck, and two idea/argument/evidence items under
// the same subtitle can produce an identical Front — so item rows are always
// located by their (unique) Back text, never by Front alone.
const isItemCard = (row) => row[0].startsWith("¿Qué ");
const isSummaryCard = (row) => row[0].startsWith("¿De qué trata la sección");

function findItemRow(rows, backSubstring) {
  return rows.filter(isItemCard).find((r) => r[1].includes(backSubstring));
}
function findSummaryRow(rows, subtitleText) {
  return rows.filter(isSummaryCard).find((r) => r[0].includes(subtitleText));
}

describe("buildAnkiExport", () => {
  it("returns an empty string for a null context", () => {
    expect(buildAnkiExport(null)).toBe("");
  });

  it("emits the standard Anki plain-text import header", () => {
    const { header } = parseDeck(buildAnkiExport(fixtureContext()));
    expect(header).toEqual(["#separator:tab", "#html:false", "#tags column:3"]);
  });

  it("builds a question referencing the parent subtitle for a nested text item", () => {
    const { rows } = parseDeck(buildAnkiExport(fixtureContext()));
    const row = findItemRow(rows, "Alcanza su pico");
    expect(row[0]).toBe('¿Qué Idea se capturó sobre "Ritmo circadiano"?');
  });

  it("appends the source as a 'Fuente:' suffix when the item has one", () => {
    const { rows } = parseDeck(buildAnkiExport(fixtureContext()));
    const row = findItemRow(rows, "Alcanza su pico");
    expect(row[1]).toBe("Alcanza su pico ~30 min tras despertar. — Fuente: ncbi.nlm.nih.gov");
  });

  it("omits the 'Fuente:' suffix when the item has no source", () => {
    const { rows } = parseDeck(buildAnkiExport(fixtureContext()));
    const row = findItemRow(rows, "Estudio X confirma Y");
    expect(row[1]).toBe("Estudio X confirma Y");
  });

  it("falls back to the context name when a text item has no parent subtitle", () => {
    const { rows } = parseDeck(buildAnkiExport(fixtureContext()));
    const row = findItemRow(rows, "Sin subtítulo padre");
    expect(row[0]).toBe("¿Qué Argumento se capturó en Cortisol?");
  });

  it("falls back to the 'Nota' label for items with no category", () => {
    const { rows } = parseDeck(buildAnkiExport(fixtureContext()));
    const row = findItemRow(rows, "Item legado sin categoría");
    expect(row[0]).toBe("¿Qué Nota se capturó en Cortisol?");
  });

  it("produces a summary card for a subtitle with children, listing each child's category label in order", () => {
    const { rows } = parseDeck(buildAnkiExport(fixtureContext()));
    const row = findSummaryRow(rows, "Ritmo circadiano");
    expect(row[0]).toBe('¿De qué trata la sección "Ritmo circadiano"?');
    expect(row[1]).toBe(
      "Idea: Alcanza su pico ~30 min tras despertar. / Evidencia: Estudio X confirma Y / Idea: Texto con tab y salto de línea"
    );
  });

  it("produces no card for a subtitle with no children", () => {
    const { rows } = parseDeck(buildAnkiExport(fixtureContext()));
    expect(findSummaryRow(rows, "Sección vacía")).toBeUndefined();
  });

  it("collapses tabs and newlines inside a field to a single space, keeping the row to 3 columns", () => {
    const { rows } = parseDeck(buildAnkiExport(fixtureContext()));
    const row = findItemRow(rows, "Texto con");
    expect(row).toHaveLength(3);
    expect(row[1]).not.toMatch(/\t|\n/);
    expect(row[1]).toBe("Texto con tab y salto de línea");
  });

  it("tags a text-item row with its category id, sanitized source hostname, and sanitized context name", () => {
    const { rows } = parseDeck(buildAnkiExport(fixtureContext()));
    const row = findItemRow(rows, "Alcanza su pico");
    expect(row[2]).toBe("idea ncbi_nlm_nih_gov cortisol");
  });

  it("omits a tag token entirely rather than inventing one for a missing category/source", () => {
    const { rows } = parseDeck(buildAnkiExport(fixtureContext()));
    const row = findItemRow(rows, "Item legado sin categoría");
    expect(row[2]).toBe("cortisol");
  });

  it("tags a subtitle summary row with 'subtitle' plus the sanitized context name", () => {
    const { rows } = parseDeck(buildAnkiExport(fixtureContext()));
    const row = findSummaryRow(rows, "Ritmo circadiano");
    expect(row[2]).toBe("subtitle cortisol");
  });
});

describe("EXPORT_FORMATS", () => {
  it("exposes exactly the markdown and anki formats with the expected metadata", () => {
    expect(EXPORT_FORMATS.map((f) => f.id)).toEqual(["markdown", "anki"]);
    const markdown = EXPORT_FORMATS.find((f) => f.id === "markdown");
    const anki = EXPORT_FORMATS.find((f) => f.id === "anki");
    expect(markdown).toMatchObject({ extension: "md", mime: "text/markdown" });
    expect(anki).toMatchObject({ extension: "anki.txt", mime: "text/plain" });
  });

  it("markdown.build delegates to Store.buildMd without altering its output", () => {
    const ctx = fixtureContext();
    const markdown = EXPORT_FORMATS.find((f) => f.id === "markdown");
    expect(markdown.build(ctx)).toBe(Store.buildMd(ctx));
  });

  it("anki.build matches buildAnkiExport for the same context", () => {
    const ctx = fixtureContext();
    const anki = EXPORT_FORMATS.find((f) => f.id === "anki");
    expect(anki.build(ctx)).toBe(buildAnkiExport(ctx));
  });
});
