/**
 * anchor.js — text re-anchoring pipeline (spec 027).
 * ---------------------------------------------------------------------------
 * Locates a saved quote inside the page text using four levels, cheapest first:
 *
 *   0. position   — raw.slice(rangeStart, rangeEnd) === quote          (O(1))
 *   1. exact      — indexOf(prefix + quote + suffix), else unique quote
 *   2. normalized — level 1 in whitespace/punctuation-normalized space,
 *                   with offsets mapped back to the raw space
 *   3. fuzzy      — approx-string-match (Myers bit-parallel) with a
 *                   Hypothesis-style score over quote + context + position
 *
 * Coordinate space: the concatenation of the page's text-node content in
 * TreeWalker order with NO separators — the same string Range.toString()
 * produces, so offsets captured at save time are directly comparable.
 *
 * Pure string module: no DOM access. The caller maps the returned raw
 * {start, end} offsets to a DOM Range.
 *
 * Scoring adapted from hypothesis/client `match-quote.ts` (BSD-2-Clause,
 * https://github.com/hypothesis/client).
 * ---------------------------------------------------------------------------
 */
import search from "approx-string-match";

// Auto-painting policy: a misplaced highlight is worse than a missing one,
// so the error budget is stricter than Hypothesis' interactive 50%.
const ERROR_RATE = 0.25;
const MAX_ERROR_BUDGET = 128;
const MIN_FUZZY_QUOTE_LEN = 5;
const SHORT_QUOTE_LEN = 16;
const MIN_CONTEXT_SCORE_FOR_SHORT = 0.7;

// 1:1 fold of typographic punctuation so a CMS swapping quote styles doesn't
// break exact matching. Multi-char folds (… → "...") would break the offset
// map, so "…" folds to a single ".". Case is NOT folded: JS lowercasing can
// change string length (e.g. "İ"), which would corrupt the map; rare case
// changes are absorbed by the fuzzy level instead.
const FOLD = {
  "‘": "'",
  "’": "'",
  "‚": "'",
  "‛": "'",
  "“": '"',
  "”": '"',
  "„": '"',
  "–": "-",
  "—": "-",
  "…": ".",
};

/**
 * Normalize text for matching and keep a map back to raw offsets:
 * collapse whitespace runs (incl. NBSP) to one space, drop soft hyphens and
 * zero-width characters, fold typographic punctuation to ASCII.
 * Returns { norm, map } where map[i] is the raw index of norm[i].
 */
export function normalizeWithMap(text) {
  const out = [];
  const map = [];
  let lastWasSpace = false;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // Soft hyphen, zero-width space/joiners, BOM: invisible — drop.
    if (code === 0xad || (code >= 0x200b && code <= 0x200d) || code === 0xfeff) {
      continue;
    }
    let ch = text[i];
    if (code === 0xa0 || /\s/.test(ch)) {
      if (lastWasSpace) continue;
      out.push(" ");
      map.push(i);
      lastWasSpace = true;
      continue;
    }
    lastWasSpace = false;
    out.push(FOLD[ch] || ch);
    map.push(i);
  }
  return { norm: out.join(""), map };
}

/** Exact search: anchored (prefix+quote+suffix) first, then unique quote. */
function findExact(text, quote, prefix, suffix) {
  if (prefix || suffix) {
    const i = text.indexOf(prefix + quote + suffix);
    if (i !== -1) {
      const start = i + prefix.length;
      return { start, end: start + quote.length };
    }
  }
  const first = text.indexOf(quote);
  if (first !== -1 && text.indexOf(quote, first + 1) === -1) {
    return { start: first, end: first + quote.length };
  }
  return null;
}

/** Map a normalized-space hit back to raw offsets. Null on any inconsistency. */
function toRaw(hit, map, rawLength) {
  if (hit.start >= hit.end || hit.end > map.length) return null;
  const start = map[hit.start];
  const end = map[hit.end - 1] + 1;
  if (!(start >= 0 && start < end && end <= rawLength)) return null;
  return { start, end };
}

/** 1 - minErrors/|pattern| similarity between a text window and a pattern. */
function textSimilarity(text, pattern) {
  if (!pattern.length || !text.length) return 0;
  const matches = search(text, pattern, pattern.length);
  if (!matches.length) return 0;
  let best = pattern.length;
  for (const m of matches) if (m.errors < best) best = m.errors;
  return 1 - best / pattern.length;
}

/**
 * Level 3: fuzzy locate `quote` in normalized text, scoring each candidate by
 * quote similarity (×50), prefix/suffix context similarity (×20 each) and
 * proximity to the saved position (×2), normalized by the weights present.
 */
function fuzzyMatch(norm, map, rawLength, quote, prefix, suffix, hintStart) {
  if (quote.length < MIN_FUZZY_QUOTE_LEN) return null;
  const maxErrors = Math.min(MAX_ERROR_BUDGET, Math.ceil(quote.length * ERROR_RATE));
  const candidates = search(norm, quote, maxErrors);
  if (!candidates.length) return null;

  let best = null;
  let bestScore = -1;
  for (const c of candidates) {
    if (c.start >= c.end || c.end > map.length) continue;
    const prefixScore = prefix
      ? textSimilarity(norm.slice(Math.max(0, c.start - prefix.length), c.start), prefix)
      : 0;
    const suffixScore = suffix
      ? textSimilarity(norm.slice(c.end, c.end + suffix.length), suffix)
      : 0;
    // Short quotes are ambiguous on their own: require solid context.
    if (
      quote.length < SHORT_QUOTE_LEN &&
      Math.max(prefixScore, suffixScore) < MIN_CONTEXT_SCORE_FOR_SHORT
    ) {
      continue;
    }
    let weight = 50;
    let total = (1 - c.errors / quote.length) * 50;
    if (prefix) {
      weight += 20;
      total += prefixScore * 20;
    }
    if (suffix) {
      weight += 20;
      total += suffixScore * 20;
    }
    if (Number.isInteger(hintStart) && rawLength > 0) {
      const rawStart = map[c.start];
      weight += 2;
      total += (1 - Math.min(1, Math.abs(rawStart - hintStart) / rawLength)) * 2;
    }
    const score = total / weight;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best ? toRaw(best, map, rawLength) : null;
}

/**
 * Find `selector` in `raw` (the page's concatenated text-node content).
 *
 * @param {string} raw
 * @param {object} selector
 * @param {string}      selector.quote      — text to locate (rangeText || text)
 * @param {string}      [selector.prefix]   — up to 50 chars before (TextQuoteSelector)
 * @param {string}      [selector.suffix]   — up to 50 chars after
 * @param {number|null} [selector.hintStart] — saved raw offset (TextPositionSelector)
 * @param {number|null} [selector.hintEnd]
 * @returns {{start: number, end: number}|null} raw offsets, or null (→ "failed")
 */
export function findMatch(raw, selector) {
  const quote = selector.quote || "";
  if (!quote || !raw) return null;
  const prefix = selector.prefix || "";
  const suffix = selector.suffix || "";
  const hintStart = Number.isInteger(selector.hintStart) ? selector.hintStart : null;
  const hintEnd = Number.isInteger(selector.hintEnd) ? selector.hintEnd : null;

  // Level 0 — TextPositionSelector fast path (unchanged page).
  if (
    hintStart !== null &&
    hintEnd !== null &&
    hintStart >= 0 &&
    hintStart < hintEnd &&
    hintEnd <= raw.length &&
    raw.slice(hintStart, hintEnd) === quote
  ) {
    return { start: hintStart, end: hintEnd };
  }

  // Level 1 — exact in the raw space.
  const exactHit = findExact(raw, quote, prefix, suffix);
  if (exactHit) return exactHit;

  // Level 2 — exact in the normalized space.
  const { norm, map } = normalizeWithMap(raw);
  const nq = normalizeWithMap(quote).norm.trim();
  if (!nq) return null;
  const np = normalizeWithMap(prefix).norm;
  const ns = normalizeWithMap(suffix).norm;
  const normHit = findExact(norm, nq, np, ns);
  if (normHit) return toRaw(normHit, map, raw.length);

  // Level 3 — fuzzy.
  return fuzzyMatch(norm, map, raw.length, nq, np, ns, hintStart);
}
