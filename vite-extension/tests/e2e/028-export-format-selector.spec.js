// @ts-check
/**
 * E2E coverage for feature 28 (export_format_selector) against the real
 * built extension — the manual-only cases from docs/test_export_format_selector.md
 * that Vitest/jsdom structurally cannot cover: real chrome.storage.local,
 * real sidebar DOM, real file downloads, real dark-mode tokens.
 */
import { test, expect } from "./fixtures.js";

const FIXTURE_CTX = {
  id: "ctx1",
  name: "Cortisol",
  color: "#5b57e8",
  createdAt: 1700000000000,
  items: [
    { id: "sub1", type: "subtitle", category: "title", text: "Ritmo circadiano" },
    {
      id: "txt1",
      type: "text",
      category: "idea",
      text: "Alcanza su pico ~30 min tras despertar.",
      linkedSubtitleId: "sub1",
      source: "ncbi.nlm.nih.gov",
      sourceUrl: "https://ncbi.nlm.nih.gov/x",
    },
  ],
};

/** Read a Playwright Download's stream into a UTF-8 string. */
async function downloadText(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

test.beforeEach(async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/src/sidebar.html`);
  await page.evaluate(
    (ctx) =>
      new Promise((resolve) => {
        chrome.storage.local.set(
          { contextHighlighter: { contexts: { [ctx.id]: ctx } } },
          resolve
        );
      }),
    FIXTURE_CTX
  );
  await page.reload();
  await expect(page.getByRole("button", { name: "Exportar" })).toBeVisible();
});

test("Exportar opens a menu with Markdown and Anki options", async ({ page }) => {
  await page.getByRole("button", { name: "Exportar" }).click();
  await expect(page.getByRole("menuitem", { name: "Markdown (.md)" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Tarjetas Anki (.txt)" })).toBeVisible();
});

test("exports a Markdown file matching the persisted context", async ({ page }) => {
  await page.getByRole("button", { name: "Exportar" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Markdown (.md)" }).click(),
  ]);

  expect(download.suggestedFilename()).toBe("Cortisol.md");
  const content = await downloadText(download);
  expect(content).toContain("# Cortisol");
  expect(content).toContain("## Ritmo circadiano");
  expect(content).toContain("🟡 Alcanza su pico ~30 min tras despertar.");
});

test("exports an Anki TSV deck matching the persisted context", async ({ page }) => {
  await page.getByRole("button", { name: "Exportar" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Tarjetas Anki (.txt)" }).click(),
  ]);

  expect(download.suggestedFilename()).toBe("Cortisol.anki.txt");
  const content = await downloadText(download);
  const lines = content.split("\n");
  expect(lines.slice(0, 3)).toEqual(["#separator:tab", "#html:false", "#tags column:3"]);
  expect(content).toContain('¿Qué Idea se capturó sobre "Ritmo circadiano"?');
  expect(content).toContain("Fuente: ncbi.nlm.nih.gov");
});

test("Exportar has no memory of the last format chosen", async ({ page }) => {
  await page.getByRole("button", { name: "Exportar" }).click();
  await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Tarjetas Anki (.txt)" }).click(),
  ]);

  // Reopen: both options are shown again, with no visual "last used" marker.
  await page.getByRole("button", { name: "Exportar" }).click();
  const items = page.getByRole("menuitem");
  await expect(items).toHaveCount(2);
  for (const cls of await items.evaluateAll((els) => els.map((el) => el.className))) {
    expect(cls).not.toMatch(/selected|active|recent/);
  }
});

test("dark mode applies the panel's dark tokens", async ({ page }) => {
  await page.getByTitle("Cambiar tema").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  const bg = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--bg").trim()
  );
  expect(bg).toBe("#1c1c1f");
});
