# Research — Feature #35: onboarding_modal_blocks_e2e

## Confirmación del bug (independiente de la feature #34)

Se revirtió temporalmente el fix de la feature #34 (`git stash` sobre
`editor.js`/`vista.js`) y se corrió `tests/e2e/030-editor-live-refresh.spec.js`
contra un perfil de Chromium nuevo: el mismo bloqueo `intercepts pointer
events` sobre `#onboarding-modal` ocurrió igual. Confirma que es una
regresión pre-existente introducida por la feature #33 (rebrand +
onboarding), no algo causado por la #34.

## Causa raíz

`src/sidebar/onboarding.js:41` — `initOnboarding()` abre el modal
automáticamente si `!(await Store.hasSeenOnboarding())`. `hasSeenOnboarding`/
`markOnboardingSeen` (`src/storage.js:142-153`) leen/escriben un campo
`onboardingSeen` **dentro del mismo objeto** `contextHighlighter` que
`contexts` (mismo `STORAGE_KEY`, ver `readAll()`/`writeAll()`).

Ningún E2E existente siembra `onboardingSeen: true` ni cierra el modal, así
que en cualquier perfil de Chromium recién creado (todos los E2E de este
proyecto usan `chromium.launchPersistentContext("", ...)` — perfil temporal
nuevo en cada corrida) el modal se auto-abre al cargar `sidebar.html` y
bloquea cualquier `.click()` posterior con "intercepts pointer events" hasta
que se cierra.

## Por qué un seed único no alcanza (el motivo de esta investigación)

`onboardingSeen` vive en el **mismo objeto** que `contexts`. Varios specs
sobrescriben el objeto completo con `chrome.storage.local.set({
contextHighlighter: { contexts: {...} } })` para sembrar su fixture de datos
— sin incluir `onboardingSeen` — lo que **borra** cualquier flag sembrado de
antemano:

- `tests/e2e/028-export-format-selector.spec.js:42-45`
- `tests/e2e/030-editor-live-refresh.spec.js:75` y `:92`

Secuencia real en 030's `beforeEach`:
1. `page.goto(sidebar.html)` → si `onboardingSeen` es falsy, el modal se abre.
2. `chrome.storage.local.set({ contextHighlighter: { contexts: {...} } })` →
   sobrescribe TODO el objeto, `onboardingSeen` vuelve a `undefined`.
3. `page.reload()` → `initOnboarding()` corre de nuevo, ve `onboardingSeen`
   falsy otra vez → el modal se re-abre.
4. `.click()` sobre "Editor" → bloqueado por el modal.

Es decir: **un seed hecho una sola vez, antes de que el spec siembre sus
propios datos, no sobrevive** a specs que hacen `set()` completo del objeto
(028, 030). Sembrar el flag no es suficiente; hace falta manejar el modal en
cada punto donde el side panel pueda (re)cargar con el flag en falso.

## Specs afectados (confirmado por inspección de código, no solo por el run fallido)

| Spec | Navegaciones a `sidebar.html` | Riesgo |
|---|---|---|
| 028-export-format-selector | `page.goto` + `page.reload()` tras `set()` completo | Alto — mismo patrón que 030 |
| 029-highlight-reload-real-sites | No abre el side panel (solo el content script + popup) | Ninguno — no afectado en la práctica |
| 030-editor-live-refresh | `page.goto` + `page.reload()` tras `set()` completo | Alto — confirmado por el run fallido |
| 031-comment-capture | `page.goto(sidebar.html)` una vez, sin overwrite posterior de `contextHighlighter` | Medio — solo la primera carga |
| 032-source-navigation | `context.newPage()` + `panel.goto(sidebar.html)`, sin overwrite | Medio — solo la primera carga |
| 034-editor-visit-preserves-anchor (ya cerrado) | `context.newPage()` + `panel.goto(sidebar.html)`, ya resuelto con `dismissOnboardingIfOpen()` local | Ya mitigado |

(029 en realidad no abre el side panel en ningún test — la corrida fallida
que se vio en el batch completo fue de OTRO spec en la misma ejecución
paralela, no de 029 en sí; se confirma revisando el archivo que no hay
`sidebar.html` en él.)

## Diseño del fix (fixtures-only, sin tocar specs individuales ni producto)

Alcance acordado con el usuario: resolver esto **solo en
`tests/e2e/fixtures.js`**, sin tocar `src/sidebar/onboarding.js` ni los
specs 028/030/031/032 uno por uno.

`BrowserContext` emite el evento `'page'` por cada página nueva creada en ese
contexto — incluida la que crea la propia fixture `page` internamente, y
cualquier `context.newPage()` que un spec haga por su cuenta (032, 034). Ese
evento es el único punto centralizado que ve TODAS las páginas sin importar
cómo se crearon.

En la fixture `context`, después de `launchPersistentContext`, escuchar
`context.on('page', ...)` y, dentro, escuchar `page.on('domcontentloaded',
...)` de forma **persistente** (no una sola vez) — porque `page.reload()` no
dispara un nuevo evento `'page'`, solo `'domcontentloaded'` de nuevo en la
misma página. Esto cubre el caso 030/028 donde el modal se puede reabrir tras
un reload posterior al seed.

En cada `domcontentloaded`, si `page.url()` no contiene `sidebar.html`,
salir de inmediato (evita el costo de buscar el selector en cada navegación
de un sitio real). Si sí es `sidebar.html`, esperar brevemente (con
timeout corto) a que `#onboarding-modal` se vuelva visible — `initOnboarding`
es async, así que el modal no aparece instantáneamente — y si aparece,
hacer clic en `.onboarding-close`. Si no aparece dentro del timeout (porque
`onboardingSeen` ya era `true`), no hacer nada.

La acción de cierre puede correr en paralelo con lo que el spec ya esté
haciendo (p.ej. `.click()` sobre "Editor" inmediatamente después del
`goto()`) sin necesitar sincronización explícita: Playwright reintenta
automáticamente una acción bloqueada por "elemento no estable/tapado" hasta
su propio timeout, así que en cuanto el listener de fixtures cierra el
modal, el `.click()` que ya estaba reintentando se destraba solo — el mismo
comportamiento que ya se observó en los logs de fallo (decenas de reintentos
de 500ms antes de agotar el timeout).

## Alcance de verificación (según lo acordado con el usuario)

Re-correr `pnpm run test:e2e` completo tras el fix y confirmar que 028, 030,
031 y 032 pasan en un perfil nuevo (029 no se ve afectado por diseño, pero se
incluye en la corrida completa igual). El spec de la feature #34 puede además
simplificarse quitando su `dismissOnboardingIfOpen()` local, ya redundante
una vez que el fixture lo maneja centralmente — se deja como decisión del
Implementer, no cambia el comportamiento observable.

## Archivos involucrados

- `tests/e2e/fixtures.js` — único archivo a modificar.
- (Sin cambios en `src/sidebar/onboarding.js`, `src/storage.js`, ni en los
  specs 028/030/031/032; opcionalmente una simplificación cosmética en el
  spec 034, ya cerrado.)
