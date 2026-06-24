/**
 * markdown.js — render Markdown to sanitized HTML for the Vista preview.
 *
 * In the Vite build, marked and DOMPurify are npm packages imported directly
 * (no window globals needed). Falls back to escaped plain text if parsing fails.
 */
import { escapeHtml } from "./dom.js";
import { marked, Renderer } from "marked";
import DOMPurify from "dompurify";

// Maps the category emoji prefix (written by buildMd) to its CSS class name.
const EMOJI_CAT = { "🟡": "idea", "🔵": "argument", "🟢": "evidence" };

/**
 * Returns a marked Renderer that wraps category paragraphs in a
 * <div class="md-cat-item cat-{name}"> and strips the leading emoji,
 * so the colored left border communicates the category instead of the emoji.
 */
function buildCategoryRenderer() {
  const r = new Renderer();
  r.paragraph = ({ text }) => {
    for (const [emoji, cat] of Object.entries(EMOJI_CAT)) {
      if (text.startsWith(emoji)) {
        const content = text.slice(emoji.length).trimStart();
        return `<div class="md-cat-item cat-${cat}"><p>${content}</p></div>\n`;
      }
    }
    return `<p>${text}</p>\n`;
  };
  return r;
}

export function renderMarkdown(md) {
  try {
    const html = marked.parse(md, {
      gfm: true,
      breaks: false,
      renderer: buildCategoryRenderer(),
    });
    return DOMPurify.sanitize(html, { ADD_ATTR: ["target"] });
  } catch {
    return "<pre>" + escapeHtml(md) + "</pre>";
  }
}
