# Test plan — Feature 37: `pdf_highlight`

Spec: `specs/037-spec-pdf_highlight.json` · Research: `docs/research_pdf_highlight.md`

Regla: ningún test existente se modifica para que pase. Si uno falla, se
investiga y se informa al usuario antes de tocarlo.

## 0. Regresión del refactor (`content.js` → `src/capture/*`)

Antes de escribir código de PDF:

| Check | Comando | Esperado |
|---|---|---|
| Unit | `pnpm run test` | Igual que antes del refactor (verde). |
| Build | `pnpm run build` | Sin errores; `dist/assets/content.js-*.js` sigue siendo un IIFE sin `import`. |
| E2E web | `pnpm exec playwright test 029 031 032 034` | Mismo resultado que en `main` (los fallos preexistentes documentados en #35 se toleran solo si también fallan sin el refactor). |

## 1. Vitest (`tests/037-*.test.js`)

### 1.1 `037-storage-pdf-md.test.js` — contrato Markdown
- `buildMd` de un contexto con un ítem de PDF (`page: 12`, `source: "paper.pdf"`)
  emite `🟡 texto\n_Fuente: paper.pdf, p. 12_`.
- Con comentario: la línea `_Fuente:_` va después del bloque `> comentario`.
- Subtítulo (`category: "title"`) con `page`: **no** emite la línea.
- Contexto sin ítems de PDF: salida idéntica byte a byte a la actual.
- Nombre con guiones bajos `my_paper_v2.pdf` → `my\_paper\_v2.pdf` en el
  Markdown; `parseMd` lo devuelve como `my_paper_v2.pdf`.
- Nombre con comas `a, b.pdf` + `p. 3` → `source: "a, b.pdf"`, `page: 3`.
- Ida y vuelta `parseMd(buildMd(ctx))` conserva texto, categoría, comentario,
  `source`, `page`.
- Legado: `_Fuente: ejemplo.com_` → `source: "ejemplo.com"`, sin `page`.

### 1.2 `037-replace-md-preserves-page.test.js`
Con el mock en memoria de `chrome.storage.local`:
- Coincidencia exacta: editar otra nota y guardar desde Markdown conserva
  `page`, `sourceTitle`, `sourceUrl` y `range*` del ítem de PDF.
- Coincidencia posicional (texto editado): conserva `sourceTitle` y `sourceUrl`.
- Cambiar `p. 12` → `p. 13` en la línea `_Fuente:_` actualiza `page` a 13.

### 1.3 `037-pdf-source-helpers.test.js`
- `isPdfItem`: true solo con `page` entero ≥ 1.
- `pdfFilename`: `https://x.org/a/b/paper.pdf?dl=1` → `paper.pdf`;
  `file:///Users/me/Mis%20Docs/año.pdf` → `año.pdf`; URL sin ruta → fallback no vacío.
- `buildViewerUrl` / `parseViewerUrl`: ida y vuelta con http, file://, espacios,
  unicode, `page` e `itemId`; el hash de la URL del PDF se descarta.
- `addItem` acepta `page`/`sourceTitle` válidos y descarta `page` inválido
  (0, -1, 2.5, "3").

### 1.4 `037-pdf-anchor.test.js`
- `findMatch` encuentra una cita sobre texto concatenado sin separadores entre
  líneas (`"…fin de líneasiguiente…"`) con prefijo/sufijo y con offsets.
- Cita con guión de corte (`memo-ria`) se encuentra.

### 1.5 `037-content-bundle-guard.test.js`
- Si existe `dist/`, el archivo de `content_scripts[0].js[0]` del manifest
  construido no contiene `import`/`export` de nivel superior ni `import(`.
  (`skipIf(!existsSync(dist))`.)

## 2. Playwright E2E (`tests/e2e/037-pdf-highlight.spec.js`)

Fixture: `tests/e2e/fixtures/sample.pdf` (3 páginas, texto conocido distinto
en cada una), servido por `http.createServer` de Node en un puerto efímero.

1. **Captura + persistencia**
   - Abrir `chrome-extension://<id>/src/viewer.html?file=<http url>#page=2`.
   - Esperar la capa de texto de la página 2.
   - Arrastrar con `page.mouse` sobre una frase de la página 2 →
     aparece `.ch-toolbar`.
   - `⋯` → escribir contexto nuevo → Enter.
   - Storage: ítem con `sourceUrl === <http url>`, `page === 2`,
     `sourceTitle === "sample.pdf"`, `rangePrefix != null`.
2. **Repintado**: `page.reload()` → la página 2 vuelve a tener el rango pintado
   (`CSS.highlights.get("ch-hl-idea").size === 1`).
3. **Vista**: abrir `sidebar.html` → encabezado de grupo `sample.pdf`, texto
   `Fuente: sample.pdf, p. 2`.
4. **Ir al origen**: click en el encabezado → la pestaña del visor se enfoca
   (o se abre una con `#page=2`); no se abre la URL cruda del PDF.
5. **Selección multipágina**: arrastrar desde la página 1 hasta la 2 →
   la toolbar muestra "Selecciona texto dentro de una sola página" y no se
   guarda nada.
6. **file:// sin permiso**: abrir `viewer.html?file=file:///…/sample.pdf` →
   aviso de acceso a archivos visible, sin errores en consola.
7. **Error de carga**: `?file=<http url>/no-existe.pdf` → estado de error con
   enlace "Abrir en el visor de Chrome".

## 3. Verificación manual (Chrome real)

- Cargar `dist/`, abrir un PDF web (p. ej. un paper de arXiv) → el botón
  "Abrir en Active Reading" aparece en el panel; también desde el menú
  contextual del icono.
- Activar "Permitir acceso a URLs de archivo", abrir un PDF local, resaltar,
  recargar → repintado.
- Zoom +/−: los resaltados se mantienen.
- Abrir el mismo PDF en el visor nativo de Chrome con el panel abierto → los
  ítems de PDF no aparecen como "no encontrado".
- Export `.md` y Anki de un contexto con ítems de PDF.

## 4. Cierre

`./init.sh`, `pnpm run build`, `pnpm run test`, `pnpm run test:e2e` en verde
(salvo fallos preexistentes documentados ajenos a esta feature).
