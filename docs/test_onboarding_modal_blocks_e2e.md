# Test plan: Fix modal de onboarding bloqueando E2E (feature 35)

## Alcance

Cubre `specs/035-spec-onboarding_modal_blocks_e2e.json`: `tests/e2e/fixtures.js`
debe cerrar automáticamente `#onboarding-modal` en cualquier página cuya URL
contenga `sidebar.html`, en la primera carga y en cualquier reload posterior,
sin tocar `src/sidebar/onboarding.js`, `src/storage.js` ni los specs
028/029/030/031/032 individualmente.

Este fix es en sí mismo infraestructura de test — no hay lógica de producto
que cubrir con Vitest. La única verificación real es correr la suite E2E
completa en un perfil de Chromium nuevo (exactamente el escenario que
reprodujo el bug) y confirmar que ya no aparece el error "intercepts pointer
events".

## Casos de prueba

### TC-01 — Primera carga de sidebar.html: el modal se cierra solo
Cubierto indirectamente por CUALQUIER spec que abra el side panel por primera
vez en el proceso (028, 030, 031, 032, 034) — todos parten de un perfil
nuevo. Si el fix funciona, ninguno debe fallar por "intercepts pointer
events".

### TC-02 — Reload tras overwrite de storage: el modal se cierra de nuevo (caso 028/030)
El caso específico que un seed único NO resuelve: `030-editor-live-refresh.spec.js`
hace `goto → set() completo de contextHighlighter → reload → click`. Si el
fix solo cerrara el modal en la carga inicial (evento 'page' disparado una
sola vez, sin listener persistente de domcontentloaded), este test seguiría
fallando en el reload. Es el caso de regresión más importante a confirmar.

### TC-03 — Páginas que no son sidebar.html no se ven afectadas
`029-highlight-reload-real-sites.spec.js` y las navegaciones a sitios reales
dentro de 031/032/034 no deben mostrar ningún intento de buscar
`#onboarding-modal` que las ralentice perceptiblemente (el chequeo de URL
descarta esas páginas de inmediato, sin esperar el timeout de 1500ms).

### TC-04 — Suite completa en verde
Correr `pnpm run test:e2e` (los 6 archivos: 028, 029, 030, 031, 032, 034) en
un perfil de Chromium nuevo (el que Playwright crea por defecto en cada
corrida vía `launchPersistentContext("", ...)`).
**Esperado:** todos los specs pasan (029 puede seguir teniendo su flakiness
documentada de sitios reales con `retries: 1`, pero no por causa del modal
de onboarding).

### TC-05 — pnpm run build sin errores
`fixtures.js` no participa del build de la extensión (es infraestructura de
test), pero se corre igual por consistencia con el resto del pipeline.

### TC-06 — init.sh pasa
Correr `./init.sh` desde la raíz.
**Esperado:** todos los checks [OK].

## Precondiciones
- `pnpm run build` completado (dist/ actualizado, aunque este fix no lo toque).
- Sin instancias de Chromium con perfiles persistentes previos que pudieran
  tener `onboardingSeen: true` ya cacheado de una corrida anterior — cada
  corrida de `pnpm run test:e2e` crea un perfil temporal nuevo, así que esto
  no debería requerir limpieza manual.
