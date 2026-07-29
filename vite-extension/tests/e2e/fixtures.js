// @ts-check
/**
 * fixtures.js — Playwright fixtures that load the built extension (dist/)
 * into a real, persistent Chromium context, the only way to exercise real
 * chrome.storage.local + a real DOM + real file downloads. Vitest (jsdom)
 * can't do any of that — this is what closes the "still manual" gap in
 * docs/test_export_format_selector.md.
 *
 * Requires `pnpm run build` to have produced vite-extension/dist/ first.
 */
import { test as base, chromium } from "@playwright/test";
import path from "node:path";

// process.cwd() is vite-extension/ (where playwright.config.js lives) —
// avoiding import.meta.url on purpose, since Playwright's default transform
// for plain .js files doesn't support it without "type": "module".
const pathToExtension = path.resolve(process.cwd(), "dist");

export const test = base.extend({
  context: async ({}, use) => {
    // headless: true resolves to Playwright's chrome-headless-shell binary,
    // which only implements Chromium's OLD headless mode — and old headless
    // cannot load extensions at all. Headed is the reliable option; this is a
    // real desktop session, not a headless CI box.
    const context = await chromium.launchPersistentContext("", {
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent("serviceworker");
    await use(worker.url().split("/")[2]);
  },
  page: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
    await page.close();
  },
});

export const expect = test.expect;
