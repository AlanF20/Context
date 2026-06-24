# Research: Fix Monaco AMD path in Vite build

**Feature ID:** 17  
**Feature name:** monaco_amd_path_fix  
**Date:** 2026-06-24

---

## Problem statement

The Monaco editor fails to load in the Vite build of the extension. The error shown in the side panel is:

> "No se pudo cargar el editor. Verifica la carpeta vendor/monaco."

This corresponds to the catch block in `editor.js:79-84`.

---

## Root cause analysis

### File locations

| Context | HTML page URL | AMD base URL |
|---|---|---|
| `outputs/` (legacy) | `chrome-extension://<id>/sidebar.html` | `chrome-extension://<id>/` |
| `vite-extension/dist/` | `chrome-extension://<id>/src/sidebar.html` | `chrome-extension://<id>/src/` |

CRXJS places built HTML pages under `dist/src/` to mirror the `src/` source structure. The Monaco vendor files live at `dist/vendor/` (copied from `public/vendor/` by Vite), which maps to `chrome-extension://<id>/vendor/`.

### The broken code

`vite-extension/src/sidebar/editor.js` line 125:

```js
req.config({ paths: { vs: "vendor/monaco/vs" } });
```

Monaco's AMD loader resolves `"vendor/monaco/vs"` relative to the page's base URL. In the Vite build:

```
chrome-extension://<id>/src/ + vendor/monaco/vs
= chrome-extension://<id>/src/vendor/monaco/vs  ← does NOT exist
```

Actual Monaco location:

```
chrome-extension://<id>/vendor/monaco/vs  ← exists
```

### Why it worked in `outputs/`

`outputs/sidebar.html` is at the extension root, so its base URL is `chrome-extension://<id>/`. The relative path `"vendor/monaco/vs"` correctly resolves to `chrome-extension://<id>/vendor/monaco/vs`.

When this code was ported to `vite-extension/` in Feature #10 (vite_sidebar_parity), the relative path was copied verbatim without adjusting for the new HTML location.

### Why `getWorkerUrl` works

`MonacoEnvironment.getWorkerUrl` already uses:

```js
chrome.runtime.getURL("vendor/monaco/vs/base/worker/workerMain.js")
```

`chrome.runtime.getURL` always returns an absolute `chrome-extension://` URL from the extension root — independent of the page's location. That's why the worker part didn't fail.

---

## Fix

Change `req.config` to use the same pattern:

```js
// BEFORE (broken in Vite build — relative to page URL, not extension root)
req.config({ paths: { vs: "vendor/monaco/vs" } });

// AFTER (absolute from extension root, works regardless of page location)
req.config({ paths: { vs: chrome.runtime.getURL("vendor/monaco/vs") } });
```

**File:** `vite-extension/src/sidebar/editor.js`, line 125.

---

## Verification plan

1. `pnpm run build` — must complete without errors.
2. Load `vite-extension/dist/` as unpacked extension in Chrome.
3. Open the side panel, select a context, click "Editor".
4. Monaco editor must render (dark theme, text cursor, markdown content).
5. No "No se pudo cargar el editor" message.
6. `init.sh` from repo root — all checks green.

---

## Scope

- **Files changed:** 1 (`vite-extension/src/sidebar/editor.js`, 1 line).
- **Risk:** Minimal. The fix uses the same API already used for the worker URL in the same function.
- **No data model changes, no UI changes, no CSS changes.**
