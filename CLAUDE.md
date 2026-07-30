# CLAUDE.md — Context Highlighter (Chrome MV3)

Reglas y mapa del proyecto para sesiones de Claude. **Léelo antes de editar.**

> **Entorno activo de desarrollo: `vite-extension/`** (Vite + pnpm + @crxjs/vite-plugin).
> Las rutas del mapa de abajo son relativas a `vite-extension/src/`.
> Chrome carga la extensión desde `vite-extension/dist/` (`pnpm run build`)
> o con HMR en dev (`pnpm run dev`).
>
> `outputs/` es **legacy congelado** — referencia histórica, no recibe features nuevas.
>
> El andamiaje del harness (`AGENTS.md`, `feature_list.json`, `docs/`, `init.sh`)
> vive en la raíz del repo. `DESIGN_SPEC.md` está en la raíz.

## Qué es

Extensión Chrome **Manifest V3**. El usuario resalta texto en cualquier página,
lo archiva en un **Contexto** (tema de investigación) con un **color/categoría**,
y revisa/exporta sus notas en **Markdown** desde un **side panel**.

Documento fuente de diseño: `../DESIGN_SPEC.md` (referencia visual:
`../navigator.html`, solo como guía, NO copiar su markup).

## Convención de código (OBLIGATORIA)

- **Separar siempre HTML, CSS y JS en archivos independientes.** Nada de CSS en
  `<style>` ni JS en `<script>` inline; nada de `style="..."` inline (usa clases).
- **Panel y content script = módulos ES.** Vite compila cada entry point por
  separado; `sidebar.html` carga `sidebar.js`, la lógica se divide en
  `sidebar/*.js` con `import`/`export` nativos.
- **Código limpio**, nombres claros, funciones pequeñas. **Documenta brevemente
  (JSDoc/comentario) las funciones complejas**; no comentes lo obvio.
- **Dependencias npm permitidas** (Vite las bundlea localmente; MV3-safe).
  Ningún CDN en tiempo de ejecución: todo queda en `dist/` tras el build.
  Dependencias pesadas opcionales (Monaco) siguen vendored en `public/vendor/`.
- Idioma de la UI: español. Comentarios de código: inglés (consistencia actual).

## Testing (OBLIGATORIO)

`vite-extension/` tiene dos suites en `tests/`:

- **Vitest** (`tests/*.test.js`, `pnpm run test`): lógica pura (`storage.js`
  `buildMd`/`parseMd`, `sidebar/export-formats.js`, etc.) y funciones que
  llaman a `chrome.storage.local` vía un mock hand-rolled en memoria (sin
  dependencias como sinon-chrome). Nombrado: `NNN-modulo.test.js` (NNN = id de
  la feature que lo origina).
- **Playwright** (`tests/e2e/*.spec.js`, `pnpm run test:e2e`): carga la
  extensión real construida en `dist/` en un Chromium con perfil persistente
  (`headless: false` — el modo headless no puede cargar extensiones). Cubre lo
  que Vitest/jsdom no puede: `chrome.storage.local` real, DOM real, selección
  de texto real vía `page.mouse`, descargas reales.

**Regla dura: todo cambio que toque el DOM (`content.js`, cualquier UI nueva,
`resize`/`scroll`/eventos reales del navegador) lleva un spec E2E nuevo bajo
`tests/e2e/`, no solo una pasada manual en Chrome.** La verificación manual
sigue siendo necesaria, pero deja de ser suficiente por sí sola para dar por
cerrado un cambio de DOM. Reusar la técnica de selección por arrastre de
`tests/e2e/029-highlight-reload-real-sites.spec.js` +
`tests/e2e/fixtures/test-sites.js` para exercitar `content.js` contra un
sitio real (el content script no reacciona a `Selection` vía JS, solo a un
`mouseup` nativo).

Motivo (no es un capricho): `content.js` importa desde `content-storage.js`
— una copia manual completa de `storage.js`, no un re-export — porque Rollup
extraería un chunk compartido que Chrome ejecuta como *web accessible
resource* sin acceso a `chrome.storage`. Un cambio en `storage.js` que olvide
resincronizar `content-storage.js` (`cp storage.js content-storage.js`,
restaurando su propio header) es invisible para Vitest, que siempre importa
`storage.js` directo vía `sidebar/store.js` — solo un E2E real que pase por el
content script de verdad lo detecta. Esto ya pasó una vez (feature 31).

## Restricciones MV3 que hay que respetar

- **No remote code en runtime**: nada de `<script src="https://cdn...">`, ni
  `eval`/`new Function` en páginas de extensión (CSP). Vite genera un bundle
  local que cumple esto automáticamente.
- **Content scripts**: Vite (con CRXJS) puede compilar `content.js` como módulo
  ES. El content script actual sigue siendo un IIFE clásico por simplicidad;
  si se refactoriza, CRXJS lo inyecta correctamente.
- **storage.js en `vite-extension/`** es un módulo ES con `export`s nombrados
  (no `window.ContextStore`). Vite lo bundlea separado en cada entry point que
  lo importe (content, sidebar). El estado compartido es `chrome.storage.local`,
  no la memoria del módulo.
- **Monaco**: sigue vendored en `public/vendor/monaco/` porque su AMD loader no
  es compatible con el bundler de Vite. `marked` y `DOMPurify` se instalan como
  dependencias npm normales (tree-shaking los optimiza).
- Orden de carga en `sidebar.html`: Monaco `loader.js` debe cargarse como script
  clásico antes del módulo `sidebar.js`. Los demás vendored siguen el orden
  Monaco → storage → sidebar (igual que en `outputs/`).

## Mapa de archivos — QUÉ YA ESTÁ ESCRITO

> Rutas relativas a `vite-extension/`. Los archivos de `outputs/` son legado congelado.

| Archivo | Estado | Responsabilidad |
|---|---|---|
| `manifest.json` | ✅ | MV3 (gestionado por CRXJS): permisos `storage`+`sidePanel`, host `<all_urls>`, content script, side panel, service worker. |
| `src/background.js` | ✅ | Service worker; abre el side panel al click del icono. |
| `src/storage.js` | ✅ | Capa de datos sobre `chrome.storage.local`. Módulo ES con exports nombrados: modelo, `buildMd`/`parseMd`, categorías de color. |
| `src/content-storage.js` | ✅ | Copia manual **completa** de `storage.js` para el content script (Rollup extraería un chunk compartido que Chrome ejecuta como WAR sin acceso a `chrome.storage`). **Debe resincronizarse a mano** (`cp storage.js content-storage.js`, luego restaurar el header propio del archivo) cada vez que cambie `storage.js` — un desincronizado no lo detecta Vitest (importa `storage.js` directo), solo un E2E real. |
| `src/content.js` | ✅ | Content script (IIFE clásico): selección → icono `+` → popup de captura (combobox de contexto, 4 categorías de color, anidar, Enter guarda) → resaltado en la página. |
| `src/content.css` | ✅ | Estilos del popup/icono/resaltado, scoped en `.ch-root`. Highlight por categoría: `.ch-hl-{title,idea,argument,evidence}`. |
| `src/sidebar.html` | ✅ | Solo estructura: rail + main. `<link>` a `sidebar.css`, `<script type="module">` a `sidebar.js`. |
| `src/sidebar.css` | ✅ | Tokens (claro/oscuro) + estilos del panel. |
| `src/sidebar.js` | ✅ | **Controlador** (módulo ES): estado (contexts/selección/modo), header, switch Vista/Editor, export `.md`, rename. |
| `src/sidebar/dom.js` | ✅ | `$`, `escapeHtml`. |
| `src/sidebar/store.js` | ✅ | Re-exporta los exports de `storage.js` como `Store`. |
| `src/sidebar/markdown.js` | ✅ | `renderMarkdown` (marked + DOMPurify, ambos npm). |
| `src/sidebar/theme.js` | ✅ | `initTheme` (toggle claro/oscuro, persistido en localStorage). |
| `src/sidebar/rail.js` | ✅ | `renderRail` (chips de contexto). |
| `src/sidebar/vista.js` | ✅ | `renderVista` (lista de ítems con badges semánticos y acciones inline editar/borrar). |
| `src/sidebar/editor.js` | ✅ | `createEditorController` (Monaco oscuro, sync en vivo, buffers por contexto). |
| `public/vendor/monaco/vs/` | ✅ | Monaco vendored (su AMD loader no es compatible con Vite). |

## Modelo de datos (`chrome.storage.local`, clave `contextHighlighter`)

```jsonc
{ "contexts": { "<id>": {
  "id","name","color","createdAt",
  "items": [
    { "id","type":"subtitle|text","category":"title|idea|argument|evidence|null",
      "text","linkedSubtitleId","source","sourceUrl","createdAt" }
  ]
}}}
```

- **Categoría = color** y deriva el `type`: `title`→`subtitle` (heading), las
  demás→`text`. `parseMd`/`buildMd` mantienen esto (títulos `##`; notas con
  emoji 🟡/🔵/🟢; `_Fuente: dominio_`).
- Duplicados permitidos a propósito (no deduplicar).

## Contrato Markdown ⇄ items
- Serializa: `Store.buildMd(ctx)`. Parsea: `Store.parseMd(md)` /
  `Store.replaceContextFromMarkdown`. Son inversos; mantenerlos sincronizados.
- El editor liga un **buffer de string por contexto** para no perder el cursor;
  edita/borra deben **invalidar** ese buffer (`editor.invalidate(ctxId)`).

## QUÉ NO ESTÁ HECHO / pendientes conocidos

- **Agrupar la Vista por página de origen**: la Vista es lista de ítems (no
  Markdown), sin agrupación por sourceUrl.
- **Atajos de teclado 1–4** para asignar categoría al capturar: omitidos
  (chocan con escribir el nombre del contexto en el combobox).
- **Highlights no persisten** ni se re-aplican al recargar la página (solo se
  marcan al guardar).
- **Resaltado de sintaxis Markdown a medida** (overlay spec §2.4): se usa Monaco.
- **`outputs/` congelado**: las features 1–12 están implementadas ahí, pero no
  recibirá más cambios. Toda feature nueva va a `vite-extension/`.

## Trigger de harness — cuando el prompt empieza con `harness:`

Si el mensaje del usuario empieza con la palabra `harness:`, **detente y ejecuta
el pipeline completo antes de tocar cualquier archivo en `vite-extension/`**. El
flujo es obligatorio y no tiene atajos.

### Pasos en orden (ninguno es opcional)

1. **`./init.sh`** — debe salir verde. Si falla, loguear en `progress/current.md`
   y parar.
2. **Leer `progress/current.md`** — entender el estado que dejó la sesión anterior.
3. **Añadir la feature a `feature_list.json`** con `status: "in_progress"` y
   `spec_path: null` antes de escribir nada más.
4. **Interviewer** — formular al usuario entre 3 y 5 preguntas de clarificación
   sobre alcance, comportamiento esperado y casos límite de la feature. Las
   respuestas quedan en el chat (sin archivo); el Researcher las usa como contexto
   adicional. Excepción explícita a la regla "todo output va a disco".
5. **Researcher** — investigar y escribir el output a
   `docs/research_<feature>.md`. Todo output va a disco; nada se pasa por chat.
6. **Spec-Writer** — redactar la spec en `specs/NNN-spec-<feature>.json`
   (NNN = feature ID con zero-padding a 3 dígitos) y presentarla al usuario para
   aprobación. El JSON debe tener los campos `id`, `status`, `createdAt`, `author`,
   `title`, `description`, `acceptance_criteria` y `dependencies`; `status` inicial
   es `"draft"`, pasa a `"approved"` tras el gate humano.
7. **⛔ STOP — esperar aprobación humana.** No escribir ningún archivo en
   `vite-extension/` hasta que el usuario diga "sí" (o equivalente). Este es el
   gate más importante: violarlo es el error más grave del pipeline.
8. **Tester** — escribir el plan de verificación en `docs/test_<feature>.md`.
9. **Implementer** — editar los archivos en `vite-extension/src/` según la spec
   aprobada. No tocar `outputs/` (legado congelado).
10. **Reviewer** — correr `./init.sh` + `pnpm run build` + `pnpm run test`
    dentro de `vite-extension/`; todos los checks deben salir verdes. Si la
    feature tocó el DOM, correr también `pnpm run test:e2e` con un spec nuevo
    bajo `tests/e2e/` (ver sección "Testing" arriba) — manual-only ya no
    cierra un cambio de DOM.
11. **Cerrar sesión** — copiar `progress/current.md` a `progress/history.md`,
    resetear `current.md` a la plantilla base, marcar la feature como `done` en
    `feature_list.json`.

### Reglas de oro

- **Una feature a la vez.** Nunca mezclar cambios de features distintas.
- **Todo output de agente va a disco.** Los agentes escriben archivos; el
  orquestador solo recibe referencias a esos archivos.
- **Ningún edit a `vite-extension/` antes del paso 7.** Ni siquiera "un cambio
  pequeño obvio". Espera la aprobación.
- **`outputs/` es legado congelado.** Nunca editar `outputs/` para features nuevas.
- **Si `init.sh` falla en cualquier momento, parar.** Loguear el bloqueo y
  marcar la feature como `blocked`.

## Cómo verificar
- **Build**: `cd vite-extension && pnpm run build` — debe terminar sin errores.
- **Dev**: `pnpm run dev` — compila con HMR; útil para iterar rápido.
- **Unit**: `pnpm run test` (Vitest) — debe pasar en verde.
- **E2E**: `pnpm run test:e2e` (Playwright, hace build primero) — obligatorio
  si el cambio toca el DOM (ver sección "Testing" arriba).
- **Sintaxis** (fallback rápido sin build): `node --check archivo.js` para scripts clásicos; copiar a `*.mjs` para ESM.
- **Harness**: `./init.sh` desde la raíz del repo.
- **Manual**: cargar `vite-extension/dist/` como carpeta sin empaquetar en `chrome://extensions` (Developer mode) — sigue siendo necesario, pero ya no sustituye al E2E para cambios de DOM.
