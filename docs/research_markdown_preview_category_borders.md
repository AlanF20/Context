# Research: Bordes de categoría en el preview Markdown de la Vista

**Feature ID:** 20  
**Fecha:** 2026-06-24

---

## Contexto

La Vista (feature #18 `preview_doc_editor`) renderiza `buildMd(ctx)` a través de `marked` + DOMPurify.
El Markdown producido por `buildMd` tiene este formato:

```
# Contexto
## Subtítulo
🟡 Texto de idea...
_Fuente: dominio.com_
🔵 Texto de argumento...
🟢 Texto de evidencia...
```

`marked.parse()` convierte esas líneas en HTML plano:
- `## Subtítulo` → `<h2>Subtítulo</h2>`
- `🟡 Texto` → `<p>🟡 Texto</p>`
- `_Fuente: x_` → `<p><em>Fuente: x</em></p>`

Los emojis quedan visibles como texto en el párrafo. No hay ninguna diferenciación visual por categoría.

El objetivo es reproducir el borde izquierdo de color por categoría que tenía la Vista ítem-por-ítem (features #6 y #16), sin abandonar el render `marked` de la feature #18.

---

## Análisis técnico

### Opción A — Renderer personalizado de `marked` (recomendada)

`marked` expone `new marked.Renderer()` (o `new Renderer()` en v14+). Se puede sobreescribir el método `paragraph` para interceptar cada bloque `<p>` antes de que llegue a DOMPurify.

```js
import { marked, Renderer } from 'marked'

const EMOJI_CAT = { '🟡': 'idea', '🔵': 'argument', '🟢': 'evidence' }

function buildCategoryRenderer() {
  const r = new Renderer()
  r.paragraph = ({ text }) => {
    for (const [emoji, cat] of Object.entries(EMOJI_CAT)) {
      if (text.startsWith(emoji)) {
        const content = text.slice(emoji.length).trimStart()
        return `<div class="md-cat-item cat-${cat}"><p>${content}</p></div>\n`
      }
    }
    return `<p>${text}</p>\n`
  }
  return r
}
```

**Por qué funciona:** `text` en el renderer de párrafo contiene el inline-Markdown ya procesado (negrita, cursiva, links); el emoji 🟡/🔵/🟢 no es markdown especial, se pasa literalmente. `text.startsWith('🟡')` funciona en JS porque el emoji es 2 code units (`🟡`), consistente con cómo `buildMd` los escribe.

**Interacción con DOMPurify:** Los `<div class="md-cat-item cat-idea">` sobreviven a DOMPurify porque:
- `div` está en la lista de tags permitidos por defecto.
- `class` está en los atributos permitidos por defecto.

**Compatibilidad con listas multi-línea:** `buildMd` omite el emoji en ítems con `\n` (listas Markdown). Esos ítems no tienen prefijo → no se envuelven → se renderizan como `<ul>`/`<ol>` normales. Correcto.

**Modo claro/oscuro:** Los tokens CSS `--cat-idea-border`, `--cat-arg-border`, `--cat-evidence-border` ya están definidos en `sidebar.css` con overrides en `prefers-color-scheme: dark` y en `.dark`. El CSS nuevo solo necesita referenciarlos.

### Opción B — Post-procesado del HTML renderizado

Después de `DOMPurify.sanitize`, parsear con `DOMParser`, buscar `<p>` que comiencen con el emoji, envolver en `<div>`. Más frágil (string → DOM → string → DOM doble parseo) y más lento. Descartada.

### Opción C — Cambiar `buildMd` para emitir HTML en lugar de Markdown

Rompe el contrato `buildMd`/`parseMd`, invalida la exportación .md y el Editor Monaco. Descartada.

---

## Archivos afectados

| Archivo | Cambio |
|---|---|
| `vite-extension/src/sidebar/markdown.js` | Añadir `buildCategoryRenderer()` y pasar `renderer` a `marked.parse()` |
| `vite-extension/src/sidebar.css` | Añadir `.md-cat-item` + `.cat-idea/argument/evidence` con `border-left` |

---

## Contrato CSS (tokens existentes)

Los tokens `--cat-*-border` ya existen en `sidebar.css`:

```css
/* light */
--cat-title-border:    #c0394c;
--cat-idea-border:     #c07a00;
--cat-arg-border:      #1a5fa8;
--cat-evidence-border: #1e7c40;

/* dark */
--cat-title-border:    #f6b8c4;
--cat-idea-border:     #f5d78e;
--cat-arg-border:      #93bef5;
--cat-evidence-border: #7fce9e;
```

El CSS nuevo reutiliza estos tokens:

```css
.vista-md-preview .md-cat-item {
  border-left: 3px solid var(--border-strong);
  padding-left: 10px;
  margin: 0 0 10px;
}
.vista-md-preview .md-cat-item.cat-idea     { border-left-color: var(--cat-idea-border); }
.vista-md-preview .md-cat-item.cat-argument { border-left-color: var(--cat-arg-border); }
.vista-md-preview .md-cat-item.cat-evidence { border-left-color: var(--cat-evidence-border); }
.vista-md-preview .md-cat-item p { margin: 0; }
```

---

## Notas de borde

- **`text.startsWith(emoji)` vs comparación de code points:** Los tres emojis (🟡 U+1F7E1, 🔵 U+1F535, 🟢 U+1F7E2) son todos caracteres fuera del BMP (2 code units en JS). `String.startsWith` opera sobre code units, por lo que la comparación es correcta sin necesidad de `[...text][0]`.
- **Selector CSS `.vista-md-preview .md-cat-item`:** Usar el padre `.vista-md-preview` como namespace evita colisiones si el mismo `.md-cat-item` se usara en otro contexto (poco probable, pero precautorio).
- **Sin cambios en `buildMd` / `parseMd`:** El renderer solo afecta la visualización. Los datos almacenados y el Markdown exportado son idénticos.
- **El `_Fuente:_` sigue renderizándose correctamente** como `<p><em>Fuente: …</em></p>` fuera del wrapper de categoría — así está ahora, no empeora ni mejora. No es objetivo de esta feature.
