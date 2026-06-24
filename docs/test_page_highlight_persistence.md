# Plan de verificación — Feature #4: Persistencia de resaltados en página

**Feature:** `page_highlight_persistence`
**Spec:** `specs/004-spec-page_highlight_persistence.json`
**Fecha:** 2026-06-24
**Verificación:** Manual — no hay test runner automatizado.

---

## 1. Configuración previa

### 1.1 Compilar la extensión

```bash
cd vite-extension
pnpm run build
```

La salida debe terminar sin errores. Aparecerá el directorio `vite-extension/dist/`.

### 1.2 Cargar la extensión en Chrome

1. Abrir `chrome://extensions` en el navegador.
2. Activar **Modo de desarrollador** (esquina superior derecha).
3. Pulsar **"Cargar descomprimida"** y seleccionar `vite-extension/dist/`.
4. Verificar que la extensión aparece sin errores de carga.
5. Si ya había una versión anterior cargada, pulsar el botón de recarga (ícono circular) antes de continuar.

### 1.3 Páginas de prueba

Usar cualquier artículo web estático. Sugerencias:

- `https://en.wikipedia.org/wiki/Sleep` — texto largo con muchos párrafos, útil para buscar fragmentos únicos y repetidos.
- `https://www.bbc.com/news` — artículos de noticias con texto variado.
- Para TC-05 (texto no presente) basta con recargar la misma URL después de borrar cookies y caché de contenido, o bien usar el DevTools para modificar el DOM antes de comparar.

### 1.4 Herramientas de apoyo

- **DevTools > Console** — para verificar ausencia de errores y mensajes de `console.warn`.
- **DevTools > Elements** — para inspeccionar atributos `class` y `data-ch-id` de los `<mark>`.
- **DevTools > Application > Storage > Local > Extension** — para inspeccionar `contextHighlighter` en `chrome.storage.local`.

---

## 2. Casos de prueba

---

### TC-01 — Guardar un resaltado y verificar su re-aplicación tras recarga

**Descripción:** Flujo básico de la feature. Un resaltado guardado en una página vuelve a aparecer al recargar la misma URL.

**Pasos:**
1. Abrir una URL de artículo en una pestaña de Chrome.
2. Seleccionar con el ratón un fragmento de texto de entre 10 y 100 caracteres (sin cruzar elementos HTML complejos).
3. Pulsar el icono flotante **"Guardar resaltado ＋"**.
4. Elegir o crear un contexto en el combobox.
5. Dejar la categoría en **Idea** (amarillo).
6. Pulsar **Guardar** (o presionar Enter).
7. Verificar que el texto queda envuelto en un `<mark class="ch-hl ch-hl-idea">` visible en la página.
8. Recargar la página (F5 o Ctrl+R).

**Resultado esperado:**
- El mismo fragmento de texto aparece resaltado con `<mark class="ch-hl ch-hl-idea">` en la posición correcta, sin intervención del usuario.
- No hay errores en la consola del contenido ni del service worker.

**Criterio de aprobación:** El resaltado visual reaparece tras la recarga. En DevTools > Elements se confirma la presencia del elemento `<mark>` con las clases correctas.

---

### TC-02 — Múltiples resaltados en la misma página se re-aplican todos

**Descripción:** Guardar varios resaltados distintos en la misma URL y verificar que todos vuelven tras recargar.

**Pasos:**
1. Abrir el mismo artículo de TC-01 (o cualquier artículo con texto abundante).
2. Guardar tres resaltados de texto distintos, con categorías diferentes: uno como **Idea**, uno como **Argumento**, uno como **Evidencia**.
3. Confirmar que los tres `<mark>` aparecen en la página inmediatamente tras guardar.
4. Recargar la página.

**Resultado esperado:**
- Los tres resaltados reaparecen en la página con sus colores y clases respectivos (`ch-hl-idea`, `ch-hl-argument`, `ch-hl-evidence`).
- El orden de reaplicación no altera el texto visible de la página.
- La consola no muestra errores.

**Criterio de aprobación:** Los tres `<mark>` están presentes en el DOM después de la recarga con clases correctas. Ningún fragmento de texto queda duplicado ni mal envuelto.

---

### TC-03 — Borrar ítem desde la Vista elimina el mark inmediatamente

**Descripción:** Al hacer clic en el botón borrar de un ítem en el sidebar, el `<mark>` correspondiente desaparece del DOM de la página activa sin necesidad de recargar.

**Pasos:**
1. Abrir un artículo y guardar al menos un resaltado (como en TC-01).
2. Abrir el side panel de la extensión (clic en el icono de la barra de herramientas de Chrome).
3. Navegar a la Vista del contexto donde se guardó el ítem.
4. Localizar el ítem guardado en la lista.
5. Hacer clic en el botón **Borrar** (icono X) del ítem.
6. Volver a la pestaña del artículo (sin recargar).

**Resultado esperado:**
- El `<mark>` desaparece del DOM de la página; el texto permanece sin resaltar.
- El ítem ya no aparece en la Vista del sidebar.
- No se producen errores ni excepciones en la consola.

**Criterio de aprobación:** En DevTools > Elements no hay ningún `<mark>` con el `data-ch-id` del ítem eliminado. El texto del artículo luce normal en esa zona.

---

### TC-04 — Ítems creados desde el editor Markdown no causan error al recargar

**Descripción:** Los ítems creados mediante `parseMd` / `replaceContextFromMarkdown` no tienen `rangePrefix` ni `rangeSuffix`. El content script debe omitirlos silenciosamente al re-aplicar resaltados, sin lanzar excepciones.

**Pasos:**
1. Abrir el side panel.
2. Cambiar al modo **Editor** del sidebar.
3. Escribir o pegar Markdown con el formato del contrato (ej.: `## Subtítulo\n🟡 Nota de prueba`).
4. Esperar a que el buffer se sincronice (o pulsar fuera del área de texto).
5. Cambiar a la Vista y confirmar que los ítems aparecen en la lista.
6. Abrir cualquier URL de artículo en una pestaña nueva.
7. Recargar la pestaña.

**Resultado esperado:**
- No aparece ningún `<mark>` para los ítems del editor (no tienen `rangePrefix`).
- La consola no muestra errores, solo en todo caso un `console.warn` silencioso por ítems omitidos (comportamiento aceptable si implementado).
- La página carga y funciona con normalidad.

**Criterio de aprobación:** La ausencia de `<mark>` para esos ítems es correcta. Cero errores en la consola de extensión y de la página.

---

### TC-05 — Texto ya no presente en la página no causa crash

**Descripción:** Si un ítem fue guardado cuando la página tenía cierto texto y ese texto ya no existe (página modificada, A/B test, o URL diferente), el content script debe omitir el resaltado sin errores.

**Pasos:**
1. Guardar un resaltado en `https://en.wikipedia.org/wiki/Sleep` sobre la frase exacta "Sleep is a naturally recurring state".
2. Confirmar que el `<mark>` aparece.
3. En DevTools > Elements, localizar el nodo de texto que contiene esa frase y **editar el texto** a otra cosa (p. ej., borrar la primera palabra).
4. Recargar la página (el DOM vuelve al original, pero el truco es usar `chrome.storage` para cambiar el `text` del ítem a un texto que no existe; alternativamente, guardar en una URL y luego cambiar el `text` con DevTools > Application > Local Storage).

   **Alternativa más simple:** Guardar un resaltado, luego usar el editor Markdown del sidebar para cambiar el texto del ítem a una cadena inventada que no aparece en la página, y finalmente recargar.

5. Recargar la página.

**Resultado esperado:**
- No aparece ningún `<mark>` para el ítem cuyo texto no se encuentra.
- Los demás ítems (si los hubiera) se re-aplican correctamente.
- La página carga y funciona con normalidad; cero excepciones en la consola.

**Criterio de aprobación:** La omisión es silenciosa. La página no queda rota. Otros resaltados presentes en el contexto sí se aplican si sus textos existen.

---

### TC-06 — Dos fragmentos idénticos en la misma página: se resalta la instancia correcta

**Descripción:** Cuando el mismo texto aparece más de una vez en la página, el algoritmo usa `rangePrefix` / `rangeSuffix` para identificar la instancia correcta; si no hay coincidencia única, cae al fallback (primera coincidencia) o la omite sin crash.

**Pasos:**
1. Buscar en el artículo una palabra o frase corta que aparezca al menos dos veces (ej.: "sleep" o "the").
2. Seleccionar la **segunda** ocurrencia y guardarla como resaltado.
3. Verificar el `<mark>` inmediato post-guardado y su posición en la página.
4. Recargar la página.

**Resultado esperado:**
- El resaltado reaparece en la misma posición (segunda ocurrencia), porque `rangePrefix` + `rangeSuffix` anclan la posición correctamente.
- Si el prefix/suffix no son suficientemente únicos, se aplica la primera ocurrencia del texto (comportamiento de fallback documentado en la spec) y no se lanza excepción.
- En ambos casos, no hay errores en la consola.

**Criterio de aprobación:** El `<mark>` aparece en la página tras la recarga. Si la posición difiere de la instancia original (fallback a primera ocurrencia), es aceptable para v1, siempre que no haya error. No se aceptan páginas rotas ni excepciones.

---

### TC-07 — El color de categoría es correcto en el mark re-aplicado

**Descripción:** Verificar que cada una de las cuatro categorías genera la clase CSS correcta tanto al guardar en tiempo real como al re-aplicar al recargar.

**Pasos:**
1. Guardar cuatro resaltados distintos en la misma página (o en cuatro páginas separadas si el artículo tiene pocos fragmentos únicos), usando una categoría diferente en cada uno:
   - **Título** (`ch-hl-title`)
   - **Idea** (`ch-hl-idea`)
   - **Argumento** (`ch-hl-argument`)
   - **Evidencia** (`ch-hl-evidence`)
2. Confirmar que los `<mark>` aparecen con las clases correctas inmediatamente tras guardar (DevTools > Elements).
3. Recargar la página.
4. Volver a inspeccionar los `<mark>` en DevTools > Elements.

**Resultado esperado:**
- Tras la recarga, cada `<mark>` conserva exactamente la clase `ch-hl ch-hl-{category}` que corresponde a su categoría guardada.
- Los colores de fondo visuales coinciden con los definidos en `content.css` para cada categoría.

**Criterio de aprobación:** Las cuatro clases son correctas antes y después de recargar. No hay `<mark>` con clase `ch-hl-undefined` ni `ch-hl-null`.

---

### TC-08 — El atributo `data-ch-id` está presente en todos los marks

**Descripción:** Todo `<mark>` generado por la extensión, tanto en tiempo real al guardar como al re-aplicar tras recarga, debe llevar `data-ch-id` con el `id` del ítem.

**Pasos:**
1. Guardar un resaltado en una página.
2. Inmediatamente, en DevTools > Elements, seleccionar el `<mark>` recién creado y verificar que tiene el atributo `data-ch-id`.
3. Anotar el valor de `data-ch-id`.
4. Recargar la página.
5. En DevTools > Elements, buscar el `<mark>` y verificar que `data-ch-id` tiene el mismo valor que antes de recargar.
6. Confirmar también que el valor de `data-ch-id` coincide con el `id` del ítem en `chrome.storage.local` (DevTools > Application > Local Storage > extensión > `contextHighlighter`).

**Resultado esperado:**
- El atributo `data-ch-id` está presente con el mismo valor en ambas situaciones (al guardar y al recargar).
- El valor es idéntico al campo `id` del ítem en storage.

**Criterio de aprobación:** `data-ch-id` coincide con el `id` del ítem en storage, tanto en el mark inmediato como en el re-aplicado. No hay marks sin `data-ch-id`.

---

### TC-09 — `pnpm run build` termina sin errores

**Descripción:** Verificación de integridad del compilado completo.

**Pasos:**
1. Desde la raíz del repositorio:
   ```bash
   cd vite-extension && pnpm run build
   ```
2. Observar la salida en terminal hasta que el proceso termine.

**Resultado esperado:**
- El proceso termina con código de salida `0`.
- No aparece ningún mensaje de error (en rojo o con prefijo `ERROR`).
- El directorio `vite-extension/dist/` se actualiza correctamente.

**Criterio de aprobación:** Exit code `0`, sin errores de compilación, sin warnings críticos de Rollup/Vite sobre imports no resueltos.

---

### TC-10 — `init.sh` pasa sin errores de sintaxis

**Descripción:** El script de inicialización del harness valida la consistencia básica del repo.

**Pasos:**
1. Desde la raíz del repositorio:
   ```bash
   ./init.sh
   ```
2. Observar la salida hasta que el script termine.

**Resultado esperado:**
- El script termina con código de salida `0` ("verde").
- No se reportan errores de sintaxis en los archivos JS modificados.
- No aparecen warnings bloqueantes.

**Criterio de aprobación:** Exit code `0`. Si falla, registrar el error en `progress/current.md` y marcar la feature como `blocked` antes de continuar.

---

## 3. Comprobaciones de regresión

Después de verificar los TC anteriores, confirmar que las funcionalidades existentes no fueron afectadas:

| Comprobación | Cómo verificar | Resultado esperado |
|---|---|---|
| **Vista renderiza ítems correctamente** | Abrir el sidebar en un contexto con ítems; cambiar a Vista | Todos los ítems se listan con badges de categoría y botones editar/borrar visibles |
| **Exportar a Markdown** | En la Vista, pulsar el botón de exportación `.md` | El archivo descargado contiene el formato correcto (`# nombre`, `## subtítulo`, emojis de categoría, `_Fuente: …_`); sin campos `rangePrefix`/`rangeSuffix` en el texto exportado |
| **Editor Monaco carga** | Cambiar al modo Editor en el sidebar; esperar 2-3 s | El editor Monaco aparece con syntax highlighting; no hay error de "Cannot read properties of undefined" en la consola |
| **Toggle de tema** | Pulsar el botón de tema (sol/luna) en el header del sidebar | El panel alterna entre modo claro y oscuro; la preferencia persiste al cerrar y reabrir el panel |
| **buildMd / parseMd sin cambios** | Escribir texto en el editor Monaco y luego cambiar a Vista | Los ítems del editor se corresponden con el Markdown escrito; round-trip es correcto |

---

## 4. Limitaciones conocidas (fuera de alcance en v1)

Los siguientes escenarios **no se prueban** en este plan y no son criterio de éxito para la feature #4:

- **SPAs (Single Page Applications):** En frameworks como React, Vue o Next.js, el contenido se renderiza dinámicamente tras la carga inicial. El content script se ejecuta en `document_idle`, antes de que el framework haya pintado el DOM final. La re-aplicación de resaltados puede fallar silenciosamente en estas páginas. La solución (MutationObserver) está programada para la fase 2.

- **Shadow DOM:** El algoritmo TreeWalker no atraviesa shadow roots. Fragmentos de texto dentro de Web Components no serán localizados.

- **Iframes:** El content script solo se inyecta en el documento principal. Texto dentro de `<iframe>` con origen cruzado no es accesible.

- **Click en `<mark>` para mostrar tooltip de borrado:** Esta interacción está pendiente para la fase 2; no se prueba aquí.

- **Re-highlight tras navegación sin recarga completa (history.pushState):** En webs que usan navegación cliente sin recarga de página, el content script no vuelve a ejecutarse y los resaltados no se re-aplican automáticamente.

- **Fragmentos de texto que cruzan elementos HTML heterogéneos:** Selecciones que abarcan, por ejemplo, texto dentro de `<b>` y fuera de él. `surroundContents` puede lanzar `DOMException`; el fallback `extractContents` + `insertNode` cubre casos simples, pero selecciones muy complejas pueden omitirse. Este es comportamiento heredado del content script existente.
