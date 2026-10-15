/**
 * capture/markdown.js — DOM selection → Markdown (list-aware).
 * Shared by the web content script and the PDF viewer (feature 37).
 */

/**
 * Convert a DocumentFragment from Range.cloneContents() to Markdown.
 * Returns null when the fragment contains no list elements so the caller
 * can fall back to sel.toString().trim().
 */
export function fragmentToMarkdown(fragment) {
  if (!fragment.querySelector("ul, ol, li")) return null;
  const md = _childrenToMd(fragment, 0);
  return md.replace(/\n{3,}/g, "\n\n").trim();
}

function _nodeToMd(node, indent) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const tag = node.tagName.toLowerCase();
  switch (tag) {
    case "ul": return _listToMd(node, indent, false);
    case "ol": return _listToMd(node, indent, true);
    case "li": return _liToMd(node, indent, false, 1); // standalone li (partial selection)
    case "br": return "\n";
    case "p":
    case "div":
    case "section":
    case "article": {
      const inner = _childrenToMd(node, indent).trim();
      return inner ? inner + "\n\n" : "";
    }
    case "h1": return "# " + node.textContent.trim() + "\n\n";
    case "h2": return "## " + node.textContent.trim() + "\n\n";
    case "h3":
    case "h4":
    case "h5":
    case "h6": return "### " + node.textContent.trim() + "\n\n";
    case "strong":
    case "b": return "**" + _childrenToMd(node, indent) + "**";
    case "em":
    case "i": return "_" + _childrenToMd(node, indent) + "_";
    case "code": return "`" + node.textContent + "`";
    case "dt": return "**" + node.textContent.trim() + "**\n";
    case "dd": return "  " + node.textContent.trim() + "\n";
    case "table": return node.textContent.trim() + "\n\n"; // fallback: no table Markdown
    default: return _childrenToMd(node, indent);
  }
}

function _listToMd(listNode, indent, ordered) {
  const parts = [];
  let n = 1;
  for (const child of listNode.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE && child.tagName.toLowerCase() === "li") {
      parts.push(_liToMd(child, indent, ordered, n));
      if (ordered) n++;
    }
  }
  return parts.join("\n") + "\n";
}

function _liToMd(li, indent, ordered, n) {
  const pad = "  ".repeat(indent);
  const bullet = ordered ? n + ". " : "- ";
  let inlineText = "";
  const nested = [];
  for (const child of li.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const t = child.tagName.toLowerCase();
      if (t === "ul" || t === "ol") {
        nested.push(_listToMd(child, indent + 1, t === "ol"));
        continue;
      }
    }
    inlineText += _nodeToMd(child, indent);
  }
  const firstLine = pad + bullet + inlineText.trim();
  return nested.length ? firstLine + "\n" + nested.join("") : firstLine;
}

function _childrenToMd(node, indent) {
  let out = "";
  for (const child of node.childNodes) out += _nodeToMd(child, indent);
  return out;
}
