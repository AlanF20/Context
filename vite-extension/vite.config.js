import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  // CRXJS 2.x doesn't inject __LIVE_RELOAD__ on Vite 5+; declare it explicitly.
  define: {
    __LIVE_RELOAD__: true,
  },
  plugins: [crx({ manifest })],
  server: {
    // Required for CRXJS HMR: allows the extension's service worker to proxy
    // WebSocket/fetch requests back to the Vite dev server.
    cors: { origin: [/chrome-extension:\/\//] },
    strictPort: true,
    port: 5173,
  },
});
