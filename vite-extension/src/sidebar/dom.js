/**
 * dom.js — tiny DOM utilities shared by the side-panel modules.
 */

/** querySelector shorthand. */
export const $ = (sel, root = document) => root.querySelector(sel);

/** Escape a string for safe insertion into HTML text/attributes. */
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
