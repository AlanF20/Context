# Research: capture_quote_preview

**Feature ID:** 14  
**Date:** 2026-06-24  
**Author:** Researcher agent

---

## 1. Current state of `.ch-quote`

### Markup (popupSkeleton in `content.js`)
```html
<div class="ch-quote" data-role="quote"></div>
```

Populated on popup open:
```js
popEl.querySelector('[data-role="quote"]').textContent = savedText;
```

### Styles (`content.css`)
```css
.ch-quote {
  font-size: 13px;
  line-height: 1.45;
  color: var(--fg-2);
  border-left: 3px solid var(--accent);   /* ← always purple/blue */
  padding: 2px 0 2px 10px;
  margin-bottom: 11px;
  max-height: 76px;
  overflow: auto;
}
```

**Problems:**
- Border color is always `--accent` (blue-purple) regardless of category.
- Long selections just overflow with a scrollbar — no truncation, no character count.
- No visual indication of which category will tag this note.
- After the user picks a category swatch, the quote block gives no feedback.

---

## 2. How category state is managed today

In `openPopup()`:
```js
let category = "idea";   // default

// Swatch click:
btn.addEventListener("click", () => {
  category = key;
  Object.entries(catButtons).forEach(([k, b]) =>
    b.classList.toggle("on", k === key)
  );
  refreshNest();
});
```

The category swatches each have CSS custom properties set inline:
```js
btn.style.setProperty("--cat", meta.dot);
btn.style.setProperty("--cat-bg", meta.hlBg);
btn.style.setProperty("--cat-fg", meta.hlFg);
```

`Store.CATEGORIES` (from `content-storage.js` → `storage.js`) provides:
```js
CATEGORIES = {
  title:    { label: "Título",    dot: "#e05a7a", hlBg: "#fde8ee", hlFg: "#5a1020" },
  idea:     { label: "Idea",      dot: "#d4a017", hlBg: "#fdf3d8", hlFg: "#6a5413" },
  argument: { label: "Argumento", dot: "#3a7fcb", hlBg: "#ddeeff", hlFg: "#14315f" },
  evidence: { label: "Evidencia", dot: "#3aab5c", hlBg: "#d8f5e2", hlFg: "#16432a" },
}
```

---

## 3. Design of the enhanced preview

### 3a. Dynamic border-left color

The quote's border-left should reflect the active category. Simplest approach:
set `--ch-quote-border` on `.ch-pop` (or on `.ch-quote` itself) and reference it.

In CSS:
```css
.ch-quote {
  border-left: 3px solid var(--ch-quote-border, var(--accent));
}
```

In JS (called whenever category changes):
```js
function updateQuotePreview() {
  const meta = Store.CATEGORIES[category];
  els.quote.style.setProperty("--ch-quote-border", meta.dot);
  // ... (chip update, see 3b)
}
```

### 3b. Category chip inside the quote

A small inline chip styled similarly to the Vista's semantic badges. The chip
shows the category label and sits at the bottom-right of the quote block (or as
a tag above the text).

HTML added to the quote area (injected once on popup open):
```html
<div class="ch-quote-wrap">
  <div class="ch-quote-chip" data-role="quote-chip">Idea</div>
  <div class="ch-quote-text" data-role="quote-text">…truncated text…</div>
</div>
```

Or more simply, add the chip as a sibling element inside the `.ch-quote` container.

**Chosen approach**: make `.ch-quote` a flex container (`flex-direction: column`),
add `data-role="quote-chip"` as first child (small label + dot), then
`data-role="quote-text"` as the text node.

### 3c. Smart truncation

Threshold: **150 characters**. If `savedText.length > 150`:
- Show first 120 chars + "…"
- Show `[N chars]` count badge
- Show a `ver todo` toggle button

Toggle click: replace truncated text with full text, toggle label to `colapsar`.

Implementation in JS:

```js
const TRUNCATE_AT = 150;
const PREVIEW_LEN = 120;

let quoteExpanded = false;

function renderQuoteText() {
  const isLong = savedText.length > TRUNCATE_AT;
  els.quoteText.textContent = isLong && !quoteExpanded
    ? savedText.slice(0, PREVIEW_LEN) + "…"
    : savedText;
  if (els.quoteLenBadge) {
    els.quoteLenBadge.hidden = !isLong;
    els.quoteLenBadge.textContent = savedText.length + " chars";
  }
  if (els.quoteToggle) {
    els.quoteToggle.hidden = !isLong;
    els.quoteToggle.textContent = quoteExpanded ? "colapsar" : "ver todo";
  }
}
```

---

## 4. Minimal DOM changes

Rather than restructuring `.ch-quote` deeply, the least disruptive approach is:
1. Add a `ch-quote-header` row (chip on left, length badge + toggle on right) 
   before the text content inside `.ch-quote`.
2. Use `data-role="quote-chip"`, `data-role="quote-text"`, 
   `data-role="quote-len"`, `data-role="quote-toggle"`.

Updated `popupSkeleton()` quote section:
```html
<div class="ch-quote" data-role="quote">
  <div class="ch-quote-header">
    <span class="ch-quote-chip" data-role="quote-chip"></span>
    <span class="ch-quote-meta">
      <span class="ch-quote-len" data-role="quote-len" hidden></span>
      <button class="ch-quote-toggle" data-role="quote-toggle" type="button" hidden></button>
    </span>
  </div>
  <div class="ch-quote-text" data-role="quote-text"></div>
</div>
```

---

## 5. CSS additions (no breaking changes)

```css
/* Quote header row */
.ch-quote {
  /* change from plain block to flex column */
  display: flex;
  flex-direction: column;
  gap: 5px;
  border-left: 3px solid var(--ch-quote-border, var(--accent));
}
.ch-quote-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.ch-quote-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px 1px 4px;
  border-radius: 4px;
  background: var(--ch-quote-chip-bg, var(--accent-soft));
  color: var(--ch-quote-chip-fg, var(--accent));
  letter-spacing: 0.02em;
}
.ch-quote-chip::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ch-quote-chip-dot, var(--accent));
  flex: 0 0 auto;
}
.ch-quote-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
}
.ch-quote-len {
  font-size: 10px;
  color: var(--fg-3);
  font-family: var(--mono);
}
.ch-quote-toggle {
  border: none;
  background: none;
  color: var(--accent);
  font-size: 10.5px;
  font-family: var(--ui);
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}
.ch-quote-text {
  font-size: 13px;
  line-height: 1.45;
  color: var(--fg-2);
  max-height: 72px;
  overflow: auto;
}
.ch-quote-text.expanded {
  max-height: none;
}
```

---

## 6. JS changes summary (content.js only)

1. **`popupSkeleton()`**: restructure `.ch-quote` inner HTML as above.
2. **`openPopup()`**:
   - Add new refs: `els.quoteText`, `els.quoteChip`, `els.quoteLen`, `els.quoteToggle`.
   - Add `updateQuotePreview()` helper (sets border color, chip label/colors, truncated text).
   - Call `updateQuotePreview()` on init and inside every `category = key` assignment.
   - Wire toggle button click: `quoteExpanded = !quoteExpanded; renderQuoteText()`.
3. **No changes** to `doSave()`, `Store`, or anything in `sidebar/`.

---

## 7. Risk assessment

- **Low risk**: all changes are purely visual/UI; `savedText` is never mutated.
- **max-height removal on expand**: removing `max-height` on the quote block will
  make the popup taller on long selections — acceptable since the user explicitly
  asked to expand.
- **No new dependencies** required.
- **Dark mode**: CSS custom properties cascade correctly; chip colors from
  `CATEGORIES` are absolute hex values that work in both modes.
