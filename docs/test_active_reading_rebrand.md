# Test Plan — Feature 33: Active Reading Rebrand

Verification plan for the rebrand: new icon set, `manifest.json` name/description,
onboarding modal (first-open + "?" reopen), and no regression to categories/
colors/`buildMd`/`parseMd`/`outputs/`. Written **before** implementation per
spec `specs/033-spec-active_reading_rebrand.json`.

## 1. Alcance de verificación

- Íconos: `src/assets/icon-{16,32,48,128}.png` existen, generados desde
  `icon.png`, referenciados en `manifest.json` (`icons` + `action.default_icon`).
- `manifest.json`: `name` = `"Active Reading"`, `description` nueva en español
  (lectura activa + archivado por contexto).
- Modal de onboarding: contenido (título, párrafo, 4 categorías con swatch +
  texto), comportamiento (aparece 1ª vez, no reaparece tras cerrar, reabre vía
  ícono "?"), accesibilidad (`role=dialog`, `aria-modal`, `aria-labelledby`,
  focus trap, Escape).
- Persistencia del flag de primera apertura en `chrome.storage.local`.
- Sin regresión: 4 categorías/colores, modelo de datos, `buildMd`/`parseMd`,
  `outputs/` intacto.
- **Nota DOM/E2E**: los acceptance criteria del spec (ítem 13) señalan que este
  cambio vive en `manifest.json` + side panel, no en `content.js`/
  `content-storage.js`. Confirmar esta suposición releyendo el diff real del
  Implementer antes de cerrar — **si tocó `content.js` o `content-storage.js`,
  la regla dura de CLAUDE.md aplica y se necesita un spec E2E nuevo bajo
  `tests/e2e/`.** Si no los tocó, no se requiere E2E nuevo para esta feature.

## 2. Automatizado — Vitest

Archivo nuevo: `vite-extension/tests/033-onboarding.test.js`.
Cubre la lógica del flag de primera apertura (probable ubicación:
`storage.js` — p.ej. `hasSeenOnboarding()`/`markOnboardingSeen()` — o un
módulo nuevo `sidebar/onboarding.js`; ajustar imports al nombre real que
elija el Implementer, pero mantener el archivo de test en `tests/`).

Usar el mock en memoria de `chrome.storage.local` ya establecido en el
proyecto (ver `tests/031-storage-comment.test.js` como referencia de patrón).

Casos:

- [ ] **Flag ausente → debe mostrarse**: con `chrome.storage.local` vacío
      (sin la clave `contextHighlighter` o sin el sub-campo del flag),
      la función que consulta "¿ya se vio el onboarding?" devuelve `false`/
      indica que el modal debe mostrarse.
- [ ] **Flag en `true` → no debe auto-mostrarse**: pre-poblar el storage mock
      con el flag ya en `true`; la función de consulta devuelve `true`.
- [ ] **Marcar como visto persiste**: llamar a la función que setea el flag
      (p.ej. `markOnboardingSeen()`), luego leer el storage mock directamente
      y confirmar que el flag quedó en `true` — sin tocar otras claves del
      namespace `contextHighlighter` (contexts, items existentes intactos).
- [ ] **No pisa otros datos**: partiendo de un storage mock con contexts/items
      ya presentes, marcar el flag y confirmar que `contexts` sigue igual
      (round-trip: leer todo el objeto antes/después, diff solo en el campo
      del flag).
- [ ] **Reapertura manual es independiente del flag**: la función que abre el
      modal vía el ícono "?" no debe consultar ni depender del flag de
      primera-vez — se puede simular directamente sin necesidad de aserciones
      de storage (esto es más una nota de diseño de API: si el Implementer
      expone `openOnboarding()` separado de la lógica de auto-show, testear
      que `openOnboarding()` no lee el flag; si todo vive en el DOM del
      sidebar sin unidad testeable aparte del flag, dejar constancia en el
      test file de que la reapertura se verifica manualmente en la sección 4).
- [ ] Si el Implementer añade el flag a `storage.js` en vez de un módulo
      nuevo: confirmar que `content-storage.js` **no necesita** el mismo
      cambio (el flag es puramente de UI del side panel, no del content
      script) — dejarlo como comentario en el test o en el plan de review,
      para que el Reviewer no asuma que hay que resincronizar
      `content-storage.js` para esta feature en particular.

Ejecutar con `pnpm run test` (Vitest) — debe pasar en verde junto con toda la
suite existente.

## 3. Manual — build & load

- [ ] `cd vite-extension && pnpm run build` termina sin errores.
- [ ] `python3 -c "import json; json.load(open('vite-extension/dist/manifest.json')); print('OK')"`
      confirma que el manifest compilado es JSON válido.
- [ ] `chrome://extensions` → Developer mode → **Load unpacked** →
      `vite-extension/dist/`.
- [ ] La extensión se lista como **"Active Reading"** (no "Context
      Highlighter") en la tarjeta de `chrome://extensions`.
- [ ] El ícono en la tarjeta de `chrome://extensions` (48px) se ve nítido, no
      borroso ni pixelado/estirado.
- [ ] El ícono en la toolbar del navegador (16/32px, según DPI de pantalla)
      se ve nítido.
- [ ] Abrir el detalle de la extensión (`chrome://extensions` → "Detalles")
      y confirmar que la descripción nueva se muestra en español y menciona
      lectura activa + archivado por contexto.
- [ ] Inspeccionar `vite-extension/dist/manifest.json` directamente:
      `icons` tiene claves `16`,`32`,`48`,`128`; `action.default_icon` tiene
      al menos `16`,`32`; todas las rutas resuelven a archivos que existen en
      `dist/`.

## 4. Manual — onboarding modal

Setup: `chrome://extensions` → "Detalles" → "Datos del sitio/Almacenamiento"
o DevTools del side panel → `chrome.storage.local.clear()` en la consola,
para simular primera apertura.

- [ ] Con storage limpio, abrir el side panel → el modal aparece
      automáticamente, sin acción del usuario.
- [ ] Título del modal: **"Lectura activa: cómo funciona"**.
- [ ] El párrafo introductorio está presente y coincide en sentido con el
      borrador de `docs/research_active_reading_rebrand.md` (qué es la lectura
      activa, por qué clasificar ayuda a comprender/retener).
- [ ] Sección **"Qué significa cada color"** con las 4 categorías, en orden
      Título → Idea → Argumento → Evidencia.
- [ ] Cada categoría muestra: nombre + swatch de color + frase explicativa.
      Verificar visualmente (o inspeccionando CSS computado) que el color del
      swatch de cada categoría coincide con su token existente:
      - Título → `--cat-title-border` (`#c0394c` claro / `#f6b8c4` oscuro)
      - Idea → `--cat-idea-border` (`#c07a00` claro / `#f5d78e` oscuro)
      - Argumento → `--cat-arg-border` (`#1a5fa8` claro / `#93bef5` oscuro)
      - Evidencia → `--cat-evidence-border` (`#1e7c40` claro / `#7fce9e` oscuro)
- [ ] Botón de cierre visible con texto **"Entendido"**.
- [ ] Cerrar con click en "Entendido" → modal se cierra.
- [ ] Recargar/reabrir el side panel → el modal **no** vuelve a aparecer
      automáticamente (flag persistido).
- [ ] Repetir el ciclo completo (clear storage → abrir) pero cerrar esta vez
      con **tecla Escape** → modal se cierra, y tras recargar tampoco
      reaparece automáticamente.
- [ ] Repetir una tercera vez cerrando con **click en el overlay** (fuera del
      modal) → mismo resultado: cierra y no reaparece.
- [ ] Con el flag ya en `true` (modal ya visto), localizar el ícono **"?"**
      persistente en el rail → hacer click → el modal se abre de nuevo con el
      mismo contenido, sin importar el estado del flag.
- [ ] El ícono "?" tiene `title`/`aria-label` = **"Ver explicación de lectura
      activa"** (o equivalente corto en español, consistente con el patrón de
      `rail.js`).

## 5. Manual — accesibilidad

- [ ] Con DevTools → Elements, inspeccionar el contenedor del modal abierto:
      confirma `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
      apuntando al `id` del elemento de título.
- [ ] Navegación solo-teclado: abrir el modal (vía "?" o primera apertura),
      presionar `Tab` repetidamente → el foco permanece dentro del modal
      (no se escapa a controles del rail/panel detrás). Repetir con
      `Shift+Tab` en sentido inverso.
- [ ] Presionar `Escape` con el modal abierto → se cierra **y** el foco vuelve
      al control que lo abrió (el ícono "?" del rail, si se abrió desde ahí).
- [ ] Si el Implementer reusa el patrón de `<dialog>` nativo ya existente en
      `src/sidebar/modal.js` (`showModal()`/`close()`), el focus trap y el
      cierre con Escape deberían venir gratis del elemento nativo — confirmar
      igual con la prueba manual anterior, no asumir que el navegador lo hace
      bien sin verificarlo en este proyecto/versión de Chrome.

## 6. Regresión

- [ ] `pnpm run test` (Vitest) — toda la suite existente sigue en verde,
      no solo el test nuevo de la sección 2.
- [ ] Round-trip `buildMd`/`parseMd` sin cambios: tomar un contexto existente
      con al menos un ítem de cada categoría, correr
      `Store.buildMd(ctx)` → `Store.parseMd(md)` y confirmar que el resultado
      es idéntico al de antes del cambio (spot check manual, ver
      `docs/verification.md` Nivel 2 para el snippet de referencia).
- [ ] `git diff --stat -- outputs/` (o `git status outputs/`) no muestra
      ningún archivo modificado.
- [ ] `git diff -- vite-extension/src/storage.js vite-extension/src/content-storage.js`
      — si el flag de onboarding se implementó en un módulo separado
      (`sidebar/onboarding.js`), ambos archivos deben aparecer sin diff. Si
      el flag se agregó a `storage.js`, confirmar que **no** se tocó
      `buildMd`/`parseMd`/`CATEGORIES`/`typeForCategory` — solo la función(es)
      nueva(s) del flag — y que `content-storage.js` no necesitó
      resincronizarse (el content script no usa el flag de onboarding).
- [ ] Comparación visual de la Vista (`vista.js`) con highlights existentes de
      las 4 categorías: bordes/colores pixel-idénticos a antes del cambio (no
      se tocaron los tokens `--cat-*-border` en `sidebar.css`).
- [ ] `git diff -- vite-extension/src/sidebar.css` — si hay diff, confirmar
      que es aditivo (estilos nuevos del modal/ícono "?"), no una edición de
      los tokens `--cat-*-border` ya existentes.

## 7. Criterio de salida

- [ ] `./init.sh` (raíz del repo) sale verde.
- [ ] `pnpm run build` (dentro de `vite-extension/`) sale verde.
- [ ] `pnpm run test` (Vitest, dentro de `vite-extension/`) sale verde,
      incluyendo `033-onboarding.test.js`.
- [ ] No se requiere `pnpm run test:e2e` nuevo **salvo** que el diff del
      Implementer toque `content.js` o `content-storage.js` — en ese caso,
      la regla dura de CLAUDE.md ("todo cambio que toque el DOM lleva un spec
      E2E nuevo") aplica sin excepción y el Reviewer debe bloquear el cierre
      hasta que exista ese spec bajo `tests/e2e/`.
- [ ] Todos los checklists de las secciones 3–6 marcados, sin ítems en rojo
      sin explicación registrada en `progress/current.md`.
