# Research — Feature 32: `highlight_source_navigation`

**Pregunta:** ¿cómo dejar que el usuario vuelva, desde una nota en la Vista, a la página web donde hizo el resaltado — sin caer en un link repetido por nota ni en mostrar la URL cruda debajo del texto?

**Respuestas de la entrevista (2026-07-30):**
- Ubicación: encabezado de grupo por página (una nota consecutiva compartiendo `sourceUrl` = un grupo, un solo control por grupo).
- Acción al click: abrir/enfocar la pestaña y saltar al resaltado exacto (no solo abrir la URL).
- Relación con feature #2 (`preview_group_by_page`, pendiente): esta feature la absorbe — la agrupación por página se implementa aquí.
- Estilo visual: icono únicamente, sin texto de dominio ni URL visible.

## 1. Estado actual (hechos verificados en código)

- **`renderVista()`** (`vite-extension/src/sidebar/vista.js:43`) no renderiza ítem por ítem: hace `marked(Store.buildMd(ctx))` una sola vez sobre el documento completo (features #18/#20). No hay noción de "grupo de página" en el DOM de salida hoy.
- **`buildMd`/`parseMd`** (`storage.js`) **no llevan `sourceUrl`** en el contrato Markdown — solo `text`, `category` (vía emoji), `linkedSubtitleId` (vía posición) y `source` (dominio, solo para la línea `_Fuente: X_`, que además ya no se usa en items capturados nuevos porque `sourceUrl` vive aparte). Esto confirma que agrupar por página es un problema de **render de la Vista**, no del contrato Markdown — no toca `buildMd`/`parseMd`/export `.md`, alineado con la decisión de alcance "solo Vista".
- Los ítems creados desde el editor de documento completo (`replaceContextFromMarkdown`) siempre tienen `sourceUrl: ""` (storage.js:362) — no tienen página de origen y por lo tanto no deben mostrar ícono de navegación.
- **Anclaje/reaplicación de resaltados** (features #4/#25/#27) vive en `content.js`, disparado por `startAnchorSession()` (content.js:914) al cargar la página o al detectar cambio de URL. Usa `rangePrefix`/`rangeSuffix`/`rangeStart`/`rangeEnd`/`rangeText` guardados en el ítem (storage.js `addItem`) contra un índice de texto del `document.body` (`buildTextIndex`, content.js:785) vía `findMatch()` de `anchor.js`. El pintado usa la CSS Custom Highlight API (`paintRange`, content.js:845) — no hay mutación del DOM ni, hoy, ningún `scrollIntoView`.
- El reanclaje es **asíncrono y con reintentos**: pasa por un `MutationObserver` con debounce, hasta 50 pasadas o 5s de gracia antes de marcar un ítem como `'failed'` (soft-fail, sigue reintentando en `session.pending`). Cualquier diseño de "saltar al resaltado" tiene que tolerar este delay — no puede asumir que el resaltado ya está pintado en el momento en que la pestaña termina de cargar.
- **Mensajería existente** entre panel/background/content script (todo reusable como precedente):
  - Content → background → storage: `CH_OPEN_PANEL_CTX` (content.js:305 → background.js:14-19) abre el side panel y dejar un flag en `chrome.storage.local` (`CH_NAV`) que el panel consume — **este es el patrón a imitar** para el flujo inverso (panel → content), porque evita condiciones de carrera con mensajes "fire-and-forget" a un content script que puede no estar listo aún.
  - Content → panel: `CH_ANCHOR_STATUS` (broadcast de estado de anclaje, `anchor-status.js`).
  - Panel → content: `CH_GET_ANCHOR_STATUS` (query síncrona) y `CH_REMOVE_HL {itemId}` (comando por ítem) — precedente directo de "el panel le dice al content script qué hacer con un ítem específico".
  - `anchor-status.js` ya usa `chrome.tabs.query`, `chrome.tabs.onActivated/onUpdated` y `chrome.tabs.sendMessage` **desde el side panel**, confirmando que el panel tiene acceso a `chrome.tabs` sin pasar por background.
- **No existe hoy ningún `chrome.tabs.create` ni `chrome.tabs.update`** en todo el repo. Esta feature los introduce por primera vez.
- `domainColor()`/`hostnameFromUrl()` (storage.js) ya existen para derivar un dominio limpio de una `sourceUrl` — útiles para el `title`/`aria-label` del ícono (tooltip), no para texto visible, respetando "sin URL cruda".

## 2. Opciones consideradas

| Opción | Por qué se descarta / acepta |
|---|---|
| Ícono por nota (uno por ítem) | Rechazada explícitamente por el usuario: con varias notas de la misma página es "mucho link de redirección" repetido. |
| Sección aparte "Fuentes" | Desacopla la navegación de la nota que se está leyendo — obliga a ir y volver entre la nota y una lista externa. Peor ergonomía que un control junto al grupo. |
| **Encabezado de grupo por página con ícono único** (elegida) | Un solo punto de navegación por racha de notas consecutivas del mismo `sourceUrl` — cero repetición, cero URL visible, y resuelve a la vez el feature #2 pendiente (agrupar por página). |

## 3. Diseño recomendado

### 3.1 Agrupación y render (Vista)

`renderVista()` deja de hacer un único `marked(buildMd(ctx))`. En su lugar:

1. Particionar `ctx.items` en tramos consecutivos por `sourceUrl` (idéntico criterio al que ya proponía el feature #2: "notas consecutivas del mismo sourceUrl").
2. Tramos con `sourceUrl` no vacío llevan un encabezado de grupo: un botón ícono-only (p. ej. ícono `ExternalLink` de Lucide, ya usado en el proyecto) con `aria-label="Ir a {hostname}"` y `title="{hostname}"` como tooltip — el hostname nunca se imprime como texto visible, solo como metadata de accesibilidad.
3. Tramos con `sourceUrl` vacío (ítems creados a mano desde el editor de documento) no llevan encabezado ni ícono — se renderizan igual que hoy.
4. Cada tramo se renderiza con `renderMarkdown(buildMd-fragment)` reusando el renderer con bordes de categoría (feature #20) sin cambios — la agrupación es un wrapper visual alrededor de fragmentos ya renderizados, no un nuevo formato de Markdown.

Esto es un cambio moderado en `vista.js` (pasar de un render de documento completo a un render por grupos), pero no toca `storage.js`, `buildMd`, `parseMd` ni el modo de edición de documento completo (`createDocEditor`, que sigue mostrando el Markdown crudo del documento entero — ahí nunca aparecen íconos ni URLs, consistente con "solo Vista").

### 3.2 Click → abrir/enfocar + saltar al resaltado

Reusar el patrón `CH_NAV` (relay vía `chrome.storage.local`) en vez de un mensaje directo, precisamente porque el reanclaje es asíncrono y con reintentos:

1. El panel busca una pestaña ya abierta con esa `sourceUrl` (`chrome.tabs.query({url: sourceUrl})` — el panel ya tiene este acceso, ver `anchor-status.js`).
2. Si existe: `chrome.tabs.update(tabId, {active: true})` + enfocar su ventana, y enviar `chrome.tabs.sendMessage(tabId, {type: 'CH_SCROLL_TO_ITEM', itemId})` directamente (el content script ya está vivo, no hay condición de carrera).
3. Si no existe: `chrome.tabs.create({url: sourceUrl})`, y antes de crear la pestaña dejar un flag en `chrome.storage.local` (p. ej. `CH_SCROLL_TARGET: itemId`) que el nuevo `startAnchorSession()` del content script consulta; en cuanto ese ítem específico quede pintado (no antes, y no si termina en `'failed'`), hace `scrollIntoView({behavior:'smooth', block:'center'})` y limpia el flag.
4. En ambos casos, un mismo handler en el content script (`CH_SCROLL_TO_ITEM`) cubre "ya estaba abierta" y "recién anclada", evitando duplicar lógica de scroll.

Es responsabilidad del Spec-Writer decidir si el salto además incluye un feedback visual transitorio (ej. breve pulso sobre el resaltado ya pintado) — no es indispensable para cerrar el pedido del usuario, pero mejora la percepción de "encontré la nota correcta". Lo dejo como criterio opcional a discutir, no obligatorio.

### 3.3 Casos límite a resolver en la spec

- Ítem cuyo resaltado terminó en estado `'failed'` (el DOM de la página cambió y no se pudo reanclar): el click igual debe abrir/enfocar la página (degradación seria: sin scroll automático, no un error visible al usuario).
- Pestaña ya abierta pero en otra ventana de Chrome: hay que enfocar también la ventana (`chrome.windows.update({focused: true})`), no solo la pestaña.
- Varias pestañas abiertas con la misma URL: tomar la primera que devuelva `chrome.tabs.query`.
- `sourceUrl` con hash/query distintos pero mismo recurso lógico: fuera de alcance — se mantiene el matching exacto por string que ya usa `contextForThisPage()` y el anclaje (`content.js`), sin normalización nueva.

## 4. Impacto en feature #2

Esta feature absorbe y resuelve `feature_list.json` #2 (`preview_group_by_page`): la agrupación por `sourceUrl` con encabezado por grupo que pedía #2 queda implementada aquí como prerrequisito del ícono de navegación. Al cerrar la sesión, #2 debe marcarse resuelta por la #32 en vez de quedar pendiente por separado.

## 5. Fuera de alcance

- No se toca `buildMd`/`parseMd`/export `.md` — el ícono y la agrupación son solo de la Vista renderizada, no del documento Markdown ni del modo de edición de documento completo.
- No se introduce normalización de URLs (tracking params, trailing slash, etc.).
- No se cambia el comportamiento de reanclaje existente (`anchor.js`, `startAnchorSession`) — solo se le añade un nuevo tipo de mensaje (`CH_SCROLL_TO_ITEM`) y una consulta a un flag de storage nuevo.
