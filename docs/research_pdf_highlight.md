# Research — Feature 37: `pdf_highlight`

**Pregunta:** ¿cómo dejar que el usuario resalte texto dentro de un PDF, si el visor nativo de Chrome no admite content scripts, reutilizando el flujo de captura existente (toolbar de 4 categorías → popup de contexto/anidar/comentario → guardar → pintar) y volviendo a pintar los resaltados al reabrir el mismo PDF?

**Respuestas de la entrevista (requisitos):**
1. **Entrada solo manual.** Una acción "Abrir en Active Reading" cuando la pestaña actual es un PDF. Sin redirigir automáticamente las navegaciones a PDF; el visor nativo de Chrome sigue siendo el predeterminado.
2. **Orígenes: PDFs web (http/https) y locales (`file://`).** En `file://` hay que detectar si "Permitir acceso a URLs de archivo" está desactivado (`chrome.extension.isAllowedFileSchemeAccess`) y mostrar un aviso. En v1 no hay arrastrar y soltar ni selector de archivos.
3. **Persistencia: sí.** Anclaje por página + cita (exact + prefix/suffix), que se vuelve a aplicar a medida que se renderiza la capa de texto de cada página.
4. **Vista/export: igual que los ítems web, más el número de página.** Se agrupan por origen (#32). Un click abre el PDF en **nuestro** visor y en la página correcta. El Markdown muestra `_Fuente: archivo.pdf, p. 12_`. `buildMd`/`parseMd` tienen que seguir siendo inversos.

Todas las rutas son relativas a `vite-extension/` salvo que se indique otra cosa.

---

## 1. Resumen ejecutivo

- **Nueva página de extensión `src/viewer.html` + `src/viewer.js`** construida con `pdfjs-dist@6.4.299` (la `latest` del 2026-10-03). Usa el componente `PDFViewer` de `pdfjs-dist/web/pdf_viewer.mjs`, que trae renderizado perezoso, scroll, zoom y el evento `textlayerrendered`. URL: `viewer.html?file=<url-codificada>#page=N&item=<id>`.
- **Una página de extensión no es un content script.** Puede importar `storage.js` directamente y usar `chrome.storage` sin intermediarios. Ahí no aplica la restricción de `content-storage.js`. Lo que sí hay que evitar es que el visor **comparta un módulo con `content.js`**: Rollup extraería un chunk compartido y rompería el content script (§3.3). Esta es la decisión arquitectónica principal de la feature.
- **Modelo:** `sourceUrl` = URL **original** del PDF (nunca la URL del visor). Se añaden `page` (entero, base 1) y `sourceTitle` (nombre de archivo). `Number.isInteger(item.page)` es la marca de "ítem de PDF".
- **Markdown:** hoy `buildMd` **no emite ninguna línea `_Fuente:_`** (sí la parsea). La propuesta es emitirla **solo** en ítems de PDF y extender `parseMd` para extraer `, p. N`. Los tests actuales no cambian porque sus fixtures no tienen `page` (§5).
- **Anclaje por página:** la búsqueda se acota al texto de la capa de esa página (`findMatch` de `anchor.js`, sin cambios) y se dispara en `textlayerrendered`, no con `MutationObserver` + `MAX_PASSES`. Si no, los ítems de páginas todavía no renderizadas caerían en `failed`.

---

## 2. Estado actual (hechos verificados en código)

### 2.1 Flujo de captura en `src/content.js`

> Nota: el header de `CLAUDE.md` describe un "icono `+`". El código actual (feature de rediseño del botón de captura) muestra una **toolbar** con 4 swatches de categoría y un botón `⋯`.

| Paso | Dónde | Detalle |
|---|---|---|
| Detección | `content.js:121-138` | `mouseup` → `setTimeout 0` → `getSelection()`. Guarda `savedText` (Markdown vía `fragmentToMarkdown`, `:44`), `savedRawText` (`sel.toString().trim()`) y `savedRange` (clon). |
| Cierre | `:140-153`, `:159-162` | `mousedown` fuera de la UI, `scroll` (capture) y `resize` (reclamp). |
| Toolbar | `showToolbar` `:198-280` | Swatches + `⋯`. Si `contextForThisPage()` (`:176-189`) encuentra un contexto con un ítem cuyo `sourceUrl === location.href`, hace **fast-save** (`fastSave` `:286-311`) sin popup. |
| Popup | `popupSkeleton` `:405`, `openPopup` `:464` | Combobox de contexto, categoría, anidar (`refreshNest` `:551`), comentario, Enter guarda (`doSave` `:655-703`). |
| Metadatos | `extractRangeContext` `:736-776` | `rangePrefix`/`rangeSuffix` (50 chars) y `rangeStart`/`rangeEnd` sobre el texto concatenado de `document.body` (sin separadores = `Range.toString()`), alineados al texto *trimmed*. |
| Guardado | `Store.addItem` (`storage.js:209-263`) | `sourceUrl: location.href`. Tras guardar, `highlightSavedRange` (`:888`) pinta y `noteLiveAnchor`. `fastSave` además envía `CH_OPEN_PANEL_CTX` → `background.js:14-19` (abre panel + flag `CH_NAV`). |
| Pintado | `paintRange` `:845` | CSS Custom Highlight API (`CSS.highlights`, nombres `ch-hl-{cat}`), cero mutación del DOM. Los estilos `::highlight(ch-hl-*)` están en `content.css:489-492`. |

### 2.2 Modelo de anclaje (features 004/027)

- Campos del ítem (`storage.js:233-242`): `rangePrefix`, `rangeSuffix`, `rangeText` (texto DOM crudo cuando `text` es Markdown), `rangeStart`, `rangeEnd`.
- `src/anchor.js` es un **módulo puro de strings** (sin DOM): `findMatch(raw, {quote,prefix,suffix,hintStart,hintEnd})` con 4 niveles (posición → exacto → normalizado → fuzzy con `approx-string-match`). **Es reutilizable tal cual para PDF.** Su `normalizeWithMap` ya colapsa espacios y elimina guiones blandos y caracteres de ancho cero.
- Sesión de anclaje (`content.js:909-1100`): `startAnchorSession` (`:930`) toma los ítems con `sourceUrl === location.href && rangePrefix != null`. `runAnchorPass` (`:1035`) indexa **todo** `document.body` (`buildTextIndex` `:785`) y reintenta por `MutationObserver` hasta `MAX_PASSES=50`/`GRACE_MS=5000`. Después marca `failed` (soft-fail).
- Mensajería: `CH_ANCHOR_STATUS` (push, `:1186`), `CH_GET_ANCHOR_STATUS` (pull, `:1209`), `CH_SCROLL_TO_ITEM` (`:1212`), `CH_REMOVE_HL` (`:1202`), y el flag de relay `CH_SCROLL_TARGET` en storage (`:966-969`).

### 2.3 Panel

- `sidebar/vista.js:48-60` `groupItemsBySource` agrupa ítems **consecutivos** con el mismo `sourceUrl`. `sourceGroupHeader` (`:68-87`) usa `Store.hostnameFromUrl(sourceUrl)` como etiqueta. **Para `file:///…/x.pdf` el hostname es `""`** (`storage.js:113-124`), así que el encabezado quedaría vacío.
- `sidebar/source-nav.js:14-37` `goToSource`: `chrome.tabs.query({url: sourceUrl})` → enfocar + `CH_SCROLL_TO_ITEM`, o bien `CH_SCROLL_TARGET` + `tabs.create`.
- `sidebar/anchor-status.js:41-52` hace pull con `chrome.tabs.sendMessage(activeTab, CH_GET_ANCHOR_STATUS)`. Un rechazo equivale a "página no abierta". El comentario de `:9` ya cita los PDFs como caso de rechazo.
- No existe `contextForThisPage` en el panel: solo está en `content.js:176`.

### 2.4 Build

- `manifest.json`: permisos `storage`, `sidePanel`; host `<all_urls>`; sin `contextMenus`/`tabs`/`scripting`. `action` **sin** `default_popup` (el click abre el panel, `background.js:5-7`). `src/popup.html`/`popup.js` no están referenciados en el manifest: son código muerto, no un precedente de página extra construida.
- `vite.config.js`: solo `crx({ manifest })`, sin `build.rollupOptions.input`.
- `dist/manifest.json` (último build): `content.js` sale como **un único bundle autocontenido** `assets/content.js-<hash>.js`, listado en `content_scripts.js` y en `web_accessible_resources`. El sidebar sale como `assets/sidebar.html-<hash>.js`. Hoy no hay chunks compartidos porque `content.js` y `sidebar.js` no comparten ni un módulo (`content-storage.js` vs `storage.js`; `anchor.js` solo lo importa `content.js`).
- Dependencias: Vite 7.3.6, `@crxjs/vite-plugin` 2.7.1 (declarado como `latest`), `approx-string-match` 2.0.0. `pdfjs-dist` **no está instalado**.

---

## 3. Arquitectura recomendada

### 3.1 Piezas nuevas

```
src/viewer.html          estructura: toolbar mínima (nombre, página x/N, zoom) + #viewerContainer > #viewer
src/viewer.css           layout + overrides de pdf_viewer.css
src/viewer.js            controlador: lee ?file, carga PDF, wiring de captura y anclaje
src/viewer/pdf.js        init pdfjs (worker, cMaps, fonts, wasm), PDFViewer + EventBus + PDFLinkService
src/viewer/anchoring.js  anclaje por página sobre la capa de texto (usa findMatch)
src/viewer/source.js     helpers puros: buildViewerUrl(pdfUrl,{page,itemId}), parseViewerUrl, pdfFilename(url)
```

Las funciones puras de URL y nombre de archivo (`pdfFilename`, `isPdfItem`) conviene ponerlas **en `storage.js`** (y resincronizar `content-storage.js`), porque las necesitan tanto el panel (`vista.js`, `source-nav.js`) como `buildMd`.

### 3.2 Qué se reutiliza y qué hay que extraer de `content.js`

`content.js` (1292 líneas) mezcla tres responsabilidades:

| Bloque | Líneas | ¿Reutilizable en el visor? |
|---|---|---|
| Conversión fragment→Markdown | `:44-118` | Sí (pura sobre DOM). En PDF casi siempre da texto plano, porque la capa de texto son `<span>` + `<br>`. |
| UI de captura: toolbar, popup, toast/comentario, `position`/`reclamp` | `:198-735`, `:1251-1292` | **Sí, es el núcleo a extraer.** Depende de `location.href`, `savedRange`, `Store` y `extractRangeContext`. |
| `extractRangeContext` / `buildTextIndex` / `rangeFromOffsets` | `:736-823` | Sí, pero parametrizando el `root` (body vs `.textLayer` de la página). |
| Pintor CSS Highlight | `:825-899` | Sí, tal cual. |
| Sesión de anclaje por URL + `MutationObserver` + detección de SPA | `:901-1249` | **No.** El visor necesita anclaje por página dirigido por eventos (§6). |

**Propuesta de extracción** (es un refactor, y conviene que sea el primer commit, verificado con los E2E 029/031/032/034 en verde antes de tocar nada del PDF):

```
src/capture/ui.js       createCaptureUI(adapter) → { onSelection(range, rect), teardown() }
src/capture/markdown.js fragmentToMarkdown
src/capture/ranges.js   extractRangeContext(range, root), buildTextIndex(root), rangeFromOffsets
src/capture/paint.js    paintRange / unpaintItem / clearAllPaint / scrollToItem
```

El `adapter` inyecta lo que cambia entre web y PDF:
- `store`: `content-storage.js` en el content script, `storage.js` en el visor.
- `getSourceUrl()`: `location.href` vs la URL del PDF (`?file=`).
- `getCaptureMeta(range)`: `{}` vs `{ page, sourceTitle }`.
- `getAnchorRoot(range)`: `document.body` vs el `.textLayer` de la página que contiene `range.startContainer`.
- `afterSave(item, range)`: pintar, `noteLiveAnchor` y `CH_OPEN_PANEL_CTX`.

`contextForThisPage(contexts, url)` pasa a recibir la URL como argumento.

### 3.3 La restricción de chunk compartido (decisión clave)

- El visor **puede y debe importar `storage.js` directamente**. Compartir `storage.js` entre `sidebar.html` y `viewer.html` produce un chunk compartido entre **páginas** de extensión, y eso es inocuo: se sirven desde `chrome-extension://` con acceso completo a `chrome.*`.
- **El problema aparece si el visor importa algo que también importa `content.js`** (`anchor.js` hoy, `capture/*` tras el refactor). Rollup lo extrae a un chunk aparte, y el bundle de `content.js` pasa a tener un `import`. Con eso se rompe el content script (el incidente documentado en `content.js:16-20` y en `CLAUDE.md`, feature 31). Ningún test unitario lo detecta, solo un E2E.
- Opciones:

| Opción | Pros | Contras |
|---|---|---|
| **A. Plugin Vite `isolate-content-script`** (recomendada, previa validación con un spike): un `resolveId` que, cuando el importador pertenece al grafo de `content.js`, devuelve el id resuelto con un sufijo (`?content`). Rollup lo trata como un módulo distinto y lo inlinea en `content.js`; el `load` por defecto de Vite lee `cleanUrl(id)`. | Una sola fuente para `anchor.js`/`capture/*`, sin copias manuales. Con el tiempo permitiría retirar `content-storage.js` (fuera de alcance aquí). | Es magia de build. Hay que verificar en un spike que CRXJS 2.7.1 no lo altere. |
| B. Copias manuales (`content-capture.js`, como `content-storage.js`) | Patrón ya conocido. | Duplica ~600 líneas de UI y multiplica el riesgo de desincronizar que `CLAUDE.md` ya marca como trampa. |
| C. Build separado de `content.js` (IIFE con `inlineDynamicImports`) | Aísla por completo. | Pelea con cómo CRXJS reescribe `content_scripts` en el manifest. Es un cambio más grande. |

  **Guardarraíl obligatorio con cualquier opción:** un test de build que falle si `dist/assets/content.js-*.js` contiene una sentencia `import`/`export` de nivel superior. Puede ser un Vitest que lea `dist/` cuando exista, o un paso en el E2E. Así el fallo deja de ser silencioso.

### 3.4 Entrada manual ("Abrir en Active Reading")

- **Botón en el side panel** (principal): visible cuando la pestaña activa "parece PDF". `anchor-status.js` ya escucha `tabs.onActivated/onUpdated`, así que se puede reutilizar ese hook. La heurística es `/\.pdf($|[?#])/i` sobre `tab.url`, que con `<all_urls>` es visible para http/https/file. Para PDFs servidos sin extensión `.pdf` (`Content-Type: application/pdf`), v1 puede ofrecer el botón igualmente y que el visor muestre un error amable si PDF.js lanza `InvalidPDFException`. Con los permisos actuales no se puede leer el `contentType` sin `scripting`.
- **Menú contextual del icono** (`chrome.contextMenus.create({ id, title: "Abrir en Active Reading", contexts: ["action"] })`): requiere el permiso `contextMenus`. No se usa `contexts: ["page"]`, porque el visor nativo de PDF no garantiza mostrar menús de extensiones (pendiente de verificar; fuera de v1).
- Acción en ambos casos: `chrome.tabs.update(tab.id, { url: chrome.runtime.getURL("src/viewer.html") + "?file=" + encodeURIComponent(tab.url) })`, que reemplaza el visor nativo en la misma pestaña (el botón "atrás" vuelve al nativo). No hace falta el permiso `tabs`: con `<all_urls>` `tab.url` ya es visible. El listener de `background.js` sustituye al comentario "Future: context menus" (`background.js:9-11`).
- **No se necesitan `web_accessible_resources`** para el visor: lo navega la propia extensión, no una página web.

### 3.5 Integración con el panel

- **Anchor-status y scroll:** `chrome.tabs.sendMessage` está documentado como canal hacia *content scripts*. **No hay garantía de que llegue a una página de extensión abierta en una pestaña** (verificar en el spike). Diseño robusto: el visor escucha `chrome.runtime.onMessage` (que sí recibe los broadcasts de `runtime.sendMessage`) y filtra por su propio `tabId` (`chrome.tabs.getCurrent()`). En el panel, `queryActiveTab` y `goToSource` intentan `tabs.sendMessage` y, si el destino es un visor, hacen fallback a `runtime.sendMessage({ ..., tabId })`. El push `CH_ANCHOR_STATUS` desde el visor funciona tal cual: `sender.tab` está presente en páginas de extensión dentro de una pestaña, así que el filtro de `anchor-status.js:27` sigue valiendo.
- **Ir al origen (#32):** si `isPdfItem(item)`, en vez de `tabs.query({url: sourceUrl})` hay que: (1) buscar una pestaña con el visor de ese PDF. `chrome.tabs.query({ url: chrome.runtime.getURL("src/viewer.html") + "*" })` y comparar el parámetro `file`, o mejor `chrome.runtime.getContexts({ contextTypes: ["TAB"] })` (Chrome 116+), que devuelve `tabId` + `documentUrl` de las páginas propias sin depender del permiso `tabs`. (2) Si existe: enfocarla + `CH_SCROLL_TO_ITEM {itemId, page}`. (3) Si no existe: `tabs.create(buildViewerUrl(sourceUrl, { page, itemId }))`. El hash `#page=N&item=id` sustituye al relay `CH_SCROLL_TARGET`, porque el visor lo lee al arrancar y no hay carrera posible. Para PDFs locales con el acceso a archivos desactivado, el visor muestra el aviso (§4.3).
- **Etiqueta del grupo en la Vista:** `item.sourceTitle || pdfFilename(sourceUrl)` en lugar de `hostnameFromUrl`, cuando el grupo es de PDF.
- **Content script en el visor nativo:** `content.js` sí se inyecta en la pestaña de un PDF abierto en el visor nativo (`<all_urls>`, documento contenedor del `<embed>`). Su `startAnchorSession` tomaría los ítems de PDF con `sourceUrl ===` URL del PDF y acabarían en `failed`, de modo que el panel mostraría "no encontrado" sin motivo. **Hay que filtrar** `if (Number.isInteger(it.page)) continue;` en `content.js:943-951`, o saltar la sesión si `document.contentType === "application/pdf"`.

---

## 4. PDF.js en MV3 + Vite

### 4.1 Paquete y versión

- `pdfjs-dist@6.4.299` (`latest`, 2026-10-03). Línea de releases: 5.7 en abril y 6.0 a 6.4 entre mayo y octubre de 2026. `main: build/pdf.mjs`, **sin mapa `exports`**, así que los imports profundos (`pdfjs-dist/web/pdf_viewer.mjs`, `pdfjs-dist/build/pdf.worker.min.mjs`) funcionan. `optionalDependencies: @napi-rs/canvas` solo aplica a Node, y pnpm puede omitirla.
- El bundle moderno usa APIs recientes (`Map.prototype.getOrInsert`, `Uint8Array.fromBase64`, `Promise.try`/`withResolvers`, según un grep en `build/*.min.mjs`). Hay un build `legacy/` por si hiciera falta soportar Chrome antiguos. Recomendación: build moderno y fijar `minimum_chrome_version` en el manifest tras confirmarlo en el spike.
- **Fijar la versión exacta** (no `^`): la API del visor (`web/pdf_viewer.mjs`) no tiene garantías semver fuertes.

### 4.2 Wiring (verificado contra los `.d.ts` del tarball 6.4.299)

```js
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import { EventBus, PDFViewer, PDFLinkService } from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";            // o @import desde viewer.css
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
GlobalWorkerOptions.workerSrc = workerUrl;          // module worker, mismo origen chrome-extension://

const doc = await getDocument({
  url: pdfUrl,
  cMapUrl: chrome.runtime.getURL("vendor/pdfjs/cmaps/"), cMapPacked: true,
  standardFontDataUrl: chrome.runtime.getURL("vendor/pdfjs/standard_fonts/"),
  wasmUrl: chrome.runtime.getURL("vendor/pdfjs/wasm/"),
  // withCredentials: true  → ver §4.3 (PDFs detrás de login)
}).promise;
const eventBus = new EventBus();
const viewer = new PDFViewer({ container, eventBus, linkService, textLayerMode: 1 /* ENABLE */ });
eventBus.on("textlayerrendered", ({ pageNumber, source }) => anchorPage(pageNumber, source));
viewer.setDocument(doc); linkService.setDocument(doc);
```

- **CSP:** el CSP por defecto de MV3 para páginas de extensión es `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`. Eso permite los wasm (JBIG2/OpenJPEG/QCMS). Además existen `*_nowasm_fallback.js` como alternativa. En 6.4 **no existe la opción `isEvalSupported`** (ya no aparece en `types/src/display/api.d.ts`) y el grep no encuentra ni `new Function(` ni `eval(` en `pdf.mjs`/`pdf.worker.mjs`/`pdf_viewer.mjs`. No hace falta tocar el CSP. `quickjs-eval.wasm` es para el scripting sandbox de JS en PDFs: **no habilitar scripting** (no pasar `scriptingManager`), así no se carga.
- **Assets** (tamaños del tarball): `cmaps/` 1,6 MB, `standard_fonts/` 0,8 MB, `wasm/` 1,5 MB, `iccs/` 20 KB. Hay que copiarlos a `public/vendor/pdfjs/`. Opciones: vendorizarlos en git (patrón Monaco, `public/vendor/monaco/`) o un script `postinstall`/`prebuild` que copie desde `node_modules`. Recomiendo el script para que no se desalineen de la versión de `pdfjs-dist`.
- **Peso del bundle:** `pdf.min.mjs` 452 KB + `pdf_viewer.mjs` 316 KB (sin minificar) + worker 1,2 MB + assets ~4 MB, en total unos 6 MB más en `dist/`. Solo los carga `viewer.html`. El sidebar no se ve afectado, siempre que no importe `pdfjs-dist` (`source.js` no debe importarlo).
- **Página extra en CRXJS:** CRXJS solo construye las HTML que referencia el manifest. Las demás van en `vite.config.js` → `build: { rollupOptions: { input: { viewer: "src/viewer.html" } } }`, y la URL en runtime es `chrome.runtime.getURL("src/viewer.html")`, igual que `side_panel.default_path`. Con `pnpm run dev` (HMR) hay que verificar que la página extra se sirva. Si falla, documentarlo y probar solo con build.

### 4.3 Obtener el PDF

- **http/https:** PDF.js usa `PDFFetchStream` (`fetch`) para http(s) (`isValidFetchUrl`, `pdf.mjs:1402`). Desde una página de extensión con `<all_urls>` en `host_permissions` **no hay CORS**. Por defecto `credentials` es `same-origin`, que desde `chrome-extension://` significa sin cookies. Los PDFs detrás de login (intranets, papers con sesión) necesitan `withCredentials: true`. Aun así las cookies `SameSite=Lax/Strict` podrían no enviarse desde el origen de la extensión: es un riesgo (§8). Las peticiones por rangos (`Range`) funcionan y permiten abrir PDFs grandes de forma progresiva.
- **file://:** PDF.js usa `PDFNetworkStream` (XHR) para lo que no es http(s) (`pdf.mjs:14339`). XHR a `file://` desde una página de extensión funciona **solo** si el usuario activó "Permitir acceso a URLs de archivo". Antes de cargar: `if (url.startsWith("file:") && !(await chrome.extension.isAllowedFileSchemeAccess()))`. En ese caso se muestra un aviso en español con un botón que abre `chrome://extensions/?id=<runtime.id>` vía `chrome.tabs.create` y no se intenta cargar.
- **Errores:** `InvalidPDFException` (no es un PDF), `PasswordException` (PDF cifrado; fuera de v1, con mensaje "PDF protegido con contraseña: no soportado") y `ResponseException` (404/403). En todos los casos un estado de error con un enlace "Abrir en el visor de Chrome" (la URL original).

---

## 5. Modelo de datos y contrato Markdown

### 5.1 Campos nuevos (todos opcionales, retrocompatibles)

| Campo | Tipo | Valor en PDF | Valor en web/legado |
|---|---|---|---|
| `sourceUrl` | string | URL **original** del PDF (`https://…/x.pdf`, `file:///…/x.pdf`), sin el hash `#page=` | sin cambios |
| `page` | int ≥ 1 \| null | número de página (base 1) de **inicio** de la selección | `null` / ausente |
| `sourceTitle` | string \| null | nombre del archivo (`pdfFilename(url)`, decodificado). Opcionalmente `doc.getMetadata().info.Title` si existe | `null` |
| `source` | string | igual a `sourceTitle` (lo usan Anki `Fuente:` y los tags) | hostname |
| `range*` | — | mismo significado, pero las coordenadas son **relativas al texto de la capa de esa página** (no del documento completo) | sin cambios |

- `addItem` (`storage.js:209`) debe aceptar `opts.page` (validar con `Number.isInteger(x) && x >= 1`) y `opts.sourceTitle`. `updateItem` no los toca.
- `replaceContextFromMarkdown` (`storage.js:389-452`) tiene que **conservar `page` y `sourceTitle`** de `old`, igual que hace con `sourceUrl`, tanto en coincidencia exacta como posicional. Si el usuario edita la página en la línea `_Fuente:_`, gana el valor parseado. Hay que añadir un caso a `tests/036-…test.js`.
- Strip del hash: si `tab.url` ya trae `#page=3`, se guarda sin él, para que `contextForThisPage` y la agrupación coincidan.
- **Resincronizar `content-storage.js`** tras cambiar `storage.js` (regla de `CLAUDE.md`).

### 5.2 Formato Markdown

**Hecho clave:** `buildMdFragment` (`storage.js:510-533`) **no emite hoy ninguna línea `_Fuente:_`**. Solo `parseMd` (`:573`, `:589-597`) la reconoce, por compatibilidad con Markdown antiguo, y asigna `source` al último ítem de texto. El docblock de `buildMd` (`:500-503`) que muestra `_Fuente: {text.source}_` está desactualizado.

Propuesta (solo para `isPdfItem(it)` de tipo `text`):

```
🟡 La memoria de trabajo tiene capacidad limitada.
> mi comentario
_Fuente: baddeley-2003.pdf, p. 12_
```

- **Dónde se emite:** justo después de la línea del ítem y de su bloque de comentario, sin línea en blanco, y luego el `""` habitual. En `parseMd` la rama `fuente` se evalúa **antes** que la de `>` (`:574-597`), así que no interfiere con la regla de adyacencia del comentario (feature 031).
- **Cómo se parsea:** dentro de la rama `fuente`, `/^(.*?),\s*p\.\s*(\d+)$/` sobre el texto capturado → `{ source, page }`. Sin `, p. N` se comporta como hoy (solo `source`). Para un nombre de archivo con comas (`a, b.pdf, p. 3`), el `.*?` lazy con `$` anclado toma la última `, p. N`.
- **Guiones bajos en nombres de archivo:** la regex actual `^_Fuente:\s*(.+?)_$` sigue funcionando con `my_paper.pdf` (el lazy está anclado a `_$`). En el **render** de `marked`, `_..._` puede partirse en énfasis con `_` internos. Mitigación: en `buildMd`, escapar `_` → `\_` en el nombre, y en `parseMd` des-escapar `\_` → `_`. Cubrirlo con un test de ida y vuelta.
- **Subtítulos (`title`) de PDF:** sin línea `_Fuente:_`. Un `## …` seguido de `_Fuente:_` haría que `parseMd` la adjunte al **último ítem de texto anterior** (`:591-596`), que sería un bug. Su página vive solo en storage.
- **La Vista** renderiza `buildMdFragment` por grupo (`vista.js:98-104`), así que cada nota de PDF muestra "*Fuente: x.pdf, p. 12*" en cursiva. Eso cumple "como web + número de página" sin tocar la lógica de la Vista. Alternativa más limpia, a decidir en la spec: un badge "p. 12" generado en la Vista y la línea solo en export/editor. Pero entonces Vista y Markdown divergirían, y hoy son el mismo render.
- **Anki** (`export-formats.js:70`): `Fuente: ${it.source}` mostraría `x.pdf`. Opcional añadir `, p. N`. Si se hace, actualizar `tests/028-export-formats.test.js:103-111` en un caso nuevo, no editando el existente.

### 5.3 Impacto en tests existentes

- `tests/031-storage-comment.test.js:14-106` y `tests/028-export-formats.test.js:177-180` usan fixtures sin `page`, así que su salida no cambia (strings exactos como `"# Cortisol\n\n🟡 Texto A\n> Mi comentario\n"`).
- `tests/032-vista-grouping.test.js` agrupa por `sourceUrl`. Los ítems de un PDF comparten `sourceUrl` (sin hash), así que siguen siendo un grupo.
- `tests/036-replace-from-markdown-preserves-anchors.test.js:145` compara `sourceUrl`. Hay que añadir un caso hermano para `page`/`sourceTitle`.

---

## 6. Anclaje en la capa de texto

### 6.1 Cómo construye la capa PDF.js 6.4

`TextLayer` (`pdf.mjs:15006`) crea un `<span>` por `TextItem` (`item.str`) dentro de `.textLayer`. Cuando `hasEOL` está activo **añade un `<br>`** (líneas 242-243 de la clase), y el `<br>` no aporta texto a `Range.toString()`. En consecuencia:

- `Range.toString()` / `buildTextIndex(textLayer)` concatena "…fin de línea" + "siguiente…" **sin separador** cuando el `TextItem` no termina en espacio.
- `Selection.toString()` sí suele insertar `\n` en los `<br>`. Esto es justo el desajuste que `extractRangeContext` (`content.js:757-775`) ya resuelve usando `range.toString()` para las coordenadas. **Para PDF, guardar siempre `rangeText = range.toString().trim()`** (no el `sel.toString()`) como cita de anclaje, y `text` = selección legible con los `\n` colapsados a espacio.
- Ligaduras: el worker normaliza Unicode (NFKC) por defecto (`disableNormalization: false`), de modo que "ﬁ" → "fi" se mantiene consistente entre captura y reapertura **mientras no cambien la versión de pdfjs ni la opción**. Riesgo: subir de versión de PDF.js puede cambiar la extracción de texto. Lo absorben los niveles 2/3 de `findMatch`.
- Guiones de corte de línea ("memo-\nria"): se quedan como "memo-ria" en la capa. Exacto/fuzzy funcionan, porque el texto es estable entre aperturas. No se intenta "desguionar" en v1.
- `endOfContent` (`pdf_viewer.css:782-793`): div auxiliar que PDF.js añade para estabilizar la selección. No tiene texto y no afecta al índice.

### 6.2 Algoritmo por página (sustituye a la sesión por URL dentro del visor)

1. Al cargar: leer los ítems con `sourceUrl === pdfUrl && Number.isInteger(page)` y agruparlos por `page`.
2. En `textlayerrendered {pageNumber}`: `root = pageView.textLayer.div`, índice `buildTextIndex(root)` y `findMatch(raw, {quote, prefix, suffix, hintStart, hintEnd})` para cada ítem de esa página, luego `rangeFromOffsets` → `paintRange`. **No hay `MAX_PASSES` ni gracia temporal:** una página no renderizada está `pending`, no `failed`. Un ítem solo pasa a `failed` cuando su página se renderizó y `findMatch` devolvió `null`.
3. Fallback opcional: si no aparece en `page`, probar `page±1`. Cubre selecciones que empiezan al final de una página, aunque v1 ya bloquea las selecciones que cruzan páginas (§6.3).
4. **Re-render:** con zoom o al salir de la ventana del `PDFPageViewBuffer`, PDF.js destruye y recrea la capa de texto, y los `Range` pintados quedan huérfanos. Hay que volver a anclar en cada `textlayerrendered` (es idempotente: `paintRange` hace `unpaint` primero) y limpiar los rangos de esa página en `pagerendered`/`pagesdestroy` si hace falta.
5. **Scroll al ítem:** `viewer.currentPageNumber = page` (o `linkService.goToPage`) fuerza el render. Cuando ese ítem queda anclado, `scrollToItem` (`content.js:866-874`, el padre del `startContainer` es un `<span>` de la capa) hace `scrollIntoView` dentro de `#viewerContainer`.
6. `CH_ANCHOR_STATUS` se emite con los mismos estados (`pending|anchored|failed`). El strip del panel funciona sin cambios.

### 6.3 Casos límite

- **Selección que cruza páginas:** `range.startContainer` y `endContainer` caen en `.textLayer` distintos. v1: rechazar con un mensaje en la toolbar ("Selecciona dentro de una sola página") o recortar a la primera página. Recomiendo rechazar, porque es más simple y no rompe el modelo de "una página por ítem".
- **Selecciones que se escapan de la capa:** arrastrar sobre el canvas o el margen. El `mouseup` sigue disparándose, pero el rango puede incluir nodos fuera de `.textLayer`. Validar que ambos extremos estén dentro de una `.textLayer`.
- **PDF escaneado o sin texto:** `getTextContent()` devuelve `items: []`, la capa queda vacía, no se puede seleccionar nada y nunca aparece la toolbar. Comportamiento aceptable: tras renderizar las primeras páginas, si todas tienen capa vacía, mostrar un aviso no bloqueante: "Este PDF no tiene texto seleccionable (¿escaneado?)". OCR queda fuera de alcance.
- **Mismo PDF desde URLs distintas** (con y sin query o redirecciones): coincidencia exacta por string, igual que en la web (#32 §3.3). Sin normalización en v1.
- **PDF modificado en el servidor:** los niveles 2/3 de `findMatch` lo absorben dentro de la página. Si cambió la paginación, pasa a `failed` (y opcionalmente se prueba `page±1`).
- **Fast-save (`contextForThisPage`)** funciona igual si se le pasa `pdfUrl`.

---

## 7. Plan de pruebas

### 7.1 Vitest (puras)

- `tests/037-storage-pdf-md.test.js`: `buildMd` emite `_Fuente: x.pdf, p. 12_` solo para ítems con `page`. La ida y vuelta `parseMd(buildMd(ctx))` conserva `source` + `page` + `comment` (con y sin comentario). Legado: `_Fuente: dominio.com_` sin página sigue dando solo `source`. Escape de `_` en el nombre. Un subtítulo con `page` no emite la línea.
- `tests/037-replace-md-preserves-page.test.js`: `replaceContextFromMarkdown` conserva `page`/`sourceTitle` (exacta + posicional). Usa el mock en memoria de `chrome.storage.local` ya existente.
- `tests/037-viewer-source.test.js`: `buildViewerUrl`/`parseViewerUrl` (ida y vuelta con `file://` y espacios/unicode), `pdfFilename` (`%20`, query, `file:///C:/…`), `isPdfItem`.
- `tests/037-pdf-anchor.test.js`: `findMatch` sobre un `raw` que imita la concatenación sin separadores de la capa (`"fin de líneasiguiente"`), con ligaduras ya normalizadas y una cita guionada.
- Guardarraíl de build (§3.3): `dist/assets/content.js-*.js` sin `import` de nivel superior (`it.skipIf(!existsSync(dist))`).

### 7.2 Playwright E2E `tests/e2e/037-pdf-highlight.spec.js`

- **Fixture local, no un sitio real:** `tests/e2e/fixtures/sample.pdf`. Un PDF pequeño de 3 páginas con texto conocido, generado una vez y versionado (p. ej. con la skill de PDF o reportlab), con un párrafo distinto en la página 2.
- **Servirlo por http:** `http.createServer` de Node en un puerto efímero, dentro de `test.beforeAll` (sin dependencias nuevas). Ojo: Playwright `page.route` **no intercepta** las peticiones hechas por páginas de extensión ni por el worker de PDF.js de forma fiable. Por eso un servidor real es la opción más segura.
- **Flujo:**
  1. `page.goto(chrome-extension://${extensionId}/src/viewer.html?file=${encodeURIComponent(httpUrl)}#page=2)`.
  2. Esperar `.page[data-page-number="2"] .textLayer span`.
  3. Arrastrar sobre el span objetivo con `page.mouse` (la técnica de `029-…spec.js:89-…`: rects de línea → `down/move/up`).
  4. Esperar `.ch-toolbar` → `⋯` → escribir el contexto → Enter.
  5. Assert en storage vía `worker.evaluate` (helper `findSavedItemId`, `029:30-41`): `sourceUrl === httpUrl`, `page === 2`, `rangePrefix != null`.
  6. `page.reload()`, ir a la página 2 y comprobar que está pintado. No hay clase DOM (CSS Highlight API), así que se usa `page.evaluate(() => CSS.highlights.get("ch-hl-idea")?.size)`, que en el visor (nuestra propia página) sí es accesible, o bien el estado `anchored` vía `CH_ANCHOR_STATUS`/hook de test.
  7. Panel: `chrome-extension://…/src/sidebar.html` → la Vista contiene `Fuente: sample.pdf, p. 2` y el encabezado del grupo dice `sample.pdf`.
  8. Click en el encabezado → se abre o enfoca la pestaña del visor con `#page=2` (patrón de `032-source-navigation.spec.js:163-…`).
- **Caso `file://`:** Playwright no puede activar "Permitir acceso a URLs de archivo" en un perfil temporal sin tocar `Preferences`. Por eso el E2E cubre solo el **aviso**: abrir `viewer.html?file=file:///…/sample.pdf` y verificar el mensaje de acceso a archivos desactivado. La carga real de `file://` queda como verificación manual.
- **Regresión del refactor:** los E2E existentes 029/031/032/034 deben seguir en verde tras extraer `capture/*` (son los que detectan un `content.js` roto).

---

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| Chunk compartido entre `content.js` y el visor rompe el content script (silencioso para Vitest) | Opción A + guardarraíl de build + E2E 029 en la Revisión. |
| Refactor de `content.js` (1292 líneas) introduce regresiones en web | Hacerlo como primer paso aislado; sin cambio de comportamiento; E2E existentes en verde antes de seguir. |
| `tabs.sendMessage` no llega a páginas de extensión | Fallback `runtime.sendMessage` + filtro por `tabId`; verificar en spike. |
| PDFs con login no cargan desde el origen de la extensión | `withCredentials: true`; si falla, mensaje + enlace al visor nativo. Fuera de alcance resolverlo del todo. |
| Cambio de versión de PDF.js altera la extracción de texto y rompe anclajes | Fijar la versión exacta; niveles 2/3 de `findMatch`; documentar en la spec. |
| Capa de texto recreada en zoom/scroll deja rangos huérfanos | Re-anclar en cada `textlayerrendered` (idempotente). |
| +~6 MB en `dist/` | Aceptable para una extensión; cargado solo en `viewer.html`. |
| Content script en el visor nativo marca ítems PDF como `failed` | Filtro `Number.isInteger(it.page)` en `startAnchorSession`. |
| HMR (`pnpm run dev`) con página extra en CRXJS | Verificar; si falla, documentar "solo build" para el visor. |

## 9. Preguntas abiertas para la spec

1. Opción de aislamiento de chunks: ¿A (plugin), validada antes con un spike, o B (copias manuales)?
2. Página en la Vista: ¿línea `_Fuente: x.pdf, p. N_` por nota (lo que da el Markdown tal cual) o badge propio de la Vista?
3. Selección que cruza páginas: ¿rechazar (recomendado) o recortar?
4. ¿Mostrar el botón "Abrir en Active Reading" solo con la heurística `.pdf` o siempre (con error amable si no es PDF)?
5. ¿Añadir `, p. N` al `Fuente:` de Anki?

## 10. Alcance v1 recomendado

**Dentro:**
- `viewer.html` con PDF.js 6.4.299 (`PDFViewer`), zoom básico e indicador de página.
- Entrada manual: botón en el panel + menú contextual del icono (`contextMenus`).
- http/https y `file://` con detección y aviso de acceso a archivos.
- Captura con la UI reutilizada (toolbar, popup, fast-save, comentario, anidar) dentro de una sola página.
- Persistencia `page` + `sourceTitle` + `range*` por página; repintado en `textlayerrendered`.
- Strip de anchor-status, Vista agrupada con etiqueta = nombre de archivo, ir al origen → visor en la página y el ítem.
- `buildMd`/`parseMd` con `_Fuente: x.pdf, p. N_` como ida y vuelta.
- Vitest + E2E `037` + guardarraíl de build.

**Fuera de alcance:**
- Redirección automática de PDFs, arrastrar y soltar, selector de archivos, PDFs `blob:`/`data:` y adjuntos de Gmail/Drive.
- OCR o PDFs escaneados (solo aviso), PDFs con contraseña (solo mensaje), formularios XFA y scripting.
- Selecciones multipágina.
- Anotaciones nativas de PDF (escribir en el archivo) y descarga del PDF con resaltados.
- Búsqueda en el PDF (`PDFFindController`), miniaturas, esquema/índice e impresión.
- Normalización de URLs del PDF y deduplicación entre copias del mismo documento.
- Retirar `content-storage.js` (habilitado por la opción A, pero en otra feature).

## 11. Fuentes consultadas

- Código local: `vite-extension/src/{content.js,anchor.js,storage.js,content-storage.js,background.js}`, `src/sidebar/{vista.js,source-nav.js,anchor-status.js,export-formats.js}`, `manifest.json`, `vite.config.js`, `dist/manifest.json`, `tests/**`.
- Tarball `pdfjs-dist@6.4.299` inspeccionado en el scratchpad (no instalado en el proyecto): `types/src/display/{api,text_layer}.d.ts`, `types/web/pdf_viewer.d.ts`, `build/pdf.mjs` (`TextLayer`, `isValidFetchUrl`, `PDFFetchStream`/`PDFNetworkStream`), `web/pdf_viewer.css`, contenido de `wasm/`.
- `pnpm view pdfjs-dist` (versiones y fechas).
- Docs Chrome (sin verificar en esta sesión, a confirmar en el spike): CSP por defecto de MV3 en `extension_pages`, `chrome.extension.isAllowedFileSchemeAccess`, `chrome.runtime.getContexts` (116+), `chrome.contextMenus` con `contexts: ["action"]`, `tabs.sendMessage` (solo content scripts).
- CRXJS: páginas HTML extra vía `build.rollupOptions.input`.
- Research previo: `docs/research_highlight_source_navigation.md`, `docs/research_highlight_persistence_robustness.md` (anclaje; incluye la referencia a `hypothesis/client` `pdf.ts`, el precedente de anclaje en capas de texto de PDF.js).
