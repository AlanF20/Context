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

/**
 * The onboarding modal (feature 33) auto-opens on any fresh Chromium profile
 * — its "seen" flag lives inside the same chrome.storage.local object as
 * `contexts` (src/storage.js hasSeenOnboarding/markOnboardingSeen), and every
 * E2E profile here starts empty. Left alone it's a native <dialog> that
 * intercepts every click until dismissed, breaking any spec that opens the
 * side panel (feature 35).
 *
 * Seeding the flag once wouldn't survive specs that overwrite the WHOLE
 * contextHighlighter object to plant their own fixture data (028, 030) —
 * that wipes onboardingSeen back to falsy, and the modal reopens on the next
 * reload. So instead of seeding storage, this watches every page's DOM
 * content loads (not just the first) and closes the modal whenever it shows.
 */
async function autoDismissOnboarding(page) {
  if (!page.url().includes("sidebar.html")) return; // skip real sites, about:blank — no such element there
  const dialog = page.locator("#onboarding-modal");
  const opened = await dialog
    .waitFor({ state: "visible", timeout: 1500 })
    .then(() => true)
    .catch(() => false);
  if (!opened) return;
  await dialog.locator(".onboarding-close").click().catch(() => {});
}

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
    // 'page' fires for every page in this context — the fixture's own `page`
    // below, and any context.newPage() a spec creates itself (032, 034).
    // domcontentloaded is re-subscribed per page (not one-shot) so a modal
    // that reopens after a spec's own storage overwrite + reload gets closed
    // again too.
    context.on("page", (newPage) => {
      newPage.on("domcontentloaded", () => {
        autoDismissOnboarding(newPage).catch(() => {});
      });
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
