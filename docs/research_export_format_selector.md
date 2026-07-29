# Research — export_format_selector (feature 28)

## 1. Estado actual del export

- Único botón de descarga: `mdBtn` en `vite-extension/src/sidebar.js:258-266`, dentro de `renderHeader()` (row1). Ícono `Download` de `lucide` + un glifo SVG "MD" (`makeMdMark()`, sidebar.js:474-496).
- Handler: `downloadMd(ctx)` (sidebar.js:498-513). Resuelve el Markdown a descargar según el modo activo (`vista-edit` → valor vivo del textarea; `editor` → `editor.peek(ctx.id)`; si no, `Store.buildMd(ctx)`), arma un `Blob`, crea un `<a download>` temporal, dispara `click()` y revoca el object URL con `setTimeout`.
- `sanitizeFilename(name)` (sidebar.js:515-523) ya sanitiza el nombre de archivo — reutilizable para cualquier formato nuevo.
- No existe ningún componente de menú/dropdown en `sidebar/*.js` hoy. El único patrón de "combobox" del proyecto vive en `content.js` (selector de contexto al capturar) y es un componente distinto, no reutilizable directamente por estar en el content script.

## 2. Modelo de datos relevante (sin cambios necesarios)

`storage.js` ya expone todo lo necesario para generar tarjetas Anki sin tocar el modelo:

- `CATEGORIES` (storage.js:53-90): labels ya en español — `Título`, `Idea`, `Argumento`, `Evidencia` — más `dot`/`hlBg`/`hlFg` por si el formato quisiera colorear algo (no aplica a texto plano TSV).
- Cada item (`addItem`, storage.js:208-226) trae `category`, `type`, `text`, `linkedSubtitleId`, `source`, `sourceUrl`, `createdAt`. `linkedSubtitleId` permite reconstruir el subtítulo padre de cualquier item `text` recorriendo `ctx.items`.
- `ctx.items` es un array plano y secuencial (confirmado, sin agrupación por fuente) — para el generador de tarjetas basta un recorrido lineal llevando un puntero al último `subtitle` visto (mismo patrón que ya usa `buildMd` en storage.js para asociar `_Fuente:_` al último item de texto).

## 3. Formato Anki (texto plano, sin dependencias nuevas)

Anki soporta importación de texto plano separado por tabulador con líneas de metadatos que empiezan con `#`:

```
#separator:tab
#html:false
#tags column:3
Front	Back	tags
```

- `#tags column:N` es opcional pero recomendado — permite filtrar el mazo importado por categoría/fuente/contexto sin tocar Anki más allá del import.
- Caracteres a escapar dentro de un campo: tabulador (no debería aparecer en texto capturado, pero hay que reemplazar `\t`→espacio por seguridad) y salto de línea literal dentro de un campo TSV de una sola línea (reemplazar `\n` por `<br>` si `#html:true`, o por " / " si `#html:false`). Se recomienda `#html:false` para mantener el export como texto plano simple, consistente con el resto del proyecto (nada de HTML inyectado).

## 4. Diseño de contenido de tarjeta (según respuestas del usuario)

Confirmado en la ronda de clarificación:

- **Items `text`** (idea/argumento/evidencia):
  - Front: `¿Qué {CATEGORIES[cat].label} se capturó sobre "{subtítulo padre}"?` — si no hay `linkedSubtitleId` resuelto, usar el nombre del contexto (`ctx.name`) en su lugar: `¿Qué {label} se capturó en {ctx.name}?`.
  - Back: `{item.text}` + si `item.source` existe, una línea adicional `Fuente: {item.source}` (mismo formato que `_Fuente: X_` de `buildMd`, sin el subrayado Markdown).
  - Tags: `{category} {source-hostname-sin-punto} {nombre-contexto-slug}` (espacios en vez de puntos/espacios raros, mismo saneo que `sanitizeFilename`).
- **Items `subtitle`** (title) — el usuario pidió que SÍ generen tarjeta de resumen:
  - Front: `¿De qué trata la sección "{item.text}"?`
  - Back: lista de los items `text` anidados bajo ese subtítulo (mismo recorrido que ya usa `buildMd`/`addItem` para encontrar el rango de hijos), cada uno prefijado por su `label` de categoría, unidos por " / " (o salto real si `#html:true`, pero se decidió `#html:false`).
  - Si un subtítulo no tiene hijos, se omite (no genera tarjeta vacía).
- Ningún item queda excluido salvo subtítulos sin hijos.

## 5. Arquitectura propuesta (extensible a futuros formatos)

Para evitar rediseñar la UI cuando se agregue autenticación y nuevos formatos de descarga, conviene modelar los formatos como un **registro** en vez de una función ad-hoc por botón:

```js
// sidebar/export-formats.js (nuevo módulo)
export const EXPORT_FORMATS = [
  { id: "markdown", label: "Markdown (.md)", extension: "md",  mime: "text/markdown", build: buildMarkdownExport },
  { id: "anki",     label: "Tarjetas Anki (.txt)", extension: "anki.txt", mime: "text/plain", build: buildAnkiExport },
];
```

- `sidebar.js` reemplaza `mdBtn`/`downloadMd` por un botón "Exportar ▾" que abre un menú simple (lista de `EXPORT_FORMATS`, cada uno un `<button>`), reutilizando `sanitizeFilename` para el nombre y variando solo extensión/mime/contenido.
- Nuevo módulo pequeño: `sidebar/export-menu.js` con un componente de menú flotante mínimo (mismo espíritu que `sidebar/modal.js`: una función que monta/desmonta un elemento posicionado, sin dependencias nuevas). No hay ningún dropdown reusable hoy, así que este es un componente nuevo pero acotado.
- Añadir un formato futuro (p. ej. ligado a auth con Google) será agregar una entrada al array `EXPORT_FORMATS`, no tocar la UI del menú.
- Por decisión explícita del usuario, esta iteración **no recuerda** la última selección (siempre se muestra el menú); por lo tanto no hace falta persistir preferencia en `localStorage` ni en `chrome.storage`.
- **Asunción** (no se preguntó explícitamente): no se reserva ya un tercer formato concreto (p. ej. JSON crudo) — el registro queda genéricamente extensible en código, pero esta feature solo entrega Markdown + Anki. Si el usuario quiere adelantar un tercer formato, es una adición trivial al mismo array antes de cerrar la spec.

## 6. Restricciones del proyecto a respetar (CLAUDE.md)

- Separar HTML/CSS/JS: el menú de exportación necesita marcado propio en `sidebar.html` (o generado por JS, consistente con cómo `renderHeader` ya construye DOM con `document.createElement`) + estilos en `sidebar.css` (sin `style="..."` inline) + lógica en un módulo ES nuevo.
- Reutilizar iconos ya instalados de `lucide` (`Download` ya importado; `lucide` incluye `ChevronDown`/`FileText`/`Layers` u otros si se quiere diferenciar visualmente Markdown vs Anki en el menú — a decidir en la spec, no aquí).
- No tocar `outputs/` (legado congelado); todo el trabajo va en `vite-extension/src/`.
- Mantener `buildMd`/`parseMd` intactos — el nuevo generador Anki es una función paralela de solo lectura sobre `ctx.items`, no debe alterar el contrato Markdown existente.
