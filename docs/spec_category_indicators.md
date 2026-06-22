# Spec: category_indicators (Feature #5)

## Objetivo
Reemplazar los indicadores de categoría actuales (emojis 🟡🔵🟢 en la Vista y cuadraditos de 12 px en el popup) por **badges semánticos** de texto + color, siguiendo el patrón de Notion/Linear: color + etiqueta siempre juntos para no depender de memoria de color.

## Análisis de referentes
| Plataforma | Approach | Resultado |
|---|---|---|
| Notion | Pill tintada: fondo suave + punto + texto | ✓ Legible sin memoria de color |
| Linear | Chip con borde de color + dot + texto | ✓ Compacto, funciona en oscuro |
| Readwise | Solo círculos de color, sin texto | △ Requiere memorización |
| Kindle | Solo background en el texto, sin indicador en lista | ✗ No visible en el preview |
| Matter | Barra lateral de color, sin texto | △ Mejor que emoji, sin contexto |

**Patrón ganador:** badge compacto con fondo tintado + etiqueta en mayúsculas mono. El texto hace que sea legible sin recordar el código de color.

## Archivos modificados
| Archivo | Cambio |
|---|---|
| `outputs/sidebar/vista.js` | Reescritura: render por ítem (no Markdown). Cada `type:text` genera `.vista-cat-badge.badge-{category}` en la fila meta. También incluye acciones editar/borrar (spec_vista_item_actions, prerequisito del badge). |
| `outputs/sidebar.css` | Añadir al final: `.vista-list`, `.vista-item`, `.vista-item-meta`, `.vista-cat-badge` con 4 variantes + overrides dark. `.vista-item-source::before` para punto de dominio. Acciones hover. |
| `outputs/content.css` | `.ch-cat .sw`: cuadrado 12 px → círculo 8 px. `.ch-cat.on`: reemplazar ring `box-shadow` por fondo tintado `--cat-bg` + `border-color: --cat`. Añadir `transition`. |
| `outputs/content.js` | Añadir `setProperty("--cat-bg", meta.hlBg)` y `setProperty("--cat-fg", meta.hlFg)` en la construcción del botón de categoría. |
| `outputs/sidebar.js` | Nueva función `vistaOnMutate()`. Actualizar llamada a `renderVista(bodyEl, ctx, { onMutate: vistaOnMutate })`. |

No se toca `storage.js` — los colores `hlBg`/`hlFg` ya existen en `CATEGORIES`.

---

## 1. Indicador en la Vista (cambio principal)

**Antes:** `renderVista` llama a `Store.buildMd(ctx)` → `renderMarkdown()` → HTML estático con emojis 🟡/🔵/🟢 dentro del texto.

**Después:** `renderVista` itera `ctx.items` directamente, construyendo un `<div>` por ítem.

### Estructura DOM por ítem

```html
<!-- Ítem tipo subtitle -->
<div class="vista-item vista-item-subtitle" data-id="item_xxx">
  <div class="vista-item-content">Texto del subtítulo</div>
  <div class="vista-actions">…</div>
</div>

<!-- Ítem tipo text -->
<div class="vista-item vista-item-text" data-id="item_yyy">
  <div class="vista-item-content">Texto de la nota</div>
  <div class="vista-item-meta">
    <span class="vista-cat-badge badge-idea">Idea</span>
    <span class="vista-item-source" style="--dot-color:#4a7fd0">ncbi.nlm.nih.gov</span>
  </div>
  <div class="vista-actions">…</div>
</div>
```

El emoji desaparece del texto. El indicador sale del contenido y se ubica en la capa de metadatos, junto al dominio fuente.

---

## 2. Badge — colores (light y dark)

| Categoría | `badge-*` | Fondo (light) | Texto (light) | Fondo (dark) | Texto (dark) |
|---|---|---|---|---|---|
| title | `badge-title` | `#fde8ec` | `#8a1530` | `#3a1218` | `#f6b8c4` |
| idea | `badge-idea` | `#fff5d9` | `#7a4800` | `#2d2008` | `#f5d78e` |
| argument | `badge-argument` | `#ddeeff` | `#1a3d7a` | `#0e1f3d` | `#93bef5` |
| evidence | `badge-evidence` | `#d4f5e0` | `#175c2e` | `#0c2b1a` | `#7fce9e` |

Los colores `hlBg`/`hlFg` de `CATEGORIES` en `storage.js` coinciden con el caso light — por eso se reusan para `--cat-bg`/`--cat-fg` en el popup sin tocar `storage.js`.

---

## 3. Selector de categoría en el popup

**Antes:** estado activo = `box-shadow: 0 0 0 2px --bg, 0 0 0 3px --cat` (ring exterior). `.sw` = cuadrado 12×12 px, `border-radius: 4px`.

**Después:**
```css
.ch-cat .sw  { width: 8px; height: 8px; border-radius: 50%; }
.ch-cat.on   {
  background: var(--cat-bg, var(--accent-soft));
  border-color: var(--cat, var(--accent));
  color: var(--cat-fg, var(--fg));
}
```
El estado activo rellena el botón con el tinte de la categoría — igual al patrón Notion. El cuadradito se convierte en círculo (más refinado, consistente con el dot del rail y el header).

---

## 4. Prerequisito: render por ítem (vista_item_actions)

Para mostrar el badge es necesario iterar `ctx.items` en lugar de volcar el Markdown renderizado. Esto implementa de facto el render por ítem del spec_vista_item_actions (Feature #1), incluyendo las acciones editar/borrar inline. Ver `spec_vista_item_actions.md` para la descripción completa de ese comportamiento.

---

## 5. Lo que NO cambia

- `storage.js` — sin modificaciones.
- El contrato `buildMd`/`parseMd` — intacto. El Editor sigue usando los emojis en Markdown; la Vista los ignora al renderizar item-by-item.
- `manifest.json`, `background.js`, librerías vendored.

---

## 6. Criterios de aceptación

| AC | Verificación |
|---|---|
| Badge visible en Vista | Abrir Vista en Chrome → cada nota de tipo `text` muestra un badge `[Idea]`/`[Argumento]`/`[Evidencia]` en la fila de metadatos |
| Sin emojis en Vista | Ningún ítem muestra 🟡, 🔵 ni 🟢 en la Vista (sí aparecen si cambias al Editor) |
| Selector del popup: estado activo con fondo tintado | Abrir popup de captura, seleccionar una categoría → el botón activo tiene fondo tintado del color de la categoría, no un ring |
| `.sw` es círculo | El indicador de color en el botón de categoría del popup es un círculo, no un cuadrado |
| Dark mode | Badges legibles en `:root[data-theme="dark"]` con sus overrides correspondientes |
| Editar/borrar inline | Al pasar el cursor sobre un ítem en Vista aparecen botones ✏ y ✕; funcionan correctamente (ver spec_vista_item_actions) |
| `init.sh` pasa | No regresiones de sintaxis en ningún archivo |
