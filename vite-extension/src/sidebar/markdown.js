/**
 * markdown.js — render Markdown to sanitized HTML for the Vista preview.
 *
 * In the Vite build, marked and DOMPurify are npm packages imported directly
 * (no window globals needed). Falls back to escaped plain text if parsing fails.
 */
import { escapeHtml } from "./dom.js";
import { marked } from "marked";
import DOMPurify from "dompurify";

export function renderMarkdown(md) {
  try {
    const html = marked.parse(md, { gfm: true, breaks: false });
    return DOMPurify.sanitize(html, { ADD_ATTR: ["target"] });
  } catch {
    return "<pre>" + escapeHtml(md) + "</pre>";
  }
}
