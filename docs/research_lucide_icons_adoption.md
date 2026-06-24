# Research: Adopción de Lucide Icons
**Fecha:** 2026-06-23  
**Feature ID:** 13 — `lucide_icons_adoption`  
**Agente:** Researcher

---

## 1. ¿Qué es Lucide?

Lucide es un fork comunitario activo de Feather Icons (que quedó sin mantenimiento tras 2020). Es la librería open-source de iconos de vector más popular con ese estilo minimalista de línea fina.

| Atributo | Valor |
|---|---|
| Licencia | ISC (permissiva, equivalente MIT) |
| Iconos disponibles | ~1,500+ (crece con cada release) |
| Estilo | Línea fina (stroke), 24×24 viewBox, esquinas redondeadas |
| NPM | `lucide` (vanilla JS/SVG), `lucide-react`, `lucide-vue-next`, etc. |
| Tree-shaking | Sí — cada icono es un export independiente |
| Tamaño unpacked | ~5MB (todos los iconos); en uso real: 1–4KB por icono vía tree-shaking |
| Comunidad | >10k GitHub stars, releases frecuentes, mantenimiento activo |
| Soporte dark mode | Al ser SVG con `currentColor`, hereda el `color` CSS |

**¿Por qué es mejor que Unicode para iconos de UI?**

Los caracteres Unicode como `✏` `✕` `◐` son glifos tipográficos: su renderizado exacto depende de la fuente del sistema operativo. En macOS se ven limpios; en Linux/Windows pueden verse pixelados, distorsionados o tener tamaños dispares. Un SVG con `currentColor` se renderiza igual en todos los entornos, escala perfectamente y puede recibir `aria-label`.

---

## 2. Inventario de iconos actuales en el proyecto

| Ubicación | Símbolo actual | Propósito | Lucide equivalente |
|---|---|---|---|
| `sidebar/vista.js:66` | `✏` | Editar ítem en Vista | `Pencil` o `PencilLine` |
| `sidebar/vista.js:71` | `✕` | Borrar ítem en Vista | `X` |
| `sidebar/vista.js:20` | `✎` | Glifo de estado vacío | `NotebookPen` o `FileEdit` |
| `sidebar/rail.js:41` | `✕` | Borrar contexto (chip) | `X` |
| `sidebar/theme.js:11` | `◐` / `☾` | Toggle claro/oscuro | `Sun` / `Moon` |
| `sidebar.js:99` | `✦` | Glifo "sin contextos" | `Sparkles` o `Layers` |
| `sidebar.html:13` | `◐` | Estado inicial toggle | `Sun` |
| **CSS `::before`** | `§ ◈ → ✓` | Badges de categoría | **No reemplazar** (ver §6) |

**Total de puntos de cambio:** 7 (6 JS + 1 HTML estático)

---

## 3. Compatibilidad con MV3

La política CSP de MV3 prohíbe código remoto (`eval`, `new Function`, CDNs). Lucide es 100% compatible porque:

- Cada icono es una **función que devuelve un string SVG** (no eval, no función dinámica).
- Puede vendorizarse como archivos `.js` locales o incluirse vía npm + Vite (que genera un bundle local).
- **No requiere ninguna red** en tiempo de ejecución.

Restricción relevante: `content.js` debe seguir siendo un IIFE clásico sin módulos ES. Sin embargo, **el content script actual ya no usa iconos** (el popup de captura usa `+` de texto plano). Lucide solo entraría al panel lateral, que SÍ admite módulos ES.

---

## 4. Estrategia de integración por entorno

### 4a. `vite-extension/` (Vite + pnpm — el entorno activo)

```bash
pnpm add lucide
```

En cada módulo que necesite iconos:

```js
import { Pencil, X, Sun, Moon, Sparkles } from 'lucide';

// Lucide devuelve un nodo SVG o string según la función usada:
function iconSvg(iconFn, { size = 16, label } = {}) {
  const [tag, attrs, children] = iconFn.default;  // Lucide vanilla API
  // ...  construir SVGElement
}
```

O más sencillo, usando el helper canónico de Lucide para vanilla JS:

```js
import { createIcons, Pencil, X, Sun, Moon, Sparkles } from 'lucide';
// o usar lucide.createElement para crear SVGElement directamente
```

Vite hace tree-shaking automático: solo los iconos importados llegan al bundle. El overhead añadido es ~1–3KB por icono, ~6–12KB para el set completo de 6 iconos.

### 4b. `outputs/` (outputs sin bundler — el entorno legacy)

Sin Vite ni npm, hay dos sub-opciones:

**Opción A — Strings SVG inlineados (recomendada para outputs/)**  
Crear un `outputs/vendor/lib/icons.js` con los 6 SVGs como constantes string exportadas en `window.Icons`. Copiando los paths SVG de Lucide una sola vez:

```js
// outputs/vendor/lib/icons.js (script clásico)
window.Icons = {
  pencil: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><!-- path data --></svg>`,
  x:       `<svg ...>...</svg>`,
  // ...
};
```

Los módulos `sidebar/*.js` llaman `window.Icons.pencil` en lugar de `"✏"`.

**Opción B — Sprite SVG**  
Un único `outputs/vendor/lib/icons.svg` con `<symbol id="icon-pencil">` etc., referenciado con `<use href="icons.svg#icon-pencil">`. Más limpio pero requiere cambios en HTML.

La **Opción A** es más coherente con la convención existente (como `window.ContextStore`).

---

## 5. Impacto en accesibilidad y UX

| Aspecto | Unicode actual | Lucide SVG |
|---|---|---|
| Renderizado cross-platform | Variable (depende de font) | Consistente en todos los OS |
| Dark mode | Hereda color CSS (OK) | `currentColor` (igual o mejor) |
| Tamaño ajustable | Limitado por `font-size` | `width`/`height` o `transform` |
| `aria-label` | No soportado | Sí, con `aria-label` en el `<svg>` |
| `title` tooltip | Sólo en el botón padre | También en el SVG |
| Peso visual | Inconsistente entre chars | Uniforme (stroke-width fijo) |

---

## 6. Lo que NO se debe reemplazar con Lucide

Los **badges de categoría** en CSS (`::before { content: "§"; }`, `"◈"`, `"→"`, `"✓"`) son marcadores **semánticos** (no decorativos), introducidos explícitamente en Feature #6 para satisfacer WCAG SC 1.4.1 (no usar solo color). Reemplazarlos por Lucide no aportaría nada: los símbolos actuales son simples, inambiguos y no dependen de fuentes del sistema (están hardcodeados en CSS `content`).

**Recomendación: dejarlos intactos.**

---

## 7. Esfuerzo estimado

| Tarea | Archivos | Estimado |
|---|---|---|
| Vendor `icons.js` para `outputs/` | 1 archivo nuevo | ~30 min |
| Actualizar `sidebar/vista.js` (outputs y vite) | 2 archivos | ~15 min |
| Actualizar `sidebar/rail.js` (outputs y vite) | 2 archivos | ~10 min |
| Actualizar `sidebar/theme.js` (outputs y vite) | 2 archivos | ~10 min |
| Actualizar `sidebar.js` + `sidebar.html` | 2 archivos | ~10 min |
| Ajustar CSS `.icon-btn` para SVG sizing | `sidebar.css` x2 | ~10 min |
| **Total** | ~11 archivos | **~1.5 h** |

No se requieren cambios en `manifest.json`, `background.js`, `content.js` ni `storage.js`.

---

## 8. Riesgos y mitigaciones

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| SVG inline rompe `node --check` | Baja (strings en JS, no HTML) | Verificar con `node --check` post-cambio |
| `innerHTML = svgString` XSS en panel | Muy baja (strings constantes vendorizadas, no user-input) | DOMPurify ya está disponible si se necesita |
| Lucide no tiene un icono perfecto para `◐` (half-circle) | Media | `SunMoon` de Lucide es adecuado; `Sun`/`Moon` son más claros |
| Dependency drift en vite-extension | Baja (Lucide es estable) | Pinear versión en package.json |

---

## 9. Conclusión y recomendación

**Sí conviene adoptar Lucide.** Los beneficios superan los costos:

- **Esfuerzo bajo** (~1.5 h, 11 archivos bien delimitados).
- **Mejora real**: renderizado consistente cross-platform, accesibilidad mejor, coherencia visual.
- **MV3-safe**: todo queda local (vendor o bundle).
- **Sin cambios en el modelo de datos** ni en el contrato buildMd/parseMd.

**Plan de implementación sugerido:**

1. En `vite-extension/`: instalar `lucide` como dependencia de producción e importar los 6 iconos necesarios en sus módulos correspondientes.
2. En `outputs/`: crear `vendor/lib/icons.js` con los SVG strings extraídos de Lucide, expuesto como `window.Icons`. Referenciar desde `sidebar.html` antes de `sidebar.js`.
3. Actualizar `.icon-btn` en ambos `sidebar.css` para que los SVG hijos hereden `width: 16px; height: 16px; display: block;`.
4. Dejar los badges de categoría CSS intactos.

La feature entraría como **una sola PR** de tipo "mejora de UX/accesibilidad", sin tocar el modelo de datos ni el content script.
