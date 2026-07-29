# Test plan: Fix buffer obsoleto de Editor/Vista-edit ante capturas externas (feature 30)

## Alcance

Cubre `specs/030-spec-editor_stale_buffer_cross_page.json`: el listener
`chrome.storage.onChanged` (sidebar.js) debe invalidar/remontar el modo activo
(Editor Monaco o Vista-edit) cuando llega una captura externa (content script
de otra página/pestaña) para el contexto abierto, **solo si** ese modo no
tiene cambios sin guardar pendientes. No se toca `storage.js`, `buildMd` ni
`parseMd`.

## Cobertura automatizada (Vitest)

Los métodos nuevos `editor.isDirty(ctxId)` y `docEditor.isDirty(ctxId)` son
lógica pura de estado (sin chrome.storage real) y deben cubrirse con Vitest:

- **[Vitest]** `isDirty` retorna `false` cuando el contexto no está montado
  (`currentCtxId !== ctxId`).
- **[Vitest]** `isDirty` retorna `false` justo después de `mount()` sin que el
  usuario haya tipeado nada.
- **[Vitest]** `isDirty` retorna `true` tras simular un cambio de contenido
  (Editor: `onDidChangeModelContent` / Vista-edit: evento `input`) antes de
  que el debounce de guardado complete.
- **[Vitest]** `isDirty` vuelve a `false` después de que el guardado
  debounced/flush completa (`tabDirtyEl.hidden = true` en Editor;
  `dirtySignalled = false` tras `save()` en Vista-edit).

El resto (integración real con `chrome.storage.onChanged`, Monaco real,
side panel real) requiere verificación manual en Chrome — Monaco y el
runtime de `chrome.storage` quedan fuera de alcance de Vitest por convención
del proyecto.

## Cobertura E2E (Playwright)

`tests/e2e/030-editor-live-refresh.spec.js` (`pnpm run test:e2e`) cierra la
brecha real que Vitest no puede: carga la extensión construida en `dist/` en
un Chromium persistente, siembra un contexto fijo vía `chrome.storage.local`,
abre `sidebar.html` real y entra al tab Editor. Simula la captura "externa"
llamando `chrome.storage.local.set()` desde el service worker de la propia
extensión (mismo efecto que el `addItem()` de `content-storage.js` desde otra
pestaña/página, sin depender de un sitio real para mantenerlo rápido y
determinista — ver el precedente en `tests/e2e/029-highlight-reload-real-sites.spec.js`
para cuándo SÍ conviene un sitio real).

- **TC-01/TC-02 (repro original, combinados en un test):** Editor limpio +
  dos capturas externas sucesivas → ambas aparecen en el buffer de Monaco sin
  cambiar de pestaña ni recargar.
- **TC-03 (Editor dirty, en un test separado):** el usuario tipea en Monaco,
  llega una captura externa antes de que el usuario suelte el teclado → el
  contenido tipeado no se pierde ni se sobreescribe.

**Hallazgo durante la implementación del E2E:** el modo `"vista-edit"`
(textarea inline documentado en `specs/018-spec-preview_doc_editor.json`) ya
no tiene ningún punto de entrada en la UI actual — `switchMode("vista-edit")`
no se invoca desde ningún botón/handler en `sidebar.js` (el botón lápiz que
lo activaba, descrito en la spec 018, ya no existe en `renderHeader`; grep
confirmado: 0 llamadas a `switchMode("vista-edit")` en todo `src/`). Es código
muerto alcanzable solo si algo externo llamara a `switchMode` directamente.
Por eso:
- TC-04 y TC-05 (Vista-edit) de este plan **no se pueden verificar
  manualmente hoy** — no hay manera de llegar a ese modo desde la UI.
- `docEditor.isDirty()` y la rama Vista-edit del fix en `sidebar.js` siguen
  cubiertas a nivel unitario (Vitest, arriba) pero no tienen cobertura E2E,
  precisamente porque no son alcanzables por un usuario real en este momento.
- Esto no es una regresión de esta feature: la rama de código ya existía
  (mode `"vista-edit"` sigue siendo un valor válido de `mode` en todo
  `sidebar.js`), solo su gatillo de UI desapareció en algún momento anterior.
  Vale la pena registrarlo como hallazgo para una futura decisión de producto
  (restaurar el botón, o eliminar la rama muerta).

## Precondiciones
- `pnpm run build` completado sin errores.
- Extensión cargada en `chrome://extensions` desde `vite-extension/dist/`.
- Un Contexto existente (llamémoslo "Prueba Cross-Page") con al menos 1 ítem.
- Dos páginas reales distintas para capturar texto (ej. dos artículos de
  Wikipedia en dominios/rutas distintas), navegables en la MISMA pestaña de
  Chrome (repro confirmado por el usuario: navegación secuencial, no dos
  pestañas simultáneas).

## Casos de prueba

### TC-01 — Editor limpio refleja captura externa en vivo (caso reportado) [E2E]
1. Abrir el side panel, seleccionar "Prueba Cross-Page", cambiar a modo
   Editor. No tipear nada en Monaco.
2. En la misma pestaña de Chrome, navegar a la página A, resaltar texto y
   guardarlo en "Prueba Cross-Page".
3. Sin cambiar de pestaña Vista/Editor ni recargar el side panel, verificar
   el contenido del Editor.
**Esperado:** El Editor muestra la nota de A automáticamente (Markdown
actualizado, incluye el nuevo ítem).

### TC-02 — Segunda captura externa desde otra página también se refleja [E2E]
1. Continuando desde TC-01 (Editor sigue limpio, sin tipear), navegar en la
   misma pestaña a la página B, resaltar otro texto y guardarlo en el mismo
   contexto.
**Esperado:** El Editor ahora muestra AMBAS notas (A y B), sin necesidad de
cambiar de pestaña ni recargar. Este es el bug original reportado por el
usuario ("el editor solo muestra la información del último sitio visitado").

### TC-03 — Editor con cambios sin guardar NO se pisa [E2E]
1. Seleccionar "Prueba Cross-Page", modo Editor, escribir texto nuevo en
   Monaco (sin esperar los 350ms de debounce, o inmediatamente después de
   tipear).
2. Rápidamente, navegar a la página A y guardar una captura en el mismo
   contexto.
**Esperado:** El texto que el usuario estaba escribiendo en Monaco NO se
pierde ni se sobreescribe. La captura externa queda pendiente de reflejarse
(comportamiento documentado como fuera de alcance: se sincronizará en el
próximo flush/invalidate, ej. al cambiar de contexto o guardar manualmente).

### TC-04 — Vista-edit limpio refleja captura externa en vivo [⚠️ no verificable hoy]
1. Seleccionar "Prueba Cross-Page", entrar a Vista → modo edición inline
   (vista-edit). No tipear nada.
2. Navegar a la página A en la misma pestaña, capturar y guardar en el mismo
   contexto.
**Esperado:** El textarea de Vista-edit se actualiza automáticamente para
incluir la nota nueva.
**Nota:** no hay forma de llegar a modo Vista-edit desde la UI actual (ver
"Hallazgo" arriba) — este caso queda documentado para el día que se restaure
un punto de entrada, pero hoy no es ejecutable ni manual ni vía E2E.

### TC-05 — Vista-edit con cambios sin guardar NO se pisa [⚠️ no verificable hoy]
1. En vista-edit, escribir en el textarea sin que dispare el guardado
   (blur/debounce de 400ms).
2. Guardar una captura externa desde otra página en el mismo contexto.
**Esperado:** El texto que el usuario está escribiendo en el textarea no se
pierde ni se sobreescribe.
**Nota:** mismo bloqueo que TC-04 — sin punto de entrada a Vista-edit, no
ejecutable hoy.

### TC-06 — Modo Vista (preview) sin regresión
1. Con el panel en modo Vista (no vista-edit), guardar una captura externa.
**Esperado:** Sigue funcionando como hoy — el preview se refresca vía
`render()` (comportamiento preexistente, no debe romperse).

### TC-07 — Contador de ítems se actualiza aunque no se remonte
1. Repetir TC-03 (Editor dirty + captura externa).
2. Observar el contador "N ítems · ..." en el header.
**Esperado:** El contador refleja el nuevo total de ítems persistidos aunque
el Editor no se haya remontado (no debe quedar desactualizado).

### TC-08 — Cambiar de contexto tras una captura externa ignorada (dirty)
1. Repetir TC-03 (captura externa mientras Editor está dirty, queda
   "pendiente").
2. Cambiar de contexto en el rail y volver al contexto original.
**Esperado:** Al re-seleccionar el contexto, el Editor muestra el estado
persistido completo (incluyendo la captura externa que había quedado
pendiente) — el flush/invalidate al cambiar de contexto reconcilia todo,
sin pérdida de la captura externa a mediano plazo.

### TC-09 — No hay doble-render ni parpadeo en modo Vista
1. Con el panel en modo Vista, guardar 2-3 capturas externas seguidas.
**Esperado:** El preview se actualiza limpiamente cada vez, sin
duplicaciones ni renders redundantes (verifica que la ruta `mode === "vista"`
no cambió de comportamiento).

### TC-10 — pnpm run build sin errores
Correr `cd vite-extension && pnpm run build`.
**Esperado:** Salida sin errores de compilación ni warnings críticos.

### TC-11 — init.sh pasa
Correr `./init.sh` desde la raíz.
**Esperado:** Todos los checks [OK].

### TC-12 — pnpm run test:e2e sin errores [E2E]
Correr `cd vite-extension && pnpm run test:e2e -- tests/e2e/030-editor-live-refresh.spec.js`.
**Esperado:** Los 2 tests pasan (TC-01/02 combinados, y TC-03), sin flakiness
en corridas repetidas.
