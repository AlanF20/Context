# Research: Nest Selector Row Redesign (column layout)

## 1. Current Implementation

### HTML (content.js — `popupSkeleton`)
The nest row is a single `<div class="ch-nest">` containing two siblings:
```html
<label class="ch-nest-label" for="ch-nest-sel">Anidar bajo</label>
<select class="ch-nest-sel" data-role="nest-select" id="ch-nest-sel"></select>
```

### CSS (content.css — `.ch-nest` block, lines 271–300)
```css
.ch-nest {
  display: flex;
  align-items: center;   /* horizontal, vertically centred */
  gap: 8px;
  border: 1px dashed var(--border-strong);
  border-radius: 8px;
  padding: 7px 9px;
  margin-bottom: 9px;
  font-size: 12px;
  color: var(--fg-2);
}
.ch-nest-label { white-space: nowrap; }   /* prevents wrapping, fixed width */
.ch-nest-sel   { flex: 1; min-width: 0; … }  /* fills remaining row width */
```

The result is a horizontal row: label on the left, select filling the rest.

---

## 2. Required CSS Changes

Switch the flex axis and let each child fill the full container width:

```css
.ch-nest {
  flex-direction: column;   /* was row (default) */
  align-items: stretch;     /* was center */
}
.ch-nest-label {
  white-space: normal;      /* unwrap if needed; or keep nowrap — fits fine */
}
.ch-nest-sel {
  flex: none;               /* not needed in column; remove or keep harmless */
  width: 100%;              /* full width */
  box-sizing: border-box;
}
```

No HTML changes are required.

---

## 3. Consistency with Other Popup Controls

The popup has one other compound control: `.ch-control-row` (context combobox),
which is also a horizontal flex row (`display:flex; gap:8px; align-items:center`).
There is **no existing column-stacked label+input pattern** inside the popup.

However, the category grid (`.ch-cats`) and the quote block (`.ch-quote`) both
use `flex-direction: column` for their own internal structure. A column nest row
is not unprecedented in spirit — it follows the quote block's pattern — and the
popup's overall layout is itself a vertical stack of blocks, so a stacked label
above a select reads naturally within that flow.

---

## 4. Accessibility

The `<label for="ch-nest-sel">` / `<select id="ch-nest-sel">` association is
purely DOM-based and is **unaffected by CSS layout**. The label remains
programmatically linked to the select regardless of whether they are arranged
horizontally or vertically. Column layout neither improves nor degrades this;
it is neutral from an a11y standpoint.

---

## 5. Risks and Edge Cases

- **Width**: the popup is 340 px (with `max-width: calc(100vw - 16px)` for
  narrow viewports). With `width: 100%` and `box-sizing: border-box`, the
  select fills the content area of `.ch-nest` (340 px minus 2×13 px popup
  padding minus 2×9 px nest padding = ~296 px). That is comfortably wide for
  the longest subtitle option (capped at 40 chars + "…" in `refreshNest`).
- **Height increase**: stacking adds roughly one line height (~18–20 px) to the
  nest row. This is negligible; the popup has no fixed max-height.
- **`white-space: nowrap` on label**: safe to keep or remove — "Anidar bajo"
  fits on one line at any popup width above ~80 px.
- **No overflow risk**: select text is truncated by the browser natively; no
  horizontal scroll can escape `.ch-pop` because the popup itself clips content.
