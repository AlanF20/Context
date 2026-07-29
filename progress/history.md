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

## Session 2026-07-29 — Feature #29: e2e_highlight_reload_real_sites

**Status:** done

**Summary:** New Playwright E2E spec proving the highlight-persistence pipeline (features 4/25/27)
against a real external page (not a local fixture): drags a real mouse selection over Houston
Methodist's cortisol article's first body paragraph, saves it via the content script's capture
popup, reloads, and confirms re-anchoring. Pure test-infra feature — no changes to `src/`.

**Key research finding:** `content.js` paints highlights via the CSS Custom Highlight API with
zero DOM mutation — there is no `.ch-hl-*` element to query from `page.evaluate()`, and cross-realm
visibility of `CSS.highlights` between the content script's isolated world and the page's main
world is unverified. The spec instead polls the already-shipped `CH_GET_ANCHOR_STATUS` message
(the same channel behind the anchor-status-strip panel feature, commit `63d9011`) from the
extension's service worker via `chrome.tabs.sendMessage` — no manifest changes needed.

**Changes:**
- `vite-extension/tests/e2e/fixtures/test-sites.js` (new): exports `TEST_SITES`, an array of
  `{label, url, articleSelector}` — only Houston Methodist populated this iteration; the shape is
  the "rule" the user asked for so more URLs can be added later without touching the spec.
- `vite-extension/tests/e2e/029-highlight-reload-real-sites.spec.js` (new): full flow — real
  mouse drag over the live-read paragraph text (not hardcoded, tolerates future article edits),
  clicks the "idea" swatch, fills+saves the capture popup (first visit to the URL → no
  `fastSave` shortcut, goes through the full popup), reads the saved item id from
  `chrome.storage.local`, reloads, and polls anchor status until `'anchored'` or an explicit
  timeout.

**Bug found and fixed during Reviewer pass:** first run failed — `.ch-toolbar` never appeared.
Root cause: `Locator.boundingBox()` doesn't scroll the element into view, and the target
paragraph was below the fold, so the mouse-drag coordinates landed outside the actual rendered
viewport (no selection, no `mouseup`, no toolbar). Fix: `paragraph.scrollIntoViewIfNeeded()`
before reading the bounding box. All 6 E2E specs (the existing feature-28 suite + this new one)
pass together after the fix.

**Known accepted risk (not a defect):** depends on a live third-party site with no network
mocking — if Houston Methodist changes its template or blocks automation, this test can fail for
reasons unrelated to the extension. Documented in `docs/research_e2e_highlight_reload_real_sites.md`
and `docs/test_e2e_highlight_reload_real_sites.md`.

---

## Follow-up 2026-07-29 (same day) — Feature #29: 3 more test sites added

**Status:** done

**Summary:** User asked to extend the real-site E2E coverage to 3 more URLs (a Medium article, the
AnkiWeb docs, Wikipedia (es) Cortisol). Extended `test-sites.js` to 4 entries and converted the
single hardcoded test into a loop over `TEST_SITES`. Getting all 4 green (plus the original
Houston Methodist entry) surfaced three more real bugs beyond the earlier `scrollIntoViewIfNeeded`
fix, diagnosed via throwaway diagnostic specs reusing `fixtures.js` (page.evaluate to read
computed style / getBoundingClientRect / elementFromPoint, and manual string-length bisection):

1. **Hover-transform vs. Playwright's click stability check.** `.ch-toolbar-swatch:hover {
   transform: scale(1.2) }` grows the button's box on pointer-over, so Playwright's default
   `.click()` (which waits for a stable bounding box) never converges and hangs until the test
   timeout. Fixed with `.click({force: true})` on that one click.
2. **Long input value wipes `document.body` on Houston Methodist specifically.** Typing a ~40+
   character value into the capture popup's context-name field reliably removed the popup (and
   apparently much more) within ~200ms — confirmed length-triggered, not content-triggered (an
   em-dash wasn't the cause), and confirmed NOT caused by our own code (`removeChild`/`.remove()`
   were monkey-patched and never fired). Almost certainly a page-side CMS/personalization script.
   Fixed by typing a short constant ("E2E Test") instead of deriving the value from the full site
   label.
3. **Floated infobox breaks `getBoundingClientRect()`-based drag targeting on Wikipedia.** The
   chemical-compound infobox floats right of the intro paragraph; the paragraph's own bounding
   rect still spans the column width underneath the float (confirmed real per-browser behavior,
   not a bug), so a drag to its bottom-right corner selected infobox text instead of the intended
   paragraph. Fixed by building a `Range` over the paragraph's contents and using
   `range.getClientRects()` (one rect per actually-rendered line) for the drag's start/end points
   instead of the element's own box.

All 9 E2E specs (5 from feature 28 + 4 from this feature) pass together, stable across repeated
runs. `pnpm run build`, `pnpm run test` (Vitest), and `./init.sh` all green. Full detail recorded
in `docs/research_e2e_highlight_reload_real_sites.md`, `docs/test_e2e_highlight_reload_real_sites.md`,
and the `project_testing_strategy` memory entry.

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

---

# Session: rehighlight_button (id 26) — STALLED, archived 2026-07-03

> This session was found abandoned at the Interviewer step (no research, no spec,
> no code artifacts). Its feature_list.json entry was malformed (appended outside
> the features array), breaking init.sh. Archived as-is; feature 26 reset to pending.

- **Feature in progress:** `rehighlight_button` (id: 26)
- **Started:** 2026-06-30
- **Active agent:** Interviewer
- **Retry count:** 0 / 3
- **Spec approved by human:** _—_

## Log

- 2026-06-30: Session started. init.sh green. feature_list.json updated (id 26, in_progress).

---

# Current session

> Reset this file at the end of every session by appending its content to `history.md`.
> Keep it updated **in real time** while working, not at the end.

- **Feature in progress:** `highlight_persistence_robustness` (id: 27)
- **Started:** 2026-07-03
- **Active agent:** Reviewer
- **Retry count:** 0 / 3
- **Spec approved by human:** ✅ 2026-07-03 ("Sí, aprobar")

## Plan

1. ✅ init.sh — red on first run (feature_list.json malformed by stale session 26); repaired JSON, green on re-run
2. ✅ Read progress/current.md — stale session for feature 26 (rehighlight_button) stalled at Interviewer; archived to history.md, feature 26 reset to pending
3. ✅ Add feature 27 to feature_list.json (in_progress, spec_path: null)
4. ✅ Interviewer — 4 questions answered (see Log)
5. ✅ Researcher → docs/research_highlight_persistence_robustness.md (workflow: 4 research agents + synthesis + critic; 1 gap found and repaired)
6. ✅ Spec-Writer → specs/027-spec-highlight_persistence_robustness.json (status: draft)
7. ✅ Human approval gate — APPROVED 2026-07-03
8. ✅ Tester → docs/test_highlight_persistence_robustness.md
9. ✅ Implementer → vite-extension/src/ (see Log)
10. ✅ Reviewer → init.sh ✅ + pnpm run build ✅ + manual review (workflow hit org spend limit, see Log)
11. ✅ Close session

## Log

- 2026-07-03: init.sh FAILED — feature_list.json invalid JSON (feature 26 was appended outside the features array by the previous session). Repaired array structure; init.sh green on re-run.
- 2026-07-03: Previous session (feature 26, stalled at Interviewer, no artifacts produced) archived to history.md. Feature 26 reset to `pending` — pending user confirmation on whether feature 27 supersedes it.
- 2026-07-03: Feature 27 `highlight_persistence_robustness` added to feature_list.json as in_progress. User request: "verify and find the better way to keep the historial of highlighted text if the page refresh, or when I re visit a previous page where I highlight something."
- 2026-07-03: Context recon: specs 004 (TextQuoteSelector persistence) and 025 (border-fix) read. Known gaps: SPAs, editor-created items (rangePrefix null), fragile matching on DOM change.

- 2026-07-03: Interviewer done. Answers: (1) scope = static AND dynamic/SPA pages (late-rendered content must get highlighted); (2) same-page criterion = EXACT URL match, unchanged (no URL normalization); (3) lost text = fuzzy matching for minor changes + panel indicator "no encontrado en la página" when anchoring fails; (4) architecture = open to migrating painting to CSS Custom Highlight API if research supports it, keeping stored data compatible. Feature 26 stays pending; may be retired if 27 supersedes it.

- 2026-07-03: Researcher done (workflow wf_0ad178dc-d46, 7 agents, ~13 min). Doc at docs/research_highlight_persistence_robustness.md. Key findings: 15 concrete failure modes incl. 2 data bugs (content-storage.js drops rangeText; Markdown editor destroys anchors context-wide). Recommendation: TextPositionSelector + 4-level matching pipeline (approx-string-match@2.0.0 fuzzy), full migration to CSS Custom Highlight API, URL-epoch anchoring session with MutationObserver, hybrid push+pull panel messaging.
- 2026-07-03: Spec-Writer done. specs/027-spec-highlight_persistence_robustness.json written (draft), spec_path registered in feature_list.json. Presented to user for approval.

- 2026-07-03: GATE PASSED — user approved spec 027 ("Sí, aprobar"). Spec status set to approved.

- 2026-07-03: Tester done — docs/test_highlight_persistence_robustness.md (build gate + V1–V9).
- 2026-07-03: Implementer note — research suggested converting content-storage.js into a re-export of storage.js, but content.js:16-20 documents the copy is DELIBERATE (a shared Rollup chunk becomes a CRXJS web-accessible resource without chrome.storage access). Decision: keep the copy, regenerate it from the updated storage.js (fixes the rangeText bug + drift), document sync requirement in its header.

- 2026-07-03: Implementer done. Changes: package.json +approx-string-match@2.0.0 (pnpm store migrated v11→v10 with `pnpm install`); src/anchor.js NEW (4-level pipeline: position → exact → normalized exact w/ offset map → fuzzy Myers + Hypothesis-style scoring, 25% budget, short-quote guards); storage.js addItem +rangeStart/rangeEnd, replaceContextFromMarkdown defaults anchor fields to null; content-storage.js regenerated as exact copy of storage.js (fixes dropped rangeText bug; header documents the deliberate-copy constraint); content.js: extractRangeContext +position offsets, painter migrated to CSS Custom Highlight API (paintedRanges Map, feature-guarded), per-URL anchoring session (MutationObserver childList+subtree, 350ms debounce, prefilter, revalidation of collapsed ranges, GRACE 5s/3 passes soft-fail, MAX_PASSES 50, 2MB index cap), SPA URL detection (Navigation API + popstate/hashchange + poll fallback), CH_ANCHOR_STATUS push + CH_GET_ANCHOR_STATUS pull, CH_REMOVE_HL now unpaints via registry; content.css: .ch-hl* → ::highlight(ch-hl-*); sidebar/anchor-status.js NEW (strip "no encontrado en la página", 3 states, never persisted) wired in sidebar.js (attach in vista, detach elsewhere); sidebar.css strip styles.
- 2026-07-03: Reviewer: pnpm run build ✅ (content.js 23.76 kB), init.sh ✅. Adversarial review workflow launched (3 lenses + verify) — ALL 3 agents failed: "org's monthly spend limit" hit mid-run. `confirmed: []` from that run is NOT a clean bill of health — it means zero review coverage, not zero defects. Discarded that result.
- 2026-07-04: Model switched to claude-sonnet-5, ultracode off. Did a manual review myself in place of re-running the (expensive) workflow, to respect the spend limit: verified content-storage.js is byte-identical to storage.js past the header (rangeText bug fix holds); syntax-checked anchor.js/content.js/anchor-status.js. Found ONE real bug by manual read-through: `extractRangeContext` (content.js) computed rangePrefix/rangeSuffix/rangeStart/rangeEnd from the RAW (untrimmed) Range, but the stored quote (`item.text`/`rangeText`) is `sel.toString().trim()` — a coordinate-space mismatch. Any selection with boundary whitespace (common with drag-selects) made anchoring level 0 (position) permanently dead and broke level 1's anchored prefix+quote+suffix match, silently falling back to the no-context "unique quote" path and losing duplicate-quote disambiguation — undermining the exact motivation for adding rangeStart/rangeEnd. Fixed: extractRangeContext now trims range.toString() and shifts prefix/suffix/offsets by the leading/trailing whitespace trimmed, so all four fields align with the trimmed stored quote. Rebuilt (pnpm run build ✅) and re-ran init.sh ✅ after the fix.
- 2026-07-04: NOT independently re-verified by a second pass (no adversarial workflow re-run, to avoid hitting the spend limit again). Flagging as residual risk for whoever picks this up next: re-run the review workflow (or a manual second pass) once the org spend limit resets, focusing on content.js session/observer lifecycle and anchor.js fuzzy-scoring edge cases (candidates with c.end > map.length, division-by-zero on empty quotes) — these were assigned to lenses that never got to run.
- 2026-07-04: Session closed. Feature 27 marked done in feature_list.json. User said "hola" / "finish" — closing out per harness rules (session log → history.md, current.md reset, feature status updated).

## Next step

None — session closed. See docs/test_highlight_persistence_robustness.md for the manual verification checklist (V1–V9) still owed before calling this feature fully field-tested in Chrome.

---

# Follow-up: revisión adversaria manual de feature 27 (2026-07-04)

El workflow adversario original (3 agentes) había fallado por completo al chocar con el límite
de gasto mensual de la organización — `confirmed: []` no era una revisión limpia, era cero
cobertura. A petición del usuario ("Crea agentes con este modelo para realizar la tarea que los
agentes pasados iban a realizar para asegurar que lo generado es correcto"), se relanzó la
revisión con 3 agentes en paralelo usando claude-sonnet-5 (modelo activo de la sesión), cubriendo
las mismas 3 lentes: anchor.js (offsets/fuzzy), ciclo de vida de sesión/pintor/mensajería en
content.js, y cumplimiento de los 20 acceptance_criteria de la spec 027 + panel.

## Hallazgos y resolución

- **anchor.js**: sin hallazgos nuevos — el fix de offsets de la sesión anterior se sostiene.
- **content.js (sesión/pintor/mensajería)**: 6 hallazgos, 4 relevantes a feature 27 + 2
  preexistentes (no introducidos por esta feature, hallados de paso).
- **spec + panel**: cumplimiento de los 20 CA confirmado; 1 hallazgo (contexts obsoleto en
  sidebar.js al salir de modo Editor).

## Fixes aplicados (7)

1. Race de URL en `fastSave`/`doSave` (content.js): `highlightSavedRange`/`noteLiveAnchor` podían
   pintar/anclar un ítem a la sesión de una página distinta si una navegación SPA ocurría durante
   el `await Store.addItem(...)`. Fix: capturar `location.href` antes del await, comparar después.
2. Timer de soft-fail huérfano en `startAnchorSession` (content.js): invocaciones solapadas podían
   dejar un `setTimeout` sin cancelar, marcando ítems 'failed' antes de tiempo. Fix: `clearTimeout`
   defensivo justo antes de instalar el nuevo timer (tras el await).
3. Contaminación cruzada de pestañas en `CH_ANCHOR_STATUS` (anchor-status.js): el broadcast de
   cualquier pestaña con sesión activa podía sobrescribir la franja de la pestaña activa en el
   panel. Fix: filtrar por `sender.tab.id` contra el `activeTabId` conocido (confirmado con la
   documentación de Chrome que `sender.tab` SÍ se puebla para content scripts).
4. `contexts` obsoleto en `sidebar.js` (`switchMode`/`onSelectContext`, rama `mode === "editor"`):
   no se refrescaba `contexts` tras `editor.flush()`, a diferencia de la rama `vista-edit`. Fix:
   añadir `contexts = await Store.listContexts()` en ambas funciones, igualando el patrón.
5. `fastSave`: `sendMessage(CH_OPEN_PANEL_CTX)` sin `.catch` (preexistente, inconsistente con el
   resto del archivo). Fix: `.catch(() => {})`.
6. Timer del toast de éxito del toolbar (`showToolbarSuccess`, preexistente) podía cerrar un
   toolbar nuevo abierto por una selección posterior dentro de los 450ms. Fix: capturar el
   elemento por closure en vez de depender de la variable global mutable.
7. Mismo patrón que 6, encontrado en la verificación adversaria de los fixes: el
   `setTimeout(teardown, 500)` de `doSave()` podía cerrar un popup/toolbar nuevo. Fix: capturar
   `popEl` por closure, sin tocar `removeToolbar()`.

Verificación adversaria final (1 agente, sonnet) sobre los 7 fixes: los 6 primeros CORRECTOS
(incluyendo confirmación documental de que `sender.tab.id` se puebla para content scripts en
`chrome.runtime.onMessage`), con una advertencia residual menor no bloqueante (orden de resolución
de `queryActiveTab()` en `activeTabId`) y el hallazgo #7 arriba, que también se corrigió.

`pnpm run build` ✅ e `init.sh` ✅ tras cada tanda de cambios. No se tocó `progress/current.md`
(no había sesión activa del harness — se decidió registrar este trabajo directamente aquí en vez
de reabrir el ciclo completo del pipeline, al ser una revisión de calidad sobre una feature ya
`done`, no una feature nueva).

**Pendiente**: la verificación manual en Chrome real (docs/test_highlight_persistence_robustness.md,
V1–V9) sigue sin ejecutarse.

---

## Session 2026-07-29 — Feature #28: export_format_selector

**Status:** done

**Summary:** Reemplazado el botón único de descarga '.md' por un botón "Exportar" con menú
desplegable, respaldado por un registro extensible de formatos (`EXPORT_FORMATS`) pensado para
admitir futuros formatos (p.ej. ligados a una autenticación con Google) sin rediseñar la UI.
Primera iteración: Markdown (sin cambios de comportamiento) + un nuevo export de tarjetas estilo
Anki (TSV) generado desde `ctx.items` — una tarjeta Front/Back por item idea/argumento/evidencia
(pregunta por subtítulo padre + categoría) y una tarjeta resumen por subtítulo con hijos.

Pipeline completo: Interviewer (4 preguntas de clarificación) → Researcher
(`docs/research_export_format_selector.md`) → Spec-Writer (`specs/028-spec-export_format_selector.json`)
→ ⛔ aprobación humana → Tester (`docs/test_export_format_selector.md`, 24 casos) → Implementer → Reviewer.

**Changes:**
- `vite-extension/src/sidebar/export-formats.js` (nuevo): registro `EXPORT_FORMATS` (`markdown`,
  `anki`) + `buildAnkiExport(ctx)` — genera filas Front/Back/Tags con cabecera
  `#separator:tab`/`#html:false`/`#tags column:3`, escapando tabs/saltos de línea por campo.
- `vite-extension/src/sidebar/export-menu.js` (nuevo): menú flotante mínimo (`createExportMenu()`),
  mismo patrón de factory por closure que `history.js`/`find.js`. Navegación con flechas/Enter/Escape,
  cierre por click-outside, sin memoria de la última selección (decisión explícita del usuario).
- `vite-extension/src/sidebar.js`: `mdBtn`/`downloadMd` → botón "Exportar" (ícono Download + chevron)
  + `downloadExport(ctx, formatId)`. Markdown conserva la resolución de buffer en vivo
  (vista-edit/editor); los demás formatos leen `Store.getContext` fresco (ignoran cambios sin
  guardar). `exportMenu.dispose()` en cada `renderHeader()` y en el estado vacío. Removido
  `makeMdMark()` (glifo SVG "MD" ya no usado).
- `vite-extension/src/sidebar.css`: nuevas reglas `.btn.export`, `.export-menu`,
  `.export-menu-item`; removidas `.btn.md`/`.md-mark` (dead code tras el reemplazo del botón).

No se modificó `storage.js` ni el contrato `buildMd`/`parseMd`. `pnpm run build` ✅ e `init.sh` ✅.

**Pendiente**: verificación manual en Chrome real de los 24 casos de
`docs/test_export_format_selector.md` (no ejecutada en esta sesión).

**Addendum 2026-07-29 (misma sesión):** el usuario pidió automatizar la verificación con Vitest
(ya instalado) en vez de una pasada manual en Chrome. Se siguió la convención de
[[project_testing_strategy]] (node env para lógica pura, jsdom vía docblock solo donde se toca DOM,
mocks a mano en vez de dependencias extra). Cambios:
- `vite-extension/vitest.config.js` (nuevo, separado de `vite.config.js` para no arrastrar el
  plugin CRXJS a los tests) + `"test": "vitest run"` en `package.json` + `jsdom` como devDependency.
- `src/sidebar/export-formats.test.js` (13 tests, entorno node): header Anki, pregunta/respuesta
  por item con y sin fuente, fallback a nombre de contexto y a label "Nota", tarjeta resumen de
  subtítulo con hijos (y ausencia si no tiene hijos), escapado de tabs/saltos de línea, tags.
- `src/sidebar/export-menu.test.js` (9 tests, entorno jsdom vía `@vitest-environment`): apertura/
  cierre del menú, aria-expanded, click en ítem, toggle en el mismo/otro anchor, Escape,
  navegación con flechas, click-outside, dispose().
- Nota de implementación durante la escritura de tests: `pnpm install`/`pnpm add` fallaban por un
  desajuste de store de pnpm (`node_modules` linkeado con pnpm v11, CLI activo v10) — se resolvió
  con `CI=true pnpm install` (recreación no interactiva sugerida por el propio pnpm), sin tocar
  lockfile ni dependencias de producción.
- 25/25 tests pasan. `pnpm run build` e `init.sh` siguen en verde tras los cambios.
- `docs/test_export_format_selector.md` actualizado con una sección que mapea qué TCs quedaron
  cubiertos por Vitest vs. cuáles siguen siendo manuales (todo lo que depende del runtime real de
  la extensión: chrome.storage.local persistido, side panel, temas, descarga real de archivo).

**Addendum 2026-07-29 (corrección de convención, misma sesión):** el usuario corrigió la
convención de colocation — los tests deben vivir en `vite-extension/tests/`, no junto al código
fuente. Un archivo de test por módulo (no uno combinado por feature), prefijado con el id de tarea
del harness. Se movieron `export-formats.test.js` → `tests/028-export-formats.test.js` y
`export-menu.test.js` → `tests/028-export-menu.test.js` (imports ajustados a `../src/...`), se
actualizó el `include` de `vitest.config.js` a `tests/**/*.test.js`, y se corrigió
[[project_testing_strategy]] para reflejar la nueva regla. 25/25 tests, `pnpm run build` e
`init.sh` en verde tras el cambio.

**Addendum 2026-07-29 (capa E2E con Playwright, misma sesión):** el usuario había corrido el
scaffold de Playwright por su cuenta (`playwright.config.js`, `tests/e2e/example.spec.js` default,
`.gitignore`, `@playwright/test` instalado) y pidió cerrar la tarea con esa herramienta. Se
escribió `tests/e2e/fixtures.js` (context/extensionId/page fixtures que cargan `dist/` real vía
`chromium.launchPersistentContext` con `--load-extension`) y
`tests/e2e/028-export-format-selector.spec.js` (5 tests: menú Exportar visible, descarga Markdown
real, descarga Anki real, sin memoria de formato, tema oscuro aplica tokens reales) — reemplazando
el `example.spec.js` placeholder. Se agregó `"test:e2e": "vite build && playwright test"` a
`package.json` y se recortó `playwright.config.js` a un solo project `chromium` (firefox/webkit no
aplican: las fixtures siempre lanzan Chromium directo).

Dos bugs de entorno encontrados y resueltos durante la implementación:
1. `import.meta.url` en `fixtures.js` rompía porque Playwright transpila `.js` planos a CJS salvo
   que `package.json` tenga `"type":"module"` — se resolvió el path vía `process.cwd()` en su lugar.
2. Los 5 tests colgaban indefinidamente (timeout esperando un service worker que nunca aparecía):
   `headless: true` resuelve al binario `chrome-headless-shell`, que solo implementa el headless
   **viejo** de Chromium — y ese modo no soporta cargar extensiones en absoluto (por eso existe el
   headless "new"). Fix: `headless: false` — válido porque esta corre en una sesión de escritorio
   real (Mac con WindowServer), no en un runner headless de CI.

25 tests Vitest + 5 tests Playwright, `pnpm run build` e `init.sh` en verde. Se verificó que no
quedaran procesos de Chrome huérfanos tras cada corrida. `docs/test_export_format_selector.md` y
[[project_testing_strategy]] actualizados con la cobertura E2E y sus gotchas.
