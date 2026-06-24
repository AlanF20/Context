# Research — sidebar_header_dedup

## Problema

El panel lateral del side panel de Chrome muestra dos cabeceras:

1. **Cabecera nativa de Chrome** — barra superior con el icono de extensión, el nombre
   "Context Highlighter", y los botones de anclar/cerrar. La genera Chrome automáticamente
   para todo side panel MV3; no se puede quitar ni personalizar.

2. **`.chrome-bar` propio** — `<div class="chrome-bar">` en `sidebar.html` que contiene:
   - Logo cuadrado "C" (`.logo`, background acento #5b57e8)
   - Título "Context Highlighter" (`.chrome-bar .title`)
   - Botón toggle de tema `#theme-toggle` (`.icon-btn`)

El resultado visible (ver captura) es que el nombre de la extensión aparece dos veces,
lo que consume espacio vertical innecesario y crea confusión visual.

## Causa raíz

El `.chrome-bar` fue diseñado en una etapa del proyecto en que el panel podía no tener
cabecera nativa visible, o como guía de estudio. Con el uso real del side panel (que
siempre muestra su propia barra de título), la barra propia se volvió superflua.

## Archivos implicados

| Archivo | Cambio |
|---|---|
| `outputs/sidebar.html` | Eliminar `<div class="chrome-bar">…</div>` |
| `outputs/sidebar.css` | Eliminar reglas `.chrome-bar`, `.logo`, `.chrome-bar .title` |
| `outputs/sidebar.html` | Mover `<button id="theme-toggle">` al interior de `<nav class="rail">` |
| `outputs/sidebar.css` | Añadir `margin-top: auto` al `#theme-toggle` dentro del rail |

El JS (`sidebar.js`, `sidebar/theme.js`) no requiere cambios: `initTheme` recibe el
elemento `#theme-toggle` por ID; la ubicación en el DOM no importa.

## Opciones consideradas

### Opción A — Eliminar `.chrome-bar` y mover el toggle al rail ✅ (elegida)

- La cabecera nativa de Chrome queda como única barra superior.
- El toggle de tema migra al final del rail vertical (empujado con `margin-top: auto`).
- Se gana ~38 px de altura vertical en el panel.
- El toggle está siempre accesible desde el rail, independientemente de qué contexto esté seleccionado.

### Opción B — Dejar `.chrome-bar` como toolbar mínima (solo toggle, sin logo/título)

- Reduce el duplicado de nombre pero deja una barra extra visible.
- Consume ~32 px adicionales sin aportar información nueva.
- Rechazada: innecesariamente compleja.

## Riesgos

- Ninguno en el flujo de datos: el toggle de tema usa solo `localStorage` y `data-theme`.
- CSS: verificar que `.icon-btn` no esté referenciado con selector de contexto
  `.chrome-bar .icon-btn`; actualmente es selector plano `.icon-btn`, sin conflicto.
- Espaciado del rail: el rail usa `gap: 9px` y `padding: 11px 0`. El toggle con
  `margin-top: auto` se pegará al fondo correctamente en un flex-column.
