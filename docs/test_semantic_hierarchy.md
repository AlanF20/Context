# Test plan — Feature #6: Jerarquía semántica y accesibilidad en la Vista (WCAG)

> Agent: Tester  
> Date: 2026-06-22

---

## Level 1 — Syntax (mandatory before any other check)

```bash
cd outputs
node --check storage.js
node --check content.js
node --check background.js
for f in sidebar.js sidebar/*.js; do
  cp "$f" "/tmp/$(basename "$f").mjs" && node --check "/tmp/$(basename "$f").mjs" && echo "OK: $f"
done
python3 -c "import json; json.load(open('manifest.json')); print('manifest OK')"
```

Expected: all commands exit 0, no syntax errors.

---

## Level 2 — DOM structure (manual, Chrome DevTools)

Load the unpacked extension. Open the side panel with at least one context
that has a subtitle and notes of each category.

1. Open DevTools → Elements → inspect `.vista-list`
   - [ ] Tag is `<ul>` (not `<div>`)
   - [ ] `role="list"` attribute is present
2. Inspect a subtitle item
   - [ ] Wrapper tag is `<li>`
   - [ ] Content tag inside is `<h3>`
3. Inspect a text item
   - [ ] Wrapper tag is `<li>` with `data-category="<category>"`
   - [ ] Content tag inside is `<p>` (not `<div>`)
4. Inspect the meta row of any text item
   - [ ] Contains `.vista-cat-badge` with text starting with the correct symbol
     - Título → "§ Título"
     - Idea → "◈ Idea"
     - Argumento → "→ Argumento"
     - Evidencia → "✓ Evidencia"
   - [ ] NO `.vista-item-source` span present

---

## Level 3 — CSS / visual (manual, Chrome)

5. Each text item shows a 3px left border in the matching category color
   - title → reddish (`#c0394c` light / `#f6b8c4` dark)
   - idea → amber (`#c07a00` / `#f5d78e`)
   - argument → blue (`#1a5fa8` / `#93bef5`)
   - evidence → green (`#1e7c40` / `#7fce9e`)
6. Badges show the symbol as the first character (CSS `::before` content)
7. No URL/domain text visible below any note
8. No layout breakage (items don't overlap actions buttons)

---

## Level 4 — Inline edit restore (regression)

9. Click ✏ on a text item → textarea appears
10. Press Escape → content is restored as `<p>` (not `<div>`)
11. Click ✏ on a subtitle → textarea appears
12. Press Escape → content is restored as `<h3>` (not `<div>`)

---

## Level 5 — Dark mode (regression)

13. Toggle dark mode via the theme button
14. Left borders are visible against dark backgrounds (lighter token values)
15. Badges remain readable in dark mode

---

## Anti-patterns to check

- No `undefined` or empty `data-category` attributes on subtitle `<li>` elements
- No console errors in the panel DevTools
- `.vista-item-source` CSS class no longer has a matching DOM element anywhere
