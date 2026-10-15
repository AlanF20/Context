import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';
import { isolateContentScript } from './vite-plugins/isolate-content-script.js';
import { copyPdfjsAssets } from './vite-plugins/copy-pdfjs-assets.js';

export default defineConfig({
  // CRXJS 2.x doesn't inject __LIVE_RELOAD__ on Vite 5+; declare it explicitly.
  define: {
    __LIVE_RELOAD__: true,
  },
  plugins: [
    copyPdfjsAssets({ dest: 'public/vendor/pdfjs' }),
    isolateContentScript({ entry: 'src/content.js' }),
    crx({ manifest }),
  ],
  build: {
    rollupOptions: {
      // CRXJS only builds the pages the manifest references; the PDF viewer
      // (feature 37) is opened by URL, so it's an extra explicit entry.
      input: { viewer: 'src/viewer.html' },
    },
  },
  server: {
    // Required for CRXJS HMR: allows the extension's service worker to proxy
    // WebSocket/fetch requests back to the Vite dev server.
    cors: { origin: [/chrome-extension:\/\//] },
    strictPort: true,
    port: 5173,
  },
});
