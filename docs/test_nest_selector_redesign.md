# Test plan — Feature 15: popup redesign (70/30 row + cat dot + column nest)

Spec: `specs/015-spec-nest_selector_redesign.json`

## 1. Build check (automated)

```bash
cd vite-extension && pnpm run build
```
Must exit 0 with no errors or warnings about missing identifiers.

```bash
./init.sh   # from repo root
```
All steps must show [OK].

## 2. Manual Chrome verification

Load `vite-extension/dist/` as an unpacked extension in `chrome://extensions` (Developer mode on).

Open any page (e.g. `example.com`), select some text.

### 2a. Layout

- [ ] The popup shows the context combo and the category pill **in the same horizontal row**.
- [ ] The context combo occupies roughly **70%** of the row width.
- [ ] The category pill occupies roughly **30%** of the row width.
- [ ] The category pill has the same pill border/background as the context combo (surface-2, border radius 8px).
- [ ] The category pill contains a small **colored dot** on the left and a `<select>` on the right.
- [ ] The **4-button swatch grid is gone** — no `.ch-cat` buttons appear.

### 2b. Category dot color

- [ ] On open, the dot is **purple/blue** (idea = `#5b57e8`, the default).
- [ ] Changing the select to **Título** → dot turns amber (`#f59e0b`).
- [ ] Changing the select to **Argumento** → dot turns blue (`#3b82f6`).
- [ ] Changing the select to **Evidencia** → dot turns green (`#22c55e`).
- [ ] The quote chip border color also updates (driven by `updateQuotePreview()`).

### 2c. "Anidar bajo" nest block

- [ ] When a context with subtitles is selected and category ≠ Título, the nest block appears.
- [ ] The nest block shows the label **"anidar bajo"** (monospace, small, muted) on its own line.
- [ ] The `<select>` of subtitles is on the **line below**, full width.
- [ ] The label and select are **not side by side** anymore.
- [ ] Changing the selected subtitle and saving → the saved item has the correct `linkedSubtitleId`.

### 2d. Category drives nest visibility

- [ ] Select category **Título** → nest block hides (category is subtitle type).
- [ ] Select any other category → nest block shows (if context has subtitles).

### 2e. Save flow

- [ ] Selecting a context, choosing a category, choosing a subtitle, pressing Enter → item saved to `chrome.storage.local` with correct `category` and `linkedSubtitleId`.
- [ ] Opening the sidebar → the saved item appears under the correct subtitle.

## 3. Dark mode

- [ ] Open the popup with `prefers-color-scheme: dark` active (DevTools → Rendering → Emulate).
- [ ] The category pill uses dark-mode surface/border tokens (no pure white pill on dark bg).
- [ ] The dot color is still visible against the dark surface.

## 4. Regression: no broken features

- [ ] Context combobox still filters and creates new contexts.
- [ ] Cancel / Escape closes the popup.
- [ ] Enter saves without requiring a mouse click.
