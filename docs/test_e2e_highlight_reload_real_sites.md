# Test plan: E2E highlight → reload → re-highlight en sitios reales (feature 29)

Esta feature es puramente de test (no toca `src/`), así que su "cobertura" es el propio spec
E2E que se está construyendo — no hay lógica de producto adicional que testear con Vitest. Este
documento define qué debe demostrar el spec y cómo verificarlo manualmente si falla o si Chrome
cambia de comportamiento.

## Cobertura E2E (Playwright)

`tests/e2e/029-highlight-reload-real-sites.spec.js` (`pnpm run test:e2e`) es la única cobertura
automatizada de esta feature. Requiere:
- `pnpm run build` completado (el script `test:e2e` ya lo encadena).
- Conexión a internet real (sitio externo, sin mocking de red).
- Un display real (headed, ver `fixtures.js` — old headless no carga extensiones).

## Precondiciones
- `tests/e2e/fixtures/test-sites.js` existe con al menos la entrada de Houston Methodist.
- Ningún contexto previo en `chrome.storage.local` referencia esa URL (contexto nuevo desde cero
  — si el perfil persistente de una corrida previa quedó con datos, limpiar o usar un contexto
  fresco de Playwright).

## Casos de prueba

### TC-01 — El párrafo objetivo existe y es seleccionable
1. Navegar a la URL de Houston Methodist.
2. `page.evaluate` sobre `articleSelector` (`.horizontal-text.txt-container p`).
**Esperado:** Devuelve un nodo con texto no vacío (~350+ caracteres del párrafo introductorio
real, no un párrafo de contacto/teléfono).

### TC-02 — Selección real de mouse dispara la toolbar de captura
1. Obtener el bounding box del párrafo.
2. `page.mouse.move` al inicio → `mouse.down()` → `mouse.move` al final → `mouse.up()`.
**Esperado:** Aparece `.ch-toolbar` (los 4 swatches de categoría + botón "⋯"). Si no aparece,
sospechar que el drag no cruzó suficiente texto o que un banner de cookies interceptó el evento
— inspeccionar con una corrida headed manual antes de tocar el spec.

### TC-03 — Clic en swatch "idea" abre el popup completo (primera visita a la URL)
1. Clic en el swatch `data-cat="idea"`.
**Esperado:** Como no hay contexto previo para esta URL (`contextForThisPage` devuelve null), se
abre el popup completo (`.ch-pop`), no un guardado directo. La categoría queda preseleccionada en
"Idea".

### TC-04 — Guardar crea el contexto y el item
1. Escribir un nombre nuevo en el combobox de contexto.
2. Confirmar con Enter (o clic en "Guardar").
**Esperado:** El popup se cierra; `chrome.storage.local` (verificable vía el service worker)
contiene un nuevo contexto con un item cuyo `sourceUrl` es la URL exacta y `category: "idea"`.

### TC-05 — Tras recargar, el item se re-ancla
1. `page.reload()`.
2. Poll de `CH_GET_ANCHOR_STATUS` (vía `chrome.tabs.sendMessage` desde el service worker) hasta
   ver `statuses[itemId] === 'anchored'` o agotar el timeout explícito del helper.
**Esperado:** El estado llega a `'anchored'` dentro de la ventana esperada (acorde a
`GRACE_MS`/`DEBOUNCE_MS`/`MAX_PASSES` de `content.js` — no debería tardar más de unos pocos
segundos en una página estática como esta).

### TC-06 — El test falla limpiamente si nunca ancla
Simular (manualmente, no como parte del spec en verde) un caso donde el texto ya no existe en la
página, y confirmar que el helper de polling produce un fallo de test claro con timeout explícito,
no un colgado indefinido ni un falso verde.
**Esperado:** Mensaje de fallo legible indicando que el estado nunca llegó a `'anchored'`.

### TC-07 — No hay regresión en el resto de la suite E2E
1. Correr `pnpm run test:e2e` completo (incluye `028-export-format-selector.spec.js`).
**Esperado:** Ambos specs pasan; el nuevo spec no deja estado global (contexto persistente,
storage) que contamine el otro.

### TC-08 — pnpm run build sin errores
Correr `cd vite-extension && pnpm run build`.
**Esperado:** Sin errores de compilación.

### TC-09 — init.sh pasa
Correr `./init.sh` desde la raíz.
**Esperado:** Todos los checks `[OK]`.

## Actualización 2026-07-29 — 3 sitios más añadidos

`tests/e2e/fixtures/test-sites.js` ahora tiene 4 entradas (Houston Methodist, Medium, AnkiWeb
docs, Wikipedia es) y el spec corre un test por entrada (loop, no un test fijo). Los 9 specs E2E
del proyecto (5 de la feature 28 + 4 de esta) pasan juntos. TC-01 a TC-05 aplican a cada sitio.

Tres bugs reales encontrados y corregidos durante esta ampliación (no eran fallos del feature en
sí, sino de cómo el test interactúa con páginas reales — ver detalle en el research doc y en
memoria de sesión):
- El hover de `.ch-toolbar-swatch` (`transform: scale(1.2)`) rompía el chequeo de estabilidad de
  Playwright antes de un click — se resolvió con `{force: true}` en ese click puntual.
- Houston Methodist específicamente: escribir un valor largo (~40+ caracteres) en el combobox de
  nombre de contexto hacía que algún script de la página (probablemente CMS/personalización)
  vaciara `document.body`, arrastrando el popup con él. Se usa un nombre corto y genérico en vez
  del label completo del sitio.
- Wikipedia: el infobox flotante hace que el `<p>` de la introducción reporte un
  `getBoundingClientRect()` que cubre espacio que el texto no ocupa realmente (el texto fluye
  alrededor del infobox) — arrastrar hasta esa esquina inferior-derecha seleccionaba texto del
  infobox, no del párrafo. Se corrigió usando `Range.getClientRects()` sobre el contenido del
  párrafo para obtener la geometría real línea por línea.

## Riesgos conocidos (no son bugs a corregir, son límites aceptados del enfoque)
- Dependencia de un sitio externo real: si Houston Methodist cambia su plantilla, bloquea
  automatización, o el artículo se edita/retira, el test puede fallar por razones ajenas a la
  extensión. Documentado también en la investigación (`docs/research_e2e_highlight_reload_real_sites.md`).
- Un banner de cookies/consentimiento no observado durante la investigación (fetch estático, sin
  JS) podría aparecer en una carga real con navegador y bloquear la selección — si TC-02 falla en
  la primera corrida real, este es el primer sospechoso a revisar antes de cambiar el spec.
