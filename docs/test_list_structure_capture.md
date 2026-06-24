# Test Plan — list_structure_capture (Feature #19)

**Feature:** List Structure Capture  
**Spec:** `specs/019-spec-list_structure_capture.json`  
**Date:** 2026-06-24  
**Tester:** Harness Tester Agent

---

## 1. Build Check

### Commands

```bash
# From repo root
./init.sh

# Then
cd vite-extension
pnpm run build
```

### Pass Criteria

- `./init.sh` exits with code 0 and prints no syntax errors.
- `pnpm run build` exits with code 0.
- `vite-extension/dist/` is populated and includes `content.js`, `sidebar.js`, and `sidebar.html`.
- No TypeScript/Vite warnings that reference `content.js`, `storage.js`, or `content.css`.

### Fail Criteria

- Any non-zero exit code.
- Any `SyntaxError`, `ReferenceError`, or unresolved import in the build output.

---

## 2. Unit-Level Logic Check (Node REPL / Script)

Since the project has no automated test suite, the following describes a manual node script approach to verify `fragmentToMarkdown` and the `buildMd`/`parseMd` round-trip in isolation before loading the extension in Chrome.

### 2a. `fragmentToMarkdown` isolation test

Create a temporary script at `/tmp/test_fragment.mjs`:

```js
// /tmp/test_fragment.mjs
// Minimal DOM mock using globalThis to simulate DocumentFragment + li elements.
// Run with: node /tmp/test_fragment.mjs

// Provide a minimal jsdom environment if available:
//   node --experimental-vm-modules /tmp/test_fragment.mjs
// Or use the simpler object-based mock below.

function mockLi(text, children = []) {
  return {
    tagName: 'LI',
    childNodes: [{ nodeType: 3, textContent: text, tagName: undefined }],
    children,
    textContent: text,
  };
}

// Copy fragmentToMarkdown verbatim from content.js and paste here,
// then call it with mock DocumentFragment objects.

// Expected outputs to verify manually:

// Input: <ul><li>Alpha</li><li>Beta</li></ul>
// Expected: "- Alpha\n- Beta"

// Input: <ol><li>First</li><li>Second</li></ol>
// Expected: "1. First\n2. Second"

// Input: <ul><li>Top<ul><li>Nested</li></ul></li></ul>
// Expected: "- Top\n  - Nested"

// Input: plain text node (no ul/ol)
// Expected: same string as sel.toString() would return

console.log('Manually paste fragmentToMarkdown from content.js and call it here.');
console.log('Compare each output against the expected strings above.');
```

Run:
```bash
node /tmp/test_fragment.mjs
```

**What to verify:**

| Input DOM structure | Expected output |
|---|---|
| `<ul><li>Alpha</li><li>Beta</li></ul>` | `"- Alpha\n- Beta"` |
| `<ol><li>First</li><li>Second</li></ol>` | `"1. First\n2. Second"` |
| `<ul><li>Top<ul><li>Nested</li></ul></li></ul>` | `"- Top\n  - Nested"` |
| `<ol><li>A<ol><li>B</li></ol></li></ol>` | `"1. A\n  1. B"` |
| Plain text fragment | Identical to plain `textContent` |

### 2b. `buildMd` / `parseMd` round-trip test

Open a Node REPL in the vite-extension directory or create `/tmp/test_roundtrip.mjs`:

```js
// /tmp/test_roundtrip.mjs
// Run from vite-extension/ with:
//   node --input-type=module < /tmp/test_roundtrip.mjs
// OR copy storage.js exports here (strip chrome.storage calls first).

// Test 1: multiline item emits as GFM blockquote
// item.text = "- Alpha\n- Beta"
// Expected buildMd output to contain:
//   > - Alpha
//   > - Beta

// Test 2: parseMd re-assembles blockquote lines into single item
// Input markdown:
//   > - Alpha
//   > - Beta
// Expected: one item with text "- Alpha\n- Beta" (not two items)

// Test 3: plain-text item (no \n) is unaffected
// item.text = "Some normal highlight"
// Expected buildMd output: plain line, no > prefix
// parseMd: one item with text "Some normal highlight"

console.log('Manually verify buildMd and parseMd outputs match expectations above.');
```

**Key assertions:**

1. `buildMd` converts `item.text = "- Alpha\n- Beta"` into blockquote lines (`> - Alpha\n> - Beta`).
2. `parseMd` on that blockquote output produces exactly one item, not two.
3. Plain-text items (no `\n`) pass through `buildMd` and `parseMd` unchanged.

---

## 3. Manual Chrome Tests

### Setup (all scenarios)

1. Run `cd vite-extension && pnpm run build`.
2. Open `chrome://extensions`, enable Developer mode.
3. Click "Load unpacked" and select `vite-extension/dist/`.
4. Open a test page. A convenient test page can be created locally:

```html
<!-- /tmp/test_page.html — open via file:// in Chrome -->
<!DOCTYPE html>
<html lang="es">
<body>
  <p id="plain">This is a plain paragraph with no list elements.</p>

  <ul id="ul-list">
    <li>Alpha item</li>
    <li>Beta item</li>
    <li>Gamma item</li>
  </ul>

  <ol id="ol-list">
    <li>First step</li>
    <li>Second step</li>
    <li>Third step</li>
  </ol>

  <ul id="nested-list">
    <li>Top level A
      <ul>
        <li>Nested A1</li>
        <li>Nested A2</li>
      </ul>
    </li>
    <li>Top level B</li>
  </ul>

  <p id="mixed">Introduction paragraph.</p>
  <ul id="mixed-list">
    <li>Mixed item 1</li>
    <li>Mixed item 2</li>
  </ul>
</body>
</html>
```

Open the side panel by clicking the extension icon.

---

### Scenario A — Unordered list capture

**Setup:** Test page is open. At least one context exists in the side panel (create one named "Test" if needed).

**Action:**
1. Click and drag to select all three `<li>` items inside `#ul-list`.
2. The `+` capture icon appears near the selection.
3. Click the `+` icon.
4. In the capture popup, select the "Test" context and choose any color category.
5. Press Enter (or click save).

**Expected result:**
- The item is saved.
- Open the side panel → switch to Vista.
- The captured item's text shows:
  ```
  - Alpha item
  - Beta item
  - Gamma item
  ```
- The Vista renders this as an HTML `<ul>` with three `<li>` elements (because `marked` converts GFM bullets to HTML).
- No plain concatenated text like `"Alpha itemBeta itemGamma item"`.

---

### Scenario B — Ordered list capture

**Action:**
1. Select all three `<li>` items inside `#ol-list`.
2. Capture with the `+` icon → "Test" context → any category → Enter.

**Expected result:**
- Saved item text:
  ```
  1. First step
  2. Second step
  3. Third step
  ```
- Vista renders this as an HTML `<ol>` with three `<li>` elements.

---

### Scenario C — Nested list capture

**Action:**
1. Select the entire `#nested-list` (click before "Top level A", drag to end of "Top level B").
2. Capture → "Test" context → Enter.

**Expected result:**
- Saved item text:
  ```
  - Top level A
    - Nested A1
    - Nested A2
  - Top level B
  ```
  (2-space indent per nesting level)
- Vista renders nested `<ul>` inside `<ul>` (or equivalent indented bullets).

---

### Scenario D — Plain text capture (regression)

**Action:**
1. Select the text inside `#plain` ("This is a plain paragraph with no list elements.").
2. Capture → "Test" context → Enter.

**Expected result:**
- Saved item text is identical to the selected string: `"This is a plain paragraph with no list elements."`
- No bullet characters (`-`, `1.`) prepended.
- Vista displays it as a plain paragraph, same as before this feature.
- This confirms `fragmentToMarkdown` falls back to original behavior when no `<ul>/<ol>` is present.

---

### Scenario E — Mixed content (paragraph + list)

**Action:**
1. Select from "Introduction paragraph." through "Mixed item 2" (spanning both `#mixed` and `#mixed-list`).
2. Capture → "Test" context → Enter.

**Expected result:**
- Saved item text contains both the paragraph text and the list bullets, for example:
  ```
  Introduction paragraph.
  - Mixed item 1
  - Mixed item 2
  ```
  (exact format depends on implementation; key: bullets are preserved, paragraph text is not lost)
- Vista renders the paragraph line followed by a `<ul>`.

---

### Scenario F — Popup preview shows line breaks

**Action:**
1. Select all items in `#ul-list`.
2. Click the `+` icon to open the capture popup — **do not save yet**.
3. Inspect the `.ch-quote-text` element in the popup using Chrome DevTools (right-click popup → Inspect).

**Expected result:**
- The `.ch-quote-text` element shows the three list items on separate visual lines, not collapsed into one line.
- In DevTools → Computed styles for `.ch-quote-text`: `white-space` is `pre-wrap`.
- Without `pre-wrap`, all text would appear on one line despite containing `\n`.

---

### Scenario G — Vista renders list as HTML bullets

**Prerequisite:** Scenario A or B already captured at least one list item.

**Action:**
1. Open the side panel, navigate to the "Test" context.
2. Switch to Vista mode.
3. Find the captured unordered or ordered list item.

**Expected result:**
- The item is rendered with actual `<ul><li>` or `<ol><li>` HTML, not as raw Markdown text.
- Confirm by right-clicking the rendered list in the panel → Inspect Element — the DOM should show `<ul>` or `<ol>` tags, not the raw `- ` or `1. ` strings.

---

### Scenario H — Round-trip through doc editor

**Prerequisite:** At least one list item has been captured (from Scenario A or B).

**Action:**
1. Open the side panel, select the "Test" context.
2. Switch to Editor (Monaco) mode.
3. Observe the exported Markdown for the list item. It should appear as GFM blockquote lines:
   ```
   > - Alpha item
   > - Beta item
   > - Gamma item
   ```
4. Make a trivial change (e.g., add a space and remove it) to ensure the editor buffer is active.
5. Save / switch away from Editor back to Vista (or use the export button to trigger a save).
6. Count the items in Vista before and after: the list should still be **one item**, not three separate items (one per line).

**Expected result:**
- Before editing: 1 list item in Vista.
- After round-trip through editor: still 1 item with the same bullet text.
- `parseMd` correctly collapses the `> …` blockquote lines back into a single multi-line item.

---

### Scenario I — Existing plain-text item not corrupted

**Prerequisite:** A plain-text item was captured before this feature was deployed (or captured in Scenario D above).

**Action:**
1. Open the side panel → "Test" context → Vista.
2. Locate the plain-text item captured in Scenario D.
3. Switch to Editor mode. Observe the item's Markdown representation — it should be a plain line with no `>` prefix.
4. Switch back to Vista. The plain-text item should render identically to before.

**Expected result:**
- Plain-text items have no `>` blockquote prefix in the editor.
- `parseMd` does not merge them with adjacent items.
- Text is unchanged.

---

## 4. Regression Checks

After running all scenarios above, spot-check the following pre-existing features:

| Feature | Check |
|---|---|
| Create context | Create a new context via the rail `+` button. It appears in the rail and is selectable. |
| Rename context | Double-click a context chip in the rail; rename it; confirm the new name persists after reload. |
| Delete highlight | In Vista, click the delete (trash) icon on any item. It disappears immediately. |
| Edit highlight (inline) | Click the edit icon on a plain-text item in Vista. Modify the text, save. The updated text appears. |
| Export Markdown | Click the export button. The downloaded `.md` file opens correctly and contains all items. |
| Theme toggle | Toggle light/dark mode. Both modes render correctly with no broken styles. |
| Monaco editor sync | Edit Markdown in the Editor tab. Switch to Vista and back — content is consistent. |
| Content script highlight | Capture a plain word on any real webpage (e.g., Wikipedia). The highlight span appears in the page with the correct category color. |

---

## 5. Pass/Fail Criteria

### PASS — all of the following must be true

- [ ] `./init.sh` exits with code 0.
- [ ] `pnpm run build` exits with code 0 with no errors.
- [ ] Scenario A: unordered list items saved with `- ` prefix, one item total.
- [ ] Scenario B: ordered list items saved with `1.` / `2.` prefix, one item total.
- [ ] Scenario C: nested list items indented 2 spaces per level.
- [ ] Scenario D: plain text capture unchanged (regression passes).
- [ ] Scenario E: mixed content preserves both paragraph and list bullets.
- [ ] Scenario F: `.ch-quote-text` has `white-space: pre-wrap`; newlines visible in popup.
- [ ] Scenario G: Vista renders `<ul>/<ol>` HTML elements for list items (not raw Markdown).
- [ ] Scenario H: one list item remains one item after editor round-trip (parseMd collapses blockquote).
- [ ] Scenario I: existing plain-text items are not corrupted.
- [ ] All regression checks pass with no regressions.

### FAIL — any of the following means the feature does not pass

- Any build error or `init.sh` failure.
- List items saved as concatenated plain text (no `- ` or `1.` bullets).
- Nested lists not indented or incorrectly indented.
- Plain text capture behavior changed (extra bullets or missing text).
- Popup preview collapses multi-line text to a single line (`pre-wrap` missing).
- Vista shows raw Markdown text instead of rendered HTML list.
- Round-trip creates duplicate items (one per blockquote line) instead of one item.
- Any existing feature listed in Regression Checks stops working.
