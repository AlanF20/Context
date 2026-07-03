# Test Plan — Highlight Persistence & Border Fix (Spec #25)

**Feature:** Highlight persistence on page reload + ghost border removal  
**Spec:** `specs/025-spec-highlight_persistence_border_fix.json`  
**Date:** 2026-06-30  
**Tester:** (manual)

---

## Scope

Validates four changes introduced by spec #25:

1. `buildTextIndex` in `content.js` joins text nodes with `\x00` separators so node boundaries are encoded in the concatenated `fullText`.
2. `findRangeForItem` in `content.js` discards any match whose `exact` portion contains `\x00` (straddling a node boundary).
3. `reapplyHighlights` in `content.js` calls `document.body.normalize()` after each `applyMark()` to merge fragmented/empty text nodes.
4. `.ch-hl` in `content.css` — `border-radius: 2px` removed; `box-decoration-break: clone` retained.

---

## Prerequisites

- Chrome with Developer Mode enabled.
- Extension loaded from `vite-extension/dist/` (unpacked).
- A fresh build completed without errors: `cd vite-extension && pnpm run build`.
- Side panel open and at least one Context created before each test.

---

## Test Cases

---

### TC-01 — Happy path: basic reload (single paragraph)

**Setup**  
Navigate to any content-rich page (e.g., a Wikipedia article). Ensure the extension is active. Open the side panel and select or create a Context.

**Steps**  
1. Select a short phrase (5–10 words) that is entirely within a single `<p>` element — no inline elements spanning the selection.
2. Click the `+` capture icon, choose a category, and save the highlight.
3. Confirm the highlight appears immediately (colored background on the page).
4. Press `Ctrl+R` (or `Cmd+R`) to reload the page.
5. Wait for the page and extension content script to finish loading.
6. Inspect the highlighted region visually.

**Expected result**  
- The highlight re-appears on the same phrase with the correct category color.
- No ghost border (no colored stripe above or below the highlighted line).
- No `border-radius` visible on the highlight mark.
- The surrounding text is intact and readable.

**Pass / Fail:** ___

---

### TC-02 — Happy path: multi-line highlight (phrase wrapping two rendered lines)

**Setup**  
Navigate to a page with a wide paragraph. Open the side panel and select or create a Context.

**Steps**  
1. Select a phrase long enough to wrap across two rendered lines within a single `<p>` element (no block-level child elements inside).
2. Capture and save the highlight.
3. Verify the highlight appears spanning both lines.
4. Reload the page.
5. Inspect the highlighted region on both lines.

**Expected result**  
- The highlight re-appears across both lines.
- No colored stripe visible on lines adjacent to the highlight (no ghost border above the first line or below the last line).
- `box-decoration-break: clone` causes each line fragment to be styled consistently — but no phantom top/bottom borders on non-highlighted lines.

**Pass / Fail:** ___

---

### TC-03 — Cross-element-boundary selection (expected: silent skip)

**Setup**  
Find a page with a paragraph that contains an inline `<strong>`, `<em>`, or `<a>` element. Open the side panel and select or create a Context.

**Steps**  
1. Click-drag to select text that starts inside the `<p>` plain text and ends inside the nested `<strong>` (or `<a>`), crossing the element boundary.
2. Capture and save the highlight.
3. Note whether the highlight appears immediately (it may or may not, depending on same-element matching at capture time).
4. Reload the page.
5. Inspect the location where the highlight was saved.

**Expected result**  
- On reload, if the matched `exact` substring contains `\x00`, `findRangeForItem` discards the match silently.
- No ghost border or colored stripe appears at the location.
- The DOM text content is intact — no missing characters, no duplicated text.
- The highlight simply does not re-apply (a skipped highlight is acceptable per spec).
- No JavaScript errors logged to the console related to this highlight.

**Pass / Fail:** ___

---

### TC-04 — Duplicate text: prefix/suffix anchoring

**Setup**  
Find (or open) a page where the same short phrase appears at least twice (e.g., a repeated heading or a list with repeated items). Open the side panel and select or create a Context.

**Steps**  
1. Identify the second occurrence of the duplicate phrase on the page.
2. Select and capture the second occurrence.
3. Note the surrounding context (the text just before and after).
4. Reload the page.
5. Inspect both occurrences of the phrase.

**Expected result**  
- If the prefix/suffix anchors (`prefixText`, `suffixText`) stored at capture time are unique to the second occurrence, the second occurrence is re-highlighted and the first is not.
- If the anchors are ambiguous (both occurrences have identical surroundings), the highlight is skipped cleanly — no crash, no ghost border.
- In either case, no DOM corruption is present and no unrelated highlights are affected.

**Pass / Fail:** ___

---

### TC-05 — Multiple highlights on the same page

**Setup**  
Navigate to a content-rich page. Open the side panel and select or create a Context.

**Steps**  
1. Capture 3 to 5 distinct highlights on the same page, using at least two different categories.
2. Verify all highlights appear immediately after each capture.
3. Reload the page.
4. Inspect all highlight locations one by one.
5. Open DevTools Console and check for JavaScript errors.

**Expected result**  
- All highlights that can be matched (single-element selections with unambiguous anchors) re-appear with correct colors.
- No visual artifacts between highlights (no smeared colors, no merged marks, no missing text).
- `document.body.normalize()` called after each `applyMark()` ensures previously applied marks do not leave empty text nodes that corrupt subsequent lookups.
- Console shows no errors from the content script.

**Pass / Fail:** ___

---

### TC-06 — Ghost border regression check

**Setup**  
Use any page where ghost borders were observable before the fix (a page with multi-line highlights or highlights adjacent to block boundaries).

**Steps**  
1. Create a highlight that previously exhibited the ghost border symptom (a colored top or bottom stripe on non-highlighted lines).
2. Reload the page.
3. Zoom into the area above and below the highlighted phrase using browser zoom (150%–200%) to make any thin stripes visible.
4. Open DevTools → Elements, select the `.ch-hl` span, and inspect Computed Styles.

**Expected result**  
- No colored stripe appears above or below the highlighted text on non-highlighted lines.
- Computed Styles show `border-radius: 0px` (or the property absent entirely).
- `box-decoration-break: clone` (or `-webkit-box-decoration-break: clone`) is present and set to `clone`.
- The highlight color is applied only to lines that contain actual highlighted text.

**Pass / Fail:** ___

---

### TC-07 — CSS: border-radius removed, box-decoration-break retained

**Setup**  
Load any page with at least one multi-line highlight (can be from a previous test case or captured fresh).

**Steps**  
1. Open DevTools (F12).
2. Click the Inspector/Elements tab and select a `.ch-hl` span that spans multiple rendered lines.
3. Open the Computed Styles panel (or inspect the Styles panel).
4. Search for `border-radius`.
5. Search for `box-decoration-break` (and `-webkit-box-decoration-break`).

**Expected result**  
- `border-radius` is `0px` on all corners, or is absent from computed styles (no author-defined value).
- `box-decoration-break: clone` (and/or `-webkit-box-decoration-break: clone`) is present and active.
- No inline `style` attribute on `.ch-hl` elements overrides these values.

**Pass / Fail:** ___

---

### TC-08 — Build check

**Setup**  
Terminal open at the repo root. All code changes for spec #25 applied to `vite-extension/src/`.

**Steps**  
1. Run:
   ```
   cd vite-extension && pnpm run build
   ```
2. Observe the terminal output until the command exits.

**Expected result**  
- Command exits with code `0`.
- No TypeScript/ESLint/Vite errors printed.
- `vite-extension/dist/` is updated with fresh build artifacts.
- No warnings about unresolved imports or missing modules.

**Pass / Fail:** ___

---

### TC-09 — Harness check

**Setup**  
Terminal open at the repo root.

**Steps**  
1. Run:
   ```
   ./init.sh
   ```
2. Observe all steps executed by the script.

**Expected result**  
- Script exits green (exit code `0`).
- All harness checks pass without error or warning.

**Pass / Fail:** ___

---

## Summary Table

| TC | Description | Pass / Fail |
|----|-------------|-------------|
| TC-01 | Basic reload — single paragraph highlight | |
| TC-02 | Multi-line highlight — no ghost stripes after reload | |
| TC-03 | Cross-element boundary — silent skip, no DOM corruption | |
| TC-04 | Duplicate text — prefix/suffix anchoring | |
| TC-05 | Multiple highlights — no artifacts, no console errors | |
| TC-06 | Ghost border regression — confirmed absent | |
| TC-07 | CSS — border-radius removed, box-decoration-break retained | |
| TC-08 | Build check — `pnpm run build` exits 0 | |
| TC-09 | Harness check — `./init.sh` exits green | |

---

## Notes

- A highlight being silently skipped on reload (TC-03, TC-04 ambiguous case) is **not** a failure. The spec defines a skip as the correct safe behavior for unresolvable matches.
- TC-05 exercises the `normalize()` call indirectly: if the DOM is corrupted between successive `applyMark()` calls, subsequent highlights will either misfire or throw. A clean result implies `normalize()` is working.
- Ghost borders (TC-06, TC-07) are caused by `border-radius` interacting with `box-decoration-break: clone`. Removing `border-radius` is the targeted fix; retain `box-decoration-break: clone` for correct multi-line decoration.
