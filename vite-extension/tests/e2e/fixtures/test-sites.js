// @ts-check
/**
 * test-sites.js — real external URLs used by E2E specs that need to exercise
 * the content script against genuine third-party pages (not local fixtures).
 * Each entry's `articleSelector` targets that site's actual body-text
 * paragraph — verified by hand against the live DOM, since real templates
 * often render metadata (bylines, contact info) in earlier <p> elements than
 * the real article copy. Add more entries here as needed; specs should loop
 * over (or pick from) this array instead of hardcoding URLs inline.
 */
export const TEST_SITES = [
  {
    label: "Houston Methodist — cortisol article",
    url: "https://www.houstonmethodist.org/es/why-choose-houston-methodist/blog/2025/april/what-is-cortisol/",
    articleSelector: ".horizontal-text.txt-container p",
  },
  {
    // Medium marks this a "member-only" story (isAccessibleForFree: false,
    // isLockedPreviewOnly: true per its embedded JSON) — only the lead
    // preview paragraphs render for logged-out visitors. The FIRST
    // .pw-post-body-paragraph (Medium's real body-copy class, verified
    // against the live page) is part of that free preview, so this still
    // works without auth; a paywall/upsell overlay further down the page is
    // an accepted, out-of-scope risk (not exercised — only the first
    // paragraph is used).
    label: "Medium — 11 best iPhone apps",
    url: "https://gauravtakjaipur.medium.com/11-best-iphone-apps-you-should-install-in-2026-productivity-travel-photos-more-e5d8658d917a",
    articleSelector: ".pw-post-body-paragraph",
  },
  {
    label: "AnkiWeb docs — Getting Started",
    url: "https://docs.ankiweb.net/getting-started.html",
    articleSelector: "main p",
  },
  {
    // #mw-content-text scopes to the article body, excluding chrome (sidebar,
    // nav). The infobox (a <table>, not a <p>) precedes the intro paragraph
    // in the DOM but isn't a <p> itself, so the first .mw-parser-output p
    // match is still the real lead paragraph — verified against the live page.
    label: "Wikipedia (es) — Cortisol",
    url: "https://es.wikipedia.org/wiki/Cortisol",
    articleSelector: "#mw-content-text .mw-parser-output p",
  },
];
