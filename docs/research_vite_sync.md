# Research: Vite Extension Sync Status

**Date:** 2026-06-22  
**Investigator:** Researcher Agent  
**Feature:** Monitoring vite-extension/ sync with outputs/ (post-Feature #8 vite_pnpm_migration)

---

## Executive Summary

The `vite-extension/` directory was created as part of Feature #8 (`vite_pnpm_migration`, status: `done`). However, **critical features implemented in `outputs/` after Feature #8 are NOT yet reflected in `vite-extension/`**. The extensions have diverged significantly:

- **outputs/version:** 2.0.0 (side-panel UI, Monaco editor, rich semantic Vista, nested subtitles)
- **vite-extension/version:** 1.0.0 (action popup only, no editor, minimal item management)

This sync gap must be closed before vite-extension can become the canonical build system.

---

## File-by-File Analysis

### Key Files Present in Both Directories

| File | outputs/ | vite-extension/src | Status | Notes |
|------|----------|-------------------|--------|-------|
| **manifest.json** | ✅ | ✅ | 🔴 DIVERGED | outputs: version 2.0.0, uses sidePanel; vite: version 1.0.0, uses action popup |
| **background.js** | ✅ | ✅ | 🟡 PARTIAL | outputs: sets sidePanel behavior; vite: minimal (comment-only) |
| **storage.js** | ✅ | ✅ | 🟢 FUNCTIONAL | Both export same API (buildMd, parseMd, addItem, updateItem, deleteItem, etc.); signatures match |
| **content.js** | ✅ | ✅ | 🟢 FUNCTIONAL | Core capture popup logic identical; vite uses ESM import, outputs uses IIFE + window.ContextStore |
| **content.css** | ✅ | ✅ | 🟢 IDENTICAL | Same token system, same capture UI styles |

### Files in outputs/ MISSING from vite-extension/src

| File | Purpose | Complexity |
|------|---------|-----------|
| **sidebar.html** | Side-panel entry point (MV3 sidePanel) | Core |
| **sidebar.css** | Side-panel styles + dark mode tokens | Large |
| **sidebar.js** | Side-panel controller (ES module entry) | Core |
| **sidebar/dom.js** | DOM helpers ($, escapeHtml) | Trivial |
| **sidebar/store.js** | Re-export of window.ContextStore as ES module | Trivial |
| **sidebar/markdown.js** | Markdown rendering (marked + DOMPurify wrapper) | Simple |
| **sidebar/theme.js** | Light/dark mode toggle persistence | Simple |
| **sidebar/rail.js** | Context list rail with chip navigation | Medium |
| **sidebar/vista.js** | Item-by-item Vista renderer (HTML semantics, badges, edit/delete actions) | Large |
| **sidebar/editor.js** | Monaco editor controller (buffers, HMR sync, validation) | Large |

**Total missing:** ~2000 lines of core UI code.

---

## Feature Comparison

### Features Present in outputs/

All features from the project history are implemented in outputs/:

1. **Feature #1: vista_item_actions** ✅
   - Edit/delete inline in Vista
   - Implemented in `sidebar/vista.js` (buildItem → buildActions)

2. **Feature #5: category_indicators** ✅
   - Semantic badges + left-border accents
   - Implemented in `sidebar/vista.js` + `sidebar.css`

3. **Feature #6: semantic_hierarchy** ✅
   - `<ul role="list">` + `<li>` + `<h3>`/`<p>` semantics
   - WCAG 1.4.1 unique symbols (§ ◈ → ✓)
   - Implemented in `sidebar/vista.js` + `sidebar.css`

4. **Feature #7: subtitle_nest_select** ✅
   - `<select>` dropdown for nesting
   - Implemented in `content.js` (popupSkeleton, refreshNest, doSave logic)

### Features Missing from vite-extension/

All of the above (**Features #1, #5, #6, #7**) are absent from vite-extension/src:

- ❌ No side-panel UI at all (only action popup)
- ❌ No Vista renderer (no semantic HTML, no badges, no edit/delete)
- ❌ No Monaco editor
- ❌ No nest-select (the popup UI exists but references `Store.listSubtitles()` which vite has, but without the UI integration)

---

## Architectural Differences

### outputs/ (Current Reference Build)

**UI Architecture:**
- **Action icon:** Opens MV3 `sidePanel` (right-side persistent panel)
- **Two-panel design:**
  1. Left **rail**: Context chips with context list
  2. Right **body**: Toggles between Vista (preview) and Editor (Monaco)
- **Content script:** Classic IIFE + window.ContextStore bridge
- **Storage:** Classic IIFE + global ContextStore object
- **Manifest:** Uses `"side_panel": { "default_path": "sidebar.html" }`

**Loading Order (Critical):**
```html
<script src="vendor/lib/marked.min.js"></script>
<script src="vendor/lib/purify.min.js"></script>
<script src="vendor/monaco/vs/loader.js"></script>
<script src="storage.js"></script>
<script type="module" src="sidebar.js"></script>
```
Marked + DOMPurify MUST load before Monaco loader, or UMD registration fails.

### vite-extension/ (Feature #8 Implementation)

**UI Architecture:**
- **Action icon:** Opens Chrome's default `action.default_popup` (small popup window)
- **Single popup UI:**
  1. Context list
  2. Detail view (items list with download button)
- **Content script:** ESM (Vite bundles as IIFE)
- **Storage:** ESM (named exports tree-shaken into each bundle)
- **Manifest:** Uses `"action": { "default_popup": "src/popup.html" }`

**No side-panel**, no persistent UI.

---

## Manifest.json Divergence

### outputs/manifest.json (v2.0.0)
```json
{
  "permissions": ["storage", "sidePanel"],
  "action": { "default_title": "Open Context Highlighter sidebar" },
  "side_panel": { "default_path": "sidebar.html" },
  "content_scripts": [
    { "js": ["storage.js", "content.js"], "css": ["content.css"] }
  ]
}
```

### vite-extension/manifest.json (v1.0.0)
```json
{
  "permissions": ["storage"],
  "action": { "default_popup": "src/popup.html", "default_title": "Context Highlighter" },
  "background": { "service_worker": "src/background.js", "type": "module" },
  "content_scripts": [
    { "js": ["src/content.js"], "css": ["src/content.css"], "run_at": "document_idle" }
  ]
}
```

**Key differences:**
- outputs: `sidePanel` permission + side_panel config + no service worker type
- vite: `action.default_popup` + service worker type: "module"
- vite: Does NOT expose `sidePanel` API calls in background

---

## Storage Module Differences

Both `storage.js` files export the same core API:

**✅ Identical exports:**
- `STORAGE_KEY`, `BRAND_COLORS`, `CATEGORIES`, `DOMAIN_COLORS`, `EMOJI_TO_CAT`
- `categoryMeta()`, `typeForCategory()`, `domainColor()`, `hostnameFromUrl()`
- `readAll()`, `writeAll()`
- `listContexts()`, `createContext()`, `getContext()`, `listSubtitles()`
- `addItem()`, `deleteContext()`, `renameContext()`, `updateItem()`, `deleteItem()`
- `buildMd()`, `parseMd()`, `exportContextToText()`, `exportContextToMarkdown()`
- `replaceContextFromMarkdown()`

**Module format difference:**
- outputs/storage.js: IIFE wrapping + `window.ContextStore` global
- vite-extension/storage.js: ES module with named exports

**This is intentional:** Vite bundles each entry point separately, so each gets its own copy of storage.js. No shared in-memory state — they communicate through chrome.storage.local (the actual bridge).

---

## Content.js Equivalence

Both `content.js` files are functionally equivalent:

**outputs/content.js:**
- IIFE wrapping, accesses `window.ContextStore`
- popupSkeleton() returns HTML template
- openPopup() → refreshNest() → doSave() flow

**vite-extension/src/content.js:**
- ESM module with `import * as Store from './storage.js'`
- Same popupSkeleton(), openPopup(), refreshNest(), doSave()
- Vite bundles as IIFE for content script context
- Same feature parity: nest-select, category swatches, comma-separated text

**Minor whitespace/formatting differences** (meaningless for functionality).

---

## Popup UI Differences

### outputs/ (No popup UI at all)
- Action icon opens sidebar only
- No traditional popup

### vite-extension/ (popup.html + popup.js)
**Implements:**
- Context list with colors and note counts
- Create new context form
- Click to view context detail (item list)
- Download context as .txt
- Delete context

**Code:**
- popup.html: Simple form + list structure
- popup.js: Context management, download, rendering

**NOT in outputs/:** This UI is completely new (Feature #8 innovation for the popup-based build). It does NOT conflict with outputs/ because outputs/ doesn't use a popup at all.

---

## Vendor Code

### outputs/ (Uses vendored Monaco)
- `vendor/monaco/vs/` — full Monaco ESM build
- `vendor/lib/marked.min.js`, `vendor/lib/purify.min.js`
- Loaded as classic scripts in sidebar.html

### vite-extension/
- **NO Monaco** (not bundled)
- **NO marked/DOMPurify** (can't use them without Vite bundling, and they're not needed for the popup UI)

**This is correct per Feature #8 spec:** The popup-based build intentionally omits Monaco to keep bundle small. If/when vite-extension migrates to a side-panel UI, Monaco would need to be added back (via Vite's ESM loader or as an external dependency).

---

## Summary Table: File Sync Status

| Category | File | outputs/ | vite-ext/ | Sync Status | Action Required |
|----------|------|----------|-----------|-------------|-----------------|
| **Config** | manifest.json | v2.0 sidePanel | v1.0 popup | 🔴 DIVERGED | Merge: side-panel version |
| **Config** | package.json | N/A | ✅ Vite + pnpm | N/A | Keep as-is |
| **Config** | vite.config.js | N/A | ✅ CRXJS config | N/A | Keep as-is |
| **Background** | background.js | ✅ sidePanel calls | ✅ minimal | 🟡 PARTIAL | Add sidePanel behavior to vite |
| **Storage** | storage.js | IIFE export | ESM export | 🟢 API SYNC | Both formats valid; keep both |
| **Content** | content.js | IIFE + global | ESM import | 🟢 LOGIC SYNC | Format differs; functionality same |
| **Content CSS** | content.css | ✅ Complete | ✅ Complete | 🟢 IDENTICAL | Sync CSS updates only if any |
| **Sidebar** | sidebar.html | ✅ Core UI | ❌ MISSING | 🔴 CRITICAL | Copy + adapt for Vite |
| **Sidebar** | sidebar.css | ✅ Core UI | ❌ MISSING | 🔴 CRITICAL | Copy + adapt for Vite |
| **Sidebar** | sidebar.js | ✅ Core UI | ❌ MISSING | 🔴 CRITICAL | Convert to ESM + Vite entry |
| **Sidebar modules** | sidebar/*.js | ✅ 6 files (dom, store, markdown, theme, rail, vista, editor) | ❌ ALL MISSING | 🔴 CRITICAL | Copy all, adapt imports to ESM |
| **Popup** | popup.html | ❌ N/A (uses sidebar) | ✅ Complete | N/A | No conflict; vite-only feature |
| **Popup** | popup.js | ❌ N/A | ✅ Complete | N/A | No conflict; vite-only feature |
| **Popup CSS** | popup.css | ❌ N/A | ✅ Complete | N/A | No conflict; vite-only feature |

---

## Features Not Yet Implemented (Backlog)

The following features are **pending** in outputs/ and thus also absent from vite-extension/:

- **Feature #2: preview_group_by_page** (group Vista notes by sourceUrl)
- **Feature #3: capture_keyboard_shortcuts** (1–4 keys for category)
- **Feature #4: page_highlight_persistence** (re-apply highlights on reload)
- **Feature #9: visual_separators** (separator items in the data model)

These are independent of the sync gap; they simply haven't been implemented yet in either build.

---

## Sync Strategy Recommendations

### Short Term (Reconcile Existing Features)

1. **Decide on UI target:**
   - **Option A:** vite-extension becomes side-panel build (migrate outputs/ → vite/)
   - **Option B:** Maintain both; outputs/ = side-panel reference, vite-extension = popup variant
   - **Option C:** outputs/ merges popup UI to become a "universal" reference build

2. **If Option A (recommended for DRY):**
   - Copy `sidebar.html`, `sidebar.css`, `sidebar.js`, `sidebar/` to vite-extension/src/
   - Convert sidebar.js to ESM imports (already compatible with Vite)
   - Update manifest.json to include `sidePanel` permission + config
   - Add `"sidePanel": { "default_path": "src/sidebar.html" }` to manifest.json
   - Remove or keep popup.html/popup.js as secondary UI (optional)
   - Update background.js to set sidePanel behavior
   - Copy/vendor Monaco or use Vite's ESM import (if licensing allows)
   - Mark `outputs/` as deprecated; move to `build/` directory for reference

3. **If Option B (maintain variants):**
   - Create a feature sync task (e.g., Feature #10: `vite_sidebar_variant`) to implement the side-panel in vite-extension
   - Keep outputs/ as canonical for side-panel features
   - vite-extension remains popup-only for now

### Long Term

- Establish a **sync process:** Every feature in outputs/ must be ported/tested in vite-extension before closing the feature task
- Document which UI (side-panel vs popup) each feature targets
- Possibly create a shared test harness to verify both builds behave identically

---

## Risk Assessment

### Critical Gaps

1. **No side-panel in vite-extension:** Users cannot use the rich Vista/Editor UI from vite-extension. It's feature-incomplete.
2. **No Monaco editor:** vite-extension has zero Markdown editing capability. Full manual rewrite needed.
3. **No semantic HTML in Vista:** vite-extension's popup shows a flat item list; no WCAG compliance.
4. **No inline item edit/delete:** vite-extension offers no per-item actions.

### Data Migration Risk

If users install outputs/ and save data, then switch to vite-extension (popup), they can still **read** their data (storage API is identical) but **cannot edit** it via the popup UI. Moving back to outputs/ works fine. **No data loss**, but UX regresses.

### Code Maintenance Risk

**Current state:** Two diverging codebases. Each sync cycle requires manual reconciliation. High risk of skew after new features.

---

## Conclusion

**Status:** vite-extension/ is a **working but incomplete variant** of the Context Highlighter. It successfully uses Vite + pnpm for a popup-based build, but it does NOT include the side-panel UI and advanced features (Vista, Editor, semantic HTML, inline item actions) that have been added to outputs/ in Features #1, #5, #6, and #7.

**Path forward:** 
- Decide whether to unify on vite-extension (recommended) or maintain parallel builds.
- If unifying, migrate all sidebar files + Monaco + features into vite-extension and deprecate outputs/.
- If maintaining variants, establish a Feature #10+ task to implement side-panel parity in vite-extension and automate sync checks.

**Estimated effort:** 
- Option A (unify): ~400 lines of config + imports + vendor setup (2–4 hours)
- Option B (parallel): Ongoing (~1 hour per feature)

