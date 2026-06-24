# Research: List Structure Preservation on Capture

**Feature:** `list_structure_capture`
**Date:** 2026-06-24
**Author:** Researcher agent

---

## Problem Summary

When a user selects text spanning list elements (`<ul>/<ol>/<li>`) and clicks
"Guardar resaltado", the saved note loses all list structure. Bullets and
numbering are stripped because `window.getSelection().toString()` returns
only concatenated plain text. The stored `item.text` becomes
`"Item 1\nItem 2\nItem 3"` instead of `"- Item 1\n- Item 2\n- Item 3"`. The
Vista preview and Markdown export then show unstructured paragraphs where the
original page had an enumerated or bulleted list.

---

## Root Cause

### Where `savedText` is set

**`vite-extension/src/content.js`, line 33:**
```js
const text = sel ? sel.toString().trim() : "";
```
`sel` is `window.getSelection()`. `Selection.toString()` is defined by the
spec to return the concatenation of all selected text nodes, with no HTML
structure. Bullet markers, ordinal numbers, and indentation levels are all
discarded at this point.

**Line 35:**
```js
savedText = text;
```
`savedText` is the module-level variable that is later passed verbatim into
`Store.addItem`.

### Where `savedText` reaches storage

**`content.js`, lines 380–387 (inside `doSave`):**
```js
const savedItem = await Store.addItem(ctx.id, {
  text: savedText,
  category,
  linkedSubtitleId,
  sourceUrl: location.href,
  rangePrefix,
  rangeSuffix,
});
```

**`vite-extension/src/storage.js`, lines 206–218 (inside `addItem`):**
```js
const item = {
  id: uid("item"),
  type,
  category,
  text: (opts.text || "").trim(),
  ...
};
```
The `.trim()` call is the last processing done to the text. Whatever string
arrives as `opts.text` is stored as-is. There is no HTML-to-Markdown
conversion anywhere in this path.

### Why the range is available but unused

**`content.js`, line 36:**
```js
savedRange = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
```
A `Range` object **is** saved. `range.cloneContents()` on this Range would
return a `DocumentFragment` that contains the full DOM tree of the selection,
including `<ul>`, `<ol>`, and `<li>` elements. This fragment is available at
the time `doSave()` runs (it is not cleared until `teardown()` is called),
but `doSave()` never calls `cloneContents()` — it only uses `savedText`.

---

## HTML → Markdown Conversion Algorithm

The fix uses `savedRange.cloneContents()` to get a `DocumentFragment`, then
walks its tree to produce Markdown. The algorithm must handle:

1. Plain inline text nodes → emit as-is
2. Block elements (`<p>`, `<div>`, `<h1>`–`<h6>`) → emit their inner text
   with a trailing newline
3. `<ul>` → walk `<li>` children; prefix each with `- ` at the current
   indent level
4. `<ol>` → walk `<li>` children; prefix each with `{n}. ` (counter
   increments per list)
5. Nested lists → recurse, increasing indent by 2 spaces per level
6. `<br>` → emit `\n`
7. Definition lists (`<dl>`/`<dt>`/`<dd>`) — see Edge Cases below

### Pseudocode

```js
/**
 * Convert a DocumentFragment (or any Node) to a Markdown string.
 * @param {Node} node
 * @param {number} indent  - current indentation level (0-based, 2 spaces each)
 * @param {boolean} ordered - whether the immediate parent list is ordered
 * @param {{n: number}} counter - shared mutable counter for ol items
 * @returns {string}
 */
function nodeToMarkdown(node, indent = 0, ordered = false, counter = { n: 1 }) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent; // preserve inline whitespace
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const tag = node.tagName.toLowerCase();
  const pad = "  ".repeat(indent);

  switch (tag) {
    case "ul": {
      const parts = [];
      for (const child of node.children) {
        if (child.tagName.toLowerCase() === "li") {
          parts.push(liToMarkdown(child, indent, false));
        }
      }
      return parts.join("\n") + "\n";
    }
    case "ol": {
      const parts = [];
      let n = 1;
      for (const child of node.children) {
        if (child.tagName.toLowerCase() === "li") {
          parts.push(liToMarkdown(child, indent, true, n++));
        }
      }
      return parts.join("\n") + "\n";
    }
    case "li":
      // Handled via liToMarkdown when called from ul/ol branch above.
      // If an li is encountered at the top level (partial selection), treat
      // it as an unordered bullet.
      return liToMarkdown(node, indent, false);
    case "br":
      return "\n";
    case "p":
    case "div":
      return childrenToMarkdown(node, indent).trim() + "\n\n";
    case "h1": return "# " + node.textContent.trim() + "\n\n";
    case "h2": return "## " + node.textContent.trim() + "\n\n";
    case "h3": return "### " + node.textContent.trim() + "\n\n";
    case "strong":
    case "b":
      return "**" + node.textContent + "**";
    case "em":
    case "i":
      return "_" + node.textContent + "_";
    case "code":
      return "`" + node.textContent + "`";
    default:
      return childrenToMarkdown(node, indent);
  }
}

function liToMarkdown(li, indent, ordered, n = 1) {
  const pad = "  ".repeat(indent);
  const bullet = ordered ? `${n}. ` : "- ";
  // Split li content: inline text first, then nested lists.
  let inlineText = "";
  const nestedBlocks = [];
  for (const child of li.childNodes) {
    const t = child.tagName && child.tagName.toLowerCase();
    if (t === "ul" || t === "ol") {
      nestedBlocks.push(nodeToMarkdown(child, indent + 1));
    } else {
      inlineText += nodeToMarkdown(child, indent);
    }
  }
  const firstLine = pad + bullet + inlineText.trim();
  if (nestedBlocks.length) {
    return firstLine + "\n" + nestedBlocks.join("");
  }
  return firstLine;
}

function childrenToMarkdown(node, indent) {
  let result = "";
  for (const child of node.childNodes) {
    result += nodeToMarkdown(child, indent);
  }
  return result;
}

/**
 * Entry point: convert the cloned range contents to a Markdown string.
 * Collapses multiple blank lines and trims the result.
 */
function fragmentToMarkdown(fragment) {
  const md = childrenToMarkdown(fragment, 0);
  return md.replace(/\n{3,}/g, "\n\n").trim();
}
```

### Edge Cases

| Case | Behavior |
|---|---|
| **Partial list selection** (only some `<li>` items) | `cloneContents()` returns only the selected nodes. If the selection starts mid-`<li>`, the fragment contains a partial `<li>`. The algorithm handles this by treating any `<li>` it encounters as a bullet. |
| **Mixed content** (text paragraph before a list) | The outer loop processes `<p>` then `<ul>` sequentially; both convert correctly. |
| **Deeply nested lists** | Recursion increases `indent` at each `<ul>`/`<ol>` level. Markdown renderers (including `marked` with GFM) support arbitrary nesting. |
| **Definition lists** (`<dl>`/`<dt>`/`<dd>`) | Not natively supported in CommonMark. Recommended fallback: render `<dt>` as `**term**` and `<dd>` as indented plain text: `  definition`. This is readable and survives `marked.parse()` without becoming corrupt. |
| **Selection starts inside a text node** (common case) | `cloneContents()` correctly clones only the selected portion of the text node; the algorithm receives plain text and handles it with the `TEXT_NODE` branch. |
| **Tables** (`<table>`) | Out of scope for this feature; fall back to `node.textContent` for table elements to avoid producing malformed Markdown. |

---

## Storage Contract Analysis

### `item.text` field expectations

In `storage.js`, the `text` field has no declared format constraint. Every
consumer either:
- Trims it: `text: (opts.text || "").trim()` (line 210, `addItem`)
- Trims it again on patch: `item.text = patch.text.trim()` (line 272, `updateItem`)
- Passes it through `parseMd` when rebuilding from a Markdown editor round-trip
- Outputs it verbatim through `buildMd`

`buildMd` (lines 410–425) inserts `item.text` verbatim into the Markdown output:
```js
lines.push(prefix + it.text, "");
```
Because `marked.parse()` processes the resulting string with GFM enabled
(`{ gfm: true, breaks: false }`), Markdown inside `item.text` — including
list syntax — **will be rendered correctly** by the Vista preview. A stored
text of `"- Item 1\n- Item 2"` will produce a `<ul>` in the preview.

### Does `buildMd` need changes?

**No.** `buildMd` already emits `item.text` verbatim followed by a blank
line. If `text` contains Markdown list syntax, `marked` will parse it as a
list inside the rendered preview. No change required.

### Does `parseMd` need changes?

**Potentially yes, for round-trip correctness.** Currently `parseMd`
(lines 438–476) splits the Markdown on `\n` and processes each line
individually:
```js
for (const raw of String(md || "").split("\n")) {
  const line = raw.trim();
  ...
  } else {
    items.push({ type: "text", category, text });
  }
}
```
If `item.text` is `"- Item 1\n- Item 2"`, `buildMd` emits:
```
🟡 - Item 1
- Item 2
```
(with a blank line after the block). `parseMd` splits on `\n` and creates
**two separate items**: `{ text: "🟡 - Item 1" }` and `{ text: "- Item 2" }`.
The round-trip is broken: the editor save → parse cycle splits a multi-line
item into multiple items.

**Fix for `parseMd`:** Multi-line items need to be stored as a single logical
unit in the Markdown file. Two options:
1. Use a block-quote fence: emit `item.text` as a GFM block quote
   (`> line 1\n> line 2`), and parse lines starting with `>` as a
   continuation that belongs to the same item. `parseMd` already strips
   `> ` prefixes (line 463: `let text = line.replace(/^>\s+/, "").trim()`),
   but it processes each line as a separate item rather than merging them.
   This approach requires extending `parseMd` to collect consecutive `>`
   lines into one item.
2. Serialize multi-line items with explicit continuation markers in `buildMd`
   and parse them back in `parseMd`.

The simpler and most backward-compatible path is option 1 — already partially
supported by `parseMd` (the `>` stripping is there). The round-trip fix is
required if users are expected to edit Markdown-list items in the doc editor
and have changes parsed back correctly.

---

## Preview Impact Analysis

### `renderQuoteText()` in the capture popup

**`content.js`, lines 208–219:**
```js
function renderQuoteText() {
  const isLong = savedText.length > TRUNCATE_AT;
  els.quoteText.textContent =
    isLong && !quoteExpanded
      ? savedText.slice(0, PREVIEW_LEN) + "…"
      : savedText;
  ...
}
```
`els.quoteText.textContent = ...` sets the raw string as text content, **not
innerHTML**. This means:
- Currently (plain text): newlines are rendered as line-break characters in
  a `<div>`, which may collapse in CSS unless `white-space: pre-wrap` is set
  on `.ch-quote-text`.
- After the fix (Markdown): the preview would show `- Item 1\n- Item 2` with
  literal `- ` characters and line breaks.

**Is that acceptable?** For the capture popup, showing raw Markdown bullets
in the quote preview is a reasonable trade-off — the popup is a quick
"confirm and assign category" gesture, not a reading surface. The `- ` prefix
is a lightweight and unambiguous indicator of list content. The alternative
(rendering Markdown in the popup via `innerHTML`) would require importing
`marked`+`DOMPurify` into the content script bundle and injecting HTML into
the popup, which increases bundle size and surface area for CSP issues.

**Recommendation:** Keep `textContent` in the popup. If `white-space: pre-wrap`
is not already set on `.ch-quote-text`, add it to `content.css` so that
newlines inside the text render as visible line breaks. No Markdown rendering
needed in the capture popup.

---

## Approach Options

### Option A — Convert to Markdown during capture (in `content.js`)

**How it works:**
- After `savedRange` is stored (line 36), also compute
  `savedText = fragmentToMarkdown(savedRange.cloneContents())`.
- The existing `savedText` code path remains unchanged; only the _value_
  changes.

**Trade-offs:**

| Pro | Con |
|---|---|
| Minimal surface area change — only `content.js` is modified | `fragmentToMarkdown` logic lives in the content script, adding ~80–100 lines |
| Storage contract unchanged — `item.text` is still a string | Quote preview shows raw `- ` Markdown bullets (acceptable, see above) |
| Vista and `buildMd` work correctly without changes | `parseMd` round-trip needs the multi-line item fix (see above) |
| No new storage fields | Existing plain-text items (already saved) stay as-is — no migration needed |

### Option B — Store raw HTML in a new `htmlText` field alongside `text`

**How it works:**
- At capture time, serialize `savedRange.cloneContents()` to an HTML string
  and store it as `item.htmlText`.
- Keep `item.text` as the existing plain-text `Selection.toString()` value for
  backward compatibility.
- The Vista preview uses `item.htmlText` when present (sanitized via
  DOMPurify) and falls back to `item.text`.

**Trade-offs:**

| Pro | Con |
|---|---|
| Full fidelity — tables, custom spans, etc. preserved | Storage size increases significantly (raw HTML is large) |
| Backward compatible with existing items | Vista, `buildMd`, and `parseMd` all need changes |
| Inline styles / classes from the source page are preserved (requires more DOMPurify config) | Security surface: injecting HTML requires careful sanitization |
| No conversion algorithm needed | `buildMd` Markdown export loses fidelity (HTML is not Markdown) |

### Option C — Structured intermediate format (array of `{text, indent, ordered}`)

**How it works:**
- Walk `savedRange.cloneContents()` and produce an array of list-item objects:
  `[{ text: "Item 1", indent: 0, ordered: false }, ...]`.
- Store this array in a new `item.listItems` field (only present when the
  captured content was a list).
- `buildMd` serializes `listItems` to Markdown bullets when present.
- Vista renders via `buildMd` → `marked`.

**Trade-offs:**

| Pro | Con |
|---|---|
| Explicit structured data — easy to programmatically manipulate | New field in the data model; storage.js schema expands |
| `buildMd`/`parseMd` round-trip can be perfect (structured → Markdown → back) | More complex implementation: new field, new serialization in `buildMd`, new parsing in `parseMd` |
| Supports future features (re-ordering list items, etc.) | `parseMd` cannot reconstruct `listItems` from Markdown — the list structure is "flattened" when editing in the doc editor |

---

## Recommended Approach: Option A

**Option A (Convert to Markdown during capture)** is the right choice for
this project because:

1. **Minimal footprint.** Only `content.js` changes at the capture layer.
   The existing `item.text` contract, `buildMd`, Vista, and the editor all
   work without modification (except the `parseMd` multi-line item fix, which
   is a contained, backward-compatible change).

2. **Correct rendering in Vista.** `marked` already handles Markdown lists.
   `buildMd` already emits `item.text` verbatim. The Markdown output produced
   by `fragmentToMarkdown` flows through `buildMd` → `renderMarkdown` →
   `marked.parse()` and becomes proper `<ul>/<ol>` HTML in the preview.

3. **No storage bloat.** HTML (Option B) is 3–10× larger than Markdown for
   the same content. Chrome's `chrome.storage.local` has a 5 MB quota; lists
   from research articles can be large.

4. **No schema expansion.** Option C requires a new optional field and
   dual-path handling in every consumer. Option A avoids all of that.

5. **Acceptable popup preview.** Showing `- Item 1` in the capture popup is
   honest and unambiguous. The user sees what will be saved.

**The only required companion fix** is extending `parseMd` to correctly
round-trip multi-line `item.text` values through the doc editor. The
recommended mechanism is the GFM blockquote continuation path that is already
partially stubbed in `parseMd` (the `> ` stripping on line 463).

---

## Files and Functions to Modify

### 1. `vite-extension/src/content.js`

**Change:** Replace the `savedText` assignment on line 33 with a function
that first tries to extract structured Markdown from `savedRange.cloneContents()`,
then falls back to `sel.toString().trim()` if the range is unavailable or the
fragment contains no list elements.

**New helper to add:** `fragmentToMarkdown(fragment)` — the algorithm
described in the "HTML → Markdown Conversion Algorithm" section above.

**Specific lines affected:**
- Lines 29–44 (mouseup handler): update `savedText` after `savedRange` is set
  by calling `fragmentToMarkdown(sel.getRangeAt(0).cloneContents())`.
  The range clone happens on line 36, so `cloneContents()` should be called on
  the same range to avoid advancing the range state.
- Lines 208–219 (`renderQuoteText`): no logic change needed; the function
  continues to display `savedText` as `textContent`. Consider adding or
  confirming that `.ch-quote-text { white-space: pre-wrap; }` is set in
  `content.css` so newlines render as visible breaks.

### 2. `vite-extension/src/content.css`

**Change (minor):** Ensure `.ch-quote-text` has `white-space: pre-wrap` so
that newlines in Markdown list text render as visible line breaks in the
capture popup.

### 3. `vite-extension/src/storage.js` — `parseMd` function (lines 438–476)

**Change:** Extend `parseMd` to merge consecutive blockquote lines
(`> …`) into a single item rather than creating one item per line. This
restores the round-trip invariant when a multi-line `item.text` (e.g., a
Markdown list) is saved by `buildMd` using blockquote fencing and then
re-parsed by `parseMd` after the user edits in the doc editor.

**Requires companion change to `buildMd`** (lines 410–425): when `it.text`
contains `\n` (multi-line), emit it as a GFM blockquote block:
```
🟡 > line 1
> line 2
```
and update `parseMd` to collect consecutive `> ` lines into one item.

### 4. No changes needed in:
- `vite-extension/src/sidebar/vista.js` — `renderVista` calls `buildMd` then
  `renderMarkdown`; both already handle Markdown lists.
- `vite-extension/src/sidebar/markdown.js` — `renderMarkdown` passes GFM flag;
  lists render correctly.
- `vite-extension/src/sidebar/editor.js` — the Monaco editor operates on the
  Markdown string produced by `buildMd`; if `buildMd` emits blockquote-fenced
  lists, the editor shows them as editable Markdown. No logic change.
- `vite-extension/src/storage.js` — `addItem`, `updateItem`, `buildMd` need
  no changes (only `parseMd` if the multi-line round-trip fix is in scope).
