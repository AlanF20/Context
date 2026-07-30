# Research — highlight_comment_capture (feature 31)

## Respuestas del usuario (Interviewer)

1. **Ubicación del input:** solo en el popup de captura completo (`openPopup()` en
   `content.js`). No hay UI de edición dedicada después de guardar.
2. **Obligatoriedad:** opcional. Guardar sin comentario debe seguir funcionando
   igual que hoy.
3. **Alcance de tipo:** solo ítems de texto (`idea`/`argumento`/`evidencia`).
   Los subtítulos (`type: "subtitle"`, categoría `title`) nunca llevan comentario.
4. **Persistencia Markdown:** sí, debe sobrevivir `buildMd`/`parseMd` (round-trip)
   y aparecer en el export `.md`. Queda a decidir en la spec si entra también en
   el export Anki (TSV).

## Estado actual relevante

### Popup de captura (`content.js`)

- `popupSkeleton()` (línea ~330) es el template estático del popup: header,
  bloque `.ch-quote` (preview de la selección), fila combo-contexto + selector
  de categoría, select opcional de "Anidar bajo", microcopy, acciones
  Cancelar/Guardar.
- `openPopup(rect, initialCategory)` (línea ~384) cablea el comportamiento vía
  `data-role`. `doSave()` (línea ~572) llama a `Store.addItem(ctx.id, {...})`
  con los campos actuales: `text`, `category`, `linkedSubtitleId`, `sourceUrl`,
  metadata de anclaje (`rangePrefix/rangeSuffix/rangeStart/rangeEnd/rangeText`).
- **Hay un segundo camino de guardado que NO pasa por el popup:**
  `fastSave(ctx, category)` (línea ~276), disparado al hacer clic directo en un
  swatch de categoría en la toolbar flotante cuando ya existe un contexto
  detectado para la página (`contextForThisPage`). Este camino guarda
  inmediatamente sin abrir `openPopup()`. Dado que la Feature 31 solo añade el
  input al popup completo, **el fast-save de un solo clic seguirá sin
  comentario** — es una limitación conocida a documentar en la spec, no un bug.
  El popup completo se abre solo vía el botón "⋯" o cuando no hay contexto
  detectado (clic en swatch abre el popup con esa categoría preseleccionada).
- El bloque `.ch-nest` ya se oculta condicionalmente cuando la categoría no es
  de tipo `text` (`refreshNest()`, línea ~469) — mismo patrón a seguir para
  ocultar el nuevo campo de comentario cuando `category === 'title'`.

### Modelo de datos (`storage.js`)

- `addItem(contextId, opts)` (línea ~195) construye el objeto `item` con campos
  fijos; no hay campo `comment` hoy.
- `updateItem(contextId, itemId, patch)` (línea ~273) soporta patch de `text`,
  `category`, `type`, `linkedSubtitleId` — no se pide tocarlo (el input vive
  solo en el popup), pero como `replaceContextFromMarkdown` reconstruye los
  items desde cero vía `parseMd`, cualquier edición posterior del comentario
  a través del Editor Monaco o el textarea de "vista-edit" (feature 18) fluye
  automáticamente una vez que `parseMd`/`buildMd` entienden el campo — no se
  necesita UI de edición dedicada para satisfacer el alcance aprobado.
- `replaceContextFromMarkdown` (línea ~342) mapea los items parseados a nuevos
  objetos de storage; hoy NO copia `it.comment` — debe añadirse.

### Contrato Markdown (`buildMd`/`parseMd` en `storage.js`)

- `buildMd(ctx)` (línea ~425): por cada item de tipo `text` empuja una sola
  línea `prefix + text` (o el texto crudo multi-línea sin prefijo si contiene
  saltos de línea, para preservar listas capturadas), seguida de una línea en
  blanco separadora.
- `parseMd(md)` (línea ~455) ya tiene una máquina de estados `inBlockquote`
  para líneas que empiezan con `>` (GFM blockquote), pero está pensada para
  **items completos envueltos en `>` que buildMd nunca genera actualmente**
  (posiblemente vestigial / defensiva para Markdown escrito a mano). Su
  comportamiento hoy: la primera línea `>` sin blockquote previo SIEMPRE crea
  un ítem `text` nuevo (extrayendo emoji de categoría); líneas `>` consecutivas
  se anexan como continuación (`\n`) al `text` de ese mismo ítem nuevo.
  **Este comportamiento debe cambiarse** para que un bloque de líneas `>` que
  aparece inmediatamente después (sin línea en blanco) de la línea de texto de
  un ítem `text` existente se interprete como el `comment` de ESE ítem anterior,
  no como un ítem nuevo. Si no hay un ítem `text` inmediatamente anterior
  (blockquote al inicio del documento, o justo después de un subtítulo/línea en
  blanco), debe conservarse el comportamiento legado (crear un ítem nuevo) para
  no romper Markdown escrito a mano que use blockquotes de otra forma.
- El patrón de búsqueda hacia atrás usado por `_Fuente:` (busca el último ítem
  `type === 'text'` sin importar qué haya en medio) es distinto al que conviene
  aquí: el comentario debe adjuntarse solo si es el ítem **inmediatamente
  anterior** (adyacencia estricta), reflejando "se muestra justo debajo del
  texto resaltado" tal como pidió el usuario.

### Renderer de la Vista (`sidebar/markdown.js`, `sidebar/vista.js`)

- `renderVista()` llama a `renderMarkdown(Store.buildMd(ctx))`, que usa `marked`
  con un `Renderer` custom (`buildCategoryRenderer`) que solo sobreescribe
  `paragraph` (para el borde de categoría, spec 020). `marked` ya renderiza
  líneas `> texto` como `<blockquote>` nativo sin config adicional — no hace
  falta un renderer custom para el blockquote en sí, aunque puede convenir
  envolverlo en una clase (`.md-comment`) para el estilo (ver `sidebar.css`,
  tokens `--cat-*-border` ya definidos en el mismo archivo que usa
  `markdown_preview_category_borders`, spec 020) — a decidir en la spec/tester
  si se necesita un renderer de `blockquote` custom para aplicar estilo visual
  (p. ej. itálica + icono 💬) o si el `<blockquote>` default de DOMPurify/marked
  basta.

### Export Anki (`sidebar/export-formats.js`)

- `buildAnkiRows(ctx)` construye `front`/`back` desde `it.text` y `it.source`
  para cada ítem `text`. Si la spec decide incluir el comentario en el back de
  Anki, el cambio es en la línea ~70 (`const back = ...`), añadiendo el
  comentario como texto adicional. Si se decide NO incluirlo, no se toca este
  archivo.

## Adenda — comentario también en el fast-save (decisión post-research)

El usuario pidió, además, una forma de agregar comentario sin pasar por el
popup completo cuando usa el guardado rápido de un clic (`fastSave()`,
content.js:~276). Se evaluaron tres opciones (enlace persistente bajo los
swatches / link solo en el toast post-guardado / mejorar el tooltip del botón
"⋯" existente) — el usuario eligió la segunda: **el link vive solo dentro del
toast "✓ Guardado" que ya aparece tras un fast-save**, sin tocar la fila de
swatches. Esto preserva el énfasis del guardado de un clic (nada nuevo visible
en el momento de elegir categoría) y solo ofrece la opción una vez que el
highlight ya existe.

Implicaciones técnicas:

- `showToolbarSuccess(category)` (content.js:~303) hoy solo pinta
  "✓ Guardado" y se auto-destruye a los 450 ms. Debe recibir también el item
  guardado y el contexto, extender su ventana de auto-dismiss (para dar tiempo
  a notar y hacer clic en el link) y, si `item.type === 'text'`, añadir un
  botón/link secundario "+ agregar comentario".
- Al hacer clic en ese link, el toast se transforma in-place en un mini-form
  (un `<input>` + botón Guardar) — cancelando el timer de auto-dismiss para
  que no desaparezca mientras el usuario escribe. Enter/click guarda; Escape o
  clic fuera cancela sin guardar.
- Guardar desde ese mini-form requiere poder parchear el `comment` de un item
  ya persistido — `Store.updateItem(contextId, itemId, patch)` (storage.js)
  hoy NO soporta `patch.comment`; hay que añadirlo (con la misma restricción
  que `addItem`: solo aplica si `item.type === 'text'`).
- El link "+ agregar comentario" no debe aparecer si el item recién guardado
  es un subtítulo (categoría `title`), ya que los subtítulos nunca llevan
  comentario (mismo scope aprobado en el Interviewer original).
- Esta vía de edición es efímera: solo funciona mientras el toast sigue en
  pantalla tras ESE fast-save concreto. No introduce un botón "editar
  comentario" persistente para items antiguos — eso sigue quedando fuera de
  alcance (se resuelve, si hace falta, editando el Markdown crudo vía
  Editor/vista-edit, AC-10 de la spec).

## Puntos abiertos para la spec

1. Comentario: ¿input `<input type="text">` de una sola línea, o `<textarea>`
   multi-línea? El popup ya está cargado de controles (combo, categoría, nest);
   un campo de una sola línea es más compacto. Blockquote Markdown soporta
   multi-línea igual (`> línea1\n> línea2`), así que la elección es solo de UX,
   no del contrato de datos.
2. ¿El comentario cuenta en el "Anidar bajo" / afecta el `linkedSubtitleId`? No
   — son campos independientes del ítem.
3. ¿Incluir el comentario en el export Anki (back de la tarjeta)? No estaba en
   las preguntas del Interviewer; queda a criterio del Spec-Writer/usuario en
   la fase de aprobación (recomendación: sí, como línea adicional en el back,
   ya que es contenido útil del usuario y el criterio aprobado dice "en
   buildMd/parseMd y exports").
4. Estilo visual del `<blockquote>` en la Vista: se puede reutilizar el patrón
   de borde izquierdo tintado por categoría (spec 020, tokens `--cat-*-border`)
   o usar un estilo neutro tipo "cita" (itálica, borde gris). Recomendación:
   estilo neutro discreto (no compite con el borde de categoría del párrafo
   padre) para que se lea claramente como anotación del usuario, no como parte
   del contenido resaltado.
