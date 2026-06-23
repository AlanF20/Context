# Spec: Migración a Vite + pnpm + @crxjs/vite-plugin

**Feature:** `vite_pnpm_migration` (id 8)
**Spec-Writer:** Claude pipeline — 2026-06-22
**Estado:** Pendiente de aprobación humana

---

## 0. Alcance y diferencias con `outputs/`

Este spec crea un **proyecto nuevo** en el directorio `vite-extension/` (raíz del repo), paralelo al directorio `outputs/` existente. **No modifica `outputs/`.**

### Cambios arquitectónicos deliberados respecto a `outputs/`

| Aspecto | `outputs/` (actual) | `vite-extension/` (nuevo) |
|---|---|---|
| Build system | Sin build step | Vite 7 + @crxjs/vite-plugin |
| Package manager | N/A | pnpm |
| UI principal | Side panel (sidebar.html + Monaco) | Popup (popup.html, sin Monaco) |
| Export format | Markdown (.md) | Texto plano (.txt) |
| storage.js | IIFE clásico, `window.ContextStore` | ES module (`export`) |
| content script | IIFE clásico | IIFE, bundleado por Vite |
| Vendor assets | `vendor/` en repo | Monaco en `public/` (solo si se incluye) |

> **Nota:** El usuario solicitó explícitamente `popup.html` (no side panel). Esto implica prescindir de Monaco. La decisión fue tomada en la solicitud original; si se desea mantener el side panel, hay que indicarlo antes de aprobar este spec.

---

## 1. Estructura de directorios

```
vite-extension/
├── package.json
├── vite.config.js
├── manifest.json
├── .npmrc                   ← solo si pnpm requiere ajuste de hoisting
├── src/
│   ├── background.js        ← SW: abre el popup al click del icono
│   ├── content.js           ← content script (IIFE bundleado por Vite)
│   ├── content.css          ← estilos del popup de captura (scoped .ch-root)
│   ├── popup.html           ← entrada HTML del popup
│   ├── popup.js             ← lógica del popup (ES module)
│   ├── popup.css            ← estilos del popup
│   └── storage.js           ← capa de datos (ES module)
└── dist/                    ← generado por Vite; cargar en Chrome
```

> `public/` se añade solo si Monaco es necesario (ver §7). Para este spec (popup sin editor), **no se necesita `public/`**.

---

## 2. `package.json`

```json
{
  "name": "context-highlighter-vite",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite build --watch",
    "build": "vite build",
    "preview": "vite preview"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "latest",
    "vite": "^7.0.0"
  }
}
```

**Notas:**
- `"dev": "vite build --watch"` en lugar de `"vite"` porque CRXJS escribe en `dist/` (no sirve desde memoria). El watcher recompila en cada cambio. Cargar `dist/` en `chrome://extensions`.
- Cero dependencias de producción: `storage.js` usa únicamente `chrome.storage.local`.
- Sin TypeScript, sin React, sin librerías de UI — vanilla JS.

---

## 3. `vite.config.js`

```js
import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
```

CRXJS lee `manifest.json`, descubre todas las entradas HTML y JS, y las bundlea. No se necesita `rollupOptions.input` manual porque el manifest ya declara todas las entradas.

---

## 4. `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "Context Highlighter",
  "version": "1.0.0",
  "description": "Resalta texto en cualquier página y archívalo por contexto.",
  "permissions": ["storage"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "src/background.js",
    "type": "module"
  },
  "action": {
    "default_popup": "src/popup.html",
    "default_title": "Context Highlighter"
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

**Diferencias respecto a `outputs/manifest.json`:**
- Sin permiso `sidePanel` (no hay side panel).
- `action.default_popup` apunta a `popup.html` en lugar de abrir el panel.
- `background.service_worker` solo necesita manejar el click del icono → ahora el popup se abre automáticamente por `default_popup`, por lo que el SW puede ser mínimo o vacío.
- `content_scripts.js` ya no incluye `storage.js` como script separado: está importado dentro de `content.js` (Vite lo bundlea).

---

## 5. `src/storage.js` — ES module

Refactorización del `storage.js` actual de IIFE a ES module puro. **API idéntica**, solo cambia el mecanismo de exposición.

### Contrato de exportaciones

```js
// Constantes
export const STORAGE_KEY
export const BRAND_COLORS
export const CATEGORIES

// Helpers
export function uid(prefix)
export function categoryMeta(cat)
export function typeForCategory(cat)
export function hostnameFromUrl(url)

// CRUD de contextos
export async function readAll()
export async function writeAll(data)
export async function listContexts()
export async function createContext(name)
export async function getContext(contextId)
export async function listSubtitles(contextId)
export async function deleteContext(contextId)
export async function renameContext(contextId, name)

// CRUD de ítems
export async function addItem(contextId, opts)
export async function updateItem(contextId, itemId, patch)
export async function deleteItem(contextId, itemId)
export async function moveItem(contextId, itemId, delta)

// Export
export function exportContextToText(ctx)
export function buildMd(ctx)
export function parseMd(md)
export async function replaceContextFromMarkdown(contextId, md)
```

### Modelo de datos (sin cambios vs `outputs/`)

```jsonc
{
  "contexts": {
    "<id>": {
      "id": "ctx_...",
      "name": "string",
      "color": "#hex",
      "createdAt": 1234567890,
      "items": [
        {
          "id": "item_...",
          "type": "subtitle" | "text",
          "category": "title" | "idea" | "argument" | "evidence" | null,
          "text": "string",
          "linkedSubtitleId": "string | null",
          "source": "hostname",
          "sourceUrl": "https://...",
          "createdAt": 1234567890
        }
      ]
    }
  }
}
```

> El usuario mencionó "visual separators" como nuevo tipo de ítem. Si se confirma, se añade `"type": "separator"` al modelo y se añade `addSeparator(contextId)` a la API. **Queda pendiente confirmación** antes de implementar.

### Uso en otros módulos

```js
// content.js
import { addItem, listContexts, createContext } from './storage.js'

// popup.js
import { listContexts, getContext, exportContextToText, deleteContext } from './storage.js'
```

Vite bundlea el código de `storage.js` dentro de cada entry point: el bundle de `content.js` incluye storage, y el bundle de `popup.js` también. No hay estado compartido en memoria — el estado real vive en `chrome.storage.local`.

---

## 6. `src/background.js`

Con `action.default_popup` definido en el manifest, Chrome abre el popup automáticamente. El SW ya no necesita llamar a `chrome.sidePanel.setPanelBehavior`. Se mantiene mínimo:

```js
// MV3 service worker — no action needed when popup is declared in manifest.
// Keep file so CRXJS has a SW entry point for HMR relay.
chrome.runtime.onInstalled.addListener(() => {
  // Future: onboarding, context menu, etc.
});
```

---

## 7. `src/content.js`

La lógica del content script **no cambia funcionalmente** respecto a `outputs/content.js`. Cambios de forma:

1. El import de `storage.js` pasa de `window.ContextStore` a un import ES:
   ```js
   import * as Store from './storage.js'
   ```
2. El archivo deja de ser un IIFE envoltorio explícito — Vite aplica el IIFE al bundlear para MV3.
3. El resto de la lógica (selección, icono flotante, popup de captura, resaltado) es idéntica.

---

## 8. `src/content.css`

Sin cambios respecto a `outputs/content.css`. Mismos tokens `ch-`, mismo scoping bajo `.ch-root`, mismas clases `.ch-hl-{title,idea,argument,evidence}`.

---

## 9. `src/popup.html`

Entrada HTML del popup. Carga `popup.js` como módulo ES (CRXJS lo detecta y bundlea):

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Context Highlighter</title>
  <link rel="stylesheet" href="popup.css" />
</head>
<body>
  <div id="app"></div>
  <script type="module" src="popup.js"></script>
</body>
</html>
```

Dimensiones del popup: `width: 360px; min-height: 480px` (controladas en `popup.css`).

---

## 10. `src/popup.js` — lógica del popup

### Responsabilidades

1. **Lista de contextos:** Renderizar todos los contextos guardados en `chrome.storage.local`.
2. **Selección:** Permitir al usuario hacer clic en un contexto para ver sus ítems.
3. **Vista de ítems:** Mostrar la lista de ítems del contexto seleccionado (subtítulos y textos).
4. **Crear contexto:** Input + botón para crear un nuevo contexto con nombre.
5. **Eliminar contexto:** Botón de borrado por contexto.
6. **Exportar a .txt:** Botón que descarga el contexto seleccionado como archivo `.txt` usando `exportContextToText()` y la API `URL.createObjectURL` / `<a download>`.

### Flujo principal

```
popup abre
  → listContexts() → renderizar lista
  → usuario selecciona contexto
    → getContext(id) → renderizar ítems
    → botón "Descargar .txt"
      → exportContextToText(ctx) → Blob → <a> click → descarga
```

### No incluye en este spec

- Editor Monaco ni edición inline de texto.
- Renombrar contexto (puede añadirse como feature separada).
- Vista agrupada por página de origen.

---

## 11. `src/popup.css`

Estilos del popup. Tokens CSS propios (`--ch-` prefixed). Sin dependencias externas. Soportar tema claro y oscuro con `@media (prefers-color-scheme: dark)`. Tamaño del popup fijo en `360 × 480px` mínimo.

---

## 12. Flujo de desarrollo (pnpm)

```bash
# 1. Instalar desde cero
cd vite-extension
pnpm install

# 2. Modo dev (watch + build continuo a dist/)
pnpm run dev
# → Cargar la carpeta dist/ en chrome://extensions (modo desarrollador)
# → Cada cambio en src/ recompila dist/ automáticamente
# → Para ver cambios en content.js: recargar la pestaña manualmente
# → Para ver cambios en popup.js: cerrar y reabrir el popup

# 3. Build de producción
pnpm run build
# → dist/ listo para comprimir y subir al Chrome Web Store
```

---

## 13. Criterios de aceptación

1. `pnpm install` termina sin errores en un directorio limpio.
2. `pnpm run dev` genera `dist/` sin errores de compilación.
3. `dist/` se carga en `chrome://extensions` sin errores en la consola del SW.
4. Seleccionar texto en cualquier página muestra el icono flotante y el popup de captura.
5. Guardar una nota la persiste en `chrome.storage.local` (verificable en DevTools → Application → Storage).
6. Abrir el popup muestra la lista de contextos y los ítems del seleccionado.
7. "Descargar .txt" descarga un archivo con el formato correcto (`exportContextToText`).
8. `node --check` pasa en todos los archivos JS de `src/` (clásico o `.mjs` para ESM).
9. `pnpm run build` genera `dist/` con `manifest.json` válido y sin errores Rollup.

---

## 14. Fuera de alcance (este spec)

- Monaco / edición de Markdown: no incluido (no hay side panel).
- Side panel: no incluido.
- HMR in-place para content scripts: page reload es suficiente.
- TypeScript: no incluido (vanilla JS, como el proyecto actual).
- Tests automatizados: pendiente como feature separada.
- Migración de datos desde `outputs/` al nuevo formato: ambos usan la misma clave `chrome.storage.local` con el mismo schema, por lo que son compatibles.
