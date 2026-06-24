# Research: Vista Item Style Simplification (Feature 16)

## Summary

The user wants a cleaner visual treatment for highlighted text items in the Vista panel. Three changes:
1. **Remove category badge** — the badge (§ Título / ◈ Idea / → Argumento / ✓ Evidencia) is redundant since the left-border color already encodes category.
2. **Remove border-radius** on item boxes — flat/flush cards feel less cluttered.
3. **8 px margin-top** between text item boxes instead of the current 2 px `margin-bottom`.

## Current state

### JS (`vite-extension/src/sidebar/vista.js`)
- `buildItem()` creates a `.vista-item-meta` div containing a `.vista-cat-badge.badge-{category}` `<span>` for every `text` item with a category.
- The badge text is `CAT_LABEL[item.category]` ("Título", "Idea", "Argumento", "Evidencia").
- The `.vista-item-meta` div is the only child of the badge; removing it removes the whole meta row.

### CSS (`vite-extension/src/sidebar.css`)
Key rules to change:

| Selector | Current | Change |
|---|---|---|
| `.vista-item` | `border-radius: 8px; margin-bottom: 2px;` | remove `border-radius`; change spacing |
| `.vista-item-text[data-category="*"]` | `border-left: 3px solid var(--cat-*-border); padding-left: 10px;` | **keep** |
| `.vista-cat-badge` | display, font, padding, border-radius, etc. | **delete entirely** |
| `.badge-title/idea/argument/evidence` | background/color per category | **delete entirely** |
| `:root[data-theme="dark"] .badge-*` | dark overrides | **delete entirely** |
| `.badge-*::before` | symbol prefix | **delete entirely** |

### Spacing design
- Current: `margin-bottom: 2px` on every `.vista-item`.
- New: `margin-top: 8px` on `.vista-item-text` (the text boxes), `0` on first child to avoid dead space at top.
- Subtitle items (`.vista-item-subtitle`) already have `margin-top: 12px`; leave them as-is.

## Files to touch

1. `vite-extension/src/sidebar/vista.js` — remove `meta` / `badge` DOM creation block inside `buildItem()`.
2. `vite-extension/src/sidebar.css` — remove `.vista-cat-badge` + `.badge-*` CSS blocks; adjust `.vista-item` border-radius and spacing.

## Risk assessment

- **Low risk**: purely visual, no data model changes, no storage changes, no JS logic changes beyond removing 8 lines of DOM creation.
- **Regression risk**: the `.vista-item-meta` div only holds the badge; removing it doesn't affect edit/delete actions (they are in `.vista-actions`).
- **Accessibility**: WCAG SC 1.4.1 (not color alone) was satisfied by the combination of badge + left border. Removing the badge means only the left-border color differentiates categories. The spec should acknowledge this trade-off: the user is explicitly requesting it, so document the decision.
- **Dark mode**: the `.badge-*` dark overrides will be removed; no other dark-mode rules are affected.

## Decision log

- User explicitly requests removing the badge because the color system is sufficient — intentional regression on "not color alone" for the badge; left-border color remains.
- `margin-top` (not `margin-bottom`) per user request; first child gets `margin-top: 0`.
