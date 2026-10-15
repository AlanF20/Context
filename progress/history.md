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

## Session 2026-09-04 — Feature #34: editor_tab_switch_persistence_bug

**Status:** done

**Repro reportado por el usuario:** al cambiar de Vista a Editor y volver a Vista (sin escribir nada), y luego recargar la página web (F5), el resaltado visual ya no se re-pinta — aunque la nota sigue en el panel. Efecto secundario: el "contexto detectado" de la toolbar flotante de captura también desaparecía.

**Causa raíz (docs/research_editor_tab_switch_persistence_bug.md):** `editor.flush()` (editor.js) y `docEditor.flush()`/`blur` (vista.js) guardaban incondicionalmente al salir del modo Editor/Vista-edit, sin comprobar si el buffer estaba realmente sucio. Eso disparaba `Store.replaceContextFromMarkdown`, que reconstruye TODOS los ítems del contexto y vacía `sourceUrl`/`rangePrefix`/`rangeSuffix`/`rangeText`/`rangeStart`/`rangeEnd` — el dato que `content.js` necesita para reanclar el highlight al recargar, y que `contextForThisPage()` necesita para detectar el contexto de la página.

**Changes:**
- `vite-extension/src/sidebar/editor.js`: `flush(onSave, { force })` — no-op si el buffer no está dirty, salvo `force: true` (usado por el atajo Cmd+S, que sigue guardando siempre).
- `vite-extension/src/sidebar/vista.js`: `docEditor.flush()` y el listener `blur` del textarea ahora comprueban `dirtySignalled` antes de guardar.
- `vite-extension/tests/034-flush-clean-noop.test.js` (Vitest, nuevo): cubre el no-op de `docEditor.flush()`/`blur` cuando está limpio y el guardado normal cuando está dirty (Monaco no es mockeable en jsdom, así que ese lado se cubre solo por E2E).
- `vite-extension/tests/e2e/034-editor-visit-preserves-anchor.spec.js` (Playwright, nuevo): sitio real, captura, visita a Editor sin editar, vuelta a Vista, reload — verifica que el highlight se reancla y que la toolbar sigue detectando el contexto; segundo test confirma que una edición real sigue perdiendo el ancla (sin regresión de spec 004/027).

**Verificación:** `pnpm run build` OK, `pnpm run test` 77/77 OK, `init.sh` OK, `pnpm run test:e2e -- tests/e2e/034-editor-visit-preserves-anchor.spec.js` 2/2 OK.

**Hallazgo fuera de alcance (no corregido, reportado al usuario):** el modal de onboarding introducido por la feature #33 bloquea (`intercepts pointer events`) todos los E2E que abren el side panel en un profile de Chromium nuevo — reproducido incluso con el fix de esta sesión revertido (stash), confirmando que es una regresión pre-existente de la #33, no de la #34. Rompe en la práctica los specs 028, 029 (parcial), 030, 031 y 032 en un profile limpio. El spec nuevo de esta sesión lo esquiva con un `dismissOnboardingIfOpen()` local. Pendiente decidir si se abre una feature nueva para el fix de raíz.

---

## Session 2026-07-30 — Feature #31: highlight_comment_capture

**Status:** done

**Summary:** Added an optional comment on capture, only for text categories
(idea/argumento/evidencia — never subtitles). Captured either from the full
popup's one-line input, or after a fast-save via a "+ agregar comentario"
link inside the "✓ Guardado" toast that morphs in-place into a mini-form. The
comment persists as a Markdown blockquote (`> comentario`) directly under the
item's own line, round-trips through `buildMd`/`parseMd`, appears in the
Vista (reusing the pre-existing `.md blockquote` style — no new renderer
needed) and in the Anki export's Back field.

**Changes:**
- `vite-extension/src/storage.js`: `addItem`/`updateItem` gain `comment`
  (text items only); `buildMd` emits it as `> `-prefixed line(s);
  `parseMd`'s blockquote handling now attaches an adjacent `>` block to the
  immediately preceding text item as its comment, falling back to the legacy
  "new item" behavior when there's no adjacent text item (hand-typed
  Markdown); `replaceContextFromMarkdown` copies it through.
- `vite-extension/src/content.js`: comment input row in the full popup
  (hidden for "Título"); fast-save toast gains the comment link/mini-form
  (no auto-dismiss while it's offered); `reclampToViewport()` + a `resize`
  listener fix a real bug found during manual QA — the side panel shrinks the
  page's own viewport (doesn't overlay it), which could leave the
  toast/popup positioned beyond the new edge.
- `vite-extension/src/content-storage.js`: resynced with `storage.js` — was
  stale (a deliberate hand-maintained duplicate, not a re-export) and silently
  dropped every comment before it reached storage. Found by the new E2E spec,
  invisible to Vitest since it always imports `storage.js` directly.
- `vite-extension/src/sidebar/export-formats.js`: Anki `back` gains a
  `Comentario: ...` segment between the text and the source.
- Tests: `tests/031-storage-comment.test.js`, `tests/031-export-formats-comment.test.js`
  (Vitest), `tests/e2e/031-comment-capture.spec.js` (Playwright, real site).

**Process note — new standing project requirement:** the user required, going
forward, an E2E Playwright spec for every DOM-touching change, not
manual-only verification (documented in `CLAUDE.md` § Testing and in memory).
Writing feature 31's E2E spec is what caught the `content-storage.js` desync
above — the concrete case for why the rule exists.

---

## Session 2026-07-30 — Feature #32: highlight_source_navigation

**Status:** done

**Summary:** Added a way to navigate from the Vista back to the page where a
highlight was captured, per explicit user constraints: no link per note, and
no raw URL repeated under each highlight. The Vista now groups consecutive
items sharing the same `sourceUrl` under a single icon-only "go to source"
button per group (hostname exposed only via `aria-label`/`title`, never as
visible text). Clicking it focuses the tab if that URL is already open (any
window), or opens a new tab if not — and in both cases scrolls to the exact
highlight once it's (re)anchored, reusing the existing anchoring pipeline
(features #4/#25/#27). This absorbs feature #2 (`preview_group_by_page`),
which is now marked `done` with `spec_path` pointing at #32's spec (it had no
spec of its own — its scope was folded into #32's).

**Changes:**
- `vite-extension/src/storage.js`: extracted `buildMdFragment(items)` out of
  `buildMd(ctx)` (same per-item rules, no title line) so the Vista can render
  one page-group's items as an independent Markdown fragment; `buildMd`'s
  output is byte-for-byte unchanged (pinned by regression tests).
- `vite-extension/src/content-storage.js`: resynced (`cp` + restored header)
  per the standing project convention — this file must stay a full manual
  copy of `storage.js`.
- `vite-extension/src/content.js`: new `scrollToItem(itemId)` (scrolls the
  painted Range's parent element into view); a new `session.scrollTarget`
  field consumed in two ways — (a) a direct `CH_SCROLL_TO_ITEM` message when
  the target tab is already open and its content script is alive, or (b) a
  `chrome.storage.local` relay flag (`CH_SCROLL_TARGET`), read once in
  `startAnchorSession()`, for the "open a brand-new tab" path where a
  fire-and-forget message would race the content script attaching its
  listener. Mirrors the existing `CH_NAV` relay pattern.
- `vite-extension/src/sidebar/vista.js`: `groupItemsBySource(items)` (exported
  for unit testing) partitions items into consecutive same-`sourceUrl` runs;
  `renderVista` now renders one icon-only header (via `sourceGroupHeader`)
  plus one Markdown fragment per group, instead of a single
  `marked(buildMd(ctx))` call over the whole document.
- `vite-extension/src/sidebar/source-nav.js` (new): `goToSource({sourceUrl,
  itemId})` — queries `chrome.tabs` for an existing tab at that URL; focuses
  tab+window and messages it directly if found, otherwise stashes
  `CH_SCROLL_TARGET` and calls `chrome.tabs.create`. First use of
  `chrome.tabs.create`/`update`/`chrome.windows.update` in the codebase — no
  manifest permission change needed, since `host_permissions: ["<all_urls>"]`
  already covers `tabs.query({url})` and `windows`/`tabs.create/update` need
  no extra permission at all.
- `vite-extension/src/sidebar.js`: delegated click listener on `#body` for
  `.vista-source-link`, wired to `goToSource`.
- `vite-extension/src/sidebar.css`: `.vista-source-header`/`.vista-source-link`
  styles (reuses `.icon-btn`).
- Tests: `tests/032-vista-grouping.test.js` (Vitest — grouping logic,
  `buildMd`/`buildMdFragment` regression, `goToSource` tab-decision logic with
  a `chrome.tabs`/`chrome.storage` mock); `tests/e2e/032-source-navigation.spec.js`
  (Playwright, real external site — one group icon with no visible URL text,
  click-focuses-existing-tab-no-duplicate, click-creates-new-tab-then-anchors).

**Process note:** the E2E spec's own polling helper (`waitForAnchorStatus`)
initially failed once on the "brand-new tab" case with "Could not establish
connection" — a race in the *test helper* (it sent `CH_GET_ANCHOR_STATUS`
before the fresh tab's content script had attached its listener), not a bug
in `goToSource`/`content.js`. Fixed by treating that rejection as "not
anchored yet, keep polling" (same as the existing "no tab yet" branch), not by
loosening what the test asserts — flagged here per the standing rule to never
silently adjust a test to force it to pass.

**Addendum (mismo día): el usuario pidió mostrar el nombre de la página junto
al ícono.** Se clarificó por pregunta directa (no había ambigüedad que
ameritara research: "nombre" = el dominio, ya disponible vía
`Store.hostnameFromUrl`, no el `<title>` real de la página — eso hubiera
requerido capturar y persistir un campo nuevo por ítem) y el layout deseado
(ícono + texto, ambos visibles). Esto revierte a propósito dos criterios de
aceptación originales de la spec ("ícono-only", "nunca impreso como texto
visible") — documentado como `amendments` en
`specs/032-spec-highlight_source_navigation.json` en vez de reescribir la
historia. Cambios: `vista.js` (`sourceGroupHeader` agrega un `<span
class="vista-source-label">`), `sidebar.css` (el botón pasa de ícono
cuadrado 24×24 a pastilla `inline-flex` ícono+texto). El E2E de la sección
"sin URL/dominio como texto visible" se actualizó para afirmar lo contrario
del dominio (visible) mientras seguía negando la URL completa con esquema —
no se tocó ninguna aserción sobre `chrome.tabs`/scroll/anclaje. 68/68 Vitest
y 17/17 Playwright en verde tras el cambio; `pnpm run build` e `init.sh`
también.

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

---

## Session 2026-07-29 — Feature #30: editor_stale_buffer_cross_page

**Status:** done

**Summary:** Bug reportado por el usuario: con el side panel abierto en la pestaña Editor (Monaco)
o en Vista-edit para un Contexto, una captura guardada desde OTRA página/pestaña (misma pestaña de
Chrome, navegación secuencial) no aparecía — el panel seguía mostrando el contenido de antes de esa
captura. Causa raíz (docs/research_editor_stale_buffer_cross_page.md): el listener
`chrome.storage.onChanged` (sidebar.js:66-89) solo refrescaba (`render()`) en `mode === "vista"` y
nunca invalidaba el buffer en memoria del Editor (`buffers[ctx.id]`, editor.js:49) ni remontaba
Vista-edit; ese buffer siempre ganaba sobre datos frescos y solo se invalidaba en 3 flujos internos
(borrar/renombrar/vista-edit sync), ninguno disparado por una escritura externa.

**Alcance ampliado durante el gate de aprobación:** el usuario pidió incluir también Vista-edit
(textarea inline), no solo el Editor Monaco — la spec y el fix cubren ambos modos.

**Changes:**
- `vite-extension/src/sidebar/editor.js`: nuevo método `isDirty(ctxId)` (true si `ctxId ===
  currentCtxId` y el indicador visual de "sin guardar" está visible).
- `vite-extension/src/sidebar/vista.js`: `dirtySignalled` elevado de variable local del listener
  `input` a variable del controlador; nuevo método `isDirty(ctxId)`.
- `vite-extension/src/sidebar.js`: el listener de `chrome.storage.onChanged` ahora, para cada
  contexto con ítems nuevos detectados externamente, invalida el buffer del Editor si no está dirty;
  refresca `contexts` incondicionalmente (ya no solo en modo vista); si el contexto afectado es el
  abierto en Editor o Vista-edit y no tiene ediciones sin guardar pendientes, remonta ese modo en
  vivo (`renderMain()`) para mostrar la captura sin que el usuario cambie de pestaña. Si hay
  ediciones sin guardar, se preserva el trabajo en curso (comportamiento "anti-clobber" preexistente,
  documentado como fuera de alcance su resolución de conflictos).
- `vite-extension/tests/030-editor-vista-dirty.test.js` (nuevo, Vitest/jsdom): 10 tests cubriendo
  `isDirty` en ambos controladores (antes de montar, recién montado, dirty, dirty de otro contexto,
  tras dispose).

**Verificación:** 35/35 tests Vitest en verde (10 nuevos + 25 preexistentes), `pnpm run build` sin
errores, `./init.sh` en verde. Ver `docs/test_editor_stale_buffer_cross_page.md` para el plan de
verificación manual completo (11 casos, incluyendo el repro original A→B en una sola pestaña).

**Addendum (mismo día): cobertura E2E añadida a pedido del usuario.**
`vite-extension/tests/e2e/030-editor-live-refresh.spec.js` (2 tests, Playwright contra el build real
en `dist/`) reproduce el bug reportado sin depender de un sitio externo real: simula la "captura
externa" llamando `chrome.storage.local.set()` desde el service worker de la extensión (mismo efecto
que `addItem()` desde otra pestaña/página). Cubre: (1) Editor limpio + dos capturas externas
sucesivas → ambas visibles en vivo sin cambiar de pestaña ni recargar (el repro original); (2) Editor
con ediciones sin guardar → no se pisa. 6/6 corridas en verde, sin flakiness.

**Hallazgo colateral:** al intentar automatizar el caso Vista-edit, se confirmó que el modo
`"vista-edit"` (textarea inline, spec 018) **no tiene ningún punto de entrada en la UI actual** — el
botón lápiz que lo activaba ya no existe en `renderHeader` y ningún otro código llama a
`switchMode("vista-edit")` (0 resultados al grepear `src/`). Es código muerto alcanzable solo si algo
externo invocara `switchMode` directamente. `docEditor.isDirty()` y la rama Vista-edit del fix siguen
cubiertas a nivel Vitest, pero TC-04/TC-05 del plan de pruebas quedaron marcados como no verificables
(ni manual ni E2E) hasta que se restaure un punto de entrada o se decida eliminar esa rama muerta.
Detalle completo en `docs/test_editor_stale_buffer_cross_page.md`.

---

## Session 2026-07-30 — Feature #33: active_reading_rebrand

**Status:** done

**Summary:** Rebrand acotado de "Context Highlighter" a "Active Reading": nuevo ícono (provisto
por el usuario en `src/assets/icon.png`, 1254×1254), nuevo nombre/descripción en `manifest.json`,
y un modal de onboarding en el side panel que explica qué es la lectura activa y qué significa
cada una de las 4 categorías/colores existentes (Título/Idea/Argumento/Evidencia) — más un ícono
"?" persistente en el rail para reabrirlo. Las 4 categorías, sus colores, el modelo de datos,
`buildMd`/`parseMd` y la paleta general de la UI **no cambiaron** (constraint confirmado por el
usuario en la entrevista). Pipeline completo: Interviewer (4 preguntas) → Researcher
(`docs/research_active_reading_rebrand.md`) → Spec-Writer
(`specs/033-spec-active_reading_rebrand.json`) → ⛔ aprobación humana ("proceed") → Tester
(`docs/test_active_reading_rebrand.md`) → Implementer → Reviewer.

**Changes:**
- `vite-extension/src/assets/icon-{16,32,48,128}.png` (nuevos): generados desde `icon.png` vía
  `sips` (herramienta nativa de macOS, sin dependencias nuevas).
- `vite-extension/package.json`: nuevo script `"icons"` que encadena los 4 comandos `sips`, para
  poder regenerar los tamaños si el ícono fuente cambia.
- `vite-extension/manifest.json`: `name` → `"Active Reading"`, `description` nueva en español,
  `icons` + `action.default_icon` con las 4 claves de tamaño, `action.default_title` actualizado
  (hallazgo del Reviewer: seguía diciendo "Open Context Highlighter sidebar" — corregido a "Abrir
  el panel de Active Reading").
- `vite-extension/src/sidebar.html`: `<title>` → "Active Reading"; nuevo botón `#onboarding-help-btn`
  en el rail (ícono lucide `CircleQuestionMark` — confirmado que `HelpCircle`/`CircleHelp` no
  existen en la versión instalada); nuevo `<dialog id="onboarding-modal">` con título, párrafo
  explicativo (copy exacto del research), lista de 4 categorías (swatch + nombre + explicación,
  cada swatch referenciando los tokens `--cat-*-border` ya existentes, no hex hardcodeado), y
  botón "Entendido".
- `vite-extension/src/sidebar/onboarding.js` (nuevo): `openOnboarding()` / `initOnboarding(btn)`,
  mismo patrón de `<dialog>` nativo que `modal.js`. Auto-muestra en la primera apertura
  (`!Store.hasSeenOnboarding()`), marca el flag en el evento `close` del diálogo (cubre botón/
  Escape/click-en-backdrop vía un listener adicional que compara `e.target === dialog`). Reabrir
  desde el ícono "?" no depende del flag.
- `vite-extension/src/storage.js`: `hasSeenOnboarding()` / `markOnboardingSeen()`, puramente
  aditivo sobre el documento `{contexts}` ya existente (`data.onboardingSeen`). No se tocó
  `buildMd`/`parseMd`/`CATEGORIES`/`typeForCategory` — por eso `content-storage.js` **no** se
  resincronizó (el flag es solo de UI del side panel, el content script nunca lo usa).
- `vite-extension/src/sidebar.css`: estilos aditivos para `#onboarding-modal` (reutiliza el chrome
  de diálogo de `#confirm-delete-modal`) y para el botón "?" (reutiliza `.icon-btn`, sin clase
  nueva de botón).
- `vite-extension/src/sidebar.js`: importa y llama `initOnboarding(onboardingHelpBtn)` al arrancar,
  mismo patrón que `initTheme`.
- `vite-extension/tests/033-onboarding.test.js` (nuevo): mock en memoria de
  `chrome.storage.local` — flag ausente → false, tras `markOnboardingSeen()` → true, flag
  pre-poblado → true, marcar el flag no pisa `contexts`/items existentes.

**Verificación:** 7/7 archivos Vitest, 72/72 tests en verde (incluye los 4 nuevos). `pnpm run
build` sin errores (íconos y manifest compilan correctamente a `dist/`). `./init.sh` en verde.
`git diff --stat -- outputs/` vacío (legado intacto). `content.js`/`content-storage.js` sin tocar
— no se requirió spec E2E nuevo (regla dura de CLAUDE.md solo aplica a cambios de DOM en la página
anfitriona; este cambio vive en `manifest.json` + side panel). Tamaños de ícono verificados con
`sips -g pixelWidth -g pixelHeight` (16/32/48/128 exactos).

**Hallazgo del Reviewer (corregido en la misma sesión):** el Implementer no actualizó
`action.default_title` en `manifest.json`, dejando "Open Context Highlighter sidebar" visible en
el tooltip de la toolbar — inconsistente con el resto del rebrand aunque no estaba listado
explícitamente en los acceptance criteria de la spec. Corregido directamente por el Reviewer
(cambio de una línea) y reverificado con `pnpm run build` + inspección del `dist/manifest.json`
compilado.

**Pendiente:** verificación manual en Chrome real de `docs/test_active_reading_rebrand.md`
(secciones 3–5: build & load, modal de onboarding, accesibilidad) — no ejecutada en esta sesión,
solo la verificación automatizada/de build.

---

## Session 2026-09-04 — Feature #35: onboarding_modal_blocks_e2e

**Status:** done

**Descubierto durante el cierre de la feature #34:** el modal de onboarding introducido por la
feature #33 se auto-abre en cualquier perfil de Chromium nuevo (su flag `onboardingSeen` vive
dentro del mismo objeto `contextHighlighter` que `contexts` en chrome.storage.local) e intercepta
todos los clics (`<dialog>` nativo, "intercepts pointer events") hasta cerrarse. Confirmado
independiente de la #34 (reproducido con ese fix revertido vía `git stash`). Rompía en la práctica
los specs 028, 030, 031 y 032 (029 no abre el side panel, no estaba afectado).

**Causa raíz de por qué un seed único no bastaba (docs/research_onboarding_modal_blocks_e2e.md):**
los specs 028 y 030 sobrescriben el objeto `contextHighlighter` completo para sembrar su fixture
de datos, borrando `onboardingSeen` y reabriendo el modal en el siguiente `reload()`.

**Changes:**
- `vite-extension/tests/e2e/fixtures.js`: nuevo `autoDismissOnboarding(page)` + `context.on("page", ...)`
  con un listener `domcontentloaded` persistente (no one-shot) por página — cierra el modal en la
  carga inicial de `sidebar.html` y en cualquier reload posterior, sin tocar `onboarding.js`,
  `storage.js` ni los specs individuales.
- `vite-extension/tests/e2e/034-editor-visit-preserves-anchor.spec.js`: limpieza — removido el
  `dismissOnboardingIfOpen()` local, ya redundante una vez que el fixture lo maneja centralmente.

**Verificación:** `pnpm run build` OK, `pnpm run test` 77/77 OK, `init.sh` OK, `pnpm exec playwright
test` (suite completa, 19 tests): 17 passed, 1 flaky en 031 (resize, no relacionado, pasó en
retry), 1 failed en 029/Medium — confirmado pre-existente e independiente de este fix (reproducido
igual revirtiendo `fixtures.js` vía stash; ese spec nunca abre el side panel). Cero fallos por
"intercepts pointer events" tras el fix.

**Pendiente:** el fallo de 029/Medium ("never reached 'anchored' status") queda fuera de alcance —
posible flakiness real del sitio (paywall/contenido cambiado), no relacionado con el modal de
onboarding. Podría justificar su propia feature de diagnóstico si se repite.

---

# Session — Feature #37 pdf_highlight (2026-10-06 → 2026-10-08)

> Reset this file at the end of every session by appending its content to `history.md`.
> Keep it updated **in real time** while working, not at the end.

- **Feature in progress:** #37 pdf_highlight
- **Started:** 2026-10-06
- **Active agent:** Implementer
- **Retry count:** 0 / 3
- **Spec approved by human:** sí (2026-10-08)

## Plan

1. init.sh ✅
2. Feature #37 añadida a feature_list.json (in_progress)
3. Interviewer → Researcher → Spec-Writer → ⛔ gate humano

## Log

- 2026-10-06 init.sh verde. ID 37 (no 36: existe test sin registrar 036-replace-from-markdown-preserves-anchors.test.js + cambios sin commitear en storage.js/editor.js ajenos a esta feature).

- 2026-10-06 Interviewer: botón manual (sin auto-redirect); fuentes http(s) + file://; re-anclar por página+quote; Vista/export como web + nº de página.
- 2026-10-06 Researcher lanzado → docs/research_pdf_highlight.md
- 2026-10-06 Research listo (docs/research_pdf_highlight.md). Spec draft: specs/037-spec-pdf_highlight.json.
- 2026-10-08 Spec 037 aprobada por el usuario.
- 2026-10-08 Tester: docs/test_pdf_highlight.md.
- 2026-10-08 Baseline (antes de tocar nada): Vitest 82/82; E2E 19 passed / 5 failed preexistentes (029 AnkiWeb, 029 Medium, 031 fast-save toast, 031 resize reclamp, 034 'Editar un ítem no perturba…').
- 2026-10-08 Paso 1 (spike opción A): plugin vite-plugins/isolate-content-script.js. Control sin plugin → chunk compartido `paint-*.js` + loader con import(); con plugin → content.js autocontenido. Opción A adoptada.
- 2026-10-08 Paso 2 (refactor content.js → src/capture/{ui,markdown,ranges,paint}.js): E2E idéntico al baseline (mismos 5 fallos, 19 passed).
- 2026-10-08 Paso 3: storage.js (isPdfItem, pdfFilename, page/sourceTitle, _Fuente: x.pdf, p. N_) + content-storage.js resincronizado. Vitest 108/108.

Tester → docs/test_pdf_highlight.md; luego Implementer (paso 1: spike aislamiento de chunks).

