// @ts-check
/**
 * E2E coverage for feature 30 (editor_stale_buffer_cross_page) against the
 * real built extension: real chrome.storage.local, real side panel DOM, real
 * Monaco editor instance — none of which Vitest/jsdom exercises (that suite
 * only covers editor.isDirty()/docEditor.isDirty() as pure logic).
 *
 * Reproduces the reported bug exactly: the side panel sits in the Editor
 * (Monaco) tab for a Context while a capture is saved from elsewhere (a
 * different tab/page) — simulated here via the extension's own service
 * worker calling chrome.storage.local.set(), the same call a content script
 * makes from another page, instead of driving a real external website (kept
 * out of this suite the way 029's real-site spec does it, to stay fast and
 * deterministic).
 *
 * NOTE: "vista-edit" (the inline textarea mode described in spec 018) has no
 * reachable UI entry point in the current build — the pencil button that
 * used to trigger it was removed by a later redesign and nothing else calls
 * switchMode("vista-edit") (confirmed by grepping src/ for that string: 0
 * call sites besides the internal onEscape handler). docEditor.isDirty() is
 * still covered at the unit level (tests/030-editor-vista-dirty.test.js) but
 * there is no way to E2E-drive it through real UI today, so this file only
 * covers the Editor (Monaco) path — the one from the actual user report.
 */
import { test, expect } from "./fixtures.js";

const FIXTURE_CTX = {
  id: "ctx1",
  name: "Cross-Page",
  color: "#5b57e8",
  createdAt: 1700000000000,
  items: [
    { id: "sub1", type: "subtitle", category: "title", text: "Original" },
    {
      id: "txt1",
      type: "text",
      category: "idea",
      text: "Nota original en el contexto.",
      linkedSubtitleId: "sub1",
      source: null,
      sourceUrl: "",
    },
  ],
};

/** The service worker is the only context with chrome.storage access here. */
async function getWorker(context) {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker");
  return worker;
}

/**
 * Append an item to the given context directly in chrome.storage.local —
 * the same effect content-storage.js's addItem() has, without needing a real
 * page/content-script injection. Fires the same chrome.storage.onChanged
 * event the sidebar listener reacts to.
 */
async function simulateExternalCapture(context, ctxId, text) {
  const worker = await getWorker(context);
  return worker.evaluate(
    async ({ ctxId, text }) => {
      const { contextHighlighter } = await chrome.storage.local.get("contextHighlighter");
      const ctx = contextHighlighter.contexts[ctxId];
      const item = {
        id: "item-" + text.replace(/\s+/g, "-").toLowerCase(),
        type: "text",
        category: "idea",
        text,
        linkedSubtitleId: null,
        source: null,
        sourceUrl: "https://example.com/other-page",
      };
      ctx.items.push(item);
      await chrome.storage.local.set({ contextHighlighter });
      return item.id;
    },
    { ctxId, text }
  );
}

/** Current Monaco editor content, or null if no editor instance exists yet. */
async function getEditorValue(page) {
  return page.evaluate(() => window.monaco?.editor.getEditors()[0]?.getValue() ?? null);
}

test.beforeEach(async ({ page, extensionId, context }) => {
  await page.goto(`chrome-extension://${extensionId}/src/sidebar.html`);
  await page.evaluate(
    (ctx) =>
      new Promise((resolve) => {
        chrome.storage.local.set({ contextHighlighter: { contexts: { [ctx.id]: ctx } } }, resolve);
      }),
    FIXTURE_CTX
  );
  await page.reload();
  await page.getByRole("button", { name: "Editor" }).click();
  await expect.poll(() => getEditorValue(page)).not.toBeNull();
});

test("Editor limpio refleja en vivo capturas guardadas desde otra pestaña/página", async ({
  page,
  context,
}) => {
  const initial = await getEditorValue(page);
  expect(initial).toContain("Nota original en el contexto.");

  // Site A saves while the Editor tab is open and untouched.
  await simulateExternalCapture(context, FIXTURE_CTX.id, "Captura desde sitio A");
  await expect.poll(() => getEditorValue(page)).toContain("Captura desde sitio A");

  // Site B saves next, in the same browsing session — this is the exact bug
  // report: "el editor solo muestra la información del último sitio visitado".
  await simulateExternalCapture(context, FIXTURE_CTX.id, "Captura desde sitio B");
  await expect.poll(() => getEditorValue(page)).toContain("Captura desde sitio B");

  // Both captures must be visible together, not just the most recent one.
  const finalValue = await getEditorValue(page);
  expect(finalValue).toContain("Captura desde sitio A");
  expect(finalValue).toContain("Captura desde sitio B");
  expect(finalValue).toContain("Nota original en el contexto.");
});

test("Editor con cambios sin guardar no se pisa ante una captura externa", async ({
  page,
  context,
}) => {
  const typed = "Edicion sin guardar del usuario";
  await page.locator("#editor").click();
  await page.keyboard.press("End");
  await page.keyboard.type("\n\n" + typed);

  await expect(page.locator(".tab-dirty")).toBeVisible();
  const beforeValue = await getEditorValue(page);
  expect(beforeValue).toContain(typed);

  // Saved fast enough to land well before the 350ms autosave debounce, so
  // this checks the "don't clobber in-flight edits" branch specifically,
  // not a race against the editor's own autosave.
  await simulateExternalCapture(context, FIXTURE_CTX.id, "Captura mientras el usuario edita");
  await page.waitForTimeout(150);

  const afterValue = await getEditorValue(page);
  expect(afterValue).toBe(beforeValue);
  expect(afterValue).not.toContain("Captura mientras el usuario edita");
});
