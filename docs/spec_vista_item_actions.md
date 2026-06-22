# Spec: vista_item_actions (Feature #1)

## Objetivo
Añadir acciones de editar y borrar por ítem en la Vista (tab de preview). Hoy la Vista es un bloque HTML generado por `buildMd` → `marked` → HTML estático. Después de este cambio, cada ítem es editable y borrable inline sin salir de la Vista.

## Archivos modificados
| Archivo | Cambio |
|---|---|
| `outputs/sidebar/vista.js` | Reescritura de `renderVista` — render por ítem, acciones hover, edición inline |
| `outputs/sidebar.css` | Añadir `.vista-item`, `.vista-actions`, estado `.editing` |
| `outputs/sidebar.js` | Añadir `vistaOnMutate`, pasar `{ onMutate }` a `renderVista` |

No se toca `storage.js` — `Store.updateItem` y `Store.deleteItem` ya existen.

---

## 1. Cambio de estrategia de render

**Antes:** `renderVista` llama a `Store.buildMd(ctx)` → `renderMarkdown()` → vuelca HTML estático. No hay vínculo entre los elementos del DOM y los IDs de ítem.

**Después:** `renderVista` recorre `ctx.items` directamente y construye un `<div>` por ítem con `data-id="<item.id>"`. El HTML resultante es visualmente equivalente al del preview Markdown actual (mismas clases de `.md` para heading/paragraph), pero con estructura controlada.

### Estructura DOM de cada ítem

```html
<!-- Ítem tipo subtitle (category: "title") -->
<div class="vista-item vista-item-subtitle" data-id="item_xxx">
  <div class="vista-item-content">Texto del subtítulo</div>
  <div class="vista-actions">
    <button class="vista-btn-edit" title="Editar">✏</button>
    <button class="vista-btn-delete" title="Borrar">✕</button>
  </div>
</div>

<!-- Ítem tipo text -->
<div class="vista-item vista-item-text" data-id="item_yyy">
  <div class="vista-item-content">
    <span class="vista-emoji">🟡</span> Texto de la nota
  </div>
  <div class="vista-actions">
    <button class="vista-btn-edit" title="Editar">✏</button>
    <button class="vista-btn-delete" title="Borrar">✕</button>
  </div>
  <!-- Solo si item.source existe: -->
  <div class="vista-item-source">Fuente: ncbi.nlm.nih.gov</div>
</div>
```

El wrapper del Vista sigue teniendo `class="md"` para heredar los tokens de color y tipografía existentes.

---

## 2. Acciones en hover

Las acciones son visualmente invisibles en reposo y aparecen al pasar el cursor (CSS puro):

```css
.vista-actions {
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms;
}
.vista-item:hover .vista-actions,
.vista-item:focus-within .vista-actions {
  opacity: 1;
  pointer-events: auto;
}
```

`:focus-within` cubre el caso de navegación por teclado.

---

## 3. Flujo de edición inline

1. Usuario hace clic en ✏ (o un futuro atajo de teclado).
2. El elemento `.vista-item-content` se reemplaza por un `<textarea>` con el texto actual del ítem (`item.text`, sin emoji de categoría).
3. El `<textarea>` recibe foco automático y selecciona todo el texto.
4. El `.vista-item` recibe clase `editing`.
5. **Confirmar**: `Enter` sin `Shift` → o `blur` → llama a `Store.updateItem(ctxId, itemId, { text })` y luego `onMutate()`.
6. **Cancelar**: `Esc` → restaura el DOM original sin escribir en storage.
7. Mientras se edita, las acciones (✏ / ✕) se ocultan (`.editing .vista-actions { opacity: 0; pointer-events: none; }`).

> **Nota sobre subtítulos**: el campo editable es solo el texto (`item.text`). El `type` y `category` del ítem no se modifican desde la Vista.

---

## 4. Flujo de borrado

1. Usuario hace clic en ✕.
2. Llamada inmediata a `Store.deleteItem(ctxId, itemId)`.
3. Si el ítem era un subtítulo, `deleteItem` ya desvincula los ítems de texto anidados (comportamiento existente en `storage.js`).
4. Se llama `onMutate()`.
5. No hay diálogo de confirmación (AC #3: "de inmediato").

---

## 5. Callback `onMutate`

`renderVista` recibe un tercer argumento `{ onMutate }`:

```js
// sidebar/vista.js — nueva firma
export function renderVista(mountEl, ctx, { onMutate } = {}) { ... }
```

`onMutate` es una función async definida en `sidebar.js`:

```js
// sidebar.js — nueva función
async function vistaOnMutate() {
  editor.invalidate(selectedId);
  await render();
}
```

Y la llamada se actualiza a:

```js
// sidebar.js — renderMain(), rama mode === "vista"
renderVista(bodyEl, ctx, { onMutate: vistaOnMutate });
```

Esto garantiza que después de cualquier mutación:
- El buffer del Editor para ese contexto queda invalidado.
- La Vista se re-renderiza con los datos frescos de storage.

---

## 6. CSS additions (sidebar.css)

Añadir al final de `sidebar.css`, bajo un comentario `/* Vista item actions */`:

```css
/* ---- Vista item actions ------------------------------------------------- */
.vista-item {
  position: relative;
  /* Visual spacing: match existing .md p / .md h2 margins */
}

.vista-item-subtitle {
  /* same treatment as .md h2 */
}

.vista-item-text {
  /* same treatment as .md p */
}

.vista-item-source {
  font-size: 0.78em;
  opacity: 0.6;
  font-style: italic;
  margin-top: 2px;
}

.vista-actions {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  gap: 4px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;
}

.vista-item:hover .vista-actions,
.vista-item:focus-within .vista-actions {
  opacity: 1;
  pointer-events: auto;
}

.vista-item.editing .vista-actions {
  opacity: 0 !important;
  pointer-events: none !important;
}

.vista-btn-edit,
.vista-btn-delete {
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: var(--surface-2, #f0f0f5);
  color: var(--text, #1a1a2e);
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.7;
}

.vista-btn-edit:hover { opacity: 1; }

.vista-btn-delete:hover {
  opacity: 1;
  background: #fde8e8;
  color: #c0392b;
}

.vista-item.editing textarea {
  width: 100%;
  box-sizing: border-box;
  font: inherit;
  padding: 4px 6px;
  border: 1px solid var(--accent, #5b57e8);
  border-radius: 4px;
  background: var(--surface, #fff);
  color: var(--text, #1a1a2e);
  resize: vertical;
  min-height: 2.4em;
}
```

Los tokens `--surface`, `--surface-2`, `--text`, `--accent` ya existen en `sidebar.css` (modo claro y oscuro).

---

## 7. Criterios de aceptación y cómo verificarlos

| AC | Verificación |
|---|---|
| Hover muestra acciones | Abrir Vista en Chrome, pasar el cursor sobre cualquier ítem → deben aparecer ✏ y ✕ |
| Editar inline: Enter/blur confirma, Esc cancela | Editar un ítem, confirmar → ítem actualizado en Vista y en storage; editar y pulsar Esc → sin cambios |
| Borrar elimina de inmediato y persiste | Borrar ítem → desaparece de la Vista; recargar panel → sigue ausente |
| Buffer del editor invalidado | Editar/borrar en Vista; cambiar a Editor → el Markdown refleja el cambio (no el buffer viejo) |

---

## 8. Lo que NO cambia

- `storage.js` — ninguna modificación.
- `content.js` / `content.css` — ninguna modificación.
- El contrato `buildMd` / `parseMd` — sigue intacto (el Editor sigue usando `buildMd`).
- El tab Editor — sin cambios.
- El Export `.md` — sin cambios.
