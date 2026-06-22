/**
 * store.js — access point to the shared data layer.
 *
 * storage.js is loaded as a CLASSIC script before this module (and is reused
 * verbatim by the content script, which cannot be an ES module). It attaches
 * its API to window.ContextStore, which we simply re-export here so the panel
 * modules can `import { Store }` instead of reaching into window everywhere.
 */
export const Store = window.ContextStore;
