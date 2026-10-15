/**
 * isolate-content-script.js — keep the content script bundle self-contained.
 * ---------------------------------------------------------------------------
 * Chrome runs content scripts as classic scripts. If a module imported by
 * content.js is also imported by an extension page (sidebar, PDF viewer),
 * Rollup extracts it into a shared chunk and content.js gains an `import`
 * that Chrome can't execute (the feature 31 incident, CLAUDE.md "Testing").
 *
 * This plugin gives every module reached from the content script entry its
 * own module id (`<file>?ch-content`), so Rollup treats it as a different
 * module from the copy the pages import and inlines it into content.js.
 * Vite's load fallback reads the file from disk with the query stripped.
 *
 * Build-only: the dev server serves modules over HTTP and has no chunking.
 * Guarded by tests/037-content-bundle-guard.test.js.
 * ---------------------------------------------------------------------------
 */
import path from 'node:path';

const SUFFIX = '?ch-content';

/** @param {{ entry: string }} options absolute path of the content script entry */
export function isolateContentScript({ entry }) {
  const entryPath = path.resolve(entry);
  const stripQuery = (id) => id.split('?')[0];
  const isContentImporter = (importer) =>
    importer.endsWith(SUFFIX) || stripQuery(importer) === entryPath;

  return {
    name: 'isolate-content-script',
    apply: 'build',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !isContentImporter(importer)) return null;
      const resolved = await this.resolve(source, stripQuery(importer), {
        ...options,
        skipSelf: true,
      });
      // Leave externals, virtual modules and special imports (?url, ?raw…) alone.
      if (!resolved || resolved.external || resolved.id.startsWith('\0') || resolved.id.includes('?')) {
        return resolved;
      }
      return { ...resolved, id: resolved.id + SUFFIX };
    },
  };
}
