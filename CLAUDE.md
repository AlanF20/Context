# CLAUDE.md — Context Highlighter (Chrome MV3)

Reglas y mapa del proyecto para sesiones de Claude. **Léelo antes de editar.**

> Ubicación del código: la extensión vive en `outputs/` (carpeta sin empaquetar
> que se carga en Chrome). Las rutas del mapa de abajo son relativas a `outputs/`.
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
- **Panel = módulos ES.** `sidebar.html` carga `sidebar.js` con
  `type="module"`; la lógica se divide en `sidebar/*.js` con `import`/`export`.
- **Código limpio**, nombres claros, funciones pequeñas. **Documenta brevemente
  (JSDoc/comentario) las funciones complejas**; no comentes lo obvio.
- **Sin dependencias nuevas remotas.** MV3 prohíbe código alojado remotamente:
  todo lo de terceros va **vendored** en `vendor/` y se carga local. No CDNs.
- Idioma de la UI: español. Comentarios de código: inglés (consistencia actual).

## Restricciones MV3 que hay que respetar

- **No remote code**: nada de `<script src="https://cdn...">`, ni `eval`/
  `new Function` en páginas de extensión (CSP). Por eso Monaco/marked/DOMPurify
  están vendored.
- **Content scripts NO pueden ser módulos ES** ni cargar HTML externo. Por eso
  `content.js` es un IIFE clásico y construye su DOM en JS (plantilla en
  `popupSkeleton()`), y `storage.js` se mantiene como **script clásico** que
  expone `window.ContextStore` (lo comparten content script y panel).
- Orden de carga en `sidebar.html`: los scripts **clásicos** (marked, DOMPurify,
  Monaco `loader.js`, `storage.js`) van **antes** del módulo `sidebar.js`
  (los módulos son diferidos). marked + DOMPurify deben ir **antes** del loader
  AMD de Monaco, o el UMD se registra como módulo anónimo y Monaco lo rechaza.

## Mapa de archivos — QUÉ YA ESTÁ ESCRITO

| Archivo | Estado | Responsabilidad |
|---|---|---|
| `manifest.json` | ✅ | MV3: permisos `storage`+`sidePanel`, host `<all_urls>`, content script, side panel, service worker. |
| `background.js` | ✅ | Service worker; abre el side panel al click del icono. |
| `storage.js` | ✅ | Capa de datos sobre `chrome.storage.local` (`window.ContextStore`). Modelo, `buildMd`/`parseMd`, categorías de color, export. Script CLÁSICO (lo usa también el content script). |
| `content.js` | ✅ | Content script (IIFE clásico): selección → icono `+` → popup de captura (combobox de contexto, 4 categorías de color, anidar, Enter guarda) → resaltado en la página. |
| `content.css` | ✅ | Estilos del popup/icono/resaltado, scoped en `.ch-root` (tokens propios, no tematiza la página). Highlight por categoría: `.ch-hl-{title,idea,argument,evidence}`. |
| `sidebar.html` | ✅ | Solo estructura: chrome bar + rail + main. `<link>` a `sidebar.css`, `<script type="module">` a `sidebar.js`. |
| `sidebar.css` | ✅ | Tokens (claro/oscuro) + estilos del panel y del preview Markdown (`.md`). |
| `sidebar.js` | ✅ | **Controlador** (módulo ES): estado (contexts/selección/modo), header, switch Vista/Editor, export `.md`, rename. |
| `sidebar/dom.js` | ✅ | `$`, `escapeHtml`. |
| `sidebar/store.js` | ✅ | Re-exporta `window.ContextStore` como `Store`. |
| `sidebar/markdown.js` | ✅ | `renderMarkdown` (marked + DOMPurify). |
| `sidebar/theme.js` | ✅ | `initTheme` (toggle claro/oscuro, persistido). |
| `sidebar/rail.js` | ✅ | `renderRail` (chips de contexto). |
| `sidebar/vista.js` | ✅ | `renderVista` (preview Markdown del contexto). |
| `sidebar/editor.js` | ✅ | `createEditorController` (Monaco oscuro, sync en vivo, buffers). |
| `vendor/monaco/vs/` | ✅ | Monaco vendored (editor). |
| `vendor/lib/marked.min.js`, `purify.min.js` | ✅ | Parser Markdown + sanitizador. |

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

- **Editar/borrar por ítem en la Vista**: se quitó; hoy se edita solo en el
  **Editor** (texto Markdown). No hay UI de borrado por nota.
- **Agrupar la Vista por página de origen**: implementado antes en el listado,
  pero la Vista pasó a preview Markdown (estructura por subtítulos, no por
  página). No hay agrupación por página en el preview.
- **Atajos de teclado 1–4** para asignar categoría al capturar: omitidos
  (chocan con escribir el nombre del contexto en el combobox).
- **Highlights resaltados en la página no se quitan/limpian** ni se re-aplican
  al recargar (solo se marcan al guardar).
- **Sin tests automatizados** ni build step. Verificación = `node --check` (los
  módulos ES validan copiándolos a `.mjs`) + revisión manual en Chrome.
- **Resaltado de sintaxis Markdown a medida** (overlay del spec §2.4): se usó
  Monaco real en su lugar.

## Trigger de harness — cuando el prompt empieza con `harness:`

Si el mensaje del usuario empieza con la palabra `harness:`, **detente y ejecuta
el pipeline completo antes de tocar cualquier archivo en `outputs/`**. El flujo
es obligatorio y no tiene atajos.

### Pasos en orden (ninguno es opcional)

1. **`./init.sh`** — debe salir verde. Si falla, loguear en `progress/current.md`
   y parar.
2. **Leer `progress/current.md`** — entender el estado que dejó la sesión anterior.
3. **Añadir la feature a `feature_list.json`** con `status: "in_progress"` antes
   de escribir nada más.
4. **Researcher** — investigar y escribir el output a
   `docs/research_<feature>.md`. Todo output va a disco; nada se pasa por chat.
5. **Spec-Writer** — redactar la spec en `docs/spec_<feature>.md` y presentarla
   al usuario para aprobación.
6. **⛔ STOP — esperar aprobación humana.** No escribir ningún archivo en
   `outputs/` hasta que el usuario diga "sí" (o equivalente). Este es el gate
   más importante: violarlo es el error más grave del pipeline.
7. **Tester** — escribir el plan de verificación en `docs/test_<feature>.md`.
8. **Implementer** — editar los archivos en `outputs/` según la spec aprobada.
9. **Reviewer** — correr `./init.sh` otra vez; todos los checks deben salir
   verdes. Sin errores de sintaxis, sin referencias CSS rotas.
10. **Cerrar sesión** — copiar `progress/current.md` a `progress/history.md`,
    resetear `current.md` a la plantilla base, marcar la feature como `done` en
    `feature_list.json`.

### Reglas de oro

- **Una feature a la vez.** Nunca mezclar cambios de features distintas.
- **Todo output de agente va a disco.** Los agentes escriben archivos; el
  orquestador solo recibe referencias a esos archivos.
- **Ningún edit a `outputs/` antes del paso 6.** Ni siquiera "un cambio
  pequeño obvio". Si está en `outputs/`, espera la aprobación.
- **Si `init.sh` falla en cualquier momento, parar.** Loguear el bloqueo y
  marcar la feature como `blocked`.

## Cómo verificar
- Sintaxis clásica: `node --check archivo.js`.
- Sintaxis ESM: copiar a `*.mjs` y `node --check` (solo parsea, no resuelve imports).
- `manifest.json`: validar JSON.
- Manual: cargar carpeta sin empaquetar en `chrome://extensions` (Developer mode).
