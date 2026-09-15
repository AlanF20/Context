# Test plan: Fix ancla de resaltado destruida al visitar el Editor sin editar (feature 34)

## Alcance

Cubre `specs/034-spec-editor_tab_switch_persistence_bug.json`: `editor.flush()`
(y, si aplica, `docEditor.flush()`/`blur`) deben ser no-op cuando el buffer no
tiene cambios reales, para no disparar `Store.replaceContextFromMarkdown`
(que vacía `sourceUrl`/`rangePrefix`/`rangeSuffix`/`rangeText`/`rangeStart`/
`rangeEnd` de TODOS los ítems) por el solo hecho de haber montado Monaco/el
textarea. No se toca `storage.js` ni el contrato `buildMd`/`parseMd`.

## Hallazgo heredado de la feature #30 (sigue vigente)

`mode === "vista-edit"` no tiene ningún punto de entrada en la UI actual —
ningún botón llama `switchMode("vista-edit")` (confirmado por grep: 0
ocurrencias fuera de la propia declaración/lectura de `mode`). Por lo tanto:
- El fix en `docEditor.flush()`/`blur` (vista.js) se implementa por
  consistencia y para no dejar la misma trampa si el modo se reactiva, pero
  **no es alcanzable manualmente ni por E2E hoy**.
- Toda la verificación real (manual + E2E) se concentra en el Editor (Monaco),
  que es el flujo reportado por el usuario y el único alcanzable desde la UI.

## Cobertura automatizada (Vitest)

- **[Vitest]** `editor.flush(onSave)` NO invoca `onSave` cuando se llama
  inmediatamente después de `mount()` sin disparar `onDidChangeModelContent`
  (buffer limpio).
- **[Vitest]** `editor.flush(onSave)` SÍ invoca `onSave` con el valor actual
  cuando hubo al menos un cambio de contenido desde el mount (buffer dirty),
  preservando el comportamiento existente para ediciones reales.
- **[Vitest]** Tras un `flush()` exitoso (dirty→save), una llamada posterior a
  `flush()` sin cambios adicionales es no-op (no vuelve a invocar `onSave`).
- **[Vitest]** `docEditor.flush()` NO invoca `onSave`/`Store.replaceContextFromMarkdown`
  cuando `dirtySignalled` es `false` (mount sin `input` disparado).
- **[Vitest]** El listener `blur` de `docEditor` no llama a `save()` cuando
  `dirtySignalled` es `false` al momento del blur.

Monaco real y el runtime de `chrome.storage` quedan fuera de alcance de
Vitest por convención del proyecto (mock en memoria, sin Monaco real).

## Cobertura E2E (Playwright)

Nuevo spec `tests/e2e/034-editor-visit-preserves-anchor.spec.js`
(`pnpm run test:e2e`), siguiendo el patrón de
`tests/e2e/029-highlight-reload-real-sites.spec.js` (selección real vía
`page.mouse`, sitio real, `content-storage.js` real — no jsdom):

### TC-01 — Visitar Editor sin editar preserva el re-highlight tras reload [E2E]
1. Abrir un sitio real de la lista de fixtures, seleccionar texto vía
   `page.mouse` (drag real), guardar el resaltado en un contexto nuevo desde
   la toolbar flotante del content script.
2. Abrir el side panel, seleccionar ese contexto, cambiar a la pestaña
   Editor. NO escribir nada en Monaco.
3. Cambiar de vuelta a la pestaña Vista.
4. Recargar la página del sitio real (`page.reload()`).
**Esperado:** el `.ch-hl-*` se re-pinta sobre el texto original, igual que si
nunca se hubiera visitado el Editor (mismo criterio de aserción que el spec
029: el elemento con la clase de highlight existe y contiene el texto
capturado).

### TC-02 — El contexto sigue siendo detectado por la toolbar tras el ciclo Editor [E2E]
1. Continuando desde TC-01 (después del reload), volver a seleccionar texto
   en la misma página con `page.mouse`.
2. Verificar la toolbar flotante de captura.
**Esperado:** el punto de color del "contexto detectado" (`contextForThisPage`)
sigue mostrando el contexto usado en TC-01 — no desapareció por el vaciado de
`sourceUrl`.

### TC-03 — Edición real en el Editor sigue perdiendo el ancla (sin regresión de spec 004/027) [E2E o manual]
1. Repetir TC-01 pero, en el paso 2, escribir/modificar texto real en Monaco
   antes de volver a Vista.
2. Recargar la página.
**Esperado:** el highlight de ese ítem específico YA NO se re-pinta (esto es
el comportamiento aceptado y documentado, no una regresión) — confirma que el
fix no oculta el caso legítimo de pérdida de ancla por edición real.

## Verificación manual complementaria (Chrome)
1. Cargar `vite-extension/dist/` sin empaquetar.
2. Resaltar texto en cualquier página, guardar en un contexto.
3. Abrir el side panel → pestaña Editor (sin tipear) → pestaña Vista.
4. Recargar la página con F5.
**Esperado:** el resaltado sigue pintado. Repetir sin el fix (build anterior)
para confirmar que reproduce el bug original antes del cambio.

## Precondiciones
- `pnpm run build` completado sin errores.
- Fixture de sitio real reutilizado de `tests/e2e/fixtures/test-sites.js`
  (mismo array que usa el spec 029, sin necesidad de añadir sitios nuevos).

## Checks de cierre
### TC-04 — pnpm run test (Vitest)
Correr `cd vite-extension && pnpm run test`.
**Esperado:** todos los tests en verde, incluyendo los nuevos de `flush`.

### TC-05 — pnpm run build sin errores
Correr `cd vite-extension && pnpm run build`.
**Esperado:** salida sin errores de compilación.

### TC-06 — init.sh pasa
Correr `./init.sh` desde la raíz.
**Esperado:** todos los checks [OK].

### TC-07 — pnpm run test:e2e sin errores
Correr `cd vite-extension && pnpm run test:e2e -- tests/e2e/034-editor-visit-preserves-anchor.spec.js`.
**Esperado:** TC-01, TC-02 y TC-03 pasan sin flakiness en corridas repetidas.
