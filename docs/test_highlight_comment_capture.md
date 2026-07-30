# Test plan: Comentario del usuario al capturar un resaltado (feature 31)

## Alcance

Cubre `specs/031-spec-highlight_comment_capture.json`: campo `comment` opcional
en items `type:'text'`, su serialización/parseo como blockquote Markdown
(`buildMd`/`parseMd`), su render en la Vista (sin CSS/renderer nuevo — ver
research), su inclusión en el export Anki, y el link post-fast-save
"+ agregar comentario" en el toast de `content.js`.

Por convención del proyecto: `storage.js` (lógica pura `buildMd`/`parseMd`, y
funciones que sí llaman a `chrome.storage.local` vía un mock hand-rolled) y
`sidebar/export-formats.js` se cubren con Vitest.

**Corrección post-QA (2026-07-30, requisito explícito del usuario):** todo
cambio que toca el DOM ahora lleva un spec E2E, no solo verificación manual —
ver `CLAUDE.md` § Testing. `tests/e2e/031-comment-capture.spec.js` cubre el
popup completo, el toast de fast-save con/sin el link de comentario, y el fix
de reposicionamiento en `resize`. Este spec fue el que detectó el bug real:
`content.js` depende de `content-storage.js`, una copia manual de
`storage.js` que no se había resincronizado — el comentario se descartaba en
silencio antes de llegar a storage, y los 57 tests de Vitest seguían en verde
porque importan `storage.js` directo, nunca la copia. Los casos manuales de
abajo siguen siendo la verificación humana complementaria, ya no la única.

## Cobertura automatizada (Vitest)

### `tests/031-storage-comment.test.js` — `buildMd`/`parseMd` (lógica pura)

- **[Vitest]** `buildMd`: un item `type:'text'` con `comment` no nulo agrega
  una línea `> {comment}` inmediatamente después de la línea de texto del
  item (con o sin prefijo de emoji), sin línea en blanco intermedia.
- **[Vitest]** `buildMd`: un `comment` multi-línea (contiene `\n`) se serializa
  como una línea `> ` por cada línea del comentario.
- **[Vitest]** `buildMd`: un item sin `comment` (`null`/`undefined`) no agrega
  ninguna línea nueva — output idéntico al comportamiento pre-feature 31.
- **[Vitest]** `parseMd`: una línea `>` inmediatamente después (sin línea en
  blanco) de la línea de un item `type:'text'` recién parseado se adjunta como
  `comment` de ESE item, no crea un item nuevo.
- **[Vitest]** `parseMd`: varias líneas `>` consecutivas se unen con `\n` en
  un único `comment` (continuación multi-línea).
- **[Vitest]** `parseMd` — fallback legado: un bloque de líneas `>` al inicio
  del documento, o inmediatamente después de un subtítulo/línea en blanco (sin
  item `text` inmediatamente anterior), sigue creando un item `text` nuevo a
  partir del contenido del blockquote (comportamiento preexistente, incluida
  la extracción de emoji de categoría en la primera línea) — sin regresión.
- **[Vitest]** Round-trip: `parseMd(buildMd(ctx))` reproduce el mismo
  `comment` para cada item de texto que lo tenía, y `null`/ausente para los
  que no.
- **[Vitest]** Round-trip no-regresivo: un contexto fixture con items
  multi-línea capturados como lista (`"- item1\n- item2"`, sin prefijo `>`,
  patrón de la feature 019) sigue parseando igual — el nuevo camino de
  adyacencia no interfiere porque esas líneas nunca empiezan con `>`.

### `tests/031-storage-comment.test.js` — `addItem`/`updateItem` (mock de `chrome.storage.local`)

Usa un mock hand-rolled en memoria de `chrome.storage.local` (primer caso del
proyecto que ejercita este camino directamente, ya anticipado en
[[project_testing_strategy]] como "reservado para código que sí llama a
chrome.storage").

- **[Vitest]** `addItem(..., { comment: "  nota  " })` en un item de categoría
  `idea` guarda `comment: "nota"` (recortado).
- **[Vitest]** `addItem(...)` sin `opts.comment` guarda `comment: null`.
- **[Vitest]** `addItem(..., { category: 'title', comment: "x" })` guarda
  `comment: null` siempre (los subtítulos nunca llevan comentario, sin
  importar qué se pase en `opts`).
- **[Vitest]** `updateItem(ctxId, textItemId, { comment: "editado" })` actualiza
  el campo en un item `type:'text'` existente.
- **[Vitest]** `updateItem(ctxId, subtitleItemId, { comment: "x" })` en un item
  `type:'subtitle'` NO setea `comment` (queda `null`/sin cambios).
- **[Vitest]** `updateItem(..., { comment: "" })` guarda `null` (cadena vacía
  se normaliza a ausencia de comentario, igual que el resto de campos texto).

### `tests/031-export-formats-comment.test.js` — Anki (lógica pura)

Archivo nuevo (no se modifica `028-export-formats.test.js`, que pertenece a la
feature 28), siguiendo la convención de un archivo por módulo prefijado con el
id de la feature que lo origina.

- **[Vitest]** Un item de texto con `comment` produce un `back` con el
  segmento `Comentario: {comment}` insertado entre el texto y la `Fuente:`
  (orden: texto — comentario — fuente).
- **[Vitest]** Un item sin `comment` produce el mismo `back` que antes de esta
  feature (sin regresión).
- **[Vitest]** Un `comment` con tabs/saltos de línea se recorta igual que los
  demás campos vía `escapeTsvField` (no rompe las 3 columnas del TSV).

## Verificación manual (Chrome, `dist/`) — `content.js`, fuera de alcance de Vitest/Playwright

Precondición: `pnpm run build` completado, extensión cargada sin empaquetar
desde `vite-extension/dist/`.

### TC-01 — Input de comentario visible solo para categorías de texto [cubierto por E2E]
1. Seleccionar texto en cualquier página, abrir el popup completo (botón "⋯").
2. Con categoría "Idea"/"Argumento"/"Evidencia" seleccionada, verificar que
   aparece el input "Comentario (opcional)".
3. Cambiar el select de categoría a "Título".
**Esperado:** el input de comentario se oculta al pasar a "Título" y reaparece
al volver a una categoría de texto (mismo patrón que el bloque "Anidar bajo").

### TC-02 — Guardar sin comentario (sin regresión)
1. En el popup completo, dejar el input de comentario vacío y guardar.
**Esperado:** funciona exactamente igual que antes de esta feature — el item
se guarda sin comentario.

### TC-03 — Guardar con comentario y verlo en la Vista [cubierto por E2E]
1. En el popup completo, escribir un comentario y guardar.
2. Abrir el side panel, ir a la Vista del contexto.
**Esperado:** debajo del párrafo con borde de categoría (feature 020) aparece
el comentario como una cita (`<blockquote>`) con el estilo neutro ya existente
(`.md blockquote`, sidebar.css:319-324) — sin bordes ni colores de categoría
compitiendo con el párrafo padre.

### TC-04 — Export Markdown incluye el comentario
1. Con al menos un item comentado, exportar el contexto como `.md`.
**Esperado:** el archivo contiene la línea `> {comentario}` inmediatamente
bajo la línea del item.

### TC-05 — Export Anki incluye el comentario
1. Exportar el mismo contexto como "Tarjetas Anki (.txt)".
**Esperado:** la columna `Back` de la fila correspondiente incluye el segmento
`Comentario: {comentario}`.

### TC-06 — Fast-save (un clic en swatch) muestra el link solo para texto [cubierto por E2E]
1. Resaltar texto en una página donde ya exista un contexto detectado
   (`contextForThisPage`), de forma que la toolbar muestre los swatches con
   punto de contexto activo.
2. Clic directo en el swatch "Idea" (o Argumento/Evidencia).
**Esperado:** aparece el toast "✓ Guardado" con un link secundario
"+ agregar comentario" junto a él.
3. Repetir el paso 2 pero con el swatch "Título".
**Esperado:** el toast "✓ Guardado" aparece SIN el link (los subtítulos nunca
llevan comentario).

### TC-07 — Mini-formulario del toast: guardar comentario [ruta Enter cubierta por E2E; ruta clic en "Guardar" queda manual]
1. Tras un fast-save de categoría de texto (TC-06), clic en
   "+ agregar comentario".
**Esperado:** el toast se transforma in-place en un input + botón "Guardar",
sin cerrarse ni reposicionarse.
2. Escribir un comentario y presionar Enter (o clic en "Guardar").
**Esperado:** el toast desaparece; al abrir la Vista del contexto, el item
recién guardado muestra el comentario como blockquote (mismo render que TC-03).

### TC-08 — Mini-formulario del toast: cancelar sin guardar
1. Repetir TC-07 hasta expandir el mini-formulario, escribir texto.
2. Presionar Escape (o hacer clic fuera del toast) sin guardar.
**Esperado:** el toast desaparece sin persistir ningún comentario — el item
queda con `comment: null`.

### TC-09 — El toast/mini-formulario no desaparecen solos mientras están abiertos
1. Tras un fast-save de categoría de texto, esperar varios segundos SIN hacer
   clic en "+ agregar comentario".
**Esperado:** el toast permanece visible indefinidamente (sin temporizador de
auto-cierre) hasta que el usuario haga clic fuera, presione Escape, haga
scroll, o inicie una nueva selección.
2. Repetir, pero esta vez hacer clic en "+ agregar comentario" para expandir
   el mini-formulario, y esperar varios segundos escribiendo con pausas.
**Esperado:** el mini-formulario tampoco desaparece solo — corrección post-QA
(2026-07-30): una ventana fija de ~1.8s resultó insuficiente en la práctica,
así que ahora no hay temporizador en absoluto mientras el link/mini-formulario
está disponible.

### TC-10 — El toast de un guardado de categoría "Título" sigue desapareciendo rápido
1. Fast-save con el swatch "Título" (sin link de comentario, ver TC-06).
**Esperado:** el toast "✓ Guardado" simple desaparece solo a los ~450ms, igual
que antes de esta feature (sin cambios — solo el toast CON link deja de tener
temporizador).

### TC-11 — Edición posterior vía Editor Monaco
1. Con un item ya comentado, abrir el side panel → tab Editor (Monaco).
2. Editar manualmente la línea `> {comentario}` en el Markdown crudo y guardar
   (Cmd+S).
3. Volver a la Vista.
**Esperado:** el comentario editado se refleja en el blockquote de la Vista
(confirma que `replaceContextFromMarkdown` copia `comment` al reconstruir
items — AC-10).
**Nota:** el modo `vista-edit` (textarea inline) mencionado en AC-10 como vía
alternativa de edición **no tiene punto de entrada en la UI actual** — hallazgo
ya registrado en `docs/test_editor_stale_buffer_cross_page.md` (feature 30),
no es una regresión de esta feature. Solo el Editor Monaco es verificable hoy.

### TC-12 — Sin regresión en items existentes sin comentario
1. Abrir un contexto con items creados antes de esta feature (sin campo
   `comment`).
**Esperado:** la Vista, el export `.md` y el export Anki los renderizan
exactamente igual que antes — ningún blockquote/segmento vacío aparece.

### TC-13 — El toast/popup no queda fuera de vista al abrir el side panel [corrección post-QA; reubicación en resize cubierta por E2E, apertura real del side panel queda manual]
1. Resaltar texto cerca del borde derecho de la ventana del navegador, en una
   página donde el side panel de Chrome esté cerrado.
2. Hacer un fast-save (clic en un swatch) — esto dispara la apertura del side
   panel (`CH_OPEN_PANEL_CTX`), que reduce el ancho visible de la página.
**Esperado:** el toast "✓ Guardado" (con o sin link, según la categoría) se
reposiciona automáticamente para seguir visible dentro del nuevo viewport más
angosto — ya NO desaparece/queda oculto detrás o más allá del side panel.
3. Repetir con el popup completo abierto ("⋯") en vez del fast-save, cambiando
   el ancho de la ventana del navegador (o abriendo/cerrando el side panel) a
   mitad de la interacción.
**Esperado:** el popup completo también se reubica dentro del viewport vigente
(mismo mecanismo, `reclampToViewport()` en el listener `resize`).

### TC-14 — `pnpm run build`
Correr `cd vite-extension && pnpm run build`.
**Esperado:** sin errores de compilación.

### TC-15 — `pnpm run test` (Vitest)
Correr `cd vite-extension && pnpm run test`.
**Esperado:** todos los tests nuevos (`031-storage-comment.test.js`,
`031-export-formats-comment.test.js`) y los preexistentes pasan.

### TC-16 — `init.sh`
Correr `./init.sh` desde la raíz.
**Esperado:** todos los checks `[OK]`.
