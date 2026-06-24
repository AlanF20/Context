# Research: Rich Markdown Preview + Document-Level Inline Edit (Feature 18)

## Problem statement

The current Vista mode renders each item one-by-one as `<li>` elements with per-item
pencil/trash icon buttons revealed on hover. To edit any note the user must hover → click
pencil → a `<textarea>` replaces that specific item's text → Enter/blur saves. This is the
"box-by-box" pattern the user wants to move away from.

Three additional gaps:
1. The Vista never renders full Markdown — bold, italic, inline code, source links are
   shown as raw text or plain items.
2. Delete is per-item (fine) but edit-per-item creates friction when the user wants to
   clean up multiple notes at once.
3. The reading experience (preview) and the writing experience (per-item boxes) compete
   on the same surface, making neither feel polished.

---

## Best-practice survey

### 1. Notion (block editor)
- Single continuous document; blocks become editable on click.
- No explicit "enter edit mode" button — the document is always "ready to edit."
- Works well for structured content, but requires a complex block-editor engine.

### 2. Confluence / Dropbox Paper (modal edit)
- View mode: beautifully rendered.
- Edit mode: enter by clicking "Edit" in the header; the entire body switches to editable.
- Clear read/write separation reduces accidental edits.
- Single "Done / Publish" button returns to read mode.

### 3. Bear / Craft (toggle preview)
- The document is stored as Markdown.
- "Preview" toggle renders the Markdown; the default view is the raw source in a
  syntax-aware textarea.
- User explicitly switches between source and rendered views.

### 4. GitHub wiki / GitLab pages (edit-page model)
- View = fully rendered HTML.
- "Edit" button replaces the whole content with a `<textarea>` containing the Markdown.
- Save / Cancel buttons.
- No per-paragraph inline boxes.

### Conclusion for this extension

Given:
- The document is structurally Markdown (built by `buildMd` / parsed by `parseMd`).
- `marked` + `DOMPurify` are already npm-installed dependencies.
- Monaco is vendored for power-user editing.
- The side panel is narrow; a block editor would be over-engineered.

**Recommended pattern: Modal document edit (Confluence/GitHub wiki style)**

- **Vista = rich rendered Markdown** via `marked(buildMd(ctx))` + `DOMPurify.sanitize()`.
  All markdown elements render: `##` headings, `**bold**` source lines, emoji badges, etc.
- **Edit mode**: a single "Editar" button in the ctx-header (or double-click on the body)
  replaces the rendered `<div>` with a `<textarea>` containing the full Markdown source.
- **Auto-save**: debounced 400 ms + blur, via `Store.replaceContextFromMarkdown()` (same
  contract Monaco uses). Invalidates the Monaco buffer (`editor.invalidate`).
- **Return to preview**: "Listo" button or Escape re-calls `renderVista`.
- **No per-item edit buttons**: removed entirely. Deletion is handled via the textarea or
  the Monaco Editor tab.

---

## Impact analysis

### Files that change
| File | Change |
|---|---|
| `vite-extension/src/sidebar/vista.js` | Remove `buildItem` edit branch + `startEdit`. Add `renderMarkdownPreview` + `enterEditMode` / `exitEditMode`. |
| `vite-extension/src/sidebar.js` | Update `renderMain` to pass the new `onEdit` callback; update `vistaOnMutate`. |
| `vite-extension/src/sidebar.css` | Add `.vista-md-preview` wrapper styles; `.vista-edit-doc` textarea styles; remove per-item editing styles. Keep left-border accent rules (they apply to the rendered Markdown). |

### Files unchanged
- `storage.js` — `buildMd` and `replaceContextFromMarkdown` already provide the correct
  Markdown ↔ model contract.
- `editor.js` — Monaco tab stays identical.
- `content.js`, `background.js`, `manifest.json` — no touch.

---

## Markdown rendering decisions

### What `buildMd(ctx)` emits
From `storage.js` (inspected):
```
# Context Name

## Subtitle text

🟡 Idea text
_Fuente: domain.com_

🔵 Argumento text

🟢 Evidencia text
```

When passed through `marked`, this produces:
- `<h1>` for the context name heading
- `<h2>` for subtitles
- `<p>` for each emoji-prefixed note (rendered as-is — emoji are plain text)
- `<em>` for the italicized source line

All of these are safe, readable and convey structure without extra CSS hacks.

### Styling the rendered output
The existing `.md` CSS class in `sidebar.css` already defines styles for `h1`, `h2`, `h3`,
`p`, `em`, `a`, `ul`, `ol`, `li`, `code`, `pre`, `blockquote`, `table`. The Vista only needs to
wrap the `marked` output in a `<div class="md">` and apply `DOMPurify.sanitize`.

### Left-border accents
After rendering the Markdown, the left-border accents can no longer be applied per-item
via `data-category` on `<li>` elements (since `marked` generates generic `<p>` tags).
This is acceptable for this feature: the category info IS present as the emoji prefix
(🟡🔵🟢 etc.) inside the rendered `<p>`. The left-border accent was a Feautre #6 addition
for the item-by-item view; it is not compatible with generic Markdown rendering. Removing
it is the right call to keep the Vista as a true rendered document.

---

## Delete-item capability

The per-item delete button is removed in this design. Users can delete items by:
1. Entering the inline edit mode (textarea) and removing the Markdown line(s).
2. Switching to the Editor (Monaco) tab.

This is consistent with how Confluence, GitHub wiki, and Bear handle it. Adding a
"delete" confirmation modal would add complexity out of scope for this feature.

---

## Edge cases

- **Empty context**: Keep the existing empty-state `<div class="state">` (same as before).
- **Concurrent edits**: `chrome.storage.onChanged` already skips re-render while in editor
  mode; the same guard will apply to the new inline edit mode (`mode === "vista-edit"`).
- **Cursor position**: `<textarea>` auto-focus + `select-all` on open gives a natural entry.
  Cursor position is not persisted across mode switches (acceptable for this level of editor).
- **Monaco buffer**: When entering inline-edit mode from Vista, the Monaco buffer for that
  context should be invalidated so it regenerates from updated storage on next open.
- **Long documents**: The `<textarea>` should grow to fill the available body space
  (`flex: 1`) and scroll internally, matching Monaco's behavior.
- **Theme**: Both the preview div and the textarea inherit the panel theme tokens (no
  hardcoded dark like Monaco has).

---

## Summary of recommended implementation

1. `renderVista(mountEl, ctx, opts)` now renders `DOMPurify.sanitize(marked.parse(buildMd(ctx)))` inside a `.vista-md-preview.md` div. The item-loop, `buildItem`, `startEdit` are all removed.
2. An "Editar documento" pencil button is added to `ctx-header` row 1 (alongside the existing `.md` download button). Clicking it calls `enterEditMode()`.
3. `enterEditMode(mountEl, ctx, opts)` replaces the preview div with a `<textarea class="vista-edit-doc">` pre-filled with `buildMd(ctx)`. A "Listo" button appears in the header. Escape also exits.
4. Auto-save: `input` event → debounce 400 ms → `Store.replaceContextFromMarkdown` → `editor.invalidate(ctxId)` → `onSync()` to refresh rail counter.
5. Blur on the textarea also triggers an immediate save.
6. "Listo" or Escape: save immediately → `renderVista` re-renders the preview.
7. `sidebar.js` tracks a third mode value `"vista-edit"` alongside `"vista"` and `"editor"`.
