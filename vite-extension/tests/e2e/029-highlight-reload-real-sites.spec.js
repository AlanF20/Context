// @ts-check
/**
 * E2E coverage for feature 29: highlight real body text on a genuine external
 * page (no local fixture), reload, and prove the highlight was re-anchored.
 * Runs once per entry in tests/e2e/fixtures/test-sites.js — adding a new site
 * there is enough to get a new test here, no spec changes needed.
 *
 * content.js paints highlights via the CSS Custom Highlight API — explicitly
 * zero DOM mutation (see content.js's painter section), so there is no
 * `.ch-hl-*`-classed element to query from page.evaluate(). Instead this
 * spec reuses the CH_GET_ANCHOR_STATUS message channel content.js already
 * ships (the same one the anchor-status-strip panel feature relies on),
 * queried from the extension's service worker via chrome.tabs.sendMessage —
 * no manifest changes needed, since host_permissions already covers <all_urls>.
 */
import { test, expect } from "./fixtures.js";
import { TEST_SITES } from "./fixtures/test-sites.js";

const ANCHOR_TIMEOUT_MS = 20000; // large real pages (e.g. Wikipedia) take longer to index/re-anchor
const ANCHOR_POLL_INTERVAL_MS = 300;

/** The service worker is the only context with chrome.tabs access. */
async function getWorker(context) {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker");
  return worker;
}

/** Read the id of the item just saved for `url` from chrome.storage.local. */
async function findSavedItemId(context, url) {
  const worker = await getWorker(context);
  return worker.evaluate(async (targetUrl) => {
    const { contextHighlighter } = await chrome.storage.local.get("contextHighlighter");
    for (const ctx of Object.values(contextHighlighter?.contexts ?? {})) {
      for (const item of ctx.items ?? []) {
        if (item.sourceUrl === targetUrl) return item.id;
      }
    }
    return null;
  }, url);
}

/** Poll CH_GET_ANCHOR_STATUS until `itemId` reports 'anchored', or throw. */
async function waitForAnchorStatus(context, url, itemId) {
  const worker = await getWorker(context);
  const deadline = Date.now() + ANCHOR_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await worker.evaluate(
      async ({ targetUrl, targetItemId }) => {
        const [tab] = await chrome.tabs.query({ url: targetUrl });
        if (!tab) return null;
        const res = await chrome.tabs.sendMessage(tab.id, { type: "CH_GET_ANCHOR_STATUS" });
        return res?.statuses?.[targetItemId] ?? null;
      },
      { targetUrl: url, targetItemId: itemId }
    );
    if (status === "anchored") return;
    await new Promise((resolve) => setTimeout(resolve, ANCHOR_POLL_INTERVAL_MS));
  }
  throw new Error(`Item ${itemId} never reached 'anchored' status within ${ANCHOR_TIMEOUT_MS}ms`);
}

test.describe.configure({ retries: 1 }); // real third-party pages: accepted, documented flakiness

for (const SITE of TEST_SITES) {
  test(`highlight persists across reload — ${SITE.label}`, async ({ page, context }) => {
    test.setTimeout(60000); // real navigation + real network is legitimately slower than the local-fixture suite

    await page.goto(SITE.url);
    // Best-effort settle: real pages keep firing analytics/ad beacons that
    // never let 'networkidle' resolve on their own — cap it so a chatty site
    // (e.g. Medium) can't stall the whole test waiting for true silence.
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

    const paragraph = page.locator(SITE.articleSelector).first();
    await expect(paragraph).toBeVisible();
    const originalText = (await paragraph.textContent())?.trim() ?? "";
    expect(originalText.length).toBeGreaterThan(50);

    // scrollIntoViewIfNeeded() first: bounding-box/rect math below is relative
    // to the current scroll position and doesn't scroll on its own — an
    // off-viewport paragraph would yield mouse coordinates outside the
    // actual rendered frame, so no real text selection (and no mouseup)
    // would ever happen.
    await paragraph.scrollIntoViewIfNeeded();

    // Element.getBoundingClientRect()/getClientRects() return the paragraph's
    // own box, which can span space it doesn't actually render into — e.g. on
    // Wikipedia, the infobox floats right and article text wraps around it,
    // but the <p>'s own rect still covers the full column width including the
    // area under the float. A drag to that box's bottom-right corner can land
    // inside the infobox instead of the paragraph (confirmed via diagnostic:
    // the resulting selection was infobox text, not the paragraph). A Range
    // over the paragraph's contents reports one rect per actual rendered
    // line, correctly narrowed around any float — using its first/last line
    // is accurate for both floated (Wikipedia) and plain single-column
    // (Houston Methodist, Medium, AnkiWeb) layouts alike.
    const lineRects = await paragraph.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return Array.from(range.getClientRects())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height }));
    });
    if (!lineRects.length) throw new Error(`No rendered text line rects for ${SITE.articleSelector}`);
    const firstLine = lineRects[0];
    const lastLine = lineRects[lineRects.length - 1];

    // Real mouse drag, not a scripted Selection API call — content.js only
    // reacts to a native mouseup event. Target the vertical center of each
    // line rect, not its edge, so the browser's point-to-caret resolution
    // isn't ambiguous about which line it's on.
    await page.mouse.move(firstLine.x + 2, firstLine.y + firstLine.height / 2);
    await page.mouse.down();
    await page.mouse.move(lastLine.x + lastLine.width - 2, lastLine.y + lastLine.height / 2, { steps: 10 });
    await page.mouse.up();

    const toolbar = page.locator(".ch-toolbar");
    await expect(toolbar).toBeVisible();
    // force: true — .ch-toolbar-swatch:hover applies transform: scale(1.2),
    // which grows the button's box the instant the pointer lands on it.
    // Playwright's default click waits for the target to be "stable" (same
    // bounding box across two animation frames); the hover-triggered resize
    // never satisfies that, so the action stalls until the test timeout.
    // The click handler only cares about the click event, not a real hover.
    await toolbar.locator('.ch-toolbar-swatch[data-cat="idea"]').click({ force: true });

    // First visit to this URL: no context detected yet, so the swatch click
    // opens the full capture popup instead of a one-click fastSave.
    const popup = page.locator(".ch-pop");
    await expect(popup).toBeVisible();
    // Keep this short (a few chars, not the full SITE.label). On at least one
    // of these real pages, typing a long value into the combobox reliably
    // wipes document.body out from under us within ~200ms (confirmed via
    // diagnostic: reproducible with any ~40+ char string regardless of its
    // content, never with short ones) — almost certainly a CMS/personalization
    // script on that page reacting to input/focus changes, not our code. A
    // short constant name sidesteps it without depending on page internals.
    await popup.locator(".ch-combo-input").fill("E2E Test");
    await popup.locator('[data-role="save"]').click();
    await expect(popup).toBeHidden();

    const itemId = await findSavedItemId(context, SITE.url);
    expect(itemId).toBeTruthy();

    await page.reload();
    await waitForAnchorStatus(context, SITE.url, itemId);
  });
}
