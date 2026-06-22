# Context Highlighter — Especificación de diseño (handoff de implementación)

> **Para la IA implementadora:** este documento describe el rediseño de la UI de la extensión
> **Context Highlighter** (Chrome MV3). El archivo `navigator.html` (HTML autónomo adjunto) es la
> **referencia visual exacta** — ábrelo para ver el resultado. Este `.md` es la fuente de verdad
> para tokens, comportamiento y dónde va cada cosa en el código real.
>
> Implementa sobre la arquitectura existente de 5 archivos (no la reescribas):
> `manifest.json`, `storage.js`, `content.js`/`content.css`, `background.js`, `sidebar.html`/`sidebar.js`.

---

## 0. Dirección de diseño

Limpio y neutro, estilo **Notion / Linear**. Densidad media-alta, jerarquía tipográfica clara,
sin gradientes ni adornos. Dos temas (claro/oscuro). El acento es un índigo (`#5b57e8`).
La UI de la extensión cambia de tema; **la página web subrayada NO** (es contenido ajeno).

Tres pilares que el diseño optimiza:
1. **Navegar muchos contextos** → riel vertical siempre visible.
2. **Densidad** → lista compacta con la fuente (dominio) de cada nota.
3. **Fricción mínima al guardar** → popup de captura de un gesto.

---

## 1. Tokens

Define estos como CSS custom properties en `:root` y `:root[data-theme="dark"]`.
La página web del usuario **no** debe heredar el tema; aplica los tokens solo dentro del
contenedor del side panel y del popup de captura.

### Color — tema claro
```
--bg:            #ffffff   /* superficie base de paneles */
--sunken:        #eeede8   /* fondo hundido / backdrop */
--surface-2:     #f6f5f2   /* riel, inputs, chrome bar */
--surface-3:     #edece6
--border:        #e7e6e0
--border-strong: #dad8d0
--fg:            #262620   /* texto primario */
--fg-2:          #6c6b62   /* texto secundario */
--fg-3:          #9b998e   /* texto terciario / meta */
--accent:        #5b57e8
--accent-fg:     #ffffff
--accent-soft:   #ecebfd   /* fondos de acento suaves */
--accent-border: #ccc9f7
--hl:            #fdeaa8   /* resaltado tipo marcador (amarillo) */
--hl-fg:         #6a5413
--chip:          #f1f0ec
--shadow:        rgba(38,38,28,0.10)
--shadow-lg:     rgba(38,38,28,0.16)
```

### Color — tema oscuro
```
--bg:            #1c1c1f
--sunken:        #121214
--surface-2:     #2a2a2f
--surface-3:     #313138
--border:        #2e2e34
--border-strong: #3c3c44
--fg:            #ededee
--fg-2:          #a2a1a9
--fg-3:          #6e6d76
--accent:        #8b88f7
--accent-fg:     #17171b
--accent-soft:   #272451
--accent-border: #403d7e
--hl:            #4e4421
--hl-fg:         #f0d690
--chip:          #2a2a2f
--shadow:        rgba(0,0,0,0.45)
--shadow-lg:     rgba(0,0,0,0.60)
```

### Color de marca por contexto (acentos del riel)
Cada contexto tiene un color asignado. Paleta usada:
`#5b57e8 (índigo)`, `#e2a23b (ámbar)`, `#3da35d (verde)`, `#4a7fd0 (azul)`,
`#b85cc0 (magenta)`, `#d4564f (rojo)`, `#2aa6a0 (teal)`.
Asígnalos en orden al crear contextos nuevos.

### Color por dominio (punto de fuente)
```
examine.com → #3da35d   ncbi.nlm.nih.gov → #4a7fd0   hubermanlab.com → #1a1a1a
sleepfoundation.org → #7a5cd0   nature.com → #d4564f   pubmed.gov → #2aa6a0
fallback → #8a8a92
```

### Tipografía
- **UI:** `Hanken Grotesk` (400/500/600/700/800), fallback `system-ui, -apple-system, sans-serif`.
- **Mono** (contadores, dominios, URL, editor): `JetBrains Mono` (400/500/600).
- **Lectura del artículo** (solo la página de demo): `Newsreader` serif — NO es parte de la UI de la extensión.
- Activa `-webkit-font-smoothing: antialiased`.

Escala de texto (px): título contexto 18/800 · subtítulo de lista 13/700 · cuerpo de nota 12.5/1.5 ·
meta y dominios 10.5–11 mono · labels de campo 10.5/700 uppercase letter-spacing .07em.

### Espaciado, radios, sombras
- Radios: inputs/botones `8–9px`, tarjetas/popups `14px`, chips de riel `11px`, pills/contadores `20px`.
- Gutters del panel: padding lateral `13–15px`, gaps de `6–11px`.
- Sombra de popup flotante: `0 14px 40px var(--shadow-lg)`. Panel acoplado: borde `1px` + sin sombra.

---

## 2. Componentes

### 2.1 Popup de captura — vive en `content.js` / `content.css`
Se inyecta en la página cuando el usuario selecciona texto y pulsa el ícono flotante `+`.

Anatomía (ancho **~340px**, fondo `--bg`, borde `--border`, radio 14, sombra `--shadow-lg`):
- **Header:** título "Guardar resaltado" (14/700) + en mono a la derecha "en {Contexto}".
- **Cita:** el texto seleccionado, 13/1.45 `--fg-2`, con barra izquierda `3px solid --accent`, padding-left 10.
- **Fila de control:**
  - Selector de **Contexto** (pill con punto de color del contexto + chevron). Al escribir, crea uno nuevo (combobox).
  - Conmutador de **tipo** segmentado de 2 celdas: `Aa` (texto normal) / `H` (subtítulo). 34px cada una, la activa con fondo `--bg` + sombra sutil.
- **Anidar (opcional):** fila con borde punteado + toggle "Anidar bajo {subtítulo}". Solo visible/relevante si el tipo es texto y existe un subtítulo previo.
- **Acciones:** `Cancelar` (ghost) + `Guardar` (primario, con kbd `↵`). Enter guarda.

Microcopy: "↳ Se guardará en {Contexto} · escribe para crear otro".

### 2.2 Panel lateral (sidebar) — vive en `sidebar.html` / `sidebar.js`
Ancho real del Chrome side panel ~360–400px. Estructura de 2 zonas: **riel** + **main**.

**Chrome bar** (top, `--surface-2`): logo "C" (cuadrado acento) + "Context Highlighter" + íconos pin y cerrar.

**Riel** (izquierda, ancho **62px**, fondo `--surface-2`, borde derecho):
- Lista vertical de contextos como chips redondeados **38×38**, radio 11, color de marca, iniciales de 2 letras (`Co`, `Su`…), texto blanco 14/800.
- **Activo:** opacidad 1 + anillo `box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px {colorContexto}`. **Inactivo:** opacidad .5.
- Al final, botón `+` (cuadrado punteado) → crea contexto nuevo y lo selecciona (muestra estado vacío).

**Main** (columna derecha):
- **Header de contexto:**
  - Fila 1: punto de color + nombre del contexto (18/800, truncado con ellipsis) + botón `.md` (descarga, primario pequeño).
  - Fila 2: contador en mono `"{n} ítems · {s} subt · {t} txt"` (izq) + **conmutador Vista/Editor** segmentado (der).
  - Fila 3 (solo en Vista): input de **búsqueda/filtro** ("Filtrar resaltados…").
- **Cuerpo** según modo (ver 2.3 y 2.4).

### 2.3 Vista (preview de resaltados) — modo por defecto
Lista densa scrollable. Para cada ítem según `type`:
- **subtitle:** punto cuadrado acento 6px + texto 13/700. Es un encabezado de grupo.
- **text:** párrafo 12.5/1.5 `--fg`; debajo, fila meta: punto de color de dominio 12px + dominio en mono 10.5 `--fg-3` (izquierda) + **acciones** (derecha).
- **Acciones por ítem** (lo que faltaba en el MVP): aparecen **al hacer hover** sobre la fila (opacity 0→1, `pointer-events` off→on). Dos botones 22×22: **editar** (lápiz) y **borrar** (papelera, color `#d4564f`).
  - **Editar texto:** convierte el párrafo en `<textarea>` inline (borde acento); Enter/blur confirma.
  - **Editar subtítulo:** input inline.
  - **Borrar:** elimina el ítem del contexto inmediatamente.
- Hover de fila aplica `background: var(--surface-2)`.

**Filtro:** al escribir, conserva los ítems `text` cuyo texto incluye la consulta (case-insensitive) y los `subtitle` que tengan al menos un hijo coincidente. Si nada coincide → estado "Sin resultados para «…»".

**Estado vacío del contexto:** ícono en cuadro `--accent-soft`, "Contexto vacío" y guía: resalta texto y pulsa `+` para llenarlo.

### 2.4 Editor (Markdown completo, estilo Monaco) — modo alterno
Reemplaza la lista por un editor de código que edita **todo el documento `.md`** de una vez
(no ítem por ítem). **Siempre tema oscuro** (como Monaco), en ambos temas de la UI.

Anatomía:
- **Tab bar** (`#26262b`): punto ámbar + `{Contexto}.md` en mono + "Editando documento completo".
- **Área de código** (`#1e1e22`): gutter de números de línea (30px, `#54545c`, alineado a la derecha) +
  texto con **resaltado de sintaxis Markdown** y ajuste de línea (`white-space: pre-wrap`).
- **Status bar** (fondo `--accent`): "Markdown · UTF-8 · {n} líneas".

Colores de sintaxis (sobre `#1e1e22`, texto base `#d4d4d8`):
```
# H1        → #c8a4ff (negrita)        ## H2..H6 → #7ec8ff (negrita)    marcador ## → #5a5a64
**negrita** → #e6c07b                  `código`  → #56b6c2              ==marca==  → texto #1e1e22 sobre #d19a66
[enlace](url) → #61afef                _Fuente:_ / > cita → #8aa66b (cursiva)
```

**Técnica de implementación recomendada (overlay):** un `<textarea>` con `color: transparent;
caret-color: #fff; background: transparent` superpuesto sobre un `<pre>`/div de tokens coloreados.
Ambos comparten **exactamente** la misma fuente, `font-size`, `line-height` (20px) y `padding`,
de modo que el wrapping coincide y el cursor cae sobre el token correcto. El gutter va dentro de la
capa coloreada (una fila flex por línea lógica: `[nº][contenido que ajusta]`), así el número se
alinea a la primera línea visual de cada línea lógica.
*(Alternativa: integrar el Monaco real ya vendored con tema oscuro y lenguaje `markdown`.
El overlay es más ligero; Monaco da features completas — elige según tu bundle.)*

---

## 3. Modelo de datos (sin cambios respecto al MVP)
```jsonc
{
  "<id>": {
    "id": "...", "name": "Cortisol", "color": "#5b57e8", "createdAt": "...",
    "items": [
      { "type": "subtitle", "text": "Ritmo circadiano" },
      { "type": "text", "text": "Alcanza su pico ~30 min…",
        "source": "ncbi.nlm.nih.gov", "linkedSubtitleId": "..." }
    ]
  }
}
```
Campos nuevos sugeridos: `color` por contexto (acento del riel). `source` ya existe; deriva el color
del punto con el mapa de §1.

---

## 4. Contrato Markdown ⇄ items (clave para el editor)
La Vista y el Editor comparten una sola fuente de verdad. Define **serializer** y **parser** inversos.

**Serializar contexto → Markdown** (`buildMd`):
```
# {context.name}

## {subtitle.text}

{text.text}

_Fuente: {text.source}_
```
- Título del contexto como `# H1`.
- Cada `subtitle` → `## H2`.
- Cada `text` → párrafo; si tiene `source`, una línea `_Fuente: {source}_` debajo.
- Colapsar líneas en blanco triples a dobles; trim final + `\n`.

**Parsear Markdown → items** (`parseMd`), línea a línea (tras `trim`):
- `# …`  → `context.name`.
- `## …` (o `###`…) → `{ type:'subtitle', text }`.
- `_Fuente: X_` → adjunta `source = X` (+ color) al **último** ítem `text`.
- línea no vacía restante (quitando `> ` inicial) → `{ type:'text', text }`.

**Comportamiento de sincronía:**
- Al teclear en el editor, parsear en vivo y actualizar `items` (la Vista queda al día).
- El `<textarea>` se liga a un **buffer de string** por contexto (lo que el usuario escribió), no a los
  items regenerados, para no perder el cursor.
- Al editar/borrar inline en la Vista, **invalida el buffer** de ese contexto (se regenera del estado).

---

## 5. Export `.md` — `storage.js`
El botón `.md` descarga el `buildMd(context)` actual:
```js
const blob = new Blob([md], { type: 'text/markdown' });
const url = URL.createObjectURL(blob);
const a = Object.assign(document.createElement('a'), { href: url, download: `${context.name}.md` });
document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
```
Mantener también el export a TXT existente.

---

## 6. Interacciones y estados (resumen para QA)
- Cambiar de contexto: clic en chip del riel → main refleja ese contexto (limpia búsqueda y edición).
- Crear contexto: `+` del riel → nuevo contexto vacío seleccionado → estado vacío.
- Buscar: filtra en vivo; estado "sin resultados".
- Hover de nota: revela editar/borrar. Editar = inline; Borrar = inmediato.
- Vista ⇄ Editor: conmutador en el header; el editor edita el doc completo y sincroniza.
- Tema claro/oscuro: cambia tokens de la UI de la extensión; **el editor permanece oscuro**;
  la página web subrayada nunca cambia de tema.
- Guardar desde la página: selección → `+` flotante → popup → al guardar, el ítem aparece en el panel.

---

## 7. Mapeo a archivos (qué tocar)
| Archivo | Qué implementar de este spec |
|---|---|
| `content.css` / `content.js` | Ícono flotante `+` sobre la selección · **popup de captura** (§2.1) · resaltado `--hl` en la página |
| `sidebar.html` | Estructura chrome bar + riel + main · contenedor con tokens (§1) |
| `sidebar.js` | Riel y switching (§2.2) · Vista con editar/borrar/filtro (§2.3) · Editor Monaco + sync (§2.4, §4) · toggle de tema |
| `storage.js` | `buildMd`/`parseMd` (§4) · export `.md` (§5) · campo `color` por contexto |
| `manifest.json` | Sin cambios funcionales (permisos `storage` + `sidePanel` ya existen) |
| `background.js` | Sin cambios (abre el side panel) |

---

## 8. Cómo usar este paquete con tu IA implementadora
Prompt sugerido:
> "Implementa este rediseño en mi extensión de Chrome MV3 **Context Highlighter** siguiendo
> `DESIGN_SPEC.md`. Usa `navigator.html` solo como **referencia visual** (no copies su markup; está
> hecho con un runtime de componentes distinto). Respeta mi arquitectura de 5 archivos y el modelo de
> datos actual en `chrome.storage.local`. Empieza por `storage.js` (buildMd/parseMd), luego `sidebar.js`,
> luego el popup en `content.js`. No introduzcas dependencias nuevas salvo las ya vendored (Monaco, marked, DOMPurify)."

Checklist de aceptación: tokens aplicados en ambos temas · riel con estado activo · editar/borrar por
ítem · filtro · Vista⇄Editor sincronizados · export `.md` con el formato de §4 · la página web no cambia de tema.
