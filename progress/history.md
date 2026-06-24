# Session history

> Append-only log. Never delete entries. Each closed session adds one entry at the bottom.

---

_No sessions recorded yet._

---

## Session 2026-06-24 — Feature 18: preview_doc_editor

**Result:** done ✅

**Changes:**
- `vite-extension/src/sidebar/vista.js` — full rewrite: removed item-loop + `startEdit`; now exports `renderVista` (marked preview) + `createDocEditor` (textarea controller)
- `vite-extension/src/sidebar.js` — added `"vista-edit"` mode, pencil/Listo header buttons, `afterDocEditorSync`, flush guards in all navigation handlers
- `vite-extension/src/sidebar.css` — removed `.vista-list / .vista-item / .vista-actions / .vista-btn-* / .vista-edit-ta`; added `.vista-md-preview` + `.vista-edit-doc`
- `feature_list.json` — feature 18 added and marked `in_progress` (→ `done` below)
- `specs/018-spec-preview_doc_editor.json` — created (approved)
- `docs/research_preview_doc_editor.md` — created
- `docs/test_preview_doc_editor.md` — created

**Build:** `pnpm run build` ✅ · `init.sh` ✅

---

## Session 2026-06-24 — Feature #4: page_highlight_persistence

- **Status:** done
- **Spec:** specs/004-spec-page_highlight_persistence.json (approved)
- **Files changed:**
  - `vite-extension/src/storage.js` — addItem() + rangePrefix/rangeSuffix fields
  - `vite-extension/src/content-storage.js` — same
  - `vite-extension/src/content.js` — TextQuoteSelector engine, reapplyHighlights(), removeHighlightById(), CH_REMOVE_HL listener, data-ch-id on marks
  - `vite-extension/src/sidebar/vista.js` — sends CH_REMOVE_HL on item delete
- **Approach:** TextQuoteSelector minimalista (rangePrefix + text + rangeSuffix, ≤50 chars each). TreeWalker text index rebuilt per item for accuracy. Two-level fallback: anchored → unique exact.
- **Reviewer:** init.sh green, pnpm run build green (447ms, no errors).

---

## Session 2026-06-24 — Feature 17: monaco_amd_path_fix

- **Status:** done
- **Root cause:** AMD `req.config` used relative path `"vendor/monaco/vs"`. In the Vite build, `sidebar.html` is served from `chrome-extension://<id>/src/`, so the AMD loader resolved the path to `/src/vendor/monaco/vs` instead of `/vendor/monaco/vs`.
- **Fix:** 1 line in `vite-extension/src/sidebar/editor.js:125` — replaced `"vendor/monaco/vs"` with `chrome.runtime.getURL("vendor/monaco/vs")`.
- **Artifacts:** `docs/research_monaco_amd_path_fix.md`, `specs/017-spec-monaco_amd_path_fix.json`, `docs/test_monaco_amd_path_fix.md`.
- **Checks:** `init.sh` green, `pnpm run build` green.

---

## Session 2026-06-24 — Feature 19: list_structure_capture

- **Status:** done ✅
- **Spec:** `specs/019-spec-list_structure_capture.json` (implemented)
- **Files changed:**
  - `vite-extension/src/content.js` — added `fragmentToMarkdown` + helpers (`_nodeToMd`, `_listToMd`, `_liToMd`, `_childrenToMd`); updated mouseup handler to use `fragmentToMarkdown(range.cloneContents())` and fall back to `sel.toString()` when no list elements are found
  - `vite-extension/src/content.css` — added `white-space: pre-wrap` to `.ch-quote-text`
  - `vite-extension/src/storage.js` — `buildMd`: multi-line items fenced as GFM blockquotes; `parseMd`: consecutive `>` lines grouped into a single item
  - `feature_list.json` — feature 19 added as `done`, `spec_path` set
  - `specs/019-spec-list_structure_capture.json` — created (implemented)
  - `docs/research_list_structure_capture.md` — created
  - `docs/test_list_structure_capture.md` — created
- **Approach:** Option A (convert at capture time). `fragmentToMarkdown` walks the `DocumentFragment` from `cloneContents()` and converts `<ul>/<ol>/<li>` to Markdown bullets/numbers with 2-space indent per nesting level. Returns `null` for non-list selections so the caller keeps the existing plain-text path. `buildMd`/`parseMd` extended for multi-line round-trip correctness via GFM blockquote fencing.
- **Checks:** `init.sh` ✅ · `pnpm run build` ✅ (492ms, no errors)

---

## Session 2026-06-24 — Feature 16: vista_item_style_simplification

- **Feature:** `vista_item_style_simplification` (id: 16)
- **Started:** 2026-06-24
- **Closed:** 2026-06-24
- **Retry count:** 0 / 3
- **Spec approved by human:** ✅ 2026-06-24
- **Result:** ✅ done

### Plan executed
1. ✅ init.sh — green (fixed feature 15 spec_path → `specs/015-spec-nest_selector_redesign.json`)
2. ✅ Feature 16 added to feature_list.json
3. ✅ Researcher → `docs/research_vista_item_style_simplification.md`
4. ✅ Spec-Writer → `specs/016-spec-vista_item_style_simplification.json`
5. ✅ Human approval gate — approved
6. ✅ Tester → `docs/test_vista_item_style_simplification.md`
7. ✅ Implementer → `vite-extension/src/sidebar.css` + `vite-extension/src/sidebar/vista.js`
8. ✅ Reviewer → init.sh green + pnpm run build green (8.86 kB CSS, 18.85 kB JS)

### Changes made
- `vite-extension/src/sidebar/vista.js`: removed `CAT_LABEL` constant and `.vista-item-meta` / `.vista-cat-badge` DOM creation block from `buildItem()`
- `vite-extension/src/sidebar.css`: removed `border-radius: 8px` and `margin-bottom: 2px` from `.vista-item`; added `margin-top: 8px` on `.vista-item-text` (`:first-child` resets to 0); removed all `.vista-cat-badge`, `.badge-*`, dark-mode badge overrides, and `::before` symbol rules
- `feature_list.json`: feature 15 `spec_path` fixed; feature 16 added as `done`

---
# Current session

> Reset this file at the end of every session by appending its content to `history.md`.
> Keep it updated **in real time** while working, not at the end.

- **Feature in progress:** `markdown_preview_category_borders` (ID: 20)
- **Started:** 2026-06-24
- **Active agent:** Spec-Writer (awaiting human approval)
- **Retry count:** 0 / 3
- **Spec approved by human:** _pending_

## Plan

1. ✅ init.sh — green
2. ✅ Read progress/current.md
3. ✅ feature_list.json — feature 20 added with status `in_progress`
4. ✅ Researcher — docs/research_markdown_preview_category_borders.md
5. ✅ Spec-Writer — specs/020-spec-markdown_preview_category_borders.json (draft)
6. ⏳ **STOP — esperando aprobación humana**
7. ⬜ Tester — docs/test_markdown_preview_category_borders.md
8. ⬜ Implementer — markdown.js + sidebar.css
9. ⬜ Reviewer — init.sh + pnpm run build
10. ⬜ Cerrar sesión

## Log

- 2026-06-24: init.sh green, sesión limpia
- 2026-06-24: Feature 20 registrada en feature_list.json
- 2026-06-24: Research escrito en docs/research_markdown_preview_category_borders.md
- 2026-06-24: Spec draft en specs/020-spec-markdown_preview_category_borders.json

## Next step

Esperar aprobación del usuario en la spec antes de escribir cualquier archivo en vite-extension/.
