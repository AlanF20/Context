# Investigación: Persistencia de resaltados en la página tras recargas

**Feature:** `page_highlight_persistence`
**Fecha:** 2026-06-24
**Autor:** Researcher Agent

---

## 1. Objetivo

Hoy el content script (`src/content.js`) aplica un `<mark class="ch-hl ch-hl-{category}">` al texto
seleccionado en el momento de guardarlo, pero ese elemento desaparece al recargar la página porque
vive únicamente en el DOM de sesión actual. El objetivo de esta feature es que, al volver a abrir
cualquier página que ya tenga ítems guardados, el content script recupere automáticamente todos
los resaltados correspondientes y los re-aplique en el DOM antes de que el usuario los vea, sin
necesidad de ninguna acción manual. Los resaltados deben ser visualmente idénticos a los que se
crean al guardar por primera vez, y deben degradarse con gracia cuando la página haya cambiado y
el texto ya no se pueda ubicar.

---

## 2. Enfoques de serialización de rango

Para re-aplicar un resaltado en una carga futura, es necesario serializar la **posición del rango**
en el DOM en el momento de guardado, y luego deserializarlo y convertirlo de nuevo en un `Range`
vivo. A continuación se comparan los cuatro enfoques principales.

### 2.1 XPath + desplazamiento de carácter

Cada extremo del rango (`startContainer`, `startOffset`, `endContainer`, `endOffset`) se convierte
en una pareja `(xpath, charOffset)`. El XPath identifica el nodo texto dentro del DOM; el
`charOffset` indica la posición dentro del contenido de ese nodo.

**Serialización**
```
startXPath:  /html/body/article/p[3]/text()[1]
startOffset: 42
endXPath:    /html/body/article/p[3]/text()[1]
endOffset:   78
```

**Deserialización:** `document.evaluate(xpath)` retorna el nodo; luego `range.setStart(node, offset)`.

| Aspecto | Valoración |
|---|---|
| Robustez ante cambios de CSS/atributos | Alta — el XPath solo depende de la estructura de elementos |
| Robustez ante cambios de contenido | Baja — si se insertan párrafos antes, los índices cambian |
| Sin eval / código remoto | Sí — usa solo DOM API estándar |
| Complejidad de implementación | Media — ~80 líneas de JS puro |
| Compatibilidad con MV3 | Total |
| Bibliotecas existentes | `rangy` (pesada, ~120 KB), implementación propia trivial |

### 2.2 CSS selector path + desplazamiento de texto

Variante del anterior: en lugar de XPath, se computa un selector CSS único para el elemento
contenedor (p.ej. `article > p:nth-child(3)`). Más legible pero más frágil si la estructura
del DOM cambia (atributos `id`/`class` que varían por dinamismo del sitio).

| Aspecto | Valoración |
|---|---|
| Robustez ante cambios de estructura | Baja — `nth-child` rompe con inserciones |
| Sin eval | Sí |
| Complejidad | Baja — ~50 líneas |
| Compatibilidad con MV3 | Total |

Este enfoque es estrictamente inferior al XPath en robustez; se descarta.

### 2.3 Coincidencia de subcadena de `textContent` (fuzzy)

No se almacena ninguna posición en el DOM. En la carga se busca el texto exacto del ítem
(ya almacenado en `item.text`) usando `TreeWalker` para iterar nodos de texto y
`node.textContent.indexOf(item.text)` para ubicar el fragmento.

| Aspecto | Valoración |
|---|---|
| Robustez ante cambios de DOM | Alta — no depende de estructura, solo del texto |
| Robustez ante texto duplicado | Baja — si el texto aparece varias veces no hay forma de distinguir cuál es el resaltado original |
| Requiere campo extra en el esquema | No — usa `item.text` existente |
| Sin eval | Sí |
| Complejidad | Baja — ~60 líneas |
| Compatibilidad con MV3 | Total |

### 2.4 Snippet anclado (5 palabras antes + texto + 5 palabras después)

Método usado por el **W3C Web Annotation Data Model** (TextQuoteSelector) y por Hypothesis.
Se almacena:
- `exact`: el texto resaltado (ya presente en `item.text`)
- `prefix`: las ~40 caracteres inmediatamente antes del texto en el DOM
- `suffix`: las ~40 caracteres inmediatamente después

En la recarga se busca la primera ocurrencia de `prefix + exact + suffix` dentro del
`document.body.textContent`, tolerando variaciones menores de espaciado. Si hay coincidencia,
se localiza el nodo de texto con `TreeWalker` y se construye un `Range` vivo.

| Aspecto | Valoración |
|---|---|
| Robustez ante cambios de CSS/estructura | Alta — no depende del árbol de elementos |
| Robustez ante texto duplicado | Alta — el contexto (prefix/suffix) desambigua |
| Robustez ante cambios de contenido | Media — si el texto o su contexto cambian, falla graciosamente |
| Sin eval | Sí — búsqueda de cadena pura |
| Complejidad | Media — ~100 líneas; algoritmo de búsqueda con normalización de espacios |
| Compatibilidad con MV3 | Total |
| Bibliotecas | `@web-highlights/selector` (W3C spec), módulo de anchoring de Hypothesis. Ambas demasiado pesadas para esta extensión; es preferible implementación propia mínima. |

### Tabla comparativa resumen

| Enfoque | Robustez DOM | Robustez contenido | Texto duplicado | Campo extra | Complejidad |
|---|---|---|---|---|---|
| XPath + charOffset | Media | Baja | Media | Sí (4 campos) | Media |
| CSS selector + offset | Baja | Baja | Media | Sí (4 campos) | Baja |
| textContent substring | Alta | Alta | Baja | No | Baja |
| Snippet anclado (TextQuote) | Alta | Media | Alta | Sí (2 campos) | Media |

---

## 3. Enfoque recomendado

**Snippet anclado (TextQuoteSelector minimalista)**, implementado a medida en ~100 líneas de
JavaScript puro dentro de `content.js`.

**Justificación:**

1. **Los casos de uso del proyecto son páginas de investigación** (artículos académicos, blogs,
   documentación). Estas páginas cambian su estructura HTML frecuentemente (actualizaciones de
   CMS, A/B testing de layouts), pero raramente cambian el cuerpo del texto. El XPath se rompe
   con cambios de estructura; el snippet anclado aguanta mientras el párrafo siga existiendo.

2. **El texto ya se almacena** en `item.text`. Solo hay que añadir dos campos pequeños (`prefix`,
   `suffix` de ≤50 chars cada uno), lo que no supone un aumento significativo del tamaño en
   `chrome.storage.local`.

3. **Desambigua texto duplicado** mejor que la coincidencia simple de subcadena. En un artículo
   largo, el mismo fragmento "el proceso inflamatorio" puede aparecer varias veces; el
   prefijo/sufijo ancla la instancia correcta.

4. **Sin dependencias extra.** No se añade ningún paquete npm. Solo DOM API y String methods,
   completamente compatibles con MV3.

5. **Degradación clara y sin excepciones.** Si `prefix + exact + suffix` no se encuentra, se
   descarta silenciosamente ese ítem sin tirar errores al usuario.

6. **Compatible con `parseMd`/`buildMd`.** Los campos `prefix`/`suffix` son metadata de
   posición DOM; no pertenecen al contrato Markdown (que solo serializa texto semántico), por
   lo que no rompen el round-trip Markdown existente. Cuando `replaceContextFromMarkdown` crea
   ítems nuevos, `prefix`/`suffix` quedan `null` — sin re-highlight en esos ítems, que es el
   comportamiento correcto (el usuario importó texto, no lo capturó de esa página).

---

## 4. Esquema de datos propuesto

El esquema actual de `item` en `storage.js` es:

```jsonc
{
  "id": "item_...",
  "type": "subtitle | text",
  "category": "title | idea | argument | evidence | null",
  "text": "...",
  "linkedSubtitleId": "item_... | null",
  "source": "dominio.com",
  "sourceUrl": "https://...",
  "createdAt": 1719180000000
}
```

Se propone añadir **dos campos opcionales** al objeto item:

```jsonc
{
  "id": "item_...",
  "type": "subtitle | text",
  "category": "title | idea | argument | evidence | null",
  "text": "...",
  "linkedSubtitleId": "item_... | null",
  "source": "dominio.com",
  "sourceUrl": "https://...",
  "createdAt": 1719180000000,

  // NUEVOS — null en ítems creados desde el editor Markdown o importados
  "rangePrefix": "...hasta 50 chars antes del resaltado...",
  "rangeSuffix": "...hasta 50 chars después del resaltado..."
}
```

**Invariantes:**
- `rangePrefix` y `rangeSuffix` se establecen únicamente en `addItem()` cuando la llamada
  proviene del content script (tienen el rango vivo disponible).
- Cuando `replaceContextFromMarkdown` crea ítems, ambos campos son `null` (o ausentes).
- Si `rangePrefix === null` o el campo no existe, el motor de re-highlight simplemente omite
  ese ítem → backward compatibility total con ítems existentes.
- La longitud máxima de cada campo es 50 caracteres (suficiente para desambiguar; mínimo peso
  en `chrome.storage.local`).

**Extensión de `addItem` en storage.js:**

```js
// opts ahora acepta rangePrefix y rangeSuffix (opcionales)
const item = {
  // … campos existentes …
  rangePrefix: opts.rangePrefix || null,
  rangeSuffix: opts.rangeSuffix || null,
};
```

---

## 5. Timing de re-aplicación

### 5.1 El content script ya se inyecta en `document_idle`

El `manifest.json` declara `"run_at": "document_idle"`, que equivale a `DOMContentLoaded`
completado + recursos diferidos procesados. Esto es adecuado para la mayoría de páginas
estáticas y artículos: el HTML del artículo ya está parseado cuando el script corre.

**Acción:** Añadir al top-level del IIFE en `content.js` una llamada asíncrona
`reapplyHighlights()` que se ejecuta inmediatamente al cargarse el script.

```js
// Al inicio de content.js (después de los listeners de selección)
reapplyHighlights(); // no await — fire and forget; no bloquea el resto del script
```

### 5.2 SPAs y contenido cargado dinámicamente

Para páginas tipo SPA donde el artículo se renderiza después de que corre el content script
(p. ej., React/Vue apps), `document_idle` no garantiza que el texto esté presente.

**Estrategia recomendada (opcional, fase 2):** Observar el DOM con `MutationObserver`
durante los primeros 5 segundos. Si se detecta que el `<body>` crece en nodos de texto,
re-intentar `reapplyHighlights()` con un debounce de 300 ms. Limitar a 3 reintentos para
no bombardear páginas con actualizaciones continuas.

Esta parte puede dejarse para una fase posterior; la mayoría de casos de uso del proyecto
(artículos académicos, blogs) son páginas estáticas donde `document_idle` es suficiente.

### 5.3 `requestIdleCallback` como optimización

Envolver `reapplyHighlights()` en `requestIdleCallback` (con timeout de 2000 ms como
fallback) garantiza que no compita con el thread principal durante el primer render crítico.

```js
if ('requestIdleCallback' in window) {
  requestIdleCallback(() => reapplyHighlights(), { timeout: 2000 });
} else {
  setTimeout(reapplyHighlights, 100); // fallback para Safari
}
```

---

## 6. Degradación segura

Cuando el algoritmo de búsqueda no encuentra el fragmento anclado, el comportamiento debe
ser silencioso e inofensivo:

1. **No lanzar excepciones al usuario.** Todo el bloque de re-highlight va en un `try/catch`
   global. Los errores se loguean con `console.warn` (visible en DevTools del desarrollador)
   pero no se propagan.

2. **Marcar el ítem como "no anclado"** temporalmente en memoria (no en storage):
   - El ítem sigue visible en la Vista del sidebar.
   - No hay `<mark>` en la página para ese ítem.
   - No se altera el dato en `chrome.storage.local`.

3. **Estrategia de fallback por niveles:**
   - Nivel 1: Buscar `prefix + exact + suffix` (búsqueda exacta normalizada).
   - Nivel 2 (fallback): Buscar solo `exact` ignorando prefix/suffix (coincidencia simple).
     Si hay exactamente UNA ocurrencia del texto en la página, aplicar el resaltado.
   - Nivel 3 (fallback): Si hay múltiples ocurrencias o ninguna → omitir silenciosamente.

4. **Tiempo máximo.** El motor de búsqueda textual debe operar en O(n) respecto al
   `textContent` total del documento. Para páginas grandes (~500 KB de texto), la búsqueda
   debe completarse en < 50 ms. No se usa ningún `while(true)` sin límite.

5. **Ítems sin `rangePrefix`** (creados desde el editor Markdown o migrados del legacy):
   se omiten directamente sin intentar ninguna búsqueda.

---

## 7. UX para quitar resaltados

### 7.1 Escenarios

- El usuario borra un ítem desde la Vista del sidebar → el resaltado correspondiente en la
  página debe desaparecer.
- El usuario recarga la página → los resaltados ya no existentes no se re-aplican (fluye
  naturalmente del diseño).
- El usuario hace clic en un `<mark>` en la página → podría mostrar un mini-tooltip para
  borrar, pero esto es complejidad extra (fase 2).

### 7.2 Trigger: borrar desde la Vista

Hoy `vista.js` llama `Store.deleteItem(ctxId, item.id)` y luego `onMutate()` que re-renderiza
la Vista. El DOM de la página no se toca.

**Solución recomendada:** Al borrar un ítem desde la Vista, enviar un mensaje
`chrome.tabs.sendMessage` al content script activo para que limpie el `<mark>` correspondiente.

**Flujo:**
1. `vista.js` al borrar: llama `deleteItem` y luego envía mensaje al tab activo:
   ```js
   chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
     if (tab) chrome.tabs.sendMessage(tab.id, { type: 'CH_REMOVE_HL', itemId: item.id });
   });
   ```
2. `content.js` escucha `chrome.runtime.onMessage`:
   ```js
   chrome.runtime.onMessage.addListener((msg) => {
     if (msg.type === 'CH_REMOVE_HL') removeHighlightById(msg.itemId);
   });
   ```
3. `removeHighlightById(itemId)`: busca `document.querySelector(`[data-ch-id="${itemId}"]`)`,
   y reemplaza el `<mark>` por sus hijos (unwrap).

**Requisito adicional:** Al crear el `<mark>` (tanto al guardar como al re-aplicar), añadir
`data-ch-id="{item.id}"` para poder localizarlo luego con exactitud.

### 7.3 El sidebar opera en un contexto diferente (side panel)

El sidebar vive en un contexto de extensión, no en el tab. Para enviar mensajes desde el
sidebar al content script del tab activo se usa `chrome.tabs.sendMessage`. El permiso
`"sidePanel"` ya está declarado; `chrome.tabs.query` no requiere permiso adicional en MV3
cuando se opera sobre el tab activo desde el side panel.

**Nota:** `chrome.tabs.sendMessage` puede fallar si el tab no tiene el content script cargado
(p. ej., extensión recién instalada o página `chrome://`). Envolver en `try/catch` y loguear
en desarrollo.

---

## 8. Impacto en archivos existentes

| Archivo | Cambio necesario |
|---|---|
| `src/storage.js` | Añadir `rangePrefix: opts.rangePrefix \|\| null` y `rangeSuffix: opts.rangeSuffix \|\| null` en el objeto `item` construido por `addItem()`. No requiere cambios en el esquema de `createContext`, `buildMd`, `parseMd` ni en ninguna función de lectura. |
| `src/content-storage.js` | Idem al anterior (es copia de `storage.js`); misma modificación en `addItem()`. |
| `src/content.js` | (1) Extraer `rangePrefix`/`rangeSuffix` del `savedRange` en el momento de `doSave()` antes de llamar a `addItem()`; (2) Añadir la función `reapplyHighlights()` que carga los ítems de la URL actual y aplica cada uno; (3) Añadir `removeHighlightById(itemId)` y el listener `chrome.runtime.onMessage`; (4) Añadir `data-ch-id` al `<mark>` generado en `highlightSavedRange()` y al crear los `<mark>` de re-aplicación. |
| `src/sidebar/vista.js` | En el handler `delBtn.click`, después de `Store.deleteItem()`, enviar `chrome.tabs.sendMessage` con el `itemId` para limpiar el mark del DOM. |
| `src/content.css` | Ninguno — las clases `.ch-hl-*` ya existen y son suficientes. |
| `src/sidebar.js` | Ninguno en primera fase. |
| `src/sidebar/store.js` | Ninguno — re-exporta `storage.js`; no necesita cambios propios. |

**Archivos que NO cambian:** `sidebar.html`, `sidebar.css`, `sidebar/dom.js`,
`sidebar/markdown.js`, `sidebar/theme.js`, `sidebar/rail.js`, `sidebar/editor.js`,
`background.js`, `manifest.json`, `package.json`, `vite.config.js`.

---

## 9. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| El texto del ítem cambia en la página (editor de la web actualiza el artículo) | Media | Bajo — el resaltado sencillamente no se aplica | Degradación silenciosa nivel 3 |
| Múltiples ítems con el mismo texto exacto y mismo prefix/suffix | Baja | Bajo — se aplica el `<mark>` al primer match | Aceptable; el usuario puede borrar desde la Vista |
| Páginas con muchos iframes o shadow DOM | Media | Medio — el `TreeWalker` en `document` no penetra shadow roots | Documentar limitación; fuera de scope en v1 |
| SPAs que reemplazan el contenido después de `document_idle` | Media | Medio — el resaltado no se aplica en la carga inicial | MutationObserver como mejora en v2 |
| `chrome.tabs.sendMessage` falla (content script no cargado) | Media | Bajo — el usuario borra el ítem desde la Vista y el mark desaparece en la próxima recarga | `try/catch` + log |
| `chrome.storage.local` quota (5 MB por extensión) | Baja | Bajo — prefix + suffix son ≤ 100 chars por ítem; 1000 ítems = ~100 KB | Dentro del límite holgadamente |
| Páginas que ofuscan/generan su `textContent` dinámicamente | Baja | Bajo — solo afecta la re-aplicación, no el guardado | Degradación silenciosa |
| El `<mark>` insertado rompe el layout de la página | Media | Medio | `box-decoration-break: clone` ya configurado; el `<mark>` no altera el flujo del bloque |

---

## 10. Decisión final

Se implementará persistencia de resaltados usando un **TextQuoteSelector minimalista** (snippet
anclado: `rangePrefix` + `text` existente + `rangeSuffix`, ≤ 50 chars cada uno), añadiendo solo
dos campos opcionales al esquema de `item` en `storage.js`/`content-storage.js`. El content
script extrae estos campos del `Range` vivo en el momento de guardar, y al cargarse en cada
página busca los ítems cuya `sourceUrl` coincida con la URL actual, localiza el fragmento de
texto en el DOM mediante `TreeWalker` + búsqueda de cadena, y aplica los `<mark>` con el
`data-ch-id` correspondiente. La degradación es completamente silenciosa cuando el texto ya
no se encuentra. La eliminación de resaltados desde la Vista se gestiona mediante un mensaje
`CH_REMOVE_HL` que el content script recibe y procesa haciendo un unwrap del `<mark>`. La
implementación es self-contained en ~120 líneas nuevas distribuidas entre `content.js`,
`storage.js` y `content-storage.js`, sin dependencias npm adicionales, y compatible al 100%
con las restricciones de Manifest V3.
