# Research — subtitle_nest_select

**Fecha:** 2026-06-22

---

## Problema actual

`content.js` → `refreshNest()` (línea ~221):

```js
const subs = await Store.listSubtitles(selectedCtx.id);
if (subs.length) lastSubtitle = subs[subs.length - 1]; // solo el ÚLTIMO
```

El markup en `popupSkeleton()`:

```html
<div class="ch-nest" data-role="nest" hidden>
  <input type="checkbox" data-role="nest-toggle" id="ch-nest-cb" />
  <label for="ch-nest-cb">Anidar bajo <span class="sub-name" data-role="sub-name"></span></label>
</div>
```

Y en `doSave()`:

```js
const linkedSubtitleId =
  isText && els.nestToggle.checked && lastSubtitle
    ? lastSubtitle.id
    : null;
```

**Limitaciones:**
1. Solo muestra el último subtítulo; si el contexto tiene 3 subtítulos el usuario no puede elegir el primero o el segundo.
2. Interacción de dos pasos: ver qué subtítulo es → decidir si anidar → marcar el checkbox.
3. No hay forma de elegir "ninguno" de forma explícita (el checkbox desmarcado ya lo hace, pero es implícito).

---

## API de `storage.js` disponible

```js
// Devuelve todos los items de tipo "subtitle" del contexto, en orden de inserción.
Store.listSubtitles(contextId) → Promise<Item[]>
// Item: { id, type:"subtitle", text, ... }
```

No se necesita ningún cambio en `storage.js`.

---

## Diseño propuesto: `<select>` nativo

### Markup nuevo (reemplaza el bloque `.ch-nest`)

```html
<div class="ch-nest" data-role="nest" hidden>
  <label class="ch-nest-label" for="ch-nest-sel">Anidar bajo</label>
  <select class="ch-nest-sel" data-role="nest-select" id="ch-nest-sel">
    <!-- poblado dinámicamente -->
  </select>
</div>
```

### Opciones del select

| value | texto visible |
|---|---|
| `""` (empty string) | — Sin subtítulo — |
| `item.id` | `item.text` (truncado a 40 car. si es necesario) |

### Lógica en `refreshNest()`

```js
async function refreshNest() {
  const isText = Store.typeForCategory(category) === "text";
  if (!isText || !selectedCtx) {
    els.nest.hidden = true;
    return;
  }
  const subs = await Store.listSubtitles(selectedCtx.id);
  if (!subs.length) {
    els.nest.hidden = true;
    return;
  }
  // Repoblar el select
  els.nestSelect.innerHTML =
    '<option value="">— Sin subtítulo —</option>' +
    subs.map(s =>
      `<option value="${s.id}">${s.text.slice(0, 40)}</option>`
    ).join('');
  // Pre-seleccionar el último (comportamiento anterior)
  els.nestSelect.value = subs[subs.length - 1].id;
  els.nest.hidden = false;
}
```

### Lógica en `doSave()`

```js
const linkedSubtitleId =
  isText && els.nestSelect && els.nestSelect.value
    ? els.nestSelect.value
    : null;
```

---

## Archivos afectados

| Archivo | Cambio |
|---|---|
| `outputs/content.js` | `popupSkeleton()`: checkbox → select. `openPopup()`: `nestToggle` → `nestSelect`. `refreshNest()`: nueva lógica. `doSave()`: leer `.value` del select. |
| `outputs/content.css` | Eliminar estilos del checkbox (`.ch-nest input`). Agregar estilos para `.ch-nest-sel` y `.ch-nest-label`. |

---

## Consideraciones de estilo

El `<select>` nativo se puede estilizar con `appearance: none` + custom arrow (SVG inline en `background-image`) o simplemente con `appearance: auto` y `accent-color`. Para mantener la coherencia del popup sin añadir complejidad, se usará:

```css
.ch-nest-sel {
  flex: 1;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--fg);
  cursor: pointer;
  accent-color: var(--accent);
}
```

El `all: revert` de `.ch-root` ya resetea el select; el estilo anterior alcanza para darle la apariencia correcta.

---

## Sin cambios en `storage.js` ni en el sidebar

`linkedSubtitleId` sigue siendo un `string | null`; el modelo de datos no cambia.
