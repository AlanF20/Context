/**
 * copy-pdfjs-assets.js — vendor PDF.js runtime assets into public/ (feature 37).
 * ---------------------------------------------------------------------------
 * The PDF viewer loads cMaps, standard fonts, ICC profiles and wasm decoders
 * by URL at runtime (chrome.runtime.getURL("vendor/pdfjs/…")), so they must
 * ship as static files. Copying them from node_modules at build/dev start
 * keeps them in lockstep with the pinned pdfjs-dist version; the output
 * folder is git-ignored. A version stamp skips the copy when up to date.
 * ---------------------------------------------------------------------------
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const FOLDERS = ['cmaps', 'standard_fonts', 'iccs', 'wasm'];

/** @param {{ dest: string }} options destination folder (inside public/) */
export function copyPdfjsAssets({ dest }) {
  return {
    name: 'copy-pdfjs-assets',
    buildStart() {
      const require = createRequire(import.meta.url);
      const pkgJson = require.resolve('pdfjs-dist/package.json');
      const pkgDir = path.dirname(pkgJson);
      const { version } = JSON.parse(readFileSync(pkgJson, 'utf8'));
      const outDir = path.resolve(dest);
      const stamp = path.join(outDir, '.version');
      if (existsSync(stamp) && readFileSync(stamp, 'utf8') === version) return;

      rmSync(outDir, { recursive: true, force: true });
      mkdirSync(outDir, { recursive: true });
      for (const folder of FOLDERS) {
        cpSync(path.join(pkgDir, folder), path.join(outDir, folder), { recursive: true });
      }
      cpSync(path.join(pkgDir, 'LICENSE'), path.join(outDir, 'LICENSE'));
      writeFileSync(stamp, version);
    },
  };
}
