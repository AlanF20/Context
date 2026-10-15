// Feature 37 guardrail — the built content script must stay self-contained.
// Chrome runs content scripts as classic scripts: an `import` (static or
// dynamic loader) means some module became a shared chunk with an extension
// page, which breaks capture silently (the feature 31 incident). Runs only
// when dist/ exists (after `pnpm run build`).
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const dist = path.resolve(__dirname, "../dist");
const hasDist = existsSync(path.join(dist, "manifest.json"));

describe.skipIf(!hasDist)("built content script bundle", () => {
  it("has no import/export and no dynamic loader", () => {
    const manifest = JSON.parse(readFileSync(path.join(dist, "manifest.json"), "utf8"));
    for (const script of manifest.content_scripts) {
      for (const file of script.js) {
        const code = readFileSync(path.join(dist, file), "utf8");
        expect(code, file).not.toMatch(/(^|[;}])\s*import\s*(\{|\*|["'`]|[\w$]+\s*(,|from\b))/m);
        expect(code, file).not.toMatch(/(^|[;}])\s*export\s*(\{|\*|default\b|const\b|function\b|let\b|class\b)/m);
        expect(code, file).not.toMatch(/\bimport\s*\(/);
      }
    }
  });
});
