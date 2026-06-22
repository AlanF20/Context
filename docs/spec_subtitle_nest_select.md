# Spec — subtitle_nest_select

**Feature ID:** 7  
**Fecha:** 2026-06-22  
**Estado:** pendiente aprobación

---

## Objetivo

Reemplazar el checkbox "Anidar bajo [último subtítulo]" del popup de captura
por un `<select>` que lista **todos** los subtítulos del contexto elegido,
permitiendo al usuario elegir explícitamente bajo cuál anidar la nota (o
ninguno).

---

## Comportamiento esperado

### Cuándo mostrar la fila de anidación

| Condición | Fila `.ch-nest` |
|---|---|
| `category === "title"` (type subtitle) | oculta |
| Ningún contexto seleccionado | oculta |
| Contexto sin subtítulos | oculta |
| Contexto con ≥ 1 subtítulo y `category !== "title"` | **visible** |

### Contenido del `<select>`

1. Primera opción: `value=""` → texto `— Sin subtítulo —` (pre-seleccionada cuando el contexto no tiene subtítulos previos; de otro modo se pre-selecciona el último).
2. Opciones siguientes: una por cada item de tipo `subtitle` del contexto, en orden de inserción. `value = item.id`, texto = `item.text` (truncado a 40 caracteres con `…` si supera ese límite).

El select se **repuebla** cada vez que:
- El usuario cambia de contexto (evento `input` / selección en el combobox).
- El usuario cambia la categoría (click en swatch).

### Pre-selección al abrir

Si el contexto tiene subtítulos, se pre-selecciona el **último** (mismo
comportamiento que el checkbox anterior, ahora explícito en el select).

### Al guardar

```
linkedSubtitleId = (category es text) && (nestSelect.value !== "")
                   ? nestSelect.value
                   : null
```

---

## Cambios de código

### `outputs/content.js`

#### 1. `popupSkeleton()` — reemplazar bloque `.ch-nest`

**Antes:**
```html
<div class="ch-nest" data-role="nest" hidden>
  <input type="checkbox" data-role="nest-toggle" id="ch-nest-cb" />
  <label for="ch-nest-cb">Anidar bajo <span class="sub-name" data-role="sub-name"></span></label>
</div>
```

**Después:**
```html
<div class="ch-nest" data-role="nest" hidden>
  <label class="ch-nest-label" for="ch-nest-sel">Anidar bajo</label>
  <select class="ch-nest-sel" data-role="nest-select" id="ch-nest-sel"></select>
</div>
```

#### 2. `openPopup()` — referencias a elementos

Quitar:
```js
nestToggle: popEl.querySelector('[data-role="nest-toggle"]'),
subName:    popEl.querySelector('[data-role="sub-name"]'),
```

Añadir:
```js
nestSelect: popEl.querySelector('[data-role="nest-select"]'),
```

#### 3. `refreshNest()` — lógica completa

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
  els.nestSelect.innerHTML =
    '<option value="">— Sin subtítulo —</option>' +
    subs.map(s => {
      const label = s.text.length > 40 ? s.text.slice(0, 40) + '…' : s.text;
      return `<option value="${s.id}">${label}</option>`;
    }).join('');
  // Pre-select the last subtitle (most recent)
  els.nestSelect.value = subs[subs.length - 1].id;
  els.nest.hidden = false;
}
```

#### 4. `doSave()` — leer el select

**Antes:**
```js
const linkedSubtitleId =
  isText && els.nestToggle.checked && lastSubtitle
    ? lastSubtitle.id
    : null;
```

**Después:**
```js
const linkedSubtitleId =
  isText && els.nestSelect && els.nestSelect.value
    ? els.nestSelect.value
    : null;
```

También eliminar la variable `lastSubtitle` (ya no se necesita).

---

### `outputs/content.css`

#### Quitar (en la sección "Nest row")

```css
.ch-nest input { margin: 0; accent-color: var(--accent); }
.ch-nest .sub-name { font-weight: 600; color: var(--fg); }
```

#### Añadir

```css
.ch-nest-label { white-space: nowrap; }
.ch-nest-sel {
  flex: 1;
  min-width: 0;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
  font-family: var(--ui);
  color: var(--fg);
  cursor: pointer;
  accent-color: var(--accent);
}
.ch-nest-sel:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
```

---

## Criterios de aceptación (checklist)

- [ ] Contexto con 2+ subtítulos → select muestra "— Sin subtítulo —" + todos los subtítulos; el último está pre-seleccionado.
- [ ] Seleccionar una opción distinta → al guardar, `linkedSubtitleId` es el `id` de esa opción.
- [ ] Seleccionar "— Sin subtítulo —" → `linkedSubtitleId === null` al guardar.
- [ ] Cambiar a categoría "Título" → fila oculta.
- [ ] Cambiar a contexto sin subtítulos → fila oculta.
- [ ] Cambiar de contexto → select se repuebla con los subtítulos del nuevo contexto.
- [ ] `init.sh` pasa sin errores.

---

## Lo que NO cambia

- `storage.js` — sin modificaciones.
- El sidebar (`sidebar/`, `sidebar.js`, `sidebar.css`) — sin modificaciones.
- El modelo de datos en `chrome.storage.local` — sin modificaciones.
- `manifest.json`, `background.js` — sin modificaciones.
