# Test plan — Feature 32: `highlight_source_navigation`

Cubre `specs/032-spec-highlight_source_navigation.json`. Toca el DOM de la Vista
y añade mensajería nueva panel↔content script + primer uso de `chrome.tabs.create`/
`update` en el repo → requiere Vitest (lógica pura) **y** Playwright (comportamiento
real de pestañas/anclaje), por regla dura de `CLAUDE.md`.

## 1. Vitest — `032-vista-grouping.test.js`

Lógica pura a extraer/testear: la función que particiona `ctx.items` en tramos
consecutivos por `sourceUrl` (usada por `renderVista` antes de decidir qué
tramos llevan encabezado de grupo).

- Tramo de 3 ítems seguidos con el mismo `sourceUrl` no vacío → un solo grupo,
  un solo encabezado.
- Ítems con `sourceUrl` distintos intercalados → tantos grupos como cambios de
  `sourceUrl`, en el mismo orden que `ctx.items`.
- Ítems con `sourceUrl: ""` (creados desde `replaceContextFromMarkdown`) → no
  generan grupo/encabezado; se agrupan aparte sin ícono.
- Un `ctx.items` vacío o `ctx` nulo → sin grupos, camino ya cubierto por el
  `emptyState()` existente (no debe regresionar `mountEl.appendChild(emptyState())`).
- `buildMd(ctx)` y `parseMd(md)` producen exactamente la misma salida antes y
  después del cambio para los contextos de fixture ya usados en
  `030-editor-vista-dirty.test.js`/`031-storage-comment.test.js` (snapshot de
  regresión — el contrato Markdown no debe moverse ni un carácter).

## 2. Vitest — mensaje `CH_SCROLL_TO_ITEM` (si la lógica de decisión vive en un módulo puro)

Si el Implementer extrae a un módulo testable la decisión "¿pestaña existente
o pestaña nueva?" (p. ej. `sidebar/source-nav.js` con una función que recibe
el resultado de `chrome.tabs.query` y devuelve la acción a tomar), testear con
el mock de `chrome.storage.local` ya usado en el resto de la suite:

- `chrome.tabs.query` devuelve un tab → la función decide "focus" (tabId +
  windowId), no "create".
- `chrome.tabs.query` devuelve `[]` → la función decide "create" con la
  `sourceUrl` exacta del ítem.
- La función nunca normaliza la URL (sin trailing slash, sin quitar query
  params) — mismatch de string exacto se trata igual que "no existe".

Si en cambio esa decisión queda inline en `sidebar.js` sin extraerse a un
módulo puro, esta sección se cubre por el E2E de la sección 3 en su lugar —
está bien, no es obligatorio forzar una extracción solo para testear.

## 3. Playwright E2E — `032-source-navigation.spec.js`

Reusa el patrón de `tests/e2e/029-highlight-reload-real-sites.spec.js` +
`tests/e2e/fixtures/test-sites.js` (arrastre de mouse real para seleccionar,
`CH_GET_ANCHOR_STATUS` para confirmar anclaje) — el content script solo
reacciona a un `mouseup` nativo, no a la Selection API vía script.

**Caso A — grupo e ícono visibles:**
1. Capturar dos resaltados en el mismo sitio de `TEST_SITES` bajo el mismo
   contexto (dos categorías distintas está bien).
2. Abrir el side panel, ir a Vista.
3. Verificar que ambas notas aparecen bajo **un solo** encabezado de grupo (un
   solo botón ícono-only visible para ese `sourceUrl`, no dos).
4. Verificar que el texto visible del encabezado **no** contiene la URL ni el
   hostname como texto de nodo (permitido solo en `aria-label`/`title`).

**Caso B — click con pestaña ya abierta (focus, no duplicado):**
1. Con la pestaña del sitio de prueba todavía abierta, click en el ícono de
   grupo desde el side panel.
2. Verificar vía `context.pages()`/`chrome.tabs.query` (desde el service
   worker, como en `029-...spec.js`) que **no** se creó una pestaña nueva —
   sigue habiendo una sola pestaña con esa URL.
3. Verificar que esa pestaña queda activa/enfocada.
4. Verificar el scroll: el resaltado objetivo queda dentro del viewport
   (`boundingBox()` del rango pintado, o al menos `window.scrollY` cambió
   hacia la posición esperada) — tolerar el mismo `ANCHOR_TIMEOUT_MS` de
   20s que usa el feature 29, ya que reutiliza el mismo pipeline de anclaje.

**Caso C — click con pestaña cerrada (crea una nueva + scrollea tras
reanclar):**
1. Cerrar la pestaña del sitio de prueba.
2. Click en el ícono de grupo desde el side panel.
3. Verificar que se abre una pestaña nueva con esa `sourceUrl` exacta.
4. Poll `CH_GET_ANCHOR_STATUS` (igual que `waitForAnchorStatus` en el spec 29)
   hasta `'anchored'`, y verificar que el scroll ocurrió después de ese punto,
   no antes (no debe intentar scrollear a un rango que todavía no existe).

**Caso D — degradación con anclaje fallido:**
1. Simular (o reusar un fixture local en vez de un sitio real, ya que forzar
   un `'failed'` en un sitio real de terceros no es reproducible de forma
   fiable) un ítem cuyo `rangePrefix`/`rangeSuffix` ya no matchean el DOM
   actual de la página.
2. Click en su ícono de grupo.
3. Verificar que la pestaña igual se abre/enfoca y que **no** aparece ningún
   error visible en el side panel (sin excepción no capturada, sin modal de
   error) — el scroll simplemente no ocurre.

## 4. Regresión manual (además de lo automatizado, no en su reemplazo)

- Cargar `dist/` sin empaquetar en `chrome://extensions`, capturar en 2-3
  sitios reales distintos bajo el mismo contexto, confirmar visualmente que
  los grupos y el ícono se ven bien en modo claro y oscuro.
- Confirmar que el modo de edición de documento completo (textarea) sigue
  mostrando el Markdown crudo sin íconos ni cambios.
- Confirmar que exportar `.md` desde un contexto con varios grupos produce
  exactamente el mismo archivo que antes de este cambio.

## 5. Criterios de salida

Todos los ítems de `acceptance_criteria` en
`specs/032-spec-highlight_source_navigation.json` verificados; `pnpm run
test`, `pnpm run test:e2e` y `pnpm run build` en verde; `init.sh` en verde.
