# Plan de verificación — Feature 27: `highlight_persistence_robustness`

**Spec:** `specs/027-spec-highlight_persistence_robustness.json` (approved 2026-07-03)
**Research:** `docs/research_highlight_persistence_robustness.md` (§9 es el borrador de este plan)
**Contexto:** el proyecto no tiene tests automatizados; la verificación es build + manual en Chrome.

---

## 0. Gate de build (obligatorio, primero)

```bash
./init.sh                      # desde la raíz — todo verde
cd vite-extension && pnpm run build   # sin errores; resuelve approx-string-match y src/anchor.js
```

Cargar `vite-extension/dist/` como extensión descomprimida en `chrome://extensions`
(Developer mode). Si ya estaba cargada, **pulsar Recargar** en la tarjeta de la extensión.
Cero errores en la consola del service worker y en la de cualquier página de prueba.

---

## 1. Escenarios manuales

> Convención: "consola de página" = DevTools de la pestaña; "panel" = side panel de la extensión.
> Cada escenario indica los criterios de aceptación (CA) de la spec que cubre.

### V1 — Recarga en página estática (CA 6, 7, 17)

1. Abrir un artículo estable (p. ej. un artículo de Wikipedia).
2. Guardar un resaltado de una frase simple (dentro de un solo párrafo, sin links).
3. Recargar con F5.

**Esperado:** el resaltado reaparece con el color pastel de su categoría.
En Elements **no existe ningún** `<mark class="ch-hl">`. En la consola de página,
`CSS.highlights.get('ch-hl-<categoría>')` devuelve un `Highlight` con `size >= 1`.

### V2 — Selección cross-node (CA 3, 6)

1. Seleccionar y guardar un texto que **cruce un `<a>` o `<em>`** (p. ej. una frase de Wikipedia
   que contenga un enlace interno).
2. Recargar.

**Esperado:** el resaltado reaparece pintado de forma continua sobre el texto completo,
incluido el enlace. (Hoy este caso se pierde para siempre — es la ganancia de recall clave.)

### V3 — Navegación SPA / pushState (CA 9, 11, 12)

1. En una SPA real (p. ej. GitHub navegando entre archivos de un repo), guardar un resaltado
   en una ruta A.
2. Navegar a otra ruta B **sin recarga completa** (navegación interna).
3. Volver a A con la navegación interna o el botón atrás.

**Esperado:** el resaltado reaparece en A al volver. En B (sin ítems) no queda observer activo.
**Sub-verificación obligatoria (plan B de la spec):** en la consola de página, con el contexto
del content script seleccionado (DevTools → pestaña Console → dropdown de contexto), comprobar
que `window.navigation` existe y que `currententrychange` dispara al navegar. Si NO dispara en
el isolated world, activar el plan B (`chrome.webNavigation` en background) antes de dar por
buena la feature, y documentarlo en `progress/current.md`.

### V4 — Contenido lazy-load / scroll infinito (CA 9, 10, 11, 14)

1. En una página con carga perezosa (feed o comentarios paginados), guardar un resaltado varias
   pantallas abajo.
2. Recargar y **no** hacer scroll.
3. Esperar >5 s; abrir el panel: el ítem aparece como «no encontrado en la página» (soft-fail).
4. Hacer scroll hasta que el texto se renderice.

**Esperado:** al llegar el contenido, el resaltado se pinta (anclaje tardío) y el badge del
panel pasa de «no encontrado» a anclado sin recargar nada.

### V5 — Tolerancia fuzzy ante texto cambiado (CA 3, 4, 5)

Usar un HTML local controlado (`python3 -m http.server` en un directorio con un `test.html`).

1. Guardar un resaltado sobre una frase de ~80 caracteres. Recargar → reaparece (nivel 0/1).
2. Editar `test.html`: cambiar pocos caracteres dentro de la cita (una palabra, un `&nbsp;`,
   comillas tipográficas) — **< 25 %** del texto. Recargar.
   **Esperado:** el resaltado reaparece (nivel 2–3).
3. Editar de nuevo: cambiar **> 25 %** de la cita o borrar la frase. Recargar.
   **Esperado:** NO se pinta nada (mejor ausente que mal colocado); el ítem pasa a `failed`
   y el panel muestra «no encontrado en la página».
4. Guardar un resaltado de < 5 caracteres, borrarlo del HTML, recargar.
   **Esperado:** nunca ancla por fuzzy; estado `failed` sin errores.

### V6 — Badge «no encontrado en la página» (CA 13, 15)

1. Con el estado `failed` del escenario V5.3, abrir el panel con esa pestaña activa.
   **Esperado:** la franja de estado lista ese ítem con «no encontrado en la página»;
   los ítems anclados no aparecen en la franja.
2. Cambiar a una pestaña sin content script (`chrome://extensions`).
   **Esperado:** estado «página no abierta» (franja oculta/atenuada); **cero errores** en la
   consola del panel por el `sendMessage` rechazado.
3. Volver a la pestaña original.
   **Esperado:** el badge se refresca (`tabs.onActivated`).

### V7 — Ítems legados sin `rangeStart` (CA 1, 2, 16)

1. En DevTools del panel (Application → Storage → `chrome.storage.local`, clave
   `contextHighlighter`) o vía consola del service worker: borrar `rangeStart`/`rangeEnd` de un
   ítem existente y re-guardar el objeto.
2. Recargar la página fuente.

**Esperado:** el ítem ancla igualmente por niveles 1–3 (compatibilidad sin migración).
Un ítem con `rangePrefix == null` se excluye sin lanzar errores.

### V8 — Regresiones del flujo existente (CA 1, 6, 8, 12, 16)

- (a) **Pintado en vivo al guardar**: mismos colores pastel por categoría que hoy
  (comparación visual contra una captura previa o `content.css` en git).
- (b) **`CH_REMOVE_HL`**: enviar desde la consola del service worker
  `chrome.tabs.sendMessage(<tabId>, {type:'CH_REMOVE_HL', itemId:'<id>'})` → el rango se
  despinta y el ítem sale del estado de sesión.
- (c) **Capturas con listas**: resaltar una `<ul>`, guardar, verificar en storage que el ítem
  tiene `rangeText` (fix del bug de `content-storage.js`); recargar → re-ancla por el texto
  crudo, no por el Markdown.
- (d) **URL exacta**: abrir la misma página con `#fragment` o `?query` distinta →
  **no** se re-aplica (comportamiento correcto por requisito, no bug).
- (e) **Vista/Editor/export**: el preview Markdown, el editor Monaco, el export `.md` y el
  rename siguen funcionando (los campos nuevos son invisibles a `buildMd`/`parseMd`).

### V9 — Consola y rendimiento (CA 10)

- En todos los escenarios: cero errores no capturados en consola de página y de panel.
- En una página con ticker/reloj (mutaciones frecuentes) y **sin** ítems pendientes:
  no hay re-escaneos perpetuos — el observer está desconectado (verificable con un
  `console.debug` temporal en la pasada o con el panel Performance).
- En una URL sin ítems guardados: no se conecta ningún observer.

---

## 2. Criterios de cierre

- Gate de build (§0) verde.
- V1–V9 ejecutados; V3 incluye la sub-verificación de la Navigation API (o plan B activado y
  documentado).
- Cualquier desviación se registra en `progress/current.md`; si algo bloquea, la feature se
  marca `blocked` en `feature_list.json` (max 3 ciclos de retry según reglas del harness).
