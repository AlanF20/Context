# Investigación: Robustez de la persistencia de resaltados (anclaje fuzzy, CSS Highlight API, páginas dinámicas)

**Feature:** `highlight_persistence_robustness`
**Fecha:** 2026-07-03
**Autor:** Researcher Agent (síntesis de 4 informes: auditoría de código, anclaje fuzzy, CSS Custom Highlight API, re-aplicación en SPA)
**Decisiones de producto ya tomadas (entrevista):** (1) los resaltados deben sobrevivir en páginas estáticas Y dinámicas/SPA; (2) el criterio de "misma página" sigue siendo `location.href` exacto — la normalización de URL está fuera de alcance; (3) fuzzy matching para tolerar cambios menores de texto + indicador "no encontrado en la página" en el panel cuando el anclaje falla; (4) migrar a CSS Custom Highlight API solo si la investigación lo respalda, manteniendo compatibilidad total con los datos ya guardados.

---

## 1. Resumen ejecutivo

Se investigó por qué los resaltados guardados dejan de re-aplicarse al recargar o revisitar
páginas, y cómo hacer el sistema robusto ante cambios menores de texto y contenido dinámico.
La auditoría encontró que el matcher actual (exact `indexOf` con separador `\x00`) falla de
forma sistemática y silenciosa en clases enteras de páginas, y que además hay un bug de datos:
`content-storage.js` descarta `rangeText` al guardar. **Recomendación**: (a) añadir un
`TextPositionSelector` (`rangeStart`/`rangeEnd`) al ítem y reemplazar el matcher por un pipeline
de 4 niveles (posición → exacto → exacto normalizado → fuzzy con `approx-string-match@2.0.0`,
~2 KB gzipped, cero deps, con scoring estilo Hypothesis); (b) migrar el pintado de `<mark>` a la
**CSS Custom Highlight API** (Chrome 105+, cero mutación del DOM, fidelidad de color idéntica);
(c) envolver el anclaje en una **sesión por URL** con `MutationObserver` debounced + detección
de navegación SPA sin cambios de manifest; (d) reportar el estado de anclaje al side panel por
mensajería efímera para el badge "no encontrado en la página". Los campos existentes
(`rangePrefix`/`rangeSuffix`/`rangeText`) se conservan sin renombrar: los ítems legados ganan
fuzzy matching gratis.

---

## 2. Auditoría del estado actual

### 2.1 Flujo de persistencia (todo en `vite-extension/src/content.js` salvo indicación)

1. **Captura**: `mouseup` (líneas 121–139) guarda `savedText` (Markdown si la selección contiene
   listas, vía `fragmentToMarkdown`, 43–47), `savedRawText = sel.toString().trim()` (130) y
   `savedRange` (131).
2. **Guardado**: `fastSave` (275–294) o `doSave` (558–593) llaman a `extractRangeContext`
   (622–639), que deriva `rangePrefix`/`rangeSuffix` (últimos/primeros 50 chars alrededor de la
   selección, vía `Range.toString()` — concatena nodos de texto **sin separadores**), y a
   `Store.addItem(...)` con `sourceUrl: location.href`.
   Importante: el `addItem` que ejecuta el content script es el de **`content-storage.js:193–241`**
   (copia privada), no el de `storage.js`.
3. **Pintado en vivo**: `highlightSavedRange` (787–802) envuelve el rango en
   `<mark class="ch-hl ch-hl-{category}" data-ch-id="{id}">` con `surroundContents()` y fallback
   `extractContents()` + `insertNode()`.
4. **Re-aplicación al cargar**: entry en 810–814 (`requestIdleCallback`, timeout 2000 ms,
   **una sola vez por carga de documento**). `reapplyHighlights()` (746–774) filtra ítems por
   `it.sourceUrl === location.href && it.rangePrefix != null` (751–753); por cada candidato
   reconstruye el índice de texto completo (`buildTextIndex`, 652–667; nodos unidos con
   `SEP = '\x00'`, 644/760), busca con `findRangeForItem` (685–726: nivel 1
   `indexOf(prefix+exact+suffix)`, nivel 2 `indexOf(exact)` solo si es único; ambos rechazan
   coincidencias que contengan `SEP`), aplica `applyMark` (729–743) y hace
   `document.body.normalize()` (768) tras cada mark.
5. **Borrado**: existe un listener `CH_REMOVE_HL` (805–807 → `removeHighlightById`, 777–784),
   pero **no existe ningún emisor** en todo `src/` (la Vista fue reescrita como preview Markdown
   de solo lectura y perdió el botón de borrado por ítem). Listener muerto.

### 2.2 Modos de fallo concretos (numerados, con líneas)

1. **`content-storage.js` está desactualizado y descarta `rangeText` al guardar.**
   `content.js:285/584` pasan `rangeText`, pero `content-storage.js:206–218` construye el ítem
   sin ese campo (solo `storage.js:219` lo persiste, y el sidebar nunca guarda capturas).
   Consecuencia: el 100 % de las capturas con estructura de lista guardan Markdown en `item.text`
   y nada más → re-aplicación busca literalmente `- item\n- item` en el DOM → **falla permanente**.
   `content-storage.js` también carece de la lógica de blockquotes de `parseMd`/`buildMd`
   (438–476 vs `storage.js:442–509`): deriva latente.
2. **Separador `\x00`: cualquier selección que cruce un límite de nodo de texto es
   in-reancorable.** Ambos niveles rechazan spans con `SEP` (695, 712). Una selección con un
   `<a>`, `<b>`, `<em>`, `<code>` o que abarque dos párrafos ocupa ≥2 nodos → se salta para
   siempre. Frecuencia alta en páginas densas en enlaces (Wikipedia, docs, prensa). El resaltado
   en vivo al guardar sí funciona, lo que engaña al usuario.
3. **Prefix/suffix guardados sin separadores pero comparados contra el índice con `SEP`** →
   el nivel 1 casi nunca dispara. `extractRangeContext` usa `Range.toString()` (628, 633) sin
   separadores; `fullText` tiene `\x00` en cada frontera. Si los 50 chars de contexto alcanzan un
   nodo adyacente, `indexOf` (691) no puede coincidir y se degrada al nivel 2 (que exige unicidad).
4. **Cero normalización de espacios/NBSP — contradice la spec 004 aprobada** (criterio 4 y
   `implementation_notes.approach` prometen "coincidencia exacta normalizada"). La implementación
   es `indexOf` crudo (691, 709). `item.text` es texto renderizado (`Selection.toString().trim()`,
   125) mientras el índice es texto fuente (saltos de línea suaves, tabs, `&nbsp;` U+00A0).
   Además el `trim()` de `addItem` (`content-storage.js:210`) desalinea prefix+exact cuando la
   selección tenía espacio inicial/final. Frecuencia muy alta.
5. **Filtro de URL exacto (751–753).** Un `#fragment` distinto, parámetros volátiles (`utm_*`,
   `fbclid`), `http→https` o `www.` producen cero candidatos. La coincidencia exacta es requisito
   del usuario (no proponer normalización), pero explica una parte silenciosa de las pérdidas.
6. **Re-aplicación de un solo disparo: sin retry, sin MutationObserver, sin hooks SPA (810–814).**
   Navegaciones client-side (pushState) nunca re-ejecutan el content script → 0 % de resaltados
   en rutas SPA; `requestIdleCallback` puede disparar antes de que cargue contenido lazy; la
   hidratación de frameworks puede reemplazar subárboles y **borrar los `<mark>` ya aplicados**.
7. **El editor Markdown destruye los metadatos de anclaje de todo el contexto.**
   `replaceContextFromMarkdown` (`storage.js:336–355`) reconstruye cada ítem con `id` nuevo,
   `sourceUrl: ""` (350) y sin `rangePrefix/rangeSuffix/rangeText`. Se invoca en cada keystroke
   debounced del editor (`vista.js:104–113` → `sidebar.js:106–110`, y Monaco en 131/324). Un
   carácter tecleado → todos los ítems del contexto fallan el filtro `rangePrefix != null` para
   siempre. Catastrófico y silencioso.
8. **Divergencia anchor-vs-texto al editar un ítem.** `updateItem` (`storage.js:274`) reescribe
   `item.text` pero conserva `rangePrefix/rangeSuffix` obsoletos.
9. **`CH_REMOVE_HL` sin emisor** (regresión frente a criterios 10–12 de la spec 004). El único
   camino de borrado de marks hoy es recargar la página.
10. **Aplicar un mark puede romper el anclaje de sus vecinos.** `buildTextIndex` excluye texto
    dentro de `.ch-hl` (657) y `surroundContents` parte el nodo anfitrión → el ítem B guardado en
    la misma frase que A pierde el nivel 1. El ganador depende del orden en el array de storage,
    no del orden del documento. Los resaltados agrupados en un párrafo son caso de uso central.
11. **Duplicados por diseño vs first-match**: dos capturas del mismo texto anclan ambas a la
    primera ocurrencia (691), o la segunda falla por el punto 10.
12. **Efectos secundarios de `extractContents()`** (736–740, 796–800): en el camino en vivo,
    selecciones multi-elemento parten elementos de la página (clones sin listeners, bloques
    anidados en `<mark>`, choques con la reconciliación de React).
13. **Coste O(ítems × texto de página)**: índice completo + join + `normalize()` de todo el body
    por cada ítem, síncrono en un solo idle callback (757–768). Jank en páginas largas.
14. **Todo fallo es silencioso** (764, 772): no hay badge, ni estado por ítem, ni canal de datos
    que registre resultados de anclaje. El requisito 3 (indicador en el panel) está sin implementar.
15. **Exclusión excesiva del filtro `rangePrefix != null` (753)**: ítems donde
    `extractRangeContext` lanzó al guardar y legados pre-feature-25 se excluyen aunque el nivel 2
    podría re-encontrar muchos.

---

## 3. Opciones de anclaje robusto

### 3.1 Selectores W3C Web Annotation y el patrón de redundancia

- **TextQuoteSelector** `{exact, prefix, suffix}` — es lo que ya almacena la extensión con
  nombres planos (`item.text`/`item.rangeText` = `exact`, `rangePrefix` = `prefix`,
  `rangeSuffix` = `suffix`; 50 chars vs los 32 de Hypothesis).
- **TextPositionSelector** `{start, end}` — offsets de carácter sobre una serialización definida
  del texto del documento. Casi gratis de capturar (dos ints), hace el camino feliz O(1) y,
  aun obsoleto, sirve como *pista de posición* para desambiguar el fuzzy en textos repetidos.
  **Es la pieza que falta.**
- **RangeSelector/XPathSelector** — estructurales, los más frágiles; se descartan.

Patrón canónico (Hypothesis desde 2013): almacenar selectores redundantes, re-anclar del más
barato al más caro, y **verificar siempre el resultado contra la cita**. El cliente moderno de
Hypothesis sustituyó diff-match-patch por `approx-string-match` + una función de scoring
(`match-quote.ts`): presupuesto de error `min(256, len/2)`, score = similitud de cita ×50 +
prefix ×20 + suffix ×20 + proximidad posicional ×2, normalizado /92. Las anotaciones que no
anclan se muestran como **orphans** — el precedente exacto del badge "no encontrado en la página".

### 3.2 Paquetes npm evaluados

| Paquete | Versión | Fuzz | Tamaño/deps | Mantenimiento | Veredicto |
|---|---|---|---|---|---|
| `dom-anchor-text-quote` | 4.0.2 (2017) | vía diff-match-patch | arrastra dep de 97 KB | muerto desde 2017 | No |
| `diff-match-patch` (`match_main`, Bitap) | 1.0.5 | sí, patrón ≤ **32 chars** (obliga a trocear) | 97 KB unpacked | repo **archivado 2024-08** | No |
| `@apache-annotator/dom` | 0.x | **ninguno** (exacto) | moderado | podling retirado de Apache | No |
| `text-fragments-polyfill` | 6.7.0 | **ninguno** | 167 KB | activo (GoogleChromeLabs) | Forma equivocada; robar ideas (filtro de visibilidad, colapso de whitespace) |
| **`approx-string-match`** | **2.0.0** | Myers bit-paralelo, patrón de longitud arbitraria, presupuesto de error explícito | **19.5 KB unpacked, ~2 KB gzipped, cero deps, MIT, `.d.ts`** | estable/"terminado" | **Adoptar** |

Dependencia npm normal: Vite la bundlea localmente → MV3-safe, sin código remoto. El scoring de
Hypothesis se reimplementa en ~100–120 líneas en un módulo nuevo `src/anchor.js` (BSD-2-Clause si
se porta literalmente, con atribución).

### 3.3 Normalización de texto + mapeo de offsets

Normalizar haystack y needles igual, buscar en espacio normalizado y **mapear offsets de vuelta**
al espacio crudo (patrón `translateOffsets` de Hypothesis):

- Colapsar runs de `\s+` (incl. `\n`, `\t`) a un espacio; NBSP U+00A0 → espacio.
- Eliminar soft hyphens U+00AD y zero-width (U+200B–U+200D, U+FEFF).
- Plegar comillas tipográficas/guiones largos/elipsis a ASCII.
- Case-fold solo en el nivel fuzzy (barato; el algoritmo de Text Fragments también es
  case-insensitive). NFKD solo si aparecen problemas de ligaduras (raro en HTML).
- Mecanismo de mapeo: al emitir cada char normalizado, apuntar su índice crudo en un array `map`;
  tras coincidir en `[s, e)` normalizado: `rawStart = map[s]`, `rawEnd = map[e-1] + 1` →
  `posToNodeOffset` existente → `Range`.

### 3.4 Pipeline de matching recomendado (sustituye el interior de `findRangeForItem`)

```
reanchor(item, index):                       # index = buildTextIndex(document.body), UNA vez por pasada
  raw   = index.nodes.map(textContent).join('')     # NUEVO: sin SEP en el espacio de matching
  quote = item.rangeText ?? item.text

  # Nivel 0 — posición (nuevo, O(1)):
  if item.rangeStart != null and raw.slice(rangeStart, rangeEnd) === quote:
      return rangeToDom(rangeStart, rangeEnd)

  # Nivel 1 — cita exacta + contexto (comportamiento actual, sobre raw):
  hit = indexOf(prefix + quote + suffix); si no, indexOf(quote) único
  if hit: return rangeToDom(...)

  # Nivel 2 — exacto normalizado:
  (norm, map) = normalize(raw); qn/pn/sn = normalize(quote/prefix/suffix)
  hit = indexOf(pn + qn + sn) en norm; si no, indexOf(qn) único
  if hit: return rangeToDom(map[s], map[e-1]+1)

  # Nivel 3 — fuzzy (nuevo):
  if qn.length < 5: return null
  budget  = min(128, ceil(qn.length * 0.25))        # más estricto que Hypothesis: pintado automático
  matches = search(norm, qn, budget)                # approx-string-match
  hint    = item.rangeStart ?? null
  best    = argmax de (50*(1 - errors/qn.length)
                     + 20*prefixScore + 20*suffixScore
                     +  2*(hint ? 1 - |start-hint|/norm.length : 0)) / 92
  guardas: si qn.length < 16, exigir max(prefixScore, suffixScore) >= 0.7
  if best: return rangeToDom(map[best.start], map[best.end-1]+1)
  return null                                       # → indicador "no encontrado"
```

**Cambio de espacio de coordenadas**: el `SEP` existía para rechazar coincidencias que cruzan
nodos porque `surroundContents` no puede pintarlas. El conocimiento de fronteras de nodo se queda
en el índice (offsets acumulados sin el +1), pero la decisión "¿se puede pintar?" sale del
matching: con fuzzy se *quieren* hits cross-node (es la mayor parte de la rotura en SPA), y con la
CSS Custom Highlight API (§4) los rangos cross-node pintan de forma nativa.

**Política de tolerancia**: para auto-pintado, un resaltado mal colocado es peor que uno ausente
→ presupuesto 25 % (vs 50 % de Hypothesis), nunca fuzzy con citas < 5 chars, y contexto obligatorio
en citas cortas. El badge del panel hace aceptable un presupuesto conservador.

---

## 4. Evaluación: CSS Custom Highlight API vs `<mark>`

### 4.1 Mecánica

4 entradas en el registro (`CSS.highlights.set('ch-hl-title'|'ch-hl-idea'|'ch-hl-argument'|'ch-hl-evidence', new Highlight(...))`),
cada `Highlight` es un setlike de `Range`s. Estilo vía `::highlight(nombre)` en el `content.css`
inyectado por manifest (CSS de autor normal; no puede ni necesita scoping bajo `.ch-root`).
Soporte: Chrome/Edge **105+** (sept. 2022), Baseline "newly available" 2026 — sobrado para una
extensión MV3 solo-Chrome. Guard barato: `if (!('highlights' in CSS)) return;`. En isolated
worlds el registro es del *documento*, así que los highlights registrados desde el content script
**sí pintan**; el registro es compartido con la página (el prefijo `ch-hl-` hace la colisión
prácticamente nula; un clobbering hostil también es posible hoy con `<mark>`).

### 4.2 Fidelidad visual exacta frente a `content.css:419–434`

Propiedades permitidas en `::highlight()`: `color`, `background-color`, `text-decoration` (+sub),
`text-shadow`, `-webkit-text-stroke/fill-*`.

| Declaración actual | ¿En `::highlight()`? | Impacto |
|---|---|---|
| `background` pasteles por categoría (`#f6b8c4`/`#fdeaa8`/`#bcd3f5`/`#bfe6c8`) | Sí (`background-color`) | Ninguno — idéntico |
| `color` tintas oscuras por categoría | Sí | Ninguno — idéntico |
| `font-weight/font-style: inherit !important` | No (font-* no pintables) | **Mejora**: el hack existía para vencer estilos de página sobre `mark`; los highlights nunca alteran la fuente |
| `padding: 0 1px` | No | **Perdido**: sin 1px de aire horizontal; también desaparece el layout shift real de 2px por resaltado (discutiblemente una mejora) |
| `border-radius: 2px` | No | Perdido (y con él los artefactos de arco del ghost-border investigado antes) |
| `box-decoration-break: clone` | No aplica | Sin pérdida práctica: los highlights multilínea pintan por line box de forma nativa, como `::selection` |
| estilos UA/página sobre `<mark>` | n/a | **Mejora**: las páginas que estilan `mark` ya no distorsionan el resaltado |

Delta visual neto: la caja pastel abraza el texto un poco más ajustada. Colores e identidad por
categoría, pixel-idénticos. Capacidad nueva si se quiere después: `text-decoration: underline dotted`
para un estado "anclaje dudoso".

### 4.3 Tabla de trade-offs

| Dimensión | `<mark>` (hoy) | Custom Highlight API |
|---|---|---|
| Fidelidad visual | CSS completo incl. padding 1px | Colores/tinta idénticos; pierde padding; inmune a estilos de página |
| Seguridad del DOM | Muta la página; fallback `extractContents` puede corromper estructura; choca con re-renders de React | **Cero mutación**; sin choques con frameworks |
| Coste de re-aplicación | Índice reconstruido por ítem + reflow + `normalize()` por ítem | Índice **una vez por pasada**; solo paint, sin reflow (~5× más rápido según benchmarks) |
| Selecciones cross-element | Saltadas (o extraídas con riesgo) | Pintan sin más (ganancia futura de recall) |
| Páginas dinámicas/SPA (req. 1) | Re-envolver bajo observers es propenso a crashes | Diseñada para ello: re-anclar + reconstruir sets de rangos |
| Borrado (`CH_REMOVE_HL`) | Cirugía de DOM + `normalize()` | `Map` lookup + `highlight.delete(range)` |
| Eventos por resaltado | Gratis (elemento) | Hit-testing manual — **hoy no se usa ninguno** (verificado por grep) |
| Compat. datos guardados (req. 4) | — | Intactos: la capa de anclaje (`rangePrefix`/`rangeSuffix`/`rangeText`) no cambia |
| Soporte | Universal | Chrome 105+ — suficiente |

### 4.4 Recomendación: **migrar completamente la capa de pintado**

La opción híbrida (marks en estático, API en dinámico) no aporta nada y duplica caminos de
código. La API elimina de raíz los modos de fallo 10, 12 y el `normalize()` del 13, y es la base
correcta para el trabajo de MutationObserver que fuerza el requisito 1. Cambios concretos:

- `content.js`: `applyMark` → `paintRange(range, category, itemId)` que hace
  `getCategoryHighlight(cat).add(range)` y registra en `Map<itemId, {category, range}>`
  (sustituto de `data-ch-id`); `removeHighlightById` → lookup en el Map +
  `highlight.delete(range)`; `highlightSavedRange` → `paintRange(savedRange.cloneRange(), ...)`;
  `reapplyHighlights` construye el índice **una vez antes del bucle** y elimina el
  `normalize()`. Migrar el camino de guardado en vivo en el mismo cambio (no mantener dos
  pintores en paralelo).
- `content.css`: reemplazar `.ch-hl`/`.ch-hl-*` (líneas 419–434) por 4 reglas
  `::highlight(ch-hl-*)` con `background-color`/`color` literales (sin `var()` — hubo churn de
  spec con custom properties dentro de highlight pseudos).
- Rangos vivos siguen la semántica de live-range: si un nodo frontera desaparece (re-render),
  el rango colapsa y deja de pintar en silencio — exactamente la señal que la sesión de §5 usa
  para re-anclar. Empezar con `Range` vivos; pasar a `StaticRange` + revalidación solo si el
  churn resulta costoso.
- Requisito 4 satisfecho: los datos almacenados son agnósticos al pintor.

---

## 5. Estrategia para páginas dinámicas/SPA

### 5.1 Diseño recomendado: sesión de anclaje por época de URL

Máquina de estados por URL, en el content script:

```
                    ┌──────────── cambio de URL (cualquier detector) ───────────┐
                    ▼                                                           │
IDLE ──(candidatos>0)──► ANCHORING ──(pending=0)──► DONE (observer off)         │
  │                        │  ▲                                                 │
  └─(candidatos=0)─► DONE  │  └── ráfaga de mutaciones (pasada con pre-filtro) ─┤
                           └─(gracia agotada)─► ítems marcados 'failed' ────────┘
                              (siguen reintentables hasta MAX_PASSES → hard stop)
```

- **Observer**: `MutationObserver` sobre `document.body` con `{ childList: true, subtree: true }`
  **solamente** (sin `attributes` ni `characterData` — los frameworks insertan/reemplazan nodos;
  `characterData` dispara con relojes y tickers y causaría re-escaneos perpetuos).
- **Scheduling**: debounce trailing de ~350 ms tras la última mutación, y la pasada real dentro
  de `requestIdleCallback({ timeout: 1000 })` — misma filosofía de dos etapas que el arranque actual.
- **Pre-filtro barato**: acumular `addedNodes.textContent` durante la ventana de debounce y solo
  correr una pasada completa si los primeros ~30 chars de algún ítem pendiente
  (`rangeText || text`) aparecen en ese acumulado. Rechazo O(texto añadido) vs O(página). El
  pre-filtro solo decide *si* correr la pasada; la pasada reconstruye el índice completo (el
  prefix/suffix puede vivir fuera del subárbol añadido).
- **Guardarraíles**: observer conectado **solo mientras `pending.size > 0`** (nunca conectar si
  la URL no tiene ítems — el caso común con `<all_urls>`); gracia de ~5 s o 3 pasadas para el
  soft-fail (badge); `MAX_PASSES = 50` por época y tope de índice ~2 MB de texto para páginas
  patológicas (feeds infinitos). Un anclaje tardío tras el soft-fail actualiza el estado a
  `anchored` y re-notifica (clave para lazy-load: el texto 10 pantallas abajo ancla cuando el
  usuario hace scroll).
- **Con la Highlight API no hay que protegerse de las propias escrituras** (cero mutación del
  DOM). Si el pintado siguiera siendo `<mark>`, sería obligatorio el patrón
  `disconnect() → aplicar → takeRecords() → observe()`, porque `normalize()` también muta nodos
  vecinos sin marcador. Otra razón para migrar el pintor.
- Al iniciar una época nueva: `CSS.highlights` se limpia de rangos de la época anterior (los
  shells de las SPA persisten entre navegaciones).

### 5.2 Detección de cambio de URL — sin cambios de manifest

| Opción | Veredicto |
|---|---|
| (a) `chrome.webNavigation.onHistoryStateUpdated` (+`onReferenceFragmentUpdated`) en background | Fiable y documentada, pero exige el permiso `"webNavigation"` → warning de instalación clase "leer historial de navegación" y deshabilitación hasta re-aprobación en extensiones publicadas. Solo como plan B. |
| (b) Poll de `location.href` | Cero permisos pero timer permanente. Solo como fallback. |
| (c) **Navigation API en el content script** | `window.navigation` (Chrome 102+, Baseline 2026) y su `currententrychange` cubren pushState/replaceState/back/forward/hash. `history.pushState` en sí NO es hookeable desde el isolated world, pero `popstate`/`hashchange` sí disparan. Caveat: la exposición en isolated world no está documentada explícitamente por Chrome — **feature-detect y verificar manualmente una vez** durante la implementación. |

**Recomendación: (c) con capas de fallback, manifest intacto** (`storage` + `sidePanel` +
`<all_urls>` quedan igual; `background.js` sigue trivial): `navigation.currententrychange` +
`popstate` + `hashchange` + comparación de `location.href` al inicio de cada pasada debounced
(las navegaciones SPA casi siempre mutan el DOM, así que el pipeline de mutaciones hace de
detector doble) + poll lento de 1500 ms solo si `window.navigation` no existe. Si la verificación
manual demuestra que los eventos no disparan en isolated world, caer a (a): son ~15 líneas en
background.

Nota de industria: nadie corre re-anclaje ilimitado por mutación. Hypothesis no tiene observer
global (solo observers scoped por integración); Web Highlights documenta abiertamente el fallo en
contenido lazy y lo expone al usuario — lo que valida el patrón "observers acotados + rendición
explícita + indicador".

---

## 6. Indicador "no encontrado en la página" en el panel

### 6.1 Estado actual (restricción)

`renderVista` (`vista.js:43–53`) es hoy un preview Markdown de solo lectura:
`div.innerHTML = renderMarkdown(Store.buildMd(ctx))`, y `buildMd` descarta ids —
**no existe mapeo id ↔ elemento DOM en la Vista**. El badge por ítem requiere recuperar algún
renderizado por ítem (o anclar el indicador en otro sitio). Esto es un prerrequisito de
implementación que la spec debe decidir.

### 6.2 Flujo de mensajería recomendado: híbrido push + pull

Hoy solo hay un tipo de mensaje por dirección (`CH_OPEN_PANEL_CTX` content→background y el
listener huérfano `CH_REMOVE_HL`), así que el protocolo se define casi desde cero:

- **Content script** mantiene un `Map<itemId, 'anchored'|'failed'>` en memoria por página
  (estado de la sesión de §5).
- **Push (frescura)**: en cada cambio del map,
  `chrome.runtime.sendMessage({ type: 'CH_ANCHOR_STATUS', url, statuses }).catch(() => {})`
  — fire-and-forget; solo aterriza si el panel está abierto; el try/catch es obligatorio (mismo
  patrón que ya prescribe la spec 004 en dirección inversa). Los anclajes tardíos (lazy-load)
  actualizan el badge de `failed` a encontrado.
- **Pull (corrección para la pestaña activa)**: al renderizar y en `chrome.tabs.onActivated` +
  `chrome.tabs.onUpdated` (status `complete`), el sidebar hace
  `chrome.tabs.query({active: true, currentWindow: true})` →
  `chrome.tabs.sendMessage(tabId, { type: 'CH_GET_ANCHOR_STATUS' })` y el content script responde
  con su map. Rechazo del sendMessage (sin content script: `chrome://`, Web Store, PDFs) =
  "estado desconocido". No hace falta el permiso `"tabs"`: `tabs.query` funciona sin él y
  `tab.url` es legible gracias a los host permissions `<all_urls>` existentes.
- **UI de tres estados** por ítem: encontrado / **no encontrado en la página** (badge) / página
  no abierta (sin badge o atenuado).
- **No persistir el estado de anclaje en `chrome.storage.local`**: es estado efímero por
  pestaña/visita, se quedaría obsoleto en el modelo, y cualquier escritura bajo
  `contextHighlighter` arriesga disparar la heurística de snapshot de undo del sidebar
  (`sidebar.js:75–80`, que hace push de historial cuando `items.length` crece).
- El listener `CH_REMOVE_HL` se rehabilita de paso: además de despintar, hace
  `session.pending.delete(itemId)`.

---

## 7. Modelo de datos y compatibilidad hacia atrás

### 7.1 Campos nuevos en el ítem (TextPositionSelector)

En `createItem`/`addItem`, junto a los existentes:

```jsonc
{
  "rangeStart": 12345,   // int|null — offset de carácter del inicio de la cita
  "rangeEnd":   12389    // int|null — offset de carácter del fin
  // Espacio de coordenadas: concatenación de los nodos de texto bajo document.body
  // en orden de TreeWalker, unidos con '' (SIN separador \x00), capturado al guardar.
}
```

Captura casi gratis: `extractRangeContext` ya construye un `preRange` desde `(document.body, 0)`
hasta el inicio de la selección — `rangeStart = preRange.toString().length` es una línea extra
(`Range.toString()` concatena sin separadores, coincidiendo con el espacio de coordenadas);
`rangeEnd = rangeStart + range.toString().length`. Ambos `null` en error, igual que los campos
actuales.

### 7.2 Reglas de compatibilidad

1. **No renombrar** `rangePrefix`/`rangeSuffix`/`rangeText`: ya son un TextQuoteSelector en todo
   menos el nombre.
2. **Sin migración**: los ítems legados tienen `rangeStart === undefined` → el nivel 0 se salta y
   el bonus posicional del fuzzy es 0. Los niveles 1–3 operan solo con los campos existentes →
   **los ítems legados ganan re-anclaje fuzzy gratis**.
3. El filtro de candidatos `it.sourceUrl === location.href && it.rangePrefix != null` se mantiene
   (URL exacta es requisito).
4. `buildMd`/`parseMd` nunca serializaron los metadatos de anclaje; `rangeStart`/`rangeEnd`
   reciben el mismo trato (invisibles al contrato Markdown).
5. `createItem` debe defaultear los campos nuevos a `null` (espejo de `storage.js:216–217`) para
   que los ítems creados por `parseMd` mantengan la forma.
6. **Arreglo obligatorio del bug del §2.2-1**: sincronizar `content-storage.js` con `storage.js`
   (persistir `rangeText`, y de paso la lógica de blockquotes) o, mejor, eliminar la duplicación
   haciendo que `content-storage.js` re-exporte de verdad en lugar de mantener una copia.
7. Backfill oportunista opcional (diferible): cuando un ítem legado ancle en niveles 0–2,
   escribir `rangeStart`/`rangeEnd` una vez, en batch (un solo `chrome.storage.local.set` tras la
   pasada) para evitar churn de escrituras.

---

## 8. Riesgos y fuera de alcance

- **Fuera de alcance (decisión explícita del usuario)**: normalización de URL. El modo de fallo
  §2.2-5 (hash/params volátiles) queda documentado pero sin acción.
- **Feature 26 `rehighlight_button` queda potencialmente superseded**: la sesión con
  MutationObserver + retries cubre el caso que ese botón manual resolvería. Marcarla en
  `feature_list.json` durante el cierre si el usuario está de acuerdo.
- **Modo de fallo §2.2-7 (el editor destruye anclas) no se resuelve con nada de este documento**:
  es un problema de `replaceContextFromMarkdown`, ortogonal al matcher/pintor. Riesgo de que el
  usuario perciba que "la feature no funciona" tras tocar el editor. Recomendación: tratarlo como
  feature separada (p. ej. preservar id+anclas de ítems cuyo texto no cambió); como mínimo,
  documentarlo en la spec como limitación conocida.
- **Navigation API en isolated world**: no verificada contra documentación primaria; hay
  feature-detect + 3 capas de fallback, y el plan B (`webNavigation`) está acotado (~15 líneas +
  1 permiso). Verificar en el primer smoke test manual.
- **Registro de highlights compartido con la página**: una página hostil puede borrar/clobberear
  entradas del registro — riesgo teórico y ya presente hoy con `<mark>`; mitigado por el prefijo
  `ch-hl-`.
- **Falsos positivos del fuzzy**: mitigados con presupuesto 25 %, mínimo de 5 chars, contexto
  obligatorio en citas cortas y el badge del panel como válvula de escape. Aun así, un resaltado
  mal colocado es posible en texto muy repetitivo; la pista posicional (`rangeStart`) reduce el
  riesgo solo en ítems nuevos.
- **Pérdida del padding de 1px** al migrar el pintor: delta visual menor, aceptado a cambio de
  cero mutación del DOM (y elimina el layout shift y los artefactos de ghost-border ya
  investigados en `research_highlight_persistence_border_fix.md`).
- **Rendimiento en feeds infinitos**: acotado por pre-filtro, `MAX_PASSES`, tope de índice de
  2 MB y desconexión del observer con `pending` vacío.
- **Duplicados por diseño** (modelo de datos): dos capturas idénticas seguirán compitiendo por la
  primera ocurrencia; el nivel 0 (posición) las desambigua para ítems nuevos, no para legados.

---

## 9. Verificación propuesta (plan de pruebas manuales)

No hay tests automatizados en el proyecto: la verificación es **`pnpm run build` + revisión
manual en Chrome**. Estos escenarios son el borrador que el Tester debe formalizar en
`docs/test_highlight_persistence_robustness.md`; la spec debe convertirlos en criterios de
aceptación verificables.

### 9.1 Gate de build (obligatorio, primero)

```bash
cd vite-extension && pnpm run build
```

Debe terminar sin errores (incluye la resolución del nuevo import `approx-string-match` y del
módulo `src/anchor.js`). Cargar `vite-extension/dist/` como extensión descomprimida en
`chrome://extensions` (Developer mode) y **recargar la extensión** si ya estaba cargada.
Sin errores en la consola del service worker ni en la de la página.

### 9.2 Escenarios manuales

| # | Escenario | Pasos y resultado esperado |
|---|---|---|
| V1 | **Recarga en página estática** | Guardar un resaltado en un artículo (p. ej. Wikipedia), recargar con F5. El resaltado reaparece con el color de su categoría. Con el pintor nuevo: **no** hay `<mark class="ch-hl">` en el DOM (Elements) y `CSS.highlights.get('ch-hl-<categoría>')` en la consola devuelve un `Highlight` con ≥1 rango. |
| V2 | **Selección cross-node** | Seleccionar texto que cruce un `<a>` o `<em>` (hoy se salta para siempre, §2.2-2), guardar y recargar. El resaltado reaparece pintado de forma continua — es la ganancia de recall clave de la migración. |
| V3 | **Navegación SPA / pushState** | En una SPA (p. ej. una app con router client-side, o GitHub navegando entre archivos de un repo), guardar un resaltado en una ruta, navegar a otra ruta **sin recarga completa** y volver con la navegación interna o el botón atrás. El resaltado reaparece en la ruta original; en la ruta sin ítems no queda observer activo. Incluye la **verificación de la Navigation API en isolated world** (§5.2/§8): comprobar en la consola de la página que `window.navigation` existe en el mundo del content script y que `currententrychange` dispara al navegar; si no dispara, activar el plan B (`webNavigation`) antes de continuar. |
| V4 | **Contenido lazy-load / scroll infinito** | Guardar un resaltado varias pantallas abajo en una página con carga perezosa (feed, comentarios paginados), recargar y **no** hacer scroll: el ítem queda pendiente sin errores. Hacer scroll hasta que el texto se renderice: el resaltado aparece al llegar el contenido y, si el panel está abierto, el badge pasa de "no encontrado" a encontrado (anclaje tardío, §5.1/§6.2). |
| V5 | **Tolerancia fuzzy ante texto cambiado** | Usar un HTML local (`file://` con acceso a URLs de archivo habilitado, o servido con `python3 -m http.server`) para controlar el contenido. Guardar un resaltado, editar el archivo cambiando pocos caracteres dentro de la cita (< 25 % del texto, p. ej. una palabra o un NBSP), recargar: el resaltado reaparece vía nivel 2–3. Repetir cambiando más del 25 % o borrando la frase: **no** debe pintarse nada (mejor ausente que mal colocado) y el ítem pasa a `failed`. Verificar también que una cita corta (< 5 chars) nunca ancla por fuzzy. |
| V6 | **Badge "no encontrado en la página"** | Con el escenario anterior en estado `failed`, abrir el side panel con esa pestaña activa: el ítem muestra el indicador "no encontrado en la página". Los ítems que sí anclaron no lo muestran. Cambiar a una pestaña donde la URL no está abierta (o `chrome://extensions`): estado "página no abierta" (sin badge o atenuado), sin errores por el `sendMessage` rechazado. Volver a la pestaña original (`tabs.onActivated`): el badge se refresca. |
| V7 | **Ítems legados sin `rangeStart`** | Simular datos pre-feature: en la consola del service worker (o DevTools > Application > Storage de la página del panel), leer `chrome.storage.local` clave `contextHighlighter`, borrar `rangeStart`/`rangeEnd` de un ítem existente y volver a guardar. Recargar la página fuente: el ítem ancla igualmente por niveles 1–3 (compatibilidad §7.2-2). Un ítem con `rangePrefix == null` se excluye sin lanzar errores. Si se implementa el backfill opcional (§7.2-7), verificar que tras anclar el ítem gana `rangeStart`/`rangeEnd` en storage. |
| V8 | **Regresiones del flujo existente** | (a) El pintado en vivo al guardar sigue funcionando con el pintor nuevo, con los mismos colores pastel por categoría (comparación visual contra `content.css` actual). (b) Borrar un ítem desde el panel despinta el rango en la página (`CH_REMOVE_HL` rehabilitado, §6.2) y lo saca de `pending`. (c) Capturas con estructura de lista guardan `rangeText` (fix §2.2-1) y re-anclan por el texto crudo, no por el Markdown. (d) URL con `#fragment` o query distinta: **no** se re-aplica (URL exacta es requisito, no bug). |
| V9 | **Consola y rendimiento** | En todos los escenarios: cero errores no capturados en la consola de la página y del panel. En una página con ticker/reloj (mutaciones frecuentes) y sin ítems pendientes, verificar que no hay re-escaneos perpetuos (el observer se desconecta con `pending` vacío; comprobable con un `console.debug` temporal o el panel Performance). |

---

## 10. Fuentes consultadas

Los agentes de fuzzy matching, CSS Highlight API y SPA tuvieron acceso web (afirmaciones sobre
Hypothesis verificadas directamente contra su código en GitHub); la auditoría de código se hizo
sobre el árbol local. Fuentes principales:

- Hypothesis — Fuzzy Anchoring: https://web.hypothes.is/blog/fuzzy-anchoring/
- hypothesis/client `match-quote.ts` (scoring): https://github.com/hypothesis/client/blob/main/src/annotator/anchoring/match-quote.ts
- hypothesis/client `pdf.ts` (normalización + translateOffsets): https://github.com/hypothesis/client/blob/main/src/annotator/anchoring/pdf.ts
- approx-string-match: https://github.com/robertknight/approx-string-match-js · https://www.npmjs.com/package/approx-string-match
- google/diff-match-patch (archivado 2024-08): https://github.com/google/diff-match-patch · wiki API
- GoogleChromeLabs/text-fragments-polyfill: https://github.com/GoogleChromeLabs/text-fragments-polyfill
- WICG scroll-to-text-fragment: https://wicg.github.io/scroll-to-text-fragment/
- @apache-annotator/dom (podling retirado): https://www.npmjs.com/package/@apache-annotator/dom
- MDN — CSS Custom Highlight API: https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API · `::highlight()`
- W3C CSS Custom Highlight API Module Level 1: https://www.w3.org/TR/css-highlight-api-1/
- Chrome Platform Status — Custom Highlight API (Chrome 105): https://chromestatus.com/feature/5436441440026624
- Frontend Masters — Using the Custom Highlight API: https://frontendmasters.com/blog/using-the-custom-highlight-api/
- CSS-Tricks — CSS Custom Highlight API: A First Look: https://css-tricks.com/css-custom-highlight-api-early-look/
- pavi2410 — High-Performance Syntax Highlighting with CSS Highlights API: https://pavi2410.com/blog/high-performance-syntax-highlighting-with-css-highlights-api/
- Igalia — CSS Custom Properties in Highlight Pseudos: https://blogs.igalia.com/schenney/css-custom-properties-in-highlight-pseudos/
- chrome.webNavigation API: https://developer.chrome.com/docs/extensions/reference/api/webNavigation
- Chrome — Navigation API: https://developer.chrome.com/docs/web-platform/navigation-api
- InfoQ — Navigation API reaches Baseline (mayo 2026): https://www.infoq.com/news/2026/05/navigation-api-browser/
- Firefox bug 1418049 — content scripts e `history.pushState` (aislamiento de worlds): https://bugzilla.mozilla.org/show_bug.cgi?id=1418049
- MDN / javascript.info — MutationObserver: https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver · https://javascript.info/mutation-observer
- Web Highlights FAQ (fallo documentado en contenido dinámico): https://web-highlights.com/faq
- Jon Udell — Notes for an annotation SDK: https://blog.jonudell.net/2021/09/03/notes-for-an-annotation-sdk/
- Chrome — content scripts / isolated worlds: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
