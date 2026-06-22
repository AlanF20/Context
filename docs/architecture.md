# Architecture — What "doing good work" means

> This document defines the quality standard for this project.
> Reviewer agents evaluate code against this file.
> If something is not here, it is not a requirement.

Project: **Context Highlighter**, a Chrome **Manifest V3** extension. The user
highlights text on any page, files it under a **Context** (research topic) with
a **color category**, and reviews/exports notes as **Markdown** from a side
panel. Visual source of truth: `../DESIGN_SPEC.md` (reference render:
`../navigator.html`, guide only — do NOT copy its markup).

## Principles

1. **Spec first.** No code is written without an approved spec.
2. **Human approval gate.** The human approves the spec before tests activate.
3. **Tests before code.** Verification is defined before the change is made.
4. **One feature at a time.** Changes from different features are never mixed.
5. **Output to disk.** Agents write files; only file references travel in chat.
6. **Single responsibility.** Each file owns one job (see the map below).
7. **Separation of concerns.** HTML, CSS and JS always live in separate files.
   No inline `<style>`, no inline `<script>`, no `style="..."` attributes.
8. **No remote code (MV3).** Third-party code is vendored under `vendor/` and
   loaded locally — never from a CDN, and never via `eval` / `new Function`.

## Project layers (real file map)

```
extension root (outputs/)
├── manifest.json        — MV3 config: storage + sidePanel perms, content
│                          script, side panel, service worker
├── background.js        — service worker; opens the side panel on icon click
├── storage.js           — CLASSIC script. Data layer over chrome.storage.local
│                          (window.ContextStore): model, buildMd/parseMd,
│                          color categories, export. Shared with the content
│                          script, so it cannot be an ES module.
├── content.js           — CLASSIC IIFE content script: selection → "+" icon →
│   content.css            capture popup (context combobox, 4 color categories,
│                          nest, Enter saves) → on-page highlight (.ch-hl-*)
├── sidebar.html         — structure only: <link> to sidebar.css,
│   sidebar.css            <script type="module"> to sidebar.js
├── sidebar.js           — ES MODULE controller: state, header, Vista/Editor
│                          switch, .md export, rename
├── sidebar/             — ES modules imported by sidebar.js
│   ├── dom.js            — $, escapeHtml
│   ├── store.js          — re-exports window.ContextStore as `Store`
│   ├── markdown.js       — renderMarkdown (marked + DOMPurify)
│   ├── theme.js          — initTheme (light/dark, persisted)
│   ├── rail.js           — renderRail (context chips)
│   ├── vista.js          — renderVista (Markdown preview)
│   └── editor.js         — createEditorController (Monaco, dark, live sync)
└── vendor/              — bundled third-party (MV3: no remote code)
    ├── monaco/vs/        — Monaco editor
    └── lib/              — marked.min.js, purify.min.js
```

## Data flow (runtime)

```
Page selection ─▶ content.js popup ─▶ window.ContextStore ─▶ chrome.storage.local
                                                                   │
                                              storage.onChanged ◀──┘
                                                                   ▼
                          side panel: sidebar.js ─▶ rail.js / vista.js / editor.js
```

`chrome.storage.local` (key `contextHighlighter`) is the single bridge between
the in-page content script and the side panel — no message passing.

## Two JS worlds (do not break this)

- **Content-script world** (`content.js` + `storage.js`): MV3 content scripts
  run in an isolated world and cannot be ES modules nor load external HTML.
  They stay CLASSIC scripts; `storage.js` exposes `window.ContextStore`.
- **Side-panel world** (`sidebar.html`): a normal extension page. `sidebar.js`
  is an ES module that imports `sidebar/*.js`. The vendored classic scripts
  (marked, DOMPurify, Monaco loader, storage.js) load BEFORE the module so
  their globals exist when it runs.

## What NOT to do

- Add remotely hosted code (CDN scripts), or use `eval` / `new Function`.
- Inline CSS/JS into HTML, or use `style="..."` attributes.
- Turn `content.js` or `storage.js` into ES modules.
- Theme the host web page from the content script (only `.ch-hl-*` highlights
  may touch the page; the panel theme stays inside the panel).
- Break the `buildMd` ⇄ `parseMd` inverse contract (see conventions.md).
- Declare a feature `done` without the verification in `verification.md` passing.
