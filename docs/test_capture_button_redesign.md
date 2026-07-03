# Test plan: Toolbar de captura rápida (#024)

**Fecha:** 2026-06-30  
**Verificación base:** `pnpm run build` + `./init.sh` en verde antes de probar.

---

## Preparación

1. Abrir Chrome → `chrome://extensions` → cargar `vite-extension/dist/` sin empaquetar (Developer mode).
2. Tener al menos un contexto existente creado previamente (ej: "Investigación IA").
3. Abrir una URL que ya tenga capturas en ese contexto (para probar ctx-dot y fast-save).
4. Tener otra URL sin capturas para probar el flujo sin contexto.

---

## T-01 Trigger visual — toolbar en lugar de pill de texto

| Paso | Acción | Esperado |
|---|---|---|
| 1 | Seleccionar cualquier texto en una página | Aparece `.ch-toolbar` — pill horizontal, sin texto "Guardar resaltado" |
| 2 | Inspeccionar el toolbar | Contiene 4 botones circulares de colores y un botón ⋯ |
| 3 | Verificar colores de swatches | Título: rojo-rosa `#f6b8c4`; Idea: dorado `#fdeaa8`; Argumento: azul `#bcd3f5`; Evidencia: verde `#bfe6c8` |
| 4 | Verificar forma del toolbar | `border-radius: 24px`, pill, sombra visible |
| 5 | Verificar animación | El toolbar aparece con fade-in suave (~120ms) |

## T-02 Posicionamiento

| Paso | Acción | Esperado |
|---|---|---|
| 1 | Seleccionar texto en el centro de la página | Toolbar aparece centrado sobre la selección |
| 2 | Seleccionar texto en la parte superior | Toolbar aparece debajo de la selección (fallback) |
| 3 | Seleccionar texto en el borde derecho | Toolbar no se sale del viewport |

## T-03 Indicador de contexto (ctx-dot)

| Paso | Acción | Esperado |
|---|---|---|
| 1 | En URL con capturas previas: seleccionar texto | Tras ~100ms, aparece un dot de color (el color del contexto) a la izquierda de los swatches |
| 2 | Hacer hover sobre un swatch | Tooltip: "Guardar en [Nombre del contexto] como [Categoría]" |
| 3 | En URL nueva (sin capturas previas): seleccionar texto | NO aparece dot de contexto; los swatches muestran solo el nombre de categoría en tooltip |

## T-04 Flujo A — Ruta rápida (URL con contexto detectado)

| Paso | Acción | Esperado |
|---|---|---|
| 1 | En URL con contexto: seleccionar texto | Toolbar aparece; ctx-dot visible |
| 2 | Hacer clic en el swatch Idea | NO se abre ningún popup |
| 3 | Verificar resaltado en página | El texto seleccionado queda resaltado en dorado (`ch-hl-idea`) |
| 4 | Verificar estado de éxito | El toolbar muestra fondo dorado + "✓ Guardado" durante ~450ms, luego desaparece |
| 5 | Verificar que el sidebar se abrió | El side panel se abrió automáticamente |
| 6 | Verificar contexto activo en el sidebar | El sidebar muestra el contexto donde se guardó la captura (rail con ese contexto seleccionado) |
| 7 | Verificar que el item existe en la vista | La nota aparece en la Vista del contexto correcto |
| 8 | Repetir con los 4 swatches (Título, Idea, Argumento, Evidencia) | Cada uno guarda con el color correcto y resaltado correcto |

## T-05 Flujo A — Sidebar ya abierto antes de la captura

| Paso | Acción | Esperado |
|---|---|---|
| 1 | Abrir el sidebar manualmente (clic en el ícono de la extensión) | Sidebar abierto, mostrando algún contexto |
| 2 | Seleccionar texto en URL con contexto diferente al activo | Toolbar aparece |
| 3 | Hacer clic en swatch | Sidebar navega al contexto de la página capturada (onSelectContext) |

## T-06 Flujo B — Ruta sin contexto (URL nueva)

| Paso | Acción | Esperado |
|---|---|---|
| 1 | En URL sin capturas previas: seleccionar texto | Toolbar sin ctx-dot |
| 2 | Hacer clic en el swatch Argumento | Toolbar se cierra |
| 3 | Popup completo se abre | El popup tiene "Argumento" pre-seleccionado en el select de categoría |
| 4 | Crear/elegir contexto y guardar (Enter) | Se guarda normalmente; flujo existente inalterado |
| 5 | Verificar que el popup sigue funcionando completo | Quote preview, combo, nest selector, Cancelar/Guardar siguen operativos |

## T-07 Flujo C — Botón ⋯

| Paso | Acción | Esperado |
|---|---|---|
| 1 | Seleccionar texto (con o sin ctx detectado) | Toolbar aparece |
| 2 | Hacer clic en ⋯ | Toolbar cierra; popup completo abre con categoría "Idea" por defecto |
| 3 | Verificar popup completo | Todos los campos presentes: quote, combo, categoría, nest, botones |
| 4 | Guardar con Enter | Flujo normal del popup inalterado |

## T-08 Cierre del toolbar

| Paso | Acción | Esperado |
|---|---|---|
| 1 | Seleccionar texto (toolbar visible) → hacer scroll | Toolbar desaparece |
| 2 | Seleccionar texto (toolbar visible) → hacer clic fuera del toolbar | Toolbar desaparece |
| 3 | Seleccionar texto → presionar Escape | Toolbar desaparece sin guardar |
| 4 | Seleccionar texto en un área nueva (toolbar visible) | Toolbar anterior desaparece; nuevo toolbar aparece en la nueva posición |

## T-09 Accesibilidad y teclado

| Paso | Acción | Esperado |
|---|---|---|
| 1 | Seleccionar texto; usar Tab | Foco navega por los 4 swatches y el botón ⋯ |
| 2 | Enfocar un swatch; presionar Enter | Se ejecuta la misma acción que el clic |
| 3 | Verificar `aria-label` en swatches | "Guardar como [Categoría]" (o con nombre de contexto si hay ctx-dot) |
| 4 | Verificar `aria-label` en ⋯ | "Más opciones" |

## T-10 Modo oscuro

| Paso | Acción | Esperado |
|---|---|---|
| 1 | Activar modo oscuro del SO | Toolbar usa tokens dark: bg `#1c1c1f`, border `#2e2e34` |
| 2 | Verificar swatches en modo oscuro | Borde de swatches `rgba(255,255,255,0.1)` |
| 3 | Verificar estado de éxito en modo oscuro | Texto "✓ Guardado" legible contra fondo tintado |

## T-11 Regresión — popup completo inalterado

| Paso | Acción | Esperado |
|---|---|---|
| 1 | Abrir popup via ⋯ | Todos los campos presentes y funcionales |
| 2 | Probar quote preview con texto largo | Truncado + toggle "ver todo" funcionan |
| 3 | Probar combobox de contexto | Búsqueda, creación de nuevo contexto funcionan |
| 4 | Probar nest selector | Aparece cuando hay subtítulos en el contexto elegido |
| 5 | Guardar con Enter | Guardado exitoso; resaltado en página; Guardado ✓ |
| 6 | Cancelar | Popup se cierra; nada guardado |

## T-12 Validación de build y harness

```bash
cd vite-extension && pnpm run build   # debe terminar sin errores
cd .. && ./init.sh                    # debe salir verde en todos los checks
```
