import { defineConfig } from "vitest/config";

// Separate from vite.config.js on purpose: the CRXJS plugin there hooks into
// manifest/build transforms that unit tests don't need and shouldn't depend on.
export default defineConfig({
  test: {
    environment: "node", // most modules are pure logic; DOM-touching test
    // files opt into jsdom individually via a `// @vitest-environment jsdom`
    // docblock at the top of the file (see tests/028-export-menu.test.js).
    include: ["tests/**/*.test.js"],
  },
});
