# Research: Ghost Border Bug in Highlight Re-application

**Feature**: Highlight persistence re-apply (`reapplyHighlights`)
**Bug**: After reload, re-applied highlights sometimes show a ghost colored top-border
and bottom-border on a line adjacent to the actual highlight span — not inside it.
**Investigator**: Researcher Agent
**Date**: 2026-06-30

---

## 1. How Re-application Works — Code Walkthrough

### Entry point (content.js lines 783–787)

```js
if ('requestIdleCallback' in window) {
  requestIdleCallback(() => reapplyHighlights(), { timeout: 2000 });
} else {
  setTimeout(reapplyHighlights, 100);
}
```

The function runs once, asynchronously, after the script is injected at
`document_idle` (per the manifest `run_at`). This fires after the DOM has been
parsed but before all sub-resources finish loading — images, fonts, etc. may
still be pending, but text nodes are present.

### `reapplyHighlights()` (lines 727–747)

1. Reads all stored data via `Store.readAll()`.
2. Filters items whose `sourceUrl === location.href` and `rangePrefix != null`.
   Items created via the Markdown editor (no `rangePrefix`) are explicitly
   excluded.
3. For each qualifying item, **rebuilds the full text index after every
   `applyMark()` call** (`buildTextIndex` + joined text string). This is
   intentional: inserting a `<mark>` mutates the DOM, so previously computed
   character offsets would be stale.

### `buildTextIndex(root)` (lines 641–656)

A `TreeWalker` collecting `SHOW_TEXT` nodes under `document.body`, skipping
nodes whose parent is already inside a `.ch-hl` element. Returns an array
`[{ node, start }]` with cumulative byte offsets for each text node.

### `findRangeForItem(item, textNodes, fullText)` (lines 674–707)

**Level 1 (anchored search):** Concatenates `prefix + item.text + suffix` and
finds its index in `fullText` (raw `String.indexOf`). Resolves start and end
positions back to `{node, offset}` pairs via `posToNodeOffset()`. Creates and
returns a `Range`.

**Level 2 (exact fallback):** If level 1 fails, searches for `item.text` alone.
Only proceeds if the text is **unique** (no second occurrence in `fullText`).

### `applyMark(range, category, itemId)` (lines 710–724)

```js
function applyMark(range, category, itemId) {
  const mark = document.createElement('mark');
  mark.className = 'ch-hl ch-hl-' + (category || 'idea');
  mark.dataset.chId = itemId;
  try {
    range.surroundContents(mark);
  } catch (_) {
    try {
      mark.appendChild(range.extractContents());
      range.insertNode(mark);
    } catch (__) {
      // range spans partial element boundaries — skip
    }
  }
}
```

Two fallback levels:
- Primary: `range.surroundContents(mark)` — works only if the range does **not**
  cross element boundaries.
- Fallback: `extractContents()` + `insertNode()` — extracts the fragment into the
  mark, then inserts the mark at the range's start.
- Silent skip if both fail.

### Storage format (storage.js lines 193–238)

Each stored item carries:
```json
{
  "id": "item_...",
  "type": "text|subtitle",
  "category": "title|idea|argument|evidence|null",
  "text": "…exact captured text…",
  "rangePrefix": "…up to 50 chars before selection…",
  "rangeSuffix": "…up to 50 chars after selection…",
  "sourceUrl": "https://…",
  "source": "domain.com",
  "createdAt": 1234567890
}
```

No XPath, no node identity, no character offsets relative to a specific element.
Anchoring is purely text-content based.

---

## 2. CSS Declarations on `.ch-hl` Classes (content.css lines 419–435)

```css
.ch-hl {
  background: #fdeaa8;
  color: #3a2f0b;
  font-weight: inherit !important;
  font-style: inherit !important;
  border-radius: 2px;
  padding: 0 1px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}
.ch-hl-title    { background: #f6b8c4; color: #5a1020; }
.ch-hl-idea     { background: #fdeaa8; color: #6a5413; }
.ch-hl-argument { background: #bcd3f5; color: #14315f; }
.ch-hl-evidence { background: #bfe6c8; color: #16432a; }
```

**No `border` property anywhere on `.ch-hl` or `.ch-hl-*`.**
No `outline`, no `box-shadow`, no `::before` / `::after` pseudo-elements.

The **critical property** is `box-decoration-break: clone`. This property
controls how a multi-line inline element's box decorations (background, padding,
border-radius) are repeated. With `clone`, each line fragment gets its own full
set of decorations. With the default value (`slice`), decorations are cut at
line-break boundaries.

---

## 3. Hypothesis Evaluation

### Hypothesis A — Split Text Nodes (surroundContents crossing element boundaries)

**Verdict: CONFIRMED as the primary bug trigger. Partially confirmed for the
border artifact.**

`Range.surroundContents()` throws a `HierarchyRequestError` if the range
partially contains any node — i.e., if the range starts or ends inside an
element node (not just a text node), or if the range crosses element boundaries.
This is extremely common in real pages: any selection that begins mid-sentence
inside a `<p>` and ends mid-sentence inside a different element, or that starts
inside a `<strong>` or `<a>` but does not fully enclose it.

The fallback is `extractContents()` + `insertNode()`. `extractContents()` on a
range that partially overlaps an element boundary **splits the partially-
intersected element**, producing two incomplete clones. For example, if the
range covers the middle of `<p>Foo <b>bar</b> baz</p>`, extracting the range
`bar baz` splits the `<b>`, leaving the original `<p>` and inserting detached
fragments. The surrounding DOM structure becomes irregular (partial elements,
detached or empty siblings).

How this produces ghost borders: The `box-decoration-break: clone` rule means
every line fragment of the `<mark>` gets its full `border-radius: 2px` and
`padding: 0 1px`. If the `<mark>` wraps a fragment that spans a line break, the
bottom edge of the first fragment and the top edge of the second fragment each
get their own border-radius rendering. In a browser compositing pass, when the
`<mark>`'s background does not perfectly align with adjacent elements (due to
split elements having their own margins/padding after `extractContents`), the
rounded corners of the mark background can visually look like a thin colored
border above or below adjacent text lines. This is not a CSS `border` property;
it is the **visual edge of the `background-color` slab clipped to
`border-radius`**, rendered by the browser as a top or bottom arc that appears
as a horizontal colored stripe.

Additionally, `extractContents()` removes the content from the DOM and
re-inserts it. If the parent block element has `line-height` or `margin`
differences from the `<mark>` element, the extracted fragment can shift its
baseline, making adjacent lines appear to have an extra gap that looks like a
border.

### Hypothesis B — CSS `display:block` leaking

**Verdict: REFUTED.**

The `.ch-hl` and `.ch-hl-*` classes have no `display` property set. A `<mark>`
element defaults to `display: inline` per the HTML specification. There is no
`border` property on the highlight classes. The visual artifact described
(top-border and bottom-border on adjacent elements) is not caused by a CSS
`display:block` declaration on the highlight classes.

However, there is a subtle secondary interaction: `box-decoration-break: clone`
on an inline element that happens to have been split by `extractContents()` and
re-inserted next to a block boundary can cause the background color's
`border-radius` edges to appear as a thin arc at the top and bottom of each line
fragment. This is a rendering artifact of `clone` mode, not a CSS `border`
property. So Hypothesis B is refuted as stated (no `display:block` or `border`
declarations), but `box-decoration-break: clone` is a contributing factor to the
visual appearance of the artifact.

### Hypothesis C — Non-deterministic Timing / Missing DOMContentLoaded Guard

**Verdict: REFUTED as stated, but partially relevant.**

The content script is loaded at `document_idle` (per `manifest.json run_at`),
which means Chrome guarantees the DOM is fully parsed before the script runs.
`requestIdleCallback` with `timeout: 2000` adds a small additional delay,
ensuring the script waits for an idle moment. There is no missing
`DOMContentLoaded` guard because `document_idle` already implies that.

The "non-determinism" in the bug is real but has a different cause: it is not
about timing of DOM parsing. The non-determinism comes from the **text index
re-build between marks** (line 739–741 in `reapplyHighlights`). After each
`applyMark()` call, the DOM is mutated by inserting or splitting `<mark>`
elements. The `buildTextIndex` re-run correctly reflects this, but if
`extractContents()` was used (fallback), the resulting DOM structure can be
non-deterministic in edge cases (e.g., empty text nodes left behind, adjacent
text nodes not normalized). This non-normalized DOM can cause subsequent
`buildTextIndex` calls to produce slightly different cumulative offsets for
items further down the list.

### Hypothesis D — Partial-match Text Search Producing Off-boundary Ranges

**Verdict: CONFIRMED as a secondary cause, explaining wrong-element matches.**

The search in `findRangeForItem` uses raw `String.indexOf` on the full
concatenated text of all text nodes (`textNodes.map(n => n.node.textContent).join('')`).
This concatenation has no separator between nodes. For example, two adjacent
text nodes `"foo"` (inside `<p>`) and `"bar"` (inside `<span>`) are joined as
`"foobar"`. If `item.text` is `"ooba"`, the search will find it straddling the
boundary between these two nodes.

`posToNodeOffset` will then resolve the start of `"ooba"` (at offset 2 in the
first node) and the end (at offset 1 in the second node), creating a Range that
crosses element boundaries. `surroundContents()` will throw because the range
crosses a node boundary, and the `extractContents()` fallback will split both
elements — exactly the pattern described for Hypothesis A.

This is non-deterministic because:
1. Whether the prefix+text+suffix sequence happens to land exactly within a
   single text node depends on page structure.
2. Pages may reflow or rerender text nodes differently (e.g., dynamic content,
   font loading, lazy scripts) producing slightly different tree structure on
   successive loads.

The **separator-less concatenation** is the root of this class of error.

### Hypothesis E — Stale or Duplicate Wrappers (double-firing)

**Verdict: REFUTED.**

`reapplyHighlights` is called exactly once, at the end of the IIFE, with no
`storage.onChanged` listener that would re-trigger it. The `buildTextIndex`
walker explicitly skips nodes already inside `.ch-hl` (line 647:
`if (n.parentElement && n.parentElement.closest('.ch-hl')) return NodeFilter.FILTER_REJECT`),
so even if the function were called twice, already-marked text nodes would be
invisible to the second pass. Double-wrapping is architecturally prevented.

---

## 4. Root Cause Ranking

### 1st (Primary) — Separator-less text concatenation + cross-node ranges

The `buildTextIndex` concatenation produces a string where text node boundaries
are invisible. A `rangePrefix + text + rangeSuffix` sequence can straddle a text
node boundary (e.g., prefix ends in the last character of one node, text starts
in the first character of the next). The resolved Range will cross an element
boundary. `surroundContents()` throws; `extractContents()` splits partial
elements. The resulting fractured DOM, combined with `box-decoration-break: clone`
on the inserted `<mark>`, renders as thin colored arcs at the top/bottom of the
mark fragment that look like ghost borders on adjacent lines.

**Non-determinism mechanism**: Whether the prefix+text+suffix string falls
entirely within a single text node or spans a node boundary depends on the
specific page's DOM structure on any given load (e.g., whitespace normalization,
inline elements, dynamic scripts that insert text). The split can happen on one
load and not another.

### 2nd (Amplifier) — `box-decoration-break: clone` rendering behavior

When a `<mark>` with `border-radius: 2px` spans multiple rendered lines (even
correctly, inside a single text node), the `clone` value causes each line
fragment to render its own `border-radius` — the bottom-right and bottom-left
corners of the top fragment, and the top-right and top-left corners of the
bottom fragment, both render as small colored arcs. On screens with subpixel
rendering or in certain zoom levels, these arcs appear as a thin top-border on
the second line and a thin bottom-border on the first line. This is not a bug in
isolation, but it amplifies the visibility of the split-element artifact.

### 3rd (Edge case) — Non-normalized text nodes after extractContents()

After `extractContents()` removes and re-inserts content, it can leave empty
text nodes or fail to merge adjacent text nodes. The subsequent `buildTextIndex`
call (which does not call `normalize()`) then sees a slightly different node
structure, shifting character offsets for items processed later in the loop.

---

## 5. Recommended Fix Approaches

### Fix A (Primary — separator-aware concatenation)

Insert a `\x00` (null byte, or any character that never appears in page text)
as a separator between text nodes when building the full text string. Store the
separator-aware positions in the index. When searching, ensure the match does
not span a separator. If the match crosses a separator, skip it and try the
fallback.

This prevents the resolved Range from ever crossing text node boundaries —
therefore `surroundContents()` will either succeed cleanly or the range will
correctly represent a cross-element selection that the skip branch handles.

Implementation sketch:
```js
const SEP = '\x00';
const parts = textNodes.map(n => n.node.textContent);
const fullText = parts.join(SEP);
// When indexOf finds a match, verify the match range contains no SEP character.
// If it does, the match straddles a node boundary — skip or narrow.
```

### Fix B (Alternative — normalize after each applyMark)

After each `applyMark()` call, call `document.body.normalize()` before
rebuilding the text index. This merges adjacent text nodes left by
`extractContents()`, making the index stable. Combined with Fix A, this
eliminates the non-normalized DOM edge case.

Risk: `normalize()` on `document.body` on a large page on every mark insertion
(O(n items) × O(DOM size)) can be slow for pages with many saved highlights.
Acceptable for typical use cases (< 20 highlights per page).

### Fix C (CSS — review `box-decoration-break: clone`)

Consider whether `box-decoration-break: clone` is actually desired. The spec
asks for simple pastel background highlights. Changing to `box-decoration-break:
slice` (the default) means multi-line marks lose their per-line border-radius
and padding, but eliminates the visible arc artifacts on line breaks.

If per-line decorations are desired, keep `clone` but remove the `border-radius`
(or set it to `0`) to prevent the arc rendering at line fragment edges.

### Fix D (Defensive — validate Range before applying)

Before calling `applyMark()`, check whether the resolved range crosses element
boundaries by comparing `range.startContainer` and `range.endContainer`:
- If both are the same text node → safe for `surroundContents()`.
- If they are in different text nodes → check if their respective parent
  elements are the same → if yes, still potentially safe; if no, skip.

This adds a safety check but does not prevent incorrect range resolution from
Hypothesis D.

---

## 6. Additional Risks and Edge Cases

### Single-page applications (SPAs)
The spec explicitly marks MutationObserver/SPA support as out-of-scope for v1.
On SPAs (React, Vue, Angular), `document_idle` fires once at initial page load.
If the user navigates within the SPA without a full page reload, `reapplyHighlights`
never re-runs, and highlights are not applied to the new content. This is a known
limitation, not a bug introduced by the fix.

### Captures from the Markdown editor (null rangePrefix)
Items created via `parseMd`/`replaceContextFromMarkdown` have `rangePrefix: null`
and are correctly excluded from re-application (line 734 check: `it.rangePrefix != null`).
These items will never generate ghost borders. The fix only affects items with
a stored rangePrefix/rangeSuffix.

### Empty text nodes from host page
Some pages deliberately include empty text nodes (e.g., React's text node
rendering). `buildTextIndex` includes them (their `textContent.length === 0`),
adding zero-width entries. This is harmless for `posToNodeOffset` but means the
separator fix (Fix A) should ignore zero-length nodes or treat them as
transparent.

### `item.text` containing the separator character (`\x00`)
Null bytes never appear in normal page text or in user-captured highlights.
Safe to use as separator for Fix A.

### `surroundContents()` with adjacent marks
If two saved highlights are adjacent (e.g., one ends where the next begins), the
second `buildTextIndex` run (after the first mark is applied) will correctly
skip the first mark's children (the FILTER_REJECT guard), but the surrounding
text nodes may have been split by the first mark's insertion. The positions of
the second highlight's prefix+text+suffix must still resolve correctly because
the text content of the surrounding text nodes is unchanged — only their node
identity has changed. Fix A is still effective here.

### Very long `item.text` with newlines (captured Markdown lists)
`fragmentToMarkdown()` can capture multi-paragraph text with `\n`. The
TextQuoteSelector search does not normalize whitespace. If the host page's DOM
normalizes whitespace differently on reload (e.g., `white-space: pre-wrap` vs.
normal flow), the exact text match may fail. This is an existing limitation, not
introduced by the fix. The skip-if-not-found criterion handles it gracefully.
