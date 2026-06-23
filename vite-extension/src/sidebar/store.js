/**
 * store.js — access point to the shared data layer.
 *
 * In the Vite build, storage.js is an ES module with named exports.
 * We bundle all exports into a single namespace object so the panel
 * modules can `import { Store }` and call Store.listContexts() etc.,
 * matching the same call-site pattern as the outputs/ build.
 */
import * as StoreNS from '../storage.js';

export const Store = StoreNS;
