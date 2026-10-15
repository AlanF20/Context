// Feature 37 — findMatch over a PDF.js text layer. The layer's spans are
// concatenated with NO separator between lines (PDF.js inserts <br>, which
// adds nothing to Range.toString()), so quotes must be matched in that space.
import { describe, it, expect } from "vitest";
import { findMatch } from "../src/anchor.js";

const RAW =
  "Introducción al tema.La memoria de trabajo tiene capacidad limitadasegún Baddeley, y su modelo incluye un buffer episó-dico que integra información.";

describe("findMatch on text-layer text", () => {
  it("finds a quote spanning a line break with prefix/suffix", () => {
    const quote = "La memoria de trabajo tiene capacidad limitadasegún Baddeley";
    const start = RAW.indexOf(quote);
    const hit = findMatch(RAW, {
      quote,
      prefix: "Introducción al tema.",
      suffix: ", y su modelo",
      hintStart: start,
      hintEnd: start + quote.length,
    });
    expect(hit).toEqual({ start, end: start + quote.length });
  });

  it("finds it without position hints (re-rendered layer, offsets lost)", () => {
    const quote = "capacidad limitadasegún";
    const hit = findMatch(RAW, { quote, prefix: "de trabajo tiene ", suffix: " Baddeley" });
    expect(RAW.slice(hit.start, hit.end)).toBe(quote);
  });

  it("matches a hyphenated line-break word as stored", () => {
    const quote = "buffer episó-dico";
    const hit = findMatch(RAW, { quote, prefix: "incluye un ", suffix: " que integra" });
    expect(RAW.slice(hit.start, hit.end)).toBe(quote);
  });
});
