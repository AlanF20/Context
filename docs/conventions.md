# Code conventions

> Extreme homogeneity. The model predicts better when the repository looks like
> itself everywhere. These are the conventions actually used in this project.

## Stack

Plain **HTML + CSS + vanilla JS** for a Chrome MV3 extension. No framework, no
build step, no TypeScript. Third-party code is **vendored** under `vendor/`.

## File separation (mandatory)

- **HTML, CSS and JS always in separate files.** Never inline `<style>`, inline
  `<script>`, or `style="..."` attributes — use classes.
- The side panel uses **ES modules**: `sidebar.html` loads `sidebar.js` with
  `type="module"`; logic is split into `sidebar/*.js` with `import`/`export`.
- **Content scripts stay classic.** `content.js` is an IIFE and builds its DOM
  in JS (markup lives in a single `popupSkeleton()` template helper).
  `storage.js` is a classic script exposing `window.ContextStore` (shared by the
  content script and the panel). Neither may become an ES module.

## Style

- 2-space indent, semicolons, double quotes (match the existing files).
- Small, single-purpose functions; clear names over cleverness.
- **Document complex functions** with a brief JSDoc/comment (parsers,
  serializers, positioning math, sync logic). Do NOT comment the obvious.
- No debug `console.log` left behind (real error logs are fine, prefixed
  `[ContextHighlighter]`); no context-free `TODO`s.
- **Language:** UI strings in **Spanish**; code/comments in **English**
  (current consistency).

## CSS

- All theme values are CSS custom properties (tokens) on `:root` and
  `:root[data-theme="dark"]`, scoped to the panel. See `DESIGN_SPEC.md §1`.
- Content-script styles are scoped under `.ch-` classes with a hard reset so
  they neither leak into nor inherit from the host page.

## Markdown contract (keep in sync)

- Serialize: `Store.buildMd(ctx)`. Parse: `Store.parseMd(md)` /
  `Store.replaceContextFromMarkdown`. They are **inverses** — change one, change
  the other, and add a round-trip check.
- Format: context name `# H1`; subtitle `## H2`; colored notes prefixed with an
  emoji (`🟡` idea, `🔵` argument, `🟢` evidence); source line `_Fuente: domain_`.

## Naming

- Files: lowercase, one responsibility per file (`rail.js`, `vista.js`, …).
- Exported functions: `renderX`, `createXController`, `initX`.
- Data keys follow the model in `CLAUDE.md` (`category`, `source`, `sourceUrl`…).

## Dependencies

- **No new remote dependencies.** MV3 forbids remotely hosted code. Anything new
  must be vendored into `vendor/` and loaded locally. No CDNs, no `eval`.
