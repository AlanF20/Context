# Session history

> Append-only log. Never delete entries. Each closed session adds one entry at the bottom.

---

## Session 2026-06-30 — Feature #25: highlight_persistence_border_fix

**Status:** done

**Summary:** Fixed ghost border artifacts on highlight re-application after page reload. Two root causes: (1) separator-less text node concatenation in `buildTextIndex` let `findRangeForItem` resolve Ranges crossing element boundaries → `extractContents()` fractured the DOM. (2) `box-decoration-break: clone` + `border-radius: 2px` turned the fractured `<mark>` fragments' rounded corners into visible colored arcs.

**Changes:**
- `vite-extension/src/content.js`: Added `SEP = '\x00'` separator between nodes in `buildTextIndex` (offsets +1 per node); `findRangeForItem` now rejects matches where the exact text portion contains SEP (cross-boundary); `reapplyHighlights` calls `document.body.normalize()` after each `applyMark()`.
- `vite-extension/src/content.css`: Removed `border-radius: 2px` from `.ch-hl` (kept `box-decoration-break: clone`).

**Also fixed:** Feature #24 had `spec_path: null` despite being done — corrected to `specs/024-spec-capture_button_redesign.json`.

---

_No sessions recorded yet._

---

## Sesión 2026-06-29 — Feature #21: editor_save_keybinding

- **Corrección previa**: feature_list.json tenía spec_path: null para feature #20 → corregido a `specs/020-spec-markdown_preview_category_borders.json`.
- **Researcher**: [docs/research_editor_save_keybinding.md](../docs/research_editor_save_keybinding.md)
- **Spec**: [specs/021-spec-editor_save_keybinding.json](../specs/021-spec-editor_save_keybinding.json) — aprobada por humano.
- **Test plan**: [docs/test_editor_save_keybinding.md](../docs/test_editor_save_keybinding.md)
- **Cambios implementados**:
  - `vite-extension/src/sidebar.js`: eliminado import de `Pencil`, eliminados bloques `editBtn` (vista) y `doneBtn` (vista-edit) de `renderHeader`. El header queda con dot + nombre + botón .md en todos los modos.
  - `vite-extension/src/sidebar/editor.js`: añadido `editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => flush())` para guardar con Cmd+S / Ctrl+S.
- **Build**: `pnpm run build` ✅ sin errores.
- **init.sh**: ✅ verde.

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

## Sesión 2026-06-29 — Feature #22: vscode_editor_experience

- **Status:** done ✅
- **Spec:** specs/022-spec-undo_redo_stack.json (approved)
- **Research:** docs/research_undo_redo_stack.md
- **Test plan:** docs/test_vscode_editor_experience.md

### Changes made
- `vite-extension/src/sidebar/history.js` ✨ new — `createHistoryManager()` with per-context past/future stacks, MAX=50
- `vite-extension/src/sidebar/find.js` ✨ new — `createFindBar()` floating find/replace bar over the textarea
- `vite-extension/src/sidebar/editor.js` — tab-bar gets `.tab-title` + `.tab-dirty` (●) span; `mount()` accepts `onSave(ctxId, md)` injected from sidebar.js; added `applyFormat(ctx)` using `executeEdits` (preserves Monaco undo); `flush()` hides tab-dirty dot
- `vite-extension/src/sidebar/vista.js` — `createDocEditor().mount()` accepts `onSave`, `onDirty`, `onClean` callbacks; `save()` delegates to `onSave` when provided
- `vite-extension/src/sidebar.js` — imports `createHistoryManager` + `createFindBar`; `serialize/restore` helpers; `saveWithHistory` wrapper that snapshots before each write; snapshot taken on Monaco mount (in `switchMode`); rename snapshots before commit; `chrome.storage.onChanged` detects external captures and pushes undo points; `onGlobalKeydown` dispatches Cmd+Z (undo), Cmd+Shift+Z (redo), Shift+Alt+F (format), Cmd+F (find); `applyUndoRedo`, `applyFormat`, `openFind` functions
- `vite-extension/src/sidebar.css` — `.unsaved-dot`, `.tab-dirty`, `.find-bar`, `.find-row/.replace-row`, `.find-input/.replace-input`, `.find-count`, `.find-action-btn`; `#body { position: relative }` for find-bar overlay

### Build
- `pnpm run build` ✅ (512ms, no errors, 96.55 kB sidebar bundle)
- `init.sh` ✅ verde

---

## Sesión 2026-06-29 — Feature #23: delete_context_modal

- **Status:** done ✅
- **Spec:** specs/023-spec-delete_context_modal.json (approved)
- **Research:** docs/research_delete_context_modal.md
- **Test plan:** docs/test_delete_context_modal.md

### Changes made
- `vite-extension/src/sidebar.html` — añadido `<dialog id="confirm-delete-modal">` con `.modal-question`, `.modal-ctx-name`, `.modal-cancel`, `.modal-confirm`
- `vite-extension/src/sidebar.css` — añadidos estilos `#confirm-delete-modal`, `::backdrop`, `.modal-question`, `.modal-ctx-name`, `.modal-actions`, `.btn.danger`
- `vite-extension/src/sidebar/modal.js` ✨ nuevo — `confirmDelete(ctxName): Promise<boolean>` usando `<dialog>.showModal()`; foco inicial en Cancelar
- `vite-extension/src/sidebar.js` — importa `confirmDelete`; `onDeleteContext` await la confirmación antes de ejecutar la eliminación

### Build
- `pnpm run build` ✅ (494ms, no errors)
- `init.sh` ✅ verde
# Current session

> Reset this file at the end of every session by appending its content to `history.md`.
> Keep it updated **in real time** while working, not at the end.

- **Feature in progress:** `capture_button_redesign` (ID 24)
- **Started:** 2026-06-29
- **Active agent:** Tester → Implementer
- **Retry count:** 0 / 3
- **Spec approved by human:** _—_

## Plan

1. ✅ `./init.sh` — green
2. ✅ Read `progress/current.md` — clean
3. ✅ Add feature 24 to `feature_list.json` (`in_progress`, `spec_path: null`)
4. ✅ Researcher — `docs/research_capture_button_redesign.md` + artifact publicado
5. ✅ Spec-Writer — `specs/024-spec-capture_button_redesign.json` (status: draft)
6. ⬜ **STOP — human approval**
7. ⬜ Tester — `docs/test_capture_button_redesign.md`
8. ⬜ Implementer — edits in `vite-extension/src/`
9. ⬜ Reviewer — `./init.sh` + `pnpm run build`
10. ⬜ Close session

## Log

- 2026-06-29: Session opened. init.sh green. Feature 24 added. Researcher running.

## Next step

Complete research artifact and `docs/research_capture_button_redesign.md`, then move to Spec-Writer.
