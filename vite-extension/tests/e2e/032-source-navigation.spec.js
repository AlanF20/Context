// @ts-check
/**
 * E2E coverage for feature 32 (highlight_source_navigation): the Vista's
 * per-page "go to source" icon, and the real chrome.tabs focus-or-create +
 * scroll-to-highlight behavior behind it. None of this is reachable from
 * Vitest/jsdom — it needs a real side panel page, real chrome.tabs, and a
 * real content script session.
 *
 * Reuses 029's real-external-site capture technique (content.js only reacts
 * to a native mouseup, never the Selection API) so the captured item carries
 * genuine anchoring metadata (rangePrefix/rangeSuffix/rangeStart/rangeEnd) —
 * required for the scroll-after-anchor behavior under test, which a
 * synthetic chrome.storage.local insert (as in 030) can't provide.
 */
import { test, expect } from "./fixtures.js";
import { TEST_SITES } from "./fixtures/test-sites.js";

const SITE = TEST_SITES[0];
const ANCHOR_TIMEOUT_MS = 20000;
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

/**
 * Poll CH_GET_ANCHOR_STATUS on the tab for `url` until `itemId` is 'anchored'.
 * On a freshly-created tab (feature 32's "no open tab" path), the tab entry
 * can exist before its content script has attached its onMessage listener —
 * chrome.tabs.sendMessage rejects with "Could not establish connection" for
 * that brief window. Swallow it and keep polling instead of letting it kill
 * the whole wait, the same way an absent tab (no `tab` yet) already does.
 */
async function waitForAnchorStatus(context, url, itemId) {
  const worker = await getWorker(context);
  const deadline = Date.now() + ANCHOR_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await worker.evaluate(
      async ({ targetUrl, targetItemId }) => {
        const [tab] = await chrome.tabs.query({ url: targetUrl });
        if (!tab) return null;
        try {
          const res = await chrome.tabs.sendMessage(tab.id, { type: "CH_GET_ANCHOR_STATUS" });
          return res?.statuses?.[targetItemId] ?? null;
        } catch (_) {
          return null; // content script not attached yet — retry on the next poll
        }
      },
      { targetUrl: url, targetItemId: itemId }
    );
    if (status === "anchored") return;
    await new Promise((resolve) => setTimeout(resolve, ANCHOR_POLL_INTERVAL_MS));
  }
  throw new Error(`Item ${itemId} never reached 'anchored' status within ${ANCHOR_TIMEOUT_MS}ms`);
}

async function countTabsForUrl(context, url) {
  const worker = await getWorker(context);
  const tabs = await worker.evaluate((targetUrl) => chrome.tabs.query({ url: targetUrl }), url);
  return tabs.length;
}

/** Drag-select the site's article paragraph and save it under a new context — same technique as 029. */
async function captureHighlight(page) {
  await page.goto(SITE.url);
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

  const paragraph = page.locator(SITE.articleSelector).first();
  await expect(paragraph).toBeVisible();
  await paragraph.scrollIntoViewIfNeeded();

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

  await page.mouse.move(firstLine.x + 2, firstLine.y + firstLine.height / 2);
  await page.mouse.down();
  await page.mouse.move(lastLine.x + lastLine.width - 2, lastLine.y + lastLine.height / 2, { steps: 10 });
  await page.mouse.up();

  const toolbar = page.locator(".ch-toolbar");
  await expect(toolbar).toBeVisible();
  await toolbar.locator('.ch-toolbar-swatch[data-cat="idea"]').click({ force: true });

  const popup = page.locator(".ch-pop");
  await expect(popup).toBeVisible();
  await popup.locator(".ch-combo-input").fill("E2E Source Nav");
  await popup.locator('[data-role="save"]').click();
  await expect(popup).toBeHidden();
}

test.describe.configure({ retries: 1 }); // real third-party page: accepted, documented flakiness

test.describe(`feature 32 — go to source (${SITE.label})`, () => {
  test("Vista muestra un único control de grupo por página, con el dominio visible pero nunca la URL completa", async ({
    page,
    context,
    extensionId,
  }) => {
    test.setTimeout(60000);
    await captureHighlight(page);
    const itemId = await findSavedItemId(context, SITE.url);
    expect(itemId).toBeTruthy();

    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/src/sidebar.html`);

    const headers = panel.locator(".vista-source-header");
    await expect(headers).toHaveCount(1);

    const hostname = new URL(SITE.url).hostname.replace(/^www\./, "");
    const link = headers.locator(".vista-source-link");
    await expect(link).toHaveAttribute("aria-label", new RegExp(hostname));
    // The hostname is now shown as visible text next to the icon (feature 32
    // amendment) — but the scheme/full URL never is.
    await expect(link.locator(".vista-source-label")).toHaveText(hostname);

    const previewText = (await panel.locator(".vista-md-preview").innerText()).toLowerCase();
    expect(previewText).not.toContain("http://");
    expect(previewText).not.toContain("https://");

    await panel.close();
  });

  test("click con la pestaña ya abierta la enfoca (no crea una duplicada) y no rompe la sesión de anclaje", async ({
    page,
    context,
    extensionId,
  }) => {
    test.setTimeout(60000);
    await captureHighlight(page);
    const itemId = await findSavedItemId(context, SITE.url);
    await waitForAnchorStatus(context, SITE.url, itemId);

    const before = await countTabsForUrl(context, SITE.url);
    expect(before).toBe(1);

    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/src/sidebar.html`);
    await panel.locator(".vista-source-link").click();

    // Focusing is async (tabs.update + windows.update + sendMessage) — poll
    // instead of asserting immediately.
    await expect.poll(() => countTabsForUrl(context, SITE.url)).toBe(1);

    const worker = await getWorker(context);
    const activeMatch = await worker.evaluate(
      (targetUrl) => chrome.tabs.query({ url: targetUrl, active: true }),
      SITE.url
    );
    expect(activeMatch.length).toBe(1);

    await panel.close();
  });

  test("click sin pestaña abierta crea una nueva y termina anclando el resaltado", async ({
    page,
    context,
    extensionId,
  }) => {
    test.setTimeout(60000);
    await captureHighlight(page);
    const itemId = await findSavedItemId(context, SITE.url);
    await waitForAnchorStatus(context, SITE.url, itemId);

    await page.close(); // no tab left open for SITE.url
    expect(await countTabsForUrl(context, SITE.url)).toBe(0);

    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/src/sidebar.html`);
    await panel.locator(".vista-source-link").click();

    await expect.poll(() => countTabsForUrl(context, SITE.url), { timeout: 15000 }).toBe(1);
    await waitForAnchorStatus(context, SITE.url, itemId);

    await panel.close();
  });
});
