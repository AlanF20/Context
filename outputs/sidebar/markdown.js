/**
 * markdown.js — render Markdown to sanitized HTML for the Vista preview.
 *
 * Uses the bundled `marked` (GFM) + `DOMPurify` (both classic globals loaded
 * before this module). Falls back to escaped plain text if marked is missing.
 */
import { escapeHtml } from "./dom.js";

export function renderMarkdown(md) {
  const parse = window.marked && window.marked.parse;
  if (!parse) return "<pre>" + escapeHtml(md) + "</pre>";

  const html = parse(md, { gfm: true, breaks: false, headerIds: false });
  return window.DOMPurify
    ? window.DOMPurify.sanitize(html, { ADD_ATTR: ["target"] })
    : html;
}
