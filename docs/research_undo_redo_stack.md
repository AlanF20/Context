# Research: Undo/Redo Stack (Feature 22)

**Date:** 2026-06-29  
**Author:** Researcher agent

---

## 1. Contexto del proyecto

La extensión ya tiene tres "editorores" de contenido conviviendo:

| Modo | Archivo | Undo actual |
|------|---------|------------|
| `vista` | `sidebar/vista.js` — preview Markdown read-only | ninguno |
| `vista-edit` | `sidebar/vista.js` — `<textarea>` full-doc | Browser nativo (texto de la sesión) |
| `editor` | `sidebar/editor.js` — Monaco | Monaco nativo (ilimitado en sesión) |

El storage compartido es `chrome.storage.local` (clave `contextHighlighter`).
Toda mutación pasa por funciones de `storage.js`: `addItem`, `replaceContextFromMarkdown`,
`deleteContext`, `renameContext`, `deleteItem`, `moveItem`.

---

## 2. Alcance de la pila de undo

### Qué debe deshacer
- **replaceContextFromMarkdown** — el "flush" de la textarea de vista-edit o del Monaco editor.
- **addItem** vía content script — detectado en `chrome.storage.onChanged` (el sidebar ya escucha).
- **renameContext** — cambio de nombre desde el header.

### Qué queda fuera de scope (v1)
- **deleteContext** — requeriría restaurar un contexto entero, incluyendo re-insertar el chip en
  el rail. Complejidad desproporcionada para v1.
- **createContext** — raro deshacer y también complejo (habría que silenciar el listener).
- **moveItem** — no hay UI de drag-and-drop en el panel aún.

---

## 3. Diseño de la pila

### Estructura en memoria

```js
// history.js
const stacks = {}; // ctxId -> { past: Snapshot[], future: Snapshot[] }

// Snapshot = JSON string de { name, items }
```

- **Máximo**: 50 entradas por contexto en `past`; 50 en `future`.
- **Vida**: en memoria del sidebar JS. Se pierde al cerrar el panel o recargar.
- **Por contexto**: cada contexto tiene su propia pila independiente.

### Operaciones

```
push(ctxId, snapshot)  → añade a past[], limpia future[], limita a MAX
undo(ctxId, current)   → past.pop(), future.push(current), devuelve el snapshot previo
redo(ctxId, current)   → future.pop(), past.push(current), devuelve el snapshot siguiente
canUndo(ctxId)         → past.length > 0
canRedo(ctxId)         → future.length > 0
invalidate(ctxId)      → borra stacks[ctxId]
```

---

## 4. Puntos de captura del snapshot

Se toma un snapshot **antes** de cada escritura:

### A. replaceContextFromMarkdown (sidebar.js)

El `docEditor` y el `editor` Monaco llaman a `Store.replaceContextFromMarkdown(ctxId, md)`
a través de `scheduleSync` / `afterDocEditorSync`. El punto de interceptación natural
es en el callback que se pasa al módulo, o bien wrapping la función en sidebar.js:

```js
async function saveWithHistory(ctxId, md) {
  const ctx = await Store.getContext(ctxId);
  if (ctx) history.push(ctxId, snapshot(ctx));
  await Store.replaceContextFromMarkdown(ctxId, md);
}
```

Ambos módulos ya reciben un callback `onSync`; la forma más limpia es pasar este wrapper
como el `save` que usan internamente, o redefinir la función en `vista.js` y `editor.js`
para recibir un callback `onSave` inyectado desde sidebar.js.

**Alternativa más simple**: en `sidebar.js`, crear versiones wrapeadas de las funciones de Store
y pasarlas como prop a cada controlador en el `mount()`:

```js
// En sidebar.js
async function saveDocWithHistory(ctxId, md) {
  const before = await Store.getContext(ctxId);
  if (before) historyMgr.push(ctxId, serialize(before));
  await Store.replaceContextFromMarkdown(ctxId, md);
}
```

En `vista.js`, `createDocEditor()` recibe un `onSave` externo en lugar de llamar
a `Store.replaceContextFromMarkdown` directamente:

```js
// vista.js — parámetro inyectado:
async function mount(mountEl, ctx, { onSync, onEscape, onSave } = {}) {
  ...
  ta.addEventListener('input', () => {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => onSave(ta.value), 400);
  });
  ...
}
```

Esta inyección de dependencia es la forma más limpia: `vista.js` y `editor.js` no conocen
el HistoryManager; solo `sidebar.js` lo gestiona.

### B. Captura via content script (chrome.storage.onChanged)

El sidebar ya escucha cambios:

```js
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEY] && mode === 'vista') {
    render();
  }
});
```

Ampliarlo para detectar un `addItem` externo:

```js
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[STORAGE_KEY]) return;
  const oldCtxs = changes[STORAGE_KEY].oldValue?.contexts || {};
  const newCtxs = changes[STORAGE_KEY].newValue?.contexts || {};
  
  for (const [id, newCtx] of Object.entries(newCtxs)) {
    const oldCtx = oldCtxs[id];
    if (oldCtx && newCtx.items.length > oldCtx.items.length) {
      // External addItem — snapshot the state before the capture
      historyMgr.push(id, serialize(oldCtx));
    }
  }
  if (mode === 'vista') render();
});
```

### C. renameContext

En `startRename()` dentro de `sidebar.js`, antes del `Store.renameContext()`:

```js
const commit = async () => {
  const ctx = selectedContext();
  if (ctx) historyMgr.push(ctx.id, serialize(ctx));
  await Store.renameContext(ctx.id, input.value || ctx.name);
  ...
};
```

---

## 5. Teclado

### Listener global en sidebar.js

```js
document.addEventListener('keydown', async (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod || e.key !== 'z') return;
  if (!selectedId) return;

  // Monaco editor: tiene undo propio, no interceptar
  if (mode === 'editor') return;

  // Textarea enfocado: browser maneja undo de texto
  if (mode === 'vista-edit') {
    const ta = document.querySelector('.vista-edit-doc');
    if (ta && document.activeElement === ta) return;
  }

  e.preventDefault();
  const isRedo = e.shiftKey;
  await applyUndoRedo(isRedo);
});
```

### applyUndoRedo

```js
async function applyUndoRedo(isRedo) {
  if (!selectedId) return;
  const before = await Store.getContext(selectedId);
  if (!before) return;

  const snap = isRedo
    ? historyMgr.redo(selectedId, serialize(before))
    : historyMgr.undo(selectedId, serialize(before));

  if (!snap) return; // stack vacía
  await restore(selectedId, snap);
  await render();
}

async function restore(ctxId, snap) {
  const { name, items } = JSON.parse(snap);
  const data = await Store.readAll();
  if (!data.contexts[ctxId]) return;
  data.contexts[ctxId].name = name;
  data.contexts[ctxId].items = items;
  await Store.writeAll(data);
}
```

---

## 6. Serialización del snapshot

```js
function serialize(ctx) {
  return JSON.stringify({ name: ctx.name, items: ctx.items });
}
```

El snapshot incluye `name` e `items` del contexto. `color` y `createdAt` no se tocan
y no se incluyen. El tamaño típico de un snapshot: ~50–200 items × ~300 bytes/item = ~15 KB max.
Con 50 snaps por contexto: ~750 KB en casos extremos. Aceptable para memoria de página.

---

## 7. Conflictos conocidos

| Escenario | Solución |
|-----------|---------|
| Usuario edita en textarea y pulsa Cmd+Z | Textarea activo → no interceptamos; browser undo de texto |
| Usuario edita en Monaco y pulsa Cmd+Z | mode === 'editor' → no interceptamos; Monaco undo de texto |
| Usuario cierra y abre el panel | Pila perdida (in-memory). Aceptable: el storage sí persiste |
| Undo de un undo vía content script externo | El snapshot previo restaura correctamente |
| Múltiples contexts: undo en contexto no activo | La pila sólo ejecuta en `selectedId` |
| deleteContext | Fuera de scope v1 |

---

## 8. Archivos a modificar/crear

| Archivo | Cambio |
|---------|-------|
| `src/sidebar/history.js` | ✨ nuevo — `createHistoryManager()` |
| `src/sidebar.js` | Importar history, listener keydown, wrappers saveDocWithHistory / saveMonacoWithHistory, renameContext con snapshot |
| `src/sidebar/vista.js` | Aceptar `onSave` externo en `mount()` en lugar de llamar directamente a Store |
| `src/sidebar/editor.js` | Aceptar `onSave` externo en `mount()` en lugar de llamar directamente a Store |
| `src/storage.js` | Exportar `readAll` y `writeAll` para que `sidebar.js` pueda hacer la restauración directa |

`storage.js` ya exporta `readAll` y `writeAll` — no hay cambio necesario.

---

## 9. Feedback visual (UX)

Un micro-feedback simple: cuando se aplica un undo/redo, el header del contexto 
muestra brevemente un indicador (e.g., texto muted "← Deshecho" / "→ Rehecho") 
que desaparece en 1.5 s. No es obligatorio para la funcionalidad pero mejora la UX.

Alternativa más simple: el re-render completo ya es suficiente feedback visual 
(el contenido cambia ante los ojos del usuario). Sin indicador adicional.

**Decisión**: implementar sin indicador extra (el cambio visual en el body es feedback suficiente).

---

## 10. Consideraciones MV3

- Todo en memoria del sidebar page — sin eval, sin remote code, sin APIs restringidas.
- `chrome.storage.local` es el bus compartido; nuestro restore escribe directamente al storage.
- El listener de `storage.onChanged` en el sidebar captura sus propios cambios también, 
  pero como `mode !== 'vista'` durante undo (o re-render inmediato), no crea loop.
