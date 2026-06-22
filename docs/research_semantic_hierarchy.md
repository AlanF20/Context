# Research — Feature #6: Jerarquía semántica en la Vista (WCAG)

> Agent: Researcher  
> Date: 2026-06-22  
> Input: user request + WCAG 2.1/2.2 quick reference (w3.org/WAI/WCAG22)

---

## 1. Problema actual

La Vista (`sidebar/vista.js`) renderiza todos los ítems como `<div>`, incluidos
los subtítulos que actualmente usan solo CSS (`font-weight: 700`) para parecer
encabezados. El DOM plano hace que lectores de pantalla no puedan navegar por
jerarquía ni anunciar "lista con N elementos". Los badges de categoría usan
solo color para distinguir tipos (falla WCAG SC 1.4.1). El dominio/URL fuente
aparece en cada nota como ruido visual que el usuario quiere eliminar.

---

## 2. WCAG success criteria relevantes

| SC | Requisito | Impacto en este feature |
|----|-----------|------------------------|
| **1.3.1** Info and Relationships | La estructura visual debe estar en el markup | `<h3>` para subtítulos, `<ul>/<li>` para listas |
| **1.4.1** Use of Color | El color no puede ser el único medio para distinguir categorías | Añadir símbolo único por badge |
| **1.4.3** Contrast (Minimum) | Texto normal ≥ 4.5:1, texto grande ≥ 3:1 | Verificar badges en ambos temas |
| **1.4.11** Non-text Contrast | Componentes UI (bordes, iconos) ≥ 3:1 | Left-border de categoría |
| **2.4.6** Headings and Labels | Los headings deben describir el contenido que sigue | `<h3>` con el texto real del subtítulo |

---

## 3. Patrones establecidos en la industria

### 3.1 Listas semánticas de notas (Notion, Bear, Obsidian)

- Encabezados de sección → elemento `<h2>`/`<h3>` real, no div estilizado
- Notas individuales → `<li>` dentro de `<ul role="list">`
- Metadatos por nota → `<div class="meta">` o `<footer>` dentro de cada `<li>`

### 3.2 Badges de categoría sin depender solo de color (Linear, GitHub Issues)

Linear usa etiqueta de texto + dot de color. GitHub usa nombre de label + fondo
tintado. El patrón ganador: **símbolo único + texto + fondo tintado**. El
símbolo puede ser un carácter Unicode o un glyph CSS `::before`.

Símbolos propuestos para este proyecto (cortos, distinguibles, semánticos):
- `§` — Título (símbolo de sección, connota encabezado)
- `◈` — Idea (forma geométrica, connota concepto)
- `→` — Argumento (flecha, connota dirección/lógica)
- `✓` — Evidencia (checkmark, connota verificado/prueba)

### 3.3 Borde izquierdo por categoría (refuerzo no-color)

Patrón de Notion y Linear para indicar tipo: `border-left: 3px solid <token-color>`.
Satisface SC 1.4.11 (contraste 3:1 del borde contra el fondo de la card).

Tokens de color propuestos (left-border):
- Título: `#c0394c` (rojo oscuro — ya existe como `badge-title` bg tinted)
- Idea: `#c07a00` (ámbar oscuro)
- Argumento: `#1a5fa8` (azul oscuro)
- Evidencia: `#1e7c40` (verde oscuro)

Dark mode equivalents (más claros para contrastar con fondos oscuros):
- Título: `#f6b8c4`
- Idea: `#f5d78e`
- Argumento: `#93bef5`
- Evidencia: `#7fce9e`

### 3.4 Tipografía mínima WCAG (SC 1.4.8 / 1.4.12)

- `line-height`: mínimo 1.5× el tamaño de fuente. El código actual usa 1.55 — correcto, mantener.
- Tamaño base: 13px (actual) es aceptable para un panel; no bajar de 12px.
- `text-align: left` (ya implementado) — nunca `justify`.

---

## 4. Cambios necesarios

### `sidebar/vista.js`

1. `renderVista`: cambiar contenedor de `<div class="vista-list">` a `<ul class="vista-list" role="list">`.
2. `buildItem`: cambiar wrapper de `<div class="vista-item">` a `<li class="vista-item">`.
3. Subtítulo: cambiar contenido de `<div class="vista-item-content">` a `<h3 class="vista-item-content">`.
4. Texto: cambiar contenido de `<div class="vista-item-content">` a `<p class="vista-item-content">`.
5. Añadir `data-category="${item.category}"` en el `<li>` de ítems de texto (para CSS left-border).
6. **Eliminar** el bloque que renderiza `item.source` (el dominio URL).

### `sidebar.css`

1. `.vista-list`: añadir `list-style: none; margin: 0; padding: 12px 14px;` (estilos actuales de padding ya están, solo mover y quitar bullet por defecto).
2. `.vista-item-text[data-category="title"]::before` (y las otras 3) — o bien: `li.vista-item-text[data-category]` con `border-left: 3px solid <token>`.
3. `.vista-cat-badge::before` — símbolo único por categoría (`:is(.badge-title)::before { content: "§ "; }` etc.).
4. Eliminar estilos `.vista-item-source` y `::before` del dot de color de dominio.
5. Añadir tokens CSS `--cat-title-border`, `--cat-idea-border`, etc. en `:root` y `:root[data-theme="dark"]`.

---

## 5. Lo que NO cambia

- El contrato `buildMd`/`parseMd` y el campo `source` en el modelo de datos.
  El campo sigue existiendo; solo se deja de mostrar en la Vista.
- Los estilos de los badges (colores de fondo y texto) — son correctos.
- La lógica de edición inline (`startEdit`, textarea) — no requiere cambios.
- El Editor (Monaco) — no se toca.
- `content.js` — no se toca.

---

## 6. Riesgos

| Riesgo | Mitigación |
|--------|-----------|
| `<h3>` dentro de `<li>` no siempre está en el mental model de devs | Es HTML5 válido; validar con node --check |
| `<p>` dentro de `<li>` — estilo de margin por defecto del navegador | Reset con `margin: 0` en `.vista-item-text p` |
| left-border reduce el ancho disponible para texto en 3px | Ajustar `padding-left` del item para compensar |
| Eliminar `.vista-item-source` CSS mientras existe en DOM de sesiones previas | El selector solo no aplica en ausencia del elemento — no hay riesgo |
