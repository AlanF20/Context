import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../src/sidebar/store.js";

/**
 * hasSeenOnboarding()/markOnboardingSeen() persist a UI-only flag in the same
 * chrome.storage.local document as contexts/items (storage.js's readAll/
 * writeAll). Mock follows the pattern in tests/031-storage-comment.test.js.
 */
describe("hasSeenOnboarding / markOnboardingSeen (chrome.storage.local mock)", () => {
  let data;

  beforeEach(() => {
    data = { contextHighlighter: { contexts: {} } };
    global.chrome = {
      storage: {
        local: {
          get: (key, cb) => cb({ [key]: data[key] }),
          set: (obj, cb) => {
            Object.assign(data, obj);
            if (cb) cb();
          },
        },
      },
    };
  });

  it("returns false when the flag is absent", async () => {
    expect(await Store.hasSeenOnboarding()).toBe(false);
  });

  it("returns true once markOnboardingSeen() has run", async () => {
    await Store.markOnboardingSeen();
    expect(await Store.hasSeenOnboarding()).toBe(true);
  });

  it("returns true when pre-populated storage already has the flag set", async () => {
    data.contextHighlighter.onboardingSeen = true;
    expect(await Store.hasSeenOnboarding()).toBe(true);
  });

  it("does not clobber existing contexts when marking the flag", async () => {
    const ctx = await Store.createContext("Cortisol");
    await Store.addItem(ctx.id, { text: "Nota", category: "idea" });

    await Store.markOnboardingSeen();

    const stored = data.contextHighlighter;
    expect(stored.onboardingSeen).toBe(true);
    expect(Object.keys(stored.contexts)).toHaveLength(1);
    expect(stored.contexts[ctx.id].items).toHaveLength(1);
    expect(stored.contexts[ctx.id].items[0].text).toBe("Nota");
  });
});

// Reopening via the rail's "?" button (openOnboarding() in sidebar/onboarding.js)
// deliberately does not read or depend on the onboardingSeen flag — it always
// calls dialog.showModal() regardless of state. That path touches the real DOM
// (document.getElementById("onboarding-modal")) and is covered by the manual
// verification plan (docs/test_active_reading_rebrand.md §4), not by a unit
// test here.
