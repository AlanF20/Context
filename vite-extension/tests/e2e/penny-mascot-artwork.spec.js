// @ts-check
/**
 * E2E coverage for the Penny mascot artwork wired into the sidebar UI
 * (onboarding modal, both empty states, and the delete-confirmation modal).
 * Not tied to a numbered harness feature — it's a branding asset swap — but
 * each spot is a new <img> in real DOM (sidebar.html/vista.js/sidebar.js/
 * modal.js), so per CLAUDE.md's testing rule it gets real specs instead of
 * only a manual check: only a real extension page proves Vite/CRXJS actually
 * resolved and shipped each asset path, which Vitest/jsdom never loads.
 */
import { test, expect } from "./fixtures.js";

/** Asserts an <img> inside `locator` is visible and actually loaded a real image. */
async function expectLoadedImage(locator) {
  await expect(locator).toBeVisible();
  const naturalWidth = await locator.evaluate(
    (img) => /** @type {HTMLImageElement} */ (img).naturalWidth
  );
  expect(naturalWidth).toBeGreaterThan(0);
}

test.beforeEach(async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/src/sidebar.html`);
});

test("onboarding modal renders the confused-Penny mascot", async ({ page }) => {
  // fixtures.js auto-dismisses the modal that opens on first visit; reopen
  // it deliberately via the rail's "?" button.
  await page.locator("#onboarding-help-btn").click();
  const dialog = page.locator("#onboarding-modal");
  await expect(dialog).toBeVisible();
  await expectLoadedImage(dialog.locator(".onboarding-mascot"));
});

test("no-contexts empty state renders the waving-Penny mascot", async ({ page }) => {
  // Fresh profile: chrome.storage.local starts with `contexts: {}`.
  await expectLoadedImage(page.locator("#body .state-mascot"));
  await expect(page.locator("#body .title")).toHaveText("Sin contextos todavía");
});

test("empty-context vista renders the drawing-Penny mascot", async ({ page }) => {
  await page.locator("#rail-add").click();
  await expectLoadedImage(page.locator("#body .state-mascot"));
  await expect(page.locator("#body .title")).toHaveText("Contexto vacío");
});

test("delete-confirmation modal renders the warning-Penny mascot", async ({ page }) => {
  await page.locator("#rail-add").click();
  await page.locator(".rail-chip-del").click();
  const dialog = page.locator("#confirm-delete-modal");
  await expect(dialog).toBeVisible();
  await expectLoadedImage(dialog.locator(".modal-mascot"));
});
