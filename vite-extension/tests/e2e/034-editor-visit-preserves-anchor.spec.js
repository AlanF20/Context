// @ts-check
/**
 * E2E coverage for feature 34 (editor_tab_switch_persistence_bug).
 *
 * Bug: switching the side panel to the Editor (Monaco) tab and back to Vista
 * — without typing anything — used to call editor.flush() unconditionally,
 * which persisted via Store.replaceContextFromMarkdown() and wiped
 * sourceUrl/rangePrefix/rangeSuffix/rangeText/rangeStart/rangeEnd for EVERY
 * item in the context. The note text survived (parseMd/buildMd round-trip
 * preserves it), but content.js's anchor session
 * (`it.sourceUrl === url && it.rangePrefix != null`, content.js:940) could no
 * longer find the item after a page reload, so the highlight never re-painted
 * — and contextForThisPage() (content.js:176) lost the sourceUrl match too,
 * so the capture toolbar stopped showing the "detected context" dot.
 *
 * Reuses 029/032's real-external-site drag-select technique (content.js only
 * reacts to a native mouseup) so the captured item carries genuine anchoring
 * metadata, and 029/032's CH_GET_ANCHOR_STATUS polling to prove re-anchoring
 * actually happens post-fix — a synthetic chrome.storage.local insert (as in
 * 030) wouldn't exercise the real anchor fields this bug destroys.
 */
import { test, expect } from "./fixtures.js";
import { TEST_SITES } from "./fixtures/test-sites.js";

const SITE = TEST_SITES[0];
const ANCHOR_TIMEOUT_MS = 20000;
const ANCHOR_POLL_INTERVAL_MS = 300;
const NEVER_ANCHORED_WINDOW_MS = 6000; // TC-03: prove it stays un-anchored, not just "not yet"

/** The service worker is the only context with chrome.tabs/storage access here. */
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

/** Poll CH_GET_ANCHOR_STATUS on the tab for `url` until `itemId` is 'anchored', or throw. */
async function waitForAnchorStatus(context, url, itemId) {
  const worker = await getWorker(context);
  const deadline = Date.now() + ANCHOR_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await readAnchorStatus(worker, url, itemId);
    if (status === "anchored") return;
    await new Promise((resolve) => setTimeout(resolve, ANCHOR_POLL_INTERVAL_MS));
  }
  throw new Error(`Item ${itemId} never reached 'anchored' status within ${ANCHOR_TIMEOUT_MS}ms`);
}

/** Poll for `windowMs` and assert the item never reaches 'anchored' (legitimate anchor loss). */
async function assertNeverAnchored(context, url, itemId, windowMs) {
  const worker = await getWorker(context);
  const deadline = Date.now() + windowMs;
  while (Date.now() < deadline) {
    const status = await readAnchorStatus(worker, url, itemId);
    expect(status).not.toBe("anchored");
    await new Promise((resolve) => setTimeout(resolve, ANCHOR_POLL_INTERVAL_MS));
  }
}

async function readAnchorStatus(worker, url, itemId) {
  return worker.evaluate(
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
}

/** Current Monaco editor content, or null if no editor instance exists yet. */
async function getEditorValue(panel) {
  return panel.evaluate(() => window.monaco?.editor.getEditors()[0]?.getValue() ?? null);
}

/**
 * Prepend `text` to the first non-blank, non-heading line of the mounted
 * Monaco document — i.e. the first captured item's own line — via
 * executeEdits (fires onDidChangeModelContent exactly like real typing would,
 * driving editor.js's debounced sync) rather than keyboard navigation, which
 * would land on an unpredictable line depending on click position/content
 * height.
 */
async function editFirstItemLine(panel, text) {
  const value = await getEditorValue(panel);
  const lines = value.split("\n");
  const idx = lines.findIndex((l) => l.trim() && !l.trim().startsWith("#"));
  if (idx === -1) throw new Error("No item line found in editor content");
  await panel.evaluate(
    ({ lineNumber, insertText }) => {
      const ed = window.monaco.editor.getEditors()[0];
      const range = new window.monaco.Range(lineNumber, 1, lineNumber, 1);
      ed.executeEdits("e2e-test", [{ range, text: insertText }]);
    },
    { lineNumber: idx + 1, insertText: text }
  );
}

/** Drag-select the site's article paragraph and save it under a new context — same technique as 029/032. */
async function captureHighlight(page, contextName) {
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
  await popup.locator(".ch-combo-input").fill(contextName);
  await popup.locator('[data-role="save"]').click();
  await expect(popup).toBeHidden();
}

test.describe.configure({ retries: 1 }); // real third-party page: accepted, documented flakiness

test.describe(`feature 34 — visitar Editor sin editar no rompe el re-highlight (${SITE.label})`, () => {
  test("Editor sin editar: el highlight se re-ancla tras reload y la toolbar sigue detectando el contexto", async ({
    page,
    context,
    extensionId,
  }) => {
    test.setTimeout(60000);
    await captureHighlight(page, "E2E Editor Visit");
    const itemId = await findSavedItemId(context, SITE.url);
    expect(itemId).toBeTruthy();

    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/src/sidebar.html`);
    await panel.getByRole("button", { name: "Editor" }).click();
    await expect.poll(() => getEditorValue(panel)).not.toBeNull();

    // Leave the Editor tab without typing anything.
    await panel.getByRole("button", { name: "Vista" }).click();
    await panel.close();

    await page.reload();
    await waitForAnchorStatus(context, SITE.url, itemId);

    // contextForThisPage() must still find this context via sourceUrl —
    // re-select text to trigger the toolbar and check its detected-context dot.
    const paragraph = page.locator(SITE.articleSelector).first();
    await paragraph.scrollIntoViewIfNeeded();
    const rect = await paragraph.evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      const rects = Array.from(r.getClientRects()).filter((x) => x.width > 0 && x.height > 0);
      const first = rects[0];
      return { x: first.x, y: first.y, height: first.height };
    });
    await page.mouse.move(rect.x + 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + 40, rect.y + rect.height / 2, { steps: 5 });
    await page.mouse.up();

    const toolbar = page.locator(".ch-toolbar");
    await expect(toolbar).toBeVisible();
    await expect(toolbar.locator(".ch-toolbar-ctx-dot")).toBeVisible();
  });

  test("Editor con una edición real sobre la PROPIA línea del ítem: ese ítem sigue sin re-anclar (sin regresión de spec 004/027)", async ({
    page,
    context,
    extensionId,
  }) => {
    test.setTimeout(60000);
    await captureHighlight(page, "E2E Editor Edit");
    const itemId = await findSavedItemId(context, SITE.url);
    expect(itemId).toBeTruthy();
    await waitForAnchorStatus(context, SITE.url, itemId); // sanity: it does anchor before any edit

    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/src/sidebar.html`);
    await panel.getByRole("button", { name: "Editor" }).click();
    await expect.poll(() => getEditorValue(panel)).not.toBeNull();

    // Edit the captured item's OWN text (its (type, category, text) key must
    // actually change) — appending unrelated text elsewhere in the document,
    // as this test used to do, leaves the item's own line byte-identical, so
    // Store.replaceContextFromMarkdown's reconciliation now correctly keeps
    // ITS anchor. Only a real edit to the item's own line still hits the
    // documented spec 004/027 limitation this test is meant to pin.
    await editFirstItemLine(panel, "[editado] ");
    await expect(panel.locator(".tab-dirty")).toBeVisible();

    await panel.getByRole("button", { name: "Vista" }).click();
    await panel.close();

    await page.reload();
    await assertNeverAnchored(context, SITE.url, itemId, NEVER_ANCHORED_WINDOW_MS);
  });

  test("Editar un ítem no perturba el ancla de OTRO ítem sin tocar en el mismo contexto (bug reportado)", async ({
    page,
    context,
    extensionId,
  }) => {
    test.setTimeout(90000);
    // TEST_SITES[1] (Medium) is documented as flaky re-anchoring even with no
    // edit at all (its own fixture comment: paywall/upsell overlay risk) —
    // confirmed independently while writing this test, so [2] (AnkiWeb docs)
    // is used here for a second, stable real page instead.
    const OTHER_SITE = TEST_SITES[2];

    await captureHighlight(page, "E2E Multi Item");
    const firstItemId = await findSavedItemId(context, SITE.url);
    expect(firstItemId).toBeTruthy();
    await waitForAnchorStatus(context, SITE.url, firstItemId);

    // Capture a second highlight, on a different page, into the SAME context.
    const page2 = await context.newPage();
    await page2.goto(OTHER_SITE.url);
    await page2.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    const paragraph2 = page2.locator(OTHER_SITE.articleSelector).first();
    await expect(paragraph2).toBeVisible();
    await paragraph2.scrollIntoViewIfNeeded();
    const rect2 = await paragraph2.evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      const rects = Array.from(r.getClientRects()).filter((x) => x.width > 0 && x.height > 0);
      const first = rects[0];
      return { x: first.x, y: first.y, width: first.width, height: first.height };
    });
    await page2.mouse.move(rect2.x + 2, rect2.y + rect2.height / 2);
    await page2.mouse.down();
    await page2.mouse.move(rect2.x + Math.min(rect2.width - 2, 200), rect2.y + rect2.height / 2, { steps: 10 });
    await page2.mouse.up();
    const toolbar2 = page2.locator(".ch-toolbar");
    await expect(toolbar2).toBeVisible();
    await toolbar2.locator('.ch-toolbar-swatch[data-cat="argument"]').click({ force: true });
    const popup2 = page2.locator(".ch-pop");
    await expect(popup2).toBeVisible();
    await popup2.locator(".ch-combo-input").fill("E2E Multi Item");
    await popup2.locator('[data-role="save"]').click();
    await expect(popup2).toBeHidden();

    const secondItemId = await findSavedItemId(context, OTHER_SITE.url);
    expect(secondItemId).toBeTruthy();
    await waitForAnchorStatus(context, OTHER_SITE.url, secondItemId);

    // Now edit only the FIRST item's own line in the Editor.
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/src/sidebar.html`);
    await panel.getByRole("button", { name: "Editor" }).click();
    await expect.poll(() => getEditorValue(panel)).not.toBeNull();
    await editFirstItemLine(panel, "[editado] "); // touches ONLY the first item's own line
    await expect(panel.locator(".tab-dirty")).toBeVisible();
    await panel.getByRole("button", { name: "Vista" }).click();
    await panel.close();

    // The untouched second item must still re-anchor after a reload of ITS page.
    await page2.reload();
    await waitForAnchorStatus(context, OTHER_SITE.url, secondItemId);
  });
});
