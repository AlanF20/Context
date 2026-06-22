# Context Highlighter — Chrome Extension (MV3)

Highlight text on any page, file it under a research **Context**, then view and
export your structured notes as **Markdown** from a side panel.

## Files

| File | Role |
| --- | --- |
| `manifest.json` | MV3 config: `storage` + `sidePanel` permissions, content script, side panel, background worker. |
| `storage.js` | Shared data layer over `chrome.storage.local`; TXT + Markdown exporters. Loaded in both the page and the side panel. |
| `content.js` / `content.css` | In-page selection capture: micro-icon → expanding context menu. |
| `background.js` | Service worker that opens the side panel when the toolbar icon is clicked. |
| `sidebar.html` / `sidebar.js` | Side panel: lists all contexts, previews Markdown, edits in Monaco, downloads `.md`. |
| `vendor/monaco/vs/` | Bundled Monaco editor (loaded locally — MV3 forbids remote code). |
| `vendor/lib/marked.min.js` | Bundled Markdown parser (GitHub-flavoured) for the preview. |
| `vendor/lib/purify.min.js` | Bundled DOMPurify; sanitizes rendered HTML before it hits the DOM. |

## Install (unpacked)

1. Keep all files in one folder.
2. Go to `chrome://extensions`, enable **Developer mode** (top right).
3. Click **Load unpacked** and select the folder.

## How it works

**On the page (`content.js` + `content.css`)**
- Select text → a tiny floating **＋** micro-icon appears (Kindle-style).
- Click the icon → it expands into the full menu where you can:
  - pick an existing **Context** or create a new one,
  - save the selection as a **Subtitle** or **Normal text**,
  - optionally **nest** normal text under any existing subtitle in that context.
- Duplicates are allowed — saving the same text twice always creates a new entry.

**Side panel (click the toolbar icon)**
- `background.js` opens `sidebar.html` as a side panel.
- The top section lists **all contexts** with a quick item count.
- Click a context → its notes render as **formatted Markdown** below.
- A **toggle icon** in the header switches the selected context between:
  - **Preview** (✎ shown) — full GitHub-flavoured Markdown rendered via the
    bundled `marked` parser and sanitized with `DOMPurify`: headings, **bold**/
    *italic*/~~strike~~, ordered/unordered/nested lists, task lists, tables,
    blockquotes, fenced code blocks, inline code, images, and links (which open
    in a new tab). Plus **Download .md**.
  - **Edit** (👁 shown) — edit the whole document in a **Monaco** editor with
    Markdown syntax highlighting. **Save** (or `Ctrl/Cmd+S`) re-parses the text
    back into the structured data model (`#` → name, `##` → subtitle, text under
    a subtitle nests beneath it, `---` fenced blocks → standalone notes).
    Switching back to preview also saves automatically.
- The panel auto-refreshes (via `chrome.storage.onChanged`) when you save a new
  highlight on a page while it's open (paused while you're mid-edit).

## Monaco editor (bundled)

Monaco is vendored under `vendor/monaco/vs/` and loaded with its AMD loader from
the extension's own origin. MV3 bans remotely hosted code, so it cannot be
pulled from a CDN — keep the `vendor/` folder alongside the other files. The
worker is pointed at `vendor/monaco/vs/base/worker/workerMain.js` via
`MonacoEnvironment.getWorkerUrl`. To upgrade Monaco later, replace the contents
of `vendor/monaco/vs/` with a newer `monaco-editor` `min/vs` build.

## The storage bridge

`storage.js` is loaded in **both** the content script and the side panel. Both
talk to the same `chrome.storage.local` key (`contextHighlighter`), so highlights
captured on a page are immediately available to the panel — no message passing
needed. All read/write logic lives in the shared `window.ContextStore` API.

## Data model (flat, ordered)

```
contexts: {
  "<id>": {
    id, name, createdAt,
    items: [ { id, type:"subtitle"|"text", text, linkedSubtitleId, sourceUrl, createdAt } ]
  }
}
```

## Markdown export layout

- Context name → `# Name`
- Subtitle → `## Subtitle`, with its linked normal texts as paragraphs beneath.
- Unlinked normal text → fenced with `---` horizontal rules so it stays visually
  distinct from neighbouring subtitles.

(`storage.js` also still exposes `exportContextToText` if you ever want a plain
`.txt` variant.)

## Markdown rendering

The side panel includes a tiny dependency-free Markdown→HTML renderer
(`renderMarkdown` in `sidebar.js`) covering the subset the exporter emits:
headings, horizontal rules, paragraphs, and inline `**bold**`, `*italic*`,
`` `code` ``, and `[links](url)`. Input is HTML-escaped first, so no remote
libraries are needed (which also keeps it within the extension's default CSP).

## MVP notes / next steps

- No edit/delete UI for items yet (clear via `chrome.storage.local`).
- No drag-reordering; items keep their save order.
- Renderer is intentionally minimal — swap in a full Markdown library if needed.
