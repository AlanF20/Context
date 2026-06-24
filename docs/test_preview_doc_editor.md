# Test Plan: Feature 18 — Rich Markdown preview + document-level inline edit

## Prerrequisitos
- Build: `cd vite-extension && pnpm run build` (debe terminar sin errores)
- Cargar `vite-extension/dist/` como extensión sin empaquetar en `chrome://extensions` (Developer mode)
- Tener al menos un Contexto con ítems de distintas categorías (Título, Idea, Argumento, Evidencia) y al menos un subtítulo

---

## T1 — Vista renderiza Markdown enriquecido

| Paso | Acción | Resultado esperado |
|---|---|---|
| T1.1 | Abrir el side panel, seleccionar un Contexto con ítems | El body muestra HTML renderizado: headings (`##` → `<h2>`), párrafos con emojis de categoría (🟡🔵🟢🔴), texto en cursiva para fuentes, ninguna lista de cajas con botones |
| T1.2 | Verificar que no aparecen botones de lápiz/X al pasar el cursor sobre el body | Ningún botón de editar/borrar por ítem; hover sobre el body no muestra acciones |
| T1.3 | Verificar que el Markdown se renderiza correctamente también en dark mode | Colores de texto y fondo correctos con el tema oscuro |

## T2 — Contexto vacío

| Paso | Acción | Resultado esperado |
|---|---|---|
| T2.1 | Crear un Contexto nuevo (sin ítems) y seleccionarlo | El body muestra el estado vacío: icono NotebookPen, "Contexto vacío", hint de captura |

## T3 — Entrar en modo edición

| Paso | Acción | Resultado esperado |
|---|---|---|
| T3.1 | En Vista, pulsar el botón lápiz del ctx-header | El body muestra un `<textarea>` con el Markdown fuente completo (formato buildMd); el textarea recibe foco automáticamente |
| T3.2 | Verificar que el botón lápiz desaparece y aparece el botón "Listo" en su lugar | Sí |
| T3.3 | Verificar que el contador de ítems del rail refleja el estado correcto | Contador inalterado al entrar en modo edición |

## T4 — Auto-guardado (debounce + blur)

| Paso | Acción | Resultado esperado |
|---|---|---|
| T4.1 | En modo edición, modificar el texto de una nota y esperar ~500 ms sin hacer nada | La nota modificada se guarda en storage (verificar en chrome.storage via DevTools o volviendo a Vista) |
| T4.2 | Editar texto, pulsar Tab para cambiar foco al botón "Listo" (blur del textarea) | Guardado inmediato al perder el foco |
| T4.3 | Añadir una línea `## Nuevo subtítulo` en el textarea y esperar debounce | Al volver a Vista, el nuevo subtítulo aparece renderizado como heading |

## T5 — Salir del modo edición

| Paso | Acción | Resultado esperado |
|---|---|---|
| T5.1 | Pulsar "Listo" estando en modo edición | Guarda inmediatamente, vuelve al preview renderizado con los cambios reflejados |
| T5.2 | Pulsar Escape en el textarea | Igual: guarda y vuelve al preview |
| T5.3 | Modificar texto → "Listo" → verificar que el preview muestra el texto actualizado | Sí, sin necesidad de recargar |

## T6 — Eliminar contenido vía edición del Markdown

| Paso | Acción | Resultado esperado |
|---|---|---|
| T6.1 | Entrar en modo edición, borrar una línea completa de nota, pulsar "Listo" | Al volver a Vista la nota ya no aparece; la vista no tiene botón X por ítem |

## T7 — Toggle Vista/Editor (Monaco)

| Paso | Acción | Resultado esperado |
|---|---|---|
| T7.1 | En Vista (modo preview), cambiar al tab "Editor" con el segmented toggle | Monaco se monta mostrando el Markdown fuente |
| T7.2 | Editar algo en Monaco, esperar sync, volver a Vista | El preview renderiza el contenido actualizado |
| T7.3 | Entrar en modo edición de Vista, hacer un cambio, pulsar el tab "Editor" | El cambio se guarda antes de montar Monaco; Monaco muestra el Markdown actualizado |
| T7.4 | En Editor Monaco, pulsar tab "Vista" | Vuelve al preview renderizado |

## T8 — Descarga Markdown

| Paso | Acción | Resultado esperado |
|---|---|---|
| T8.1 | En Vista (preview), pulsar el botón de descarga .md | Se descarga un archivo .md con el contenido del contexto |
| T8.2 | En modo edición de Vista, pulsar descarga .md | El archivo descargado refleja el estado actual del textarea (texto en edición) |

## T9 — Rename de contexto

| Paso | Acción | Resultado esperado |
|---|---|---|
| T9.1 | Hacer doble-clic sobre el nombre del contexto en el header | El nombre se convierte en input de texto; Enter confirma el nuevo nombre |

## T10 — Guardar desde content script (nueva captura mientras Vista abierta)

| Paso | Acción | Resultado esperado |
|---|---|---|
| T10.1 | Con Vista en preview, capturar un nuevo ítem desde la página | El preview se actualiza automáticamente (chrome.storage.onChanged) |
| T10.2 | Con Vista en modo edición, capturar un nuevo ítem desde la página | El textarea NO se interrumpe (onChanged guarda ignorado mientras mode === 'vista-edit') |

## T11 — Build y sintaxis

| Paso | Acción | Resultado esperado |
|---|---|---|
| T11.1 | `cd vite-extension && pnpm run build` | Sin errores |
| T11.2 | `./init.sh` desde la raíz del repo | Todos los checks [OK] |
