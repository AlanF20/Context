// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createEditorController } from "../src/sidebar/editor.js";
import { createDocEditor } from "../src/sidebar/vista.js";

const CTX = { id: "ctx-1", name: "Prueba", items: [] };
const OTHER_CTX = { id: "ctx-2", name: "Otro", items: [] };

describe("editor.isDirty (Monaco tab)", () => {
  let editor;
  let mountEl;

  beforeEach(() => {
    editor = createEditorController();
    mountEl = document.createElement("div");
    document.body.appendChild(mountEl);
  });

  afterEach(() => {
    editor.dispose();
    mountEl.remove();
  });

  it("is false before anything is mounted", () => {
    expect(editor.isDirty(CTX.id)).toBe(false);
  });

  it("is false right after mount (no edits yet)", async () => {
    await editor.mount(mountEl, CTX, {});
    expect(editor.isDirty(CTX.id)).toBe(false);
  });

  it("is true once the tab-dirty indicator is shown (simulates an in-flight edit)", async () => {
    await editor.mount(mountEl, CTX, {});
    mountEl.querySelector(".tab-dirty").hidden = false;
    expect(editor.isDirty(CTX.id)).toBe(true);
  });

  it("is false for a different context id even while the mounted one is dirty", async () => {
    await editor.mount(mountEl, CTX, {});
    mountEl.querySelector(".tab-dirty").hidden = false;
    expect(editor.isDirty(OTHER_CTX.id)).toBe(false);
  });

  it("is false again after dispose()", async () => {
    await editor.mount(mountEl, CTX, {});
    mountEl.querySelector(".tab-dirty").hidden = false;
    editor.dispose();
    expect(editor.isDirty(CTX.id)).toBe(false);
  });
});

describe("docEditor.isDirty (Vista-edit tab)", () => {
  let docEditor;
  let mountEl;

  beforeEach(() => {
    docEditor = createDocEditor();
    mountEl = document.createElement("div");
    document.body.appendChild(mountEl);
  });

  afterEach(() => {
    docEditor.dispose();
    mountEl.remove();
  });

  it("is false before anything is mounted", () => {
    expect(docEditor.isDirty(CTX.id)).toBe(false);
  });

  it("is false right after mount (no edits yet)", async () => {
    await docEditor.mount(mountEl, CTX, {});
    expect(docEditor.isDirty(CTX.id)).toBe(false);
  });

  it("is true after an input event, before the debounced save fires", async () => {
    await docEditor.mount(mountEl, CTX, {});
    const ta = mountEl.querySelector(".vista-edit-doc");
    ta.value = "# Prueba\n\nnuevo texto";
    ta.dispatchEvent(new Event("input"));
    expect(docEditor.isDirty(CTX.id)).toBe(true);
  });

  it("is false for a different context id even while the mounted one is dirty", async () => {
    await docEditor.mount(mountEl, CTX, {});
    const ta = mountEl.querySelector(".vista-edit-doc");
    ta.dispatchEvent(new Event("input"));
    expect(docEditor.isDirty(OTHER_CTX.id)).toBe(false);
  });

  it("is false again after dispose()", async () => {
    await docEditor.mount(mountEl, CTX, {});
    const ta = mountEl.querySelector(".vista-edit-doc");
    ta.dispatchEvent(new Event("input"));
    docEditor.dispose();
    expect(docEditor.isDirty(CTX.id)).toBe(false);
  });
});
