# Spec: vite_sidebar_parity (Feature #10)

**Fecha:** 2026-06-22  
**Dependencias:** Feature #8 (`vite_pnpm_migration`, done)  
**Research:** `docs/research_vite_sync.md`  
**Estado:** _pendiente de aprobación humana_

---

## Objetivo

`vite-extension/` fue creado en Feature #8 como un build popup-only con Vite + pnpm + @crxjs/vite-plugin. Desde entonces, `outputs/` recibió cuatro features que añadieron el side panel completo: Vista semántica, Monaco editor, badges de categoría, acciones inline, y nest-select. Esta feature porta todo ese UI al proyecto Vite para que `vite-extension/` sea el build canónico, funcional e idéntico en comportamiento a `outputs/`.

**No se toca `outputs/`** durante esta implementación. Es la referencia; solo se lee.

---

## Alcance

### Qué se porta (de `outputs/` → `vite-extension/src/`)

| Archivo origen | Destino | Adaptación necesaria |
|---|---|---|
| `outputs/sidebar.html` | `vite-extension/src/sidebar.html` | Ajustar rutas de `<link>`/`<script>` a la estructura Vite |
| `outputs/sidebar.css` | `vite-extension/src/sidebar.css` | Ninguna (CSS puro) |
| `outputs/sidebar.js` | `vite-extension/src/sidebar.js` | Imports ya son ESM; verificar rutas relativas |
| `outputs/sidebar/dom.js` | `vite-extension/src/sidebar/dom.js` | Ninguna |
| `outputs/sidebar/store.js` | `vite-extension/src/sidebar/store.js` | Cambiar `window.ContextStore` → ESM import de `../storage.js` |
| `outputs/sidebar/markdown.js` | `vite-extension/src/sidebar/markdown.js` | Adaptar acceso a `marked`/`DOMPurify` a imports ESM (via Vite bundle) |
| `outputs/sidebar/theme.js` | `vite-extension/src/sidebar/theme.js` | Ninguna |
| `outputs/sidebar/rail.js` | `vite-extension/src/sidebar/rail.js` | Ninguna |
| `outputs/sidebar/vista.js` | `vite-extension/src/sidebar/vista.js` | Ninguna |
| `outputs/sidebar/editor.js` | `vite-extension/src/sidebar/editor.js` | Monaco: cargar via ESM loader (ver §Monaco) |

### Qué se modifica en `vite-extension/`

| Archivo | Cambio |
|---|---|
| `vite-extension/manifest.json` | Añadir `"sidePanel"` a permissions; añadir `"side_panel": { "default_path": "src/sidebar.html" }`; quitar `"action.default_popup"` (o dejarlo como fallback) |
| `vite-extension/src/background.js` | Añadir `chrome.action.onClicked.addListener` → `chrome.sidePanel.open()` (mismo patrón que `outputs/background.js`) |
| `vite-extension/vite.config.js` | Añadir `sidebar.html` como entry point adicional en el plugin CRXJS |

### Qué NO se toca

- `vite-extension/src/popup.html`, `popup.js`, `popup.css` — se mantienen como UI secundario (no conflicta con el side panel)
- `vite-extension/src/content.js`, `content.css` — ya en paridad con `outputs/`
- `vite-extension/src/storage.js` — ya en paridad con `outputs/`
- Todo `outputs/` — es solo referencia

---

## Diseño técnico

### Monaco en Vite

`outputs/` carga Monaco con un vendor clásico (`vendor/monaco/vs/loader.js`). En Vite con ESM se puede:

**Opción A (Vendor copy — más segura para MV3 CSP):**  
Copiar `outputs/vendor/` a `vite-extension/public/vendor/` y en `sidebar.html` cargar los scripts clásicos igual que en `outputs/` (CRXJS respeta archivos en `public/`).

**Opción B (npm monaco-editor):**  
`pnpm add monaco-editor` y cargar via `import * as monaco from 'monaco-editor'`. Requiere configurar workers de Monaco para que CRXJS los empaquete correctamente. Más trabajo, mayor riesgo.

**La spec elige Opción A** (vendor copy) por simplicidad y porque el patrón ya funciona en `outputs/`. Si el build de Vite comprime o transforma los archivos del vendor, se puede mover a `public/vendor/` (Vite no toca los assets de `public/`).

### `marked` y `DOMPurify` en Vite

`outputs/` los carga como scripts clásicos UMD antes del módulo ES. En Vite se pueden importar como paquetes npm:

```js
// vite-extension/src/sidebar/markdown.js
import { marked } from 'marked';
import DOMPurify from 'dompurify';
```

Esto reemplaza la dependencia de las globals `window.marked` / `window.DOMPurify`. **La spec elige esta opción** — evita la carga frágil de UMD + requiere `pnpm add marked dompurify`.

### `sidebar/store.js` — eliminar dependencia de `window.ContextStore`

`outputs/sidebar/store.js` re-exporta `window.ContextStore`. En Vite ese global no existe (cada entry point tiene su propio bundle). El nuevo `store.js` importa directamente:

```js
// vite-extension/src/sidebar/store.js
export * from '../storage.js';
```

### Orden de carga en `sidebar.html`

En `outputs/`, el orden importa por el hack UMD de Monaco. Con Vite + ESM + `pnpm add marked dompurify`, el orden crítico desaparece. `sidebar.html` puede ser:

```html
<link rel="stylesheet" href="sidebar.css">
<script type="module" src="sidebar.js"></script>
```

CRXJS se encarga de los chunks de Monaco via el vendor copy en `public/`. El loader AMD sigue siendo el punto de entrada de Monaco, pero se carga como script clásico antes del módulo:

```html
<script src="/vendor/monaco/vs/loader.js"></script>
<script type="module" src="sidebar.js"></script>
```

### Manifest actualizado

```json
{
  "manifest_version": 3,
  "name": "Context Highlighter",
  "version": "2.0.0",
  "permissions": ["storage", "sidePanel"],
  "action": {
    "default_title": "Open Context Highlighter sidebar"
  },
  "side_panel": {
    "default_path": "src/sidebar.html"
  },
  "background": {
    "service_worker": "src/background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content.js"],
      "css": ["src/content.css"],
      "run_at": "document_idle"
    }
  ]
}
```

Nota: `action.default_popup` se quita. El popup existente (`popup.html`) queda como código muerto o se puede borrar en una limpieza futura. No se toca en esta feature.

### `background.js` actualizado

```js
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});
```

### `vite.config.js`

CRXJS detecta automáticamente los entry points declarados en `manifest.json`. Al añadir `"side_panel": { "default_path": "src/sidebar.html" }`, CRXJS incluye `sidebar.html` y sus imports como entry. No se requiere configuración manual extra.

---

## Pasos de implementación (para el Implementer)

1. `pnpm add marked dompurify` en `vite-extension/`.
2. Copiar `outputs/vendor/` → `vite-extension/public/vendor/`.
3. Copiar `outputs/sidebar.html` → `vite-extension/src/sidebar.html`; ajustar rutas.
4. Copiar `outputs/sidebar.css` → `vite-extension/src/sidebar.css` (sin cambios).
5. Copiar `outputs/sidebar.js` → `vite-extension/src/sidebar.js`; verificar imports relativos.
6. Copiar todos los módulos `outputs/sidebar/*.js` → `vite-extension/src/sidebar/`.
7. Modificar `vite-extension/src/sidebar/store.js` (eliminar `window.ContextStore`).
8. Modificar `vite-extension/src/sidebar/markdown.js` (usar `import { marked }` / `import DOMPurify`).
9. Actualizar `vite-extension/manifest.json` (sidePanel).
10. Actualizar `vite-extension/src/background.js` (sidePanel.open).
11. `pnpm run build` — verificar que no hay errores.
12. `pnpm run dev` — verificar HMR.
13. Cargar `vite-extension/dist/` en `chrome://extensions` y probar manualmente.

---

## Criterios de aceptación (checklist del Reviewer)

- [ ] `pnpm install && pnpm run build` sin errores.
- [ ] `dist/` contiene `sidebar.html`, `sidebar.css`, chunks del bundle, `vendor/monaco/`.
- [ ] Cargar `dist/` en Chrome: el icono abre el side panel (no popup).
- [ ] El rail muestra los chips de contexto guardados.
- [ ] La Vista muestra ítems con HTML semántico, badges (§ ◈ → ✓), borde izquierdo de color.
- [ ] Editar/borrar un ítem inline funciona y persiste en `chrome.storage.local`.
- [ ] El toggle Vista↔Editor funciona; Monaco carga y edita en vivo.
- [ ] El popup de captura (content script) sigue funcionando y guarda ítems.
- [ ] `init.sh` pasa sin errores de sintaxis.

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| CRXJS no incluye `public/vendor/` en `dist/` | Verificar con `pnpm run build`; si falta, mover Monaco a `vite-extension/src/vendor/` y declarar como asset en `vite.config.js` |
| Monaco AMD loader choca con ESM de Vite | El loader de Monaco es un script clásico; cargarlo con `<script>` clásico antes del módulo (igual que en `outputs/`) lo aísla del sistema de módulos de Vite |
| DOMPurify con Vite SSR / context `window` | Usar `import DOMPurify from 'dompurify'` — el paquete npm maneja el contexto browser correctamente |
| Popup existente queda huérfano (no hay `action.default_popup`) | El popup de `popup.html` simplemente deja de aparecer; el código no se borra, no rompe nada |

---

## Fuera de alcance

- Migrar `outputs/` a Vite (no es parte de esta feature).
- Implementar features pendientes (#2, #3, #4, #9) en vite-extension.
- Borrar o deprecar `outputs/` (decisión para una sesión futura).
- Tests automatizados.
