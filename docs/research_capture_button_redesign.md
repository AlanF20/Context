# Research: Rediseño del botón de captura de resaltado

**Feature:** 024 — `capture_button_redesign`
**Fecha:** 2026-06-29
**Agente:** Researcher

---

## Contexto

Al seleccionar texto en cualquier página, aparece un botón flotante `.ch-icon` con el texto
**"Guardar resaltado ＋"** (fondo indigo, radio 8px). Al hacer clic abre el popup de captura
completo (340 px): encabezado, quote preview, combobox de contexto, pill de categoría,
nest selector, microcopy y botones Cancelar / Guardar ↵.

El "botón" es realmente un trigger de dos pasos — trigger visible → popup completo — y la
pregunta de diseño es si ese flujo de dos pasos puede simplificarse, o si el trigger puede
comunicar más información antes de que el usuario haga clic.

---

## Análisis comparativo de herramientas

### 1. Hypothesis (web.hypothes.is)
- **Patrón:** Minimal icon + annotation form
- **Trigger:** Un icono rectangular pequeño ("A" con un cuadrado) en azul, aparece alineado
  al extremo de la selección. Sin texto.
- **Fricción:** Media — hay un formulario completo de anotación (incluyendo tags y privacidad).
- **Insight:** La iconografía abstracta (sin texto "Guardar") asume que el usuario conoce la herramienta. Funciona para usuarios frecuentes, confunde a nuevos.

### 2. Readwise Reader
- **Patrón:** Inline color swatches
- **Trigger:** 5 puntos de color (amarillo, azul, rosa, verde, violeta) aparecen inmediatamente
  en la selección, sin texto de acción.
- **Fricción:** Muy baja — un clic guarda inmediatamente en la categoría de color elegida.
  No hay contexto; todo va al mismo espacio de highlights del libro/artículo actual.
- **Insight:** Funciona porque la "capa de contexto" (el libro/artículo) ya está establecida
  implícitamente por la URL. Los colores son la única decisión que el usuario toma.

### 3. Glasp
- **Patrón:** Floating contextual mini-menu
- **Trigger:** Una mini-barra flotante con 4 swatches de color + íconos de compartir.
  Aparece sobre la selección. Un clic guarda y resalta en ese color.
- **Fricción:** Baja — un clic guarda, pero hay opciones adicionales visibles.
- **Insight:** La colección (equivalente al Contexto) se determina por cuenta/sesión, no
  por elección en el momento de captura. Los colores son solo aesthetics, no semántica.

### 4. Liner
- **Patrón:** Single-action floating pill
- **Trigger:** Un pill amarillo con texto "Highlight" (muy similar al estado actual de la
  extensión). Un clic guarda en amarillo por defecto.
- **Fricción:** Muy baja — acción única, sin decisiones.
- **Insight:** Liner permite cambiar el color *después* de guardar, no antes. Esto invierte
  el orden: guardar primero, categorizar después.

### 5. Medium
- **Patrón:** Inline formatting toolbar
- **Trigger:** Una barra horizontal con opciones: Bold | Italic | ★ Highlight | Link | Twitter.
  El highlight es una acción entre otras acciones de formato.
- **Fricción:** Baja — pero el highlight no tiene contexto ni categoría, es solo una marca visual.
- **Insight:** Embedding el highlight dentro de un toolbar de formato normaliza la acción
  como parte del flujo de lectura activa. No escalable si necesitas categorización.

### 6. Notion Web Clipper / Arc Notes
- **Patrón:** Browser-level integration con destino explícito
- **Trigger:** Un popup de extensión (no inline en la página) donde primero se elige el
  destino (página de Notion o Easel de Arc), luego se guarda.
- **Fricción:** Media-alta — requiere abrir la extensión, pero da control total del destino.
- **Insight:** Cuando la decisión de destino es la más importante, mostrarla primero es correcto.
  Similar a la situación del Contexto en nuestra extensión.

---

## Taxonomía de patrones por fricción

| Patrón | Ejemplo | Fricción | Contexto implícito? | Categoría en trigger? |
|---|---|---|---|---|
| Single color swatch | Glasp, Liner | Muy baja | Sí (URL/cuenta) | Sí (color) |
| Inline color swatches | Readwise | Baja | Sí (artículo actual) | Sí (color) |
| Minimal icon | Hypothesis | Media | No | No |
| Text pill (estado actual) | Esta extensión | Media | No | No |
| Toolbar embed | Medium | Baja | Sí | No |
| Browser-level popup | Notion Clipper | Alta | No | No |

**Observación clave:** Las herramientas con fricción baja funcionan porque el contexto ya
está implícito (la URL, el artículo, la cuenta). Nuestra extensión no tiene eso — el usuario
activamente construye y elige contextos. Esto justifica algo de fricción mayor que Readwise,
pero no necesariamente tanta como ahora.

---

## Oportunidades de mejora

### A) Smart default — trigger con contexto pre-sugerido
El trigger actual dice "Guardar resaltado ＋" sin comunicar a qué contexto. Si hay un contexto
de esta página (ya detectado en `contextForThisPage()`), el trigger podría mostrar:
`[dot de color] Investigación sobre IA ＋`

El usuario ve de inmediato dónde va a guardarse. Si es el contexto correcto, el popup ya
abre con todo pre-seleccionado. Si no, corrige en el combo.

### B) Category-first trigger (swatches en el trigger)
Reemplazar el pill de texto por 4 puntos de color (title/idea/argument/evidence) + un ícono de
guardar. Al hacer clic en un punto de color y haber un contexto activo de la página, guarda
inmediatamente. Si no hay contexto activo, abre el popup reducido (solo el combo + ese color pre-seleccionado).

Fricción: Muy baja para usuarios frecuentes, degradación elegante para nuevos.

### C) Two-state trigger (trigger compacto → trigger expandido)
Primera vez en una sesión: pill completo "Guardar resaltado ＋".
Después de la primera captura: pill compacto con solo el dot de color del contexto activo.
Al hover: se expande para mostrar el nombre del contexto.

Combina la discoverability inicial con eficiencia posterior.

---

## Recomendación para la Spec

La opción **A** (smart default con contexto en el trigger) es la mejora con mejor relación
esfuerzo/impacto:
- Requiere cambios mínimos al JS (el contexto de la página ya se detecta)
- Comunica más información sin cambiar el flujo
- Compatible con la opción B como mejora posterior

La opción **B** (swatches de categoría en el trigger) es más ambiciosa y requiere definir
el comportamiento para el caso "sin contexto activo" con cuidado, pero ofrece la mayor
reducción de fricción para usuarios frecuentes.

Se recomienda discutir con el usuario cuál de estas variantes quiere priorizar antes de
escribir la spec.
