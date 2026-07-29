# Research — E2E: highlight on a real site, reload, verify re-highlight (feature #29)

## Goal

A Playwright E2E spec that: opens a real external URL (not a local fixture),
performs a genuine text selection + save through the content script's capture
UI, reloads the page, and proves the highlight was re-applied by the
anchoring pipeline (features 4/25/27). The set of test URLs is stored as a
reusable array so more sites can be added later without touching the spec.

## What already exists (reuse, don't rebuild)

- `tests/e2e/fixtures.js` — launches the **built** `dist/` extension via
  `chromium.launchPersistentContext('', {...})`, exposes `context`,
  `extensionId`, `page`. `headless: false` is mandatory (old headless can't
  load extensions). `test:e2e` script already chains `vite build && playwright test`.
- `tests/e2e/028-export-format-selector.spec.js` — the only existing E2E spec;
  shows the project's conventions: task-id-prefixed filename, seeding
  `chrome.storage.local` via `page.evaluate`, `page.getByRole(...)` assertions.
- [[project_testing_strategy]] (memory) documents the Vitest+Playwright split
  and file-naming rules already agreed with the user — this feature follows
  the same `NNN-<slug>.spec.js` convention, one file for the whole feature.

## How the highlight painter actually works (critical — changes the assertion plan)

`content.js` paints highlights via the **CSS Custom Highlight API**
(`CSS.highlights.set('ch-hl-<category>', new Highlight(range))`) —
explicitly "zero DOM mutation" (see the comment block at
`content.js:738`). There is **no** `.ch-hl-idea`-classed element wrapping the
highlighted text to query with `page.locator()`. This matters because a
DOM-node/class based assertion (what a naive test would reach for) does not
exist in this codebase.

Content scripts also run in an **isolated JS world**: they share the live DOM
with the page but have their own global scope. Whether `CSS.highlights` set
by the isolated world is visible to `page.evaluate()` (which runs in the
page's **main** world) is unclear/underspecified from the spec and not worth
depending on for a test assertion.

**The mechanism to use instead already exists in production code**: `content.js`
maintains a per-URL anchoring `session` with `session.statuses` (`'pending' |
'anchored' | 'failed'` per item id) and already answers
`{ type: 'CH_GET_ANCHOR_STATUS' }` messages with `{ url, statuses }`
(`content.js:1086-1088`). This is the exact signal the just-shipped "anchor
status strip" panel feature (commit `63d9011`) relies on to show anchoring
state in the UI — so asserting against it tests the real, already-trusted
mechanism rather than reverse-engineering a new one.

- `chrome.tabs.sendMessage(tabId, msg)` reaches a specific tab's content
  script and does not require the `"tabs"` permission for `sendMessage`
  itself; reading `url`/`title` via `chrome.tabs.query` also works without
  `"tabs"` here because `host_permissions` is already `<all_urls>` (Chrome
  exposes those fields when host permissions cover the tab). **No manifest
  change needed.**
- Playwright can run this query from the extension's **service worker**
  context: `context.serviceWorkers()[0].evaluate(...)` has full extension API
  access (`chrome.tabs`, `chrome.storage`), unlike `page.evaluate()` which
  runs inside the visited page.

**Recommended assertion**: after `page.reload()` + a short wait for the
anchor session's initial pass, evaluate in the service worker:
```js
const [tab] = await chrome.tabs.query({ url: TEST_URL });
const res = await chrome.tabs.sendMessage(tab.id, { type: 'CH_GET_ANCHOR_STATUS' });
// res.statuses[itemId] === 'anchored'
```
This directly reuses the shipped introspection channel instead of inventing
pixel/screenshot comparisons or fighting cross-realm `CSS.highlights` visibility.

## Simulating a real capture (mouseup-driven, not scripted selection)

`content.js` only reacts to a native `mouseup` DOM event
(`document.addEventListener("mouseup", ...)`, `content.js:122`). Playwright's
`locator.selectText()` helper does not reliably fire that event (it selects
text without a real pointer gesture), so the spec must drive a **real mouse
drag**: `page.mouse.move(x1,y1) → page.mouse.down() → page.mouse.move(x2,y2)
→ page.mouse.up()` over the target paragraph's bounding box. This creates a
genuine browser text selection and fires the real `mouseup` the content
script listens for.

Capture flow once the toolbar appears (`.ch-toolbar`, `content.js:187`):
- `contextForThisPage()` (`content.js:166`) looks for an existing item whose
  `sourceUrl` matches `location.href`. On a **first visit** to a brand-new
  test URL there is none, so clicking a category swatch calls `openPopup()`,
  not the one-click `fastSave()` path — the test must go through the full
  popup: type a context name in the combobox, category is pre-selected from
  the clicked swatch, then click "Guardar" (or press Enter).
- The saved item gets `sourceUrl`, `rangePrefix/rangeSuffix/rangeStart/rangeEnd`
  (feature 27's anchoring metadata) written via `Store.addItem` — this is what
  the anchoring pass reads back after reload (`content.js:844`).

## Picking the paragraph to highlight (per the user's chosen approach)

The user chose "first paragraph of body text, category idea" over a
hardcoded per-URL string specifically so future URLs added to the array
don't each need a hand-picked snippet. Concretely: `page.evaluate(() =>
document.querySelector('article p') ?.textContent?.trim())` (or the site's
main-content container) read at runtime, then select that same paragraph's
rendered text via the mouse-drag above. Any live-page change to that
paragraph's wording is tolerated because the test never hardcodes the string
— it reads whatever is there and checks that the *same* text round-trips
through save → reload → re-anchor.

Verified 2026-07-29 via a raw fetch of the live page: a naive `article p`
selector is wrong here — the first `<p>` inside `<article>` is actually a
phone-number contact block (`.contact-text-container .help-box p`), rendered
*before* the real body copy. The actual first body paragraph lives at
`.horizontal-text.txt-container p` (only one such container on the page),
containing the genuine intro paragraph ("¿Has estado estresado
últimamente..."), long enough (~350 chars) for a real mouse-drag selection.
**Use `.horizontal-text.txt-container p` as this URL's `articleSelector`**,
not `article p`.

## Test URL array (the "rule")

New file `tests/e2e/fixtures/test-sites.js`:
```js
export const TEST_SITES = [
  {
    label: "Houston Methodist — cortisol article",
    url: "https://www.houstonmethodist.org/es/why-choose-houston-methodist/blog/2025/april/what-is-cortisol/",
    articleSelector: ".horizontal-text.txt-container p", // verified against the live page, 2026-07-29
  },
];
```
Only the first entry is exercised by this feature (per the user's answer);
the array shape is what makes adding a second site later a one-line diff, no
spec rewrite. Each future addition should also state its `articleSelector`
since real sites don't share a common template.

**Update 2026-07-29 (later same day): 3 more sites added, spec now loops over the whole array.**
Medium (a "member-only"/metered story — `.pw-post-body-paragraph`, only the free-preview lead
paragraph is used), AnkiWeb docs (mdBook — `main p`), and Wikipedia (es) (`#mw-content-text
.mw-parser-output p`). All 9 E2E specs (5 from feature 28 + 4 from this feature) pass together.
Getting there required fixing two more real, reproducible issues — see
`docs/test_e2e_highlight_reload_real_sites.md` and the `project_testing_strategy` memory entry for
full detail: (1) `.ch-toolbar-swatch:hover`'s `transform: scale(1.2)` breaks Playwright's click
stability check — fixed with `.click({force: true})` on that click only; (2) Houston Methodist's
page wipes `document.body` when a long (~40+ char) value is typed into the capture popup's
context-name field — fixed by using a short constant name instead of the full site label; (3)
Wikipedia's floated infobox made `getBoundingClientRect()` an unreliable drag target (it spans
space the paragraph's text doesn't actually render into) — fixed by dragging between
`Range.getClientRects()` line rects instead of the element's own bounding box.

## Risks / things the Tester plan should call out

- **Live external site dependency**: no network mocking — a real page load
  against a real third-party site. If Houston Methodist changes its template,
  blocks automated Chrome, or the article is edited/removed, this test can
  fail for reasons unrelated to the extension. This is an accepted, explicit
  trade-off (the user asked for real-site testing), not a defect to fix in
  code — the Tester doc should document it as a known-flaky external
  dependency, not something the Implementer should try to eliminate.
- **Anchoring is asynchronous** (debounce + idle callback + grace window,
  `DEBOUNCE_MS`/`IDLE_TIMEOUT_MS`/`GRACE_MS` in `content.js`): the test must
  poll/wait for `CH_GET_ANCHOR_STATUS` to report `'anchored'` rather than
  asserting immediately after `page.reload()`.
- Cookie/consent banners on a real hospital-system site may cover the
  article or shift layout before the DOM is settled — worth a defensive
  `page.waitForLoadState('networkidle')` or dismissing a banner if present;
  confirm during Tester/Implementer manual pass.
