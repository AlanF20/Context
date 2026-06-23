# Research: Migración a Vite + pnpm + @crxjs/vite-plugin

**Feature:** `vite_pnpm_migration` (id 8)
**Researcher:** Claude pipeline — junio 2026
**Fuentes:** agente con acceso web (síntesis principal) + 4 agentes de training data para verificación cruzada

---

## 1. Estado de @crxjs/vite-plugin

### Veredicto: activamente mantenido (junio 2026)

| Periodo | Estado |
|---|---|
| ago 2022 | Última release estable 1.x; v2.0.0-beta congelado |
| feb 2025 | Autor original amenaza con archivar si no hay nuevos mantenedores |
| jul 2025 | Nuevo equipo publica **v2.0.3**, rompe el congelamiento |
| jun 2026 | **v2.7.0** (última), soporte Vite 8 desde v2.6.1 |

**Package npm:** `@crxjs/vite-plugin@latest` (tag `latest`, NO usar `@beta`).
**Peer deps:** Vite `^3.0.0 || ^4.0.0 || ^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0`.

### Alternativas evaluadas

| Herramienta | Estrellas GH | Base | Veredicto |
|---|---|---|---|
| **WXT** | ~7.9k | Vite | Mejor opción para proyecto nuevo batteries-included |
| **CRXJS** | ~3.5k | Vite plugin | Mejor control; mínima magia; correcto para vanilla JS |
| **Plasmo** | ~10k | Parcel | React-heavy, maint. lenta en 2024, AMD loader problemático |

**Conclusión:** CRXJS es la opción correcta para este proyecto (vanilla JS, control explícito, mínima abstracción).

---

## 2. Compatibilidad con pnpm

**Instalación documentada oficialmente:**
```
pnpm i -D vite @crxjs/vite-plugin
```
No requiere `.npmrc` con `shamefully-hoist` para proyectos simples (single-package).

**Bugs conocidos:**

| Issue | Severidad | Estado |
|---|---|---|
| Lockfile bug pnpm | Bajo | **Corregido en v2.6.1** |
| Phantom dep warnings en monorepos | Cosmético | Mitigar con `public-hoist-pattern[]=*vite*` si aparece |
| Versión de Vite fuera del rango compatible | Error de peer | Mantener Vite dentro del rango soportado |

**Recomendación:** Para un proyecto simple (no workspace), no se necesita ningún `.npmrc`. Usar v2.6.1+ o latest para evitar el bug del lockfile.

---

## 3. Service worker (background.js)

CRXJS requiere `"type": "module"` en el service worker — lo gestiona automáticamente en el output. En dev mode, el SW corre `hmr-client-worker.ts` que proxea fetches al servidor Vite.

**Comportamiento HMR:**
- Cambio en background → **full extension reload** (no in-place patch). Por diseño en MV3.
- Se puede deshabilitar con `liveReload: false` en la config CRXJS.

---

## 4. Content scripts bajo MV3

CRXJS soporta tres modos de content script:

| Query param | Output | HMR | Caso de uso |
|---|---|---|---|
| `?script` | Async loader + HMR client | **In-place HMR** | Desarrollo activo del content script |
| `?script&module` | ES module nativo | In-place HMR | Cuando se necesita `world: "MAIN"` |
| `?script&iife` | Bundle IIFE | Page reload | `document_start` o timing crítico |

**Para `content.js` actual (IIFE clásico):** Declarado directamente en `manifest.json` como content script, CRXJS lo bundlea como IIFE. En dev, un cambio en el archivo requiere recargar la pestaña para que surta efecto. **Aceptable** para este proyecto.

**v2.7.0:** Añade soporte HMR para content scripts en `world: "MAIN"`.

---

## 5. Side panel

CRXJS v2.x reconoce `side_panel.default_path` como entrada HTML y la bundlea automáticamente. v1.x **no** lo reconocía (requería workaround con `rollupOptions.input`). Usar v2.x garantiza soporte correcto.

---

## 6. manifest.json — Dos enfoques

**Opción A — JSON estático:**
```js
// vite.config.js
import manifest from './manifest.json'
import { crx } from '@crxjs/vite-plugin'
export default defineConfig({ plugins: [crx({ manifest })] })
```

**Opción B — `defineManifest` (recomendado para producción):**
```js
// manifest.config.js
import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'
export default defineManifest({ name: pkg.name, version: pkg.version, ... })
```

**Comportamiento del build:**
- Rutas en el manifest se resuelven relativas a `vite.config.js`.
- Output: `dist/manifest.json` con rutas actualizadas a los filenames hasheados de Rollup.
- CRXJS extrae automáticamente `<script>` inline de HTML (cumple CSP de MV3).
- Los globs `*` y `**/*` en `web_accessible_resources` son **ignorados intencionalmente** (previene incluir `node_modules`).

---

## 7. Monaco Editor en Vite / MV3

**Problema principal:** Monaco usa un AMD loader (`vs/loader.js`) que entra en conflicto con el sistema ESM de Vite/Rollup. Además, los language services usan `new Function()` / `eval()`, prohibido por la CSP de MV3.

**Solución validada para extensiones:** Mantener Monaco en `public/`.

- Archivos en `public/` se copian verbatim a `dist/` sin pasar por Vite.
- Se carga en HTML con `<script src="/vs/loader.js">` antes del módulo principal.
- Las llamadas AMD `require()` existentes funcionan igual.
- **Para edición Markdown** (caso de uso actual) no se necesitan language workers — el editor básico no dispara `eval()`.

**Alternativa peligrosa (NO recomendada):** `npm install monaco-editor` → conflictos AMD + chunks multi-MB + worker URLs incorrectas en extensiones. Evitar.

---

## 8. storage.js — Estrategia en Vite

El `storage.js` actual es un IIFE clásico que expone `window.ContextStore`. En Vite, hay dos rutas:

| Estrategia | Esfuerzo | Resultado |
|---|---|---|
| **Mantener en `public/`** | Mínimo | Copia verbatim, `window.ContextStore` sigue funcionando |
| **Refactorizar a ES module** | Medio | `import { listContexts } from './storage.js'` en popup/sidebar; bundled separado para content script |

Para el nuevo proyecto Vite (desde cero, con popup.html), la **refactorización a ES module** es la opción correcta: el popup.js importa storage.js directamente, y el content.js también lo importa. Vite incluye el código de storage en ambos bundles (IIFE para content, módulo para popup). El estado real sigue siendo `chrome.storage.local`, no memoria compartida.

---

## 9. Estructura de output (build)

**Dev (`pnpm run dev`):** Genera `dist/` con loaders apuntando a `localhost:5173`. Cargar `dist/` en `chrome://extensions`.

**Prod (`pnpm run build`):** Genera `dist/` autocontenido con hashes. Listo para Chrome Web Store (comprimir en zip).

```
dist/
├── manifest.json              ← transformado por CRXJS
├── service-worker-loader.js   ← (dev: proxy; prod: SW bundleado)
├── assets/
│   ├── content.[hash].js
│   ├── content.[hash].css
│   ├── popup.[hash].js
│   └── popup.[hash].css
├── popup.html                 ← scripts extraídos (CSP)
└── vs/                        ← Monaco (si se usa public/)
```

---

## 10. Resumen de decisiones técnicas para la spec

| Decisión | Elección | Justificación |
|---|---|---|
| Plugin build | `@crxjs/vite-plugin@latest` (v2.7.x) | Único mantenido para Vite; soporte side panel v2 |
| Package manager | pnpm | Requerimiento del usuario; funciona sin config extra |
| Manifest approach | JSON estático (`manifest.json`) | Suficiente para vanilla JS; más simple que `defineManifest` |
| Content script mode | IIFE declarado en manifest | Compatible con la lógica actual; sin HMR in-place pero aceptable |
| Monaco | `public/` (verbatim copy) | Evita conflictos AMD; cero cambios en la lógica del editor |
| storage.js | ES module refactorizado | Nuevo proyecto; imports explícitos; más limpio |
| UI entry point | popup.html (no side panel) | Requerimiento explícito del usuario |
| Export format | .txt (no .md) | Requerimiento explícito del usuario |
| Vite version | 6.x o 7.x | Compatibles; evitar 5.0.12–5.1.x (bug de script en HTML) |
