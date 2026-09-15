// @vitest-environment jsdom
//
// Feature 34: merely mounting the Editor/Vista-edit and leaving without
// typing must NOT persist — Store.replaceContextFromMarkdown rebuilds every
// item and wipes DOM-anchor metadata, breaking re-highlight on reload for
// items the user never touched. docEditor (plain <textarea>) is fully
// testable here; the Monaco-backed editor.js controller can't build a real
// editor instance under jsdom (no window.require/AMD loader), so its
// flush()/force-save gating is covered by the E2E spec instead
// (tests/e2e/034-editor-visit-preserves-anchor.spec.js) — see
// docs/test_editor_tab_switch_persistence_bug.md.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createDocEditor } from "../src/sidebar/vista.js";

const CTX = { id: "ctx-1", name: "Prueba", items: [] };

describe("docEditor.flush() — no-op when clean (feature 34)", () => {
  let docEditor;
  let mountEl;
  let onSave;

  beforeEach(() => {
    docEditor = createDocEditor();
    mountEl = document.createElement("div");
    document.body.appendChild(mountEl);
    onSave = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    docEditor.dispose();
    mountEl.remove();
  });

  it("does not call onSave when flush() runs right after mount (no edits)", async () => {
    await docEditor.mount(mountEl, CTX, { onSave });
    await docEditor.flush();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("calls onSave with the buffer value when flush() runs while dirty", async () => {
    await docEditor.mount(mountEl, CTX, { onSave });
    const ta = mountEl.querySelector(".vista-edit-doc");
    ta.value = "# Prueba\n\nnuevo texto";
    ta.dispatchEvent(new Event("input"));
    await docEditor.flush();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(CTX.id, "# Prueba\n\nnuevo texto");
  });

  it("a second flush() after a clean save is a no-op (isDirty reset)", async () => {
    await docEditor.mount(mountEl, CTX, { onSave });
    const ta = mountEl.querySelector(".vista-edit-doc");
    ta.dispatchEvent(new Event("input"));
    await docEditor.flush();
    await docEditor.flush();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("blur without prior input does not call onSave", async () => {
    await docEditor.mount(mountEl, CTX, { onSave });
    const ta = mountEl.querySelector(".vista-edit-doc");
    ta.dispatchEvent(new Event("blur"));
    // blur's save() is async; flush the microtask queue.
    await Promise.resolve();
    await Promise.resolve();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("blur after an input event still saves exactly once (debounced timer is cancelled)", async () => {
    await docEditor.mount(mountEl, CTX, { onSave });
    const ta = mountEl.querySelector(".vista-edit-doc");
    ta.value = "cambio";
    ta.dispatchEvent(new Event("input"));
    ta.dispatchEvent(new Event("blur"));
    await Promise.resolve();
    await Promise.resolve();
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
