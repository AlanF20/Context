# Spec — Feature #6: Jerarquía semántica y accesibilidad en la Vista (WCAG)

> Agent: Spec-Writer  
> Date: 2026-06-22  
> Status: **PENDING HUMAN APPROVAL**  
> Research: `docs/research_semantic_hierarchy.md`

---

## Resumen

Refactorizar el renderizador de ítems de la Vista para usar markup semántico
(`<h3>`, `<p>`, `<ul>/<li>`) en lugar de divs planos, añadir un símbolo único
por badge de categoría (WCAG SC 1.4.1), agregar un borde izquierdo tintado por
categoría como refuerzo visual adicional al color, y eliminar el dominio/URL
fuente de la fila de metadatos de cada nota.

---

## Archivos a modificar

| Archivo | Tipo de cambio |
|---------|---------------|
| `outputs/sidebar/vista.js` | Cambio de elementos DOM + eliminar source |
| `outputs/sidebar.css` | Nuevos tokens, left-border por categoría, símbolo en badge, eliminar source styles |
| `feature_list.json` | Actualizar status a `done` al cerrar |

Ningún otro archivo se toca.

---

## Spec detallada

### A. `outputs/sidebar/vista.js`

#### A1. `renderVista` — contenedor de lista

```diff
- const wrap = document.createElement("div");
- wrap.className = "vista-list";
+ const wrap = document.createElement("ul");
+ wrap.className = "vista-list";
+ wrap.setAttribute("role", "list");
```

#### A2. `buildItem` — wrapper de ítem

```diff
- const el = document.createElement("div");
+ const el = document.createElement("li");
  el.className = `vista-item vista-item-${item.type}`;
  el.dataset.id = item.id;
```

#### A3. `buildItem` — contenido de subtítulo

```diff
- const content = document.createElement("div");
+ const content = document.createElement("h3");
  content.className = "vista-item-content";
  content.textContent = item.text;
```

#### A4. `buildItem` — contenido de texto

```diff
- const content = document.createElement("div");
+ const content = document.createElement("p");
  content.className = "vista-item-content";
  content.textContent = item.text;
+ if (item.category) el.dataset.category = item.category;
```

#### A5. Meta row — eliminar bloque de source

Eliminar completamente el sub-bloque que crea y añade `src` (el span
`.vista-item-source`). El badge de categoría se mantiene sin cambios de lógica.

```diff
- if (item.source) {
-   const src = document.createElement("span");
-   src.className = "vista-item-source";
-   src.style.setProperty("--dot-color", Store.domainColor(item.source));
-   src.textContent = item.source;
-   meta.appendChild(src);
- }
```

La condición que decide si se muestra la `meta` row cambia de
`if (item.category || item.source)` a `if (item.category && CAT_LABEL[item.category])`.

---

### B. `outputs/sidebar.css`

#### B1. Nuevos tokens en `:root` y `:root[data-theme="dark"]`

Añadir en el bloque de tokens de `:root` (después de `--shadow-lg`):

```css
/* Category left-border accents */
--cat-title-border:    #c0394c;
--cat-idea-border:     #c07a00;
--cat-arg-border:      #1a5fa8;
--cat-evidence-border: #1e7c40;
```

Añadir en `:root[data-theme="dark"]`:

```css
--cat-title-border:    #f6b8c4;
--cat-idea-border:     #f5d78e;
--cat-arg-border:      #93bef5;
--cat-evidence-border: #7fce9e;
```

#### B2. `.vista-list` — reset de lista

```diff
  .vista-list {
    flex: 1 1 auto;
    overflow-y: auto;
    padding: 12px 14px;
+   list-style: none;
+   margin: 0;
  }
```

#### B3. Left-border por categoría en ítems de texto

Añadir después de `.vista-item:hover`:

```css
.vista-item-text[data-category="title"]    { border-left: 3px solid var(--cat-title-border);    padding-left: 10px; }
.vista-item-text[data-category="idea"]     { border-left: 3px solid var(--cat-idea-border);     padding-left: 10px; }
.vista-item-text[data-category="argument"] { border-left: 3px solid var(--cat-arg-border);      padding-left: 10px; }
.vista-item-text[data-category="evidence"] { border-left: 3px solid var(--cat-evidence-border); padding-left: 10px; }
```

#### B4. Símbolo único por badge (WCAG SC 1.4.1)

Añadir después de los bloques `.badge-*`:

```css
.badge-title::before    { content: "§ "; }
.badge-idea::before     { content: "◈ "; }
.badge-argument::before { content: "→ "; }
.badge-evidence::before { content: "✓ "; }
```

#### B5. Reset de margin en `<p>` y `<h3>` dentro de vista-item

```css
.vista-item-text .vista-item-content   { margin: 0 0 5px; }   /* <p> default margin reset */
.vista-item-subtitle .vista-item-content { margin: 0; }        /* <h3> default margin reset */
```

(Los valores son los mismos que actualmente tienen los `div`; solo se garantiza
que el nuevo elemento semántico no hereda el margin por defecto del navegador.)

#### B6. Eliminar estilos de source domain

Eliminar los bloques:

```css
/* — eliminar — */
.vista-item-source { ... }
.vista-item-source::before { ... }
```

---

## Acceptance criteria (checklist de cierre)

- [ ] `<ul role="list">` envuelve todos los ítems en la Vista.
- [ ] Cada ítem es un `<li>` (no `<div>`).
- [ ] Subtítulos se renderizan como `<h3>`.
- [ ] Notas de texto se renderizan como `<p>`.
- [ ] `data-category` presente en cada `<li>` de tipo texto.
- [ ] Badge muestra símbolo único antes del texto (`§ Título`, `◈ Idea`, `→ Argumento`, `✓ Evidencia`).
- [ ] Borde izquierdo de 3 px visible en cada nota según su categoría.
- [ ] El dominio/URL fuente NO aparece en ninguna nota de la Vista.
- [ ] `init.sh` pasa sin errores (node --check + JSON válido).
- [ ] Sin elementos DOM huérfanos ni referencias CSS rotas.

---

## Lo que no cambia

- Modelo de datos en `chrome.storage.local` — el campo `source`/`sourceUrl` sigue existiendo; solo se deja de mostrar.
- Contrato `buildMd`/`parseMd` — sin cambios.
- Lógica de edición inline (`startEdit`, `commit`, `restore`).
- Editor Monaco.
- `content.js`, `storage.js`, `background.js`.
