// @ts-check
/**
 * E2E coverage for feature 31 (highlight_comment_capture) — the parts that
 * live entirely in content.js and only exist as real, interactive DOM: the
 * capture popup's comment input, the fast-save toast's "+ agregar
 * comentario" link and its in-place mini-form, and the resize/reclamp fix
 * found during manual QA. None of this is reachable from Vitest/jsdom (real
 * mouse-driven text selection, real chrome.storage.local, a real viewport
 * resize) — this is what closes that gap per the (now standing) project
 * policy: any DOM-touching change gets an E2E spec, not just a manual pass.
 *
 * Reuses the real-site drag-select technique from
 * tests/e2e/029-highlight-reload-real-sites.spec.js against AnkiWeb's docs
 * site (docs.ankiweb.net) — a static mdBook page with no
 * personalization/analytics scripts reacting to input, which 029/memory
 * flagged as a real flakiness source on other sites.
 */
import { test, expect } from "./fixtures.js";

const SITE_URL = "https://docs.ankiweb.net/getting-started.html";
const ARTICLE_SELECTOR = "main p";

/** The service worker is the only context with chrome.storage access here. */
async function getWorker(context) {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker");
  return worker;
}

/** Every text item's `comment` field currently in storage, in item order. */
async function readComments(context) {
  const worker = await getWorker(context);
  return worker.evaluate(async () => {
    const { contextHighlighter } = await chrome.storage.local.get("contextHighlighter");
    const out = [];
    for (const ctx of Object.values(contextHighlighter?.contexts ?? {})) {
      for (const item of ctx.items ?? []) {
        if (item.type === "text") out.push(item.comment ?? null);
      }
    }
    return out;
  });
}

/**
 * Real mouse drag over a paragraph's full rendered content — content.js only
 * reacts to a native mouseup, not the Selection API. Uses per-line client
 * rects (not the paragraph's own bounding box) so a float elsewhere on the
 * page can't shift the drag onto the wrong content (see 029 for the original
 * diagnosis of that failure mode).
 */
async function dragSelectParagraph(page, paragraph) {
  await paragraph.scrollIntoViewIfNeeded();
  const lineRects = await paragraph.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return Array.from(range.getClientRects())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height }));
  });
  if (!lineRects.length) throw new Error(`No rendered text line rects for ${ARTICLE_SELECTOR}`);
  const firstLine = lineRects[0];
  const lastLine = lineRects[lineRects.length - 1];
  await page.mouse.move(firstLine.x + 2, firstLine.y + firstLine.height / 2);
  await page.mouse.down();
  await page.mouse.move(lastLine.x + lastLine.width - 2, lastLine.y + lastLine.height / 2, { steps: 10 });
  await page.mouse.up();
}

test.describe.configure({ retries: 1 }); // real third-party page — same accepted flakiness as 029

test("popup completo: el input de comentario solo aparece para categorías de texto, y persiste hasta la Vista", async ({
  page,
  extensionId,
}) => {
  test.setTimeout(60000);
  await page.goto(SITE_URL);
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

  const paragraph = page.locator(ARTICLE_SELECTOR).first();
  await expect(paragraph).toBeVisible();
  await dragSelectParagraph(page, paragraph);

  const toolbar = page.locator(".ch-toolbar");
  await expect(toolbar).toBeVisible();
  // No detected context yet on a fresh profile — "..." opens the full popup.
  await toolbar.locator(".ch-toolbar-more").click({ force: true });

  const popup = page.locator(".ch-pop");
  await expect(popup).toBeVisible();
  await popup.locator(".ch-combo-input").fill("E2E Comment");

  const commentRow = popup.locator('[data-role="comment-row"]');
  // Default category on open is "idea" — a text category.
  await expect(commentRow).toBeVisible();

  await popup.locator('[data-role="cat-select"]').selectOption("title");
  await expect(commentRow).toBeHidden();

  await popup.locator('[data-role="cat-select"]').selectOption("idea");
  await expect(commentRow).toBeVisible();
  await popup.locator('[data-role="comment-input"]').fill("Mi comentario E2E");

  await popup.locator('[data-role="save"]').click();
  await expect(popup).toBeHidden();

  await page.goto(`chrome-extension://${extensionId}/src/sidebar.html`);
  await page.locator('.rail-chip[title="E2E Comment"]').click();
  await page.getByRole("button", { name: "Vista" }).click();

  const blockquote = page.locator(".vista-md-preview blockquote").first();
  await expect(blockquote).toBeVisible();
  await expect(blockquote).toContainText("Mi comentario E2E");
});

test("fast-save: el toast ofrece '+ agregar comentario' solo para texto, nunca para 'Título', y el mini-formulario persiste", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  await page.goto(SITE_URL);
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

  const paragraphs = page.locator(ARTICLE_SELECTOR);
  await expect(paragraphs.first()).toBeVisible();

  // Step 1 — establish a detected context for this exact URL via the full
  // popup, the same precondition fastSave()'s contextForThisPage() checks.
  await dragSelectParagraph(page, paragraphs.nth(0));
  let toolbar = page.locator(".ch-toolbar");
  await expect(toolbar).toBeVisible();
  await toolbar.locator(".ch-toolbar-more").click({ force: true });
  const popup = page.locator(".ch-pop");
  await expect(popup).toBeVisible();
  await popup.locator(".ch-combo-input").fill("E2E FastSave");
  await popup.locator('[data-role="save"]').click();
  await expect(popup).toBeHidden();

  // Step 2 — a second selection on the SAME page now hits the fast-save path.
  await dragSelectParagraph(page, paragraphs.nth(1));
  toolbar = page.locator(".ch-toolbar");
  await expect(toolbar).toBeVisible();
  await expect(toolbar.locator(".ch-toolbar-ctx-dot")).toBeVisible(); // context detected

  await toolbar.locator('.ch-toolbar-swatch[data-cat="idea"]').click({ force: true });
  let toast = page.locator(".ch-toolbar-success");
  await expect(toast).toBeVisible();
  const commentLink = toast.locator(".ch-toolbar-success-comment");
  await expect(commentLink).toBeVisible();

  await commentLink.click({ force: true });
  const toastInput = toast.locator(".ch-toolbar-comment-input");
  await expect(toastInput).toBeVisible();
  await toastInput.fill("Comentario desde el toast");
  await toastInput.press("Enter");
  await expect(toast).toBeHidden();

  await expect.poll(() => readComments(context)).toContainEqual("Comentario desde el toast");

  // Step 3 — a "Título" fast-save must show the toast WITHOUT the link at all
  // (subtitles never carry a comment, feature 031 scope).
  await dragSelectParagraph(page, paragraphs.nth(2));
  toolbar = page.locator(".ch-toolbar");
  await expect(toolbar).toBeVisible();
  await toolbar.locator('.ch-toolbar-swatch[data-cat="title"]').click({ force: true });
  const titleToast = page.locator(".ch-toolbar-success");
  await expect(titleToast).toBeVisible();
  await expect(titleToast.locator(".ch-toolbar-success-comment")).toHaveCount(0);
});

test("el toast/popup se reubican dentro del viewport tras un resize (fix post-QA: el side panel achica el viewport, no lo superpone)", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto(SITE_URL);
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

  const paragraphs = page.locator(ARTICLE_SELECTOR);
  await expect(paragraphs.first()).toBeVisible();

  // Establish a detected context, then fast-save near the right edge of the
  // (wide) viewport — the exact condition that used to leave the toast
  // stranded once the side panel narrowed the page.
  await dragSelectParagraph(page, paragraphs.nth(0));
  let toolbar = page.locator(".ch-toolbar");
  await toolbar.locator('.ch-toolbar-swatch[data-cat="idea"]').click({ force: true });
  const popup = page.locator(".ch-pop");
  await expect(popup).toBeVisible();
  await popup.locator(".ch-combo-input").fill("E2E Resize");
  await popup.locator('[data-role="save"]').click();
  await expect(popup).toBeHidden();

  await dragSelectParagraph(page, paragraphs.nth(1));
  toolbar = page.locator(".ch-toolbar");
  await toolbar.locator('.ch-toolbar-swatch[data-cat="evidence"]').click({ force: true });
  const toast = page.locator(".ch-toolbar-success");
  await expect(toast).toBeVisible();

  const before = page.viewportSize();
  const narrower = { width: Math.round(before.width * 0.55), height: before.height };
  await page.setViewportSize(narrower);
  // Force the same code path content.js's own resize listener runs, rather
  // than depending on whether setViewportSize's own resize dispatch timing
  // is reliable in this harness — reclampToViewport() reads window.innerWidth
  // live, so a synthetic dispatch exercises the exact same logic.
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));

  const box = await toast.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(narrower.width);
});
