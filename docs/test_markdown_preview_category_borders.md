# Test plan: Bordes de categoría en el preview Markdown de la Vista (Feature 20)

## Verificación automatizada

```bash
./init.sh                          # debe salir verde
cd vite-extension && pnpm run build  # debe terminar sin errores
```

## Verificación manual en Chrome

### Setup
1. `pnpm run build` en `vite-extension/`
2. Cargar `vite-extension/dist/` en `chrome://extensions` (Developer mode, "Load unpacked")
3. Abrir cualquier página web

### Casos a probar

#### TC-01: Ítem de categoría Idea (🟡)
1. Resaltar texto → asignar categoría **Idea** → guardar
2. Abrir el panel lateral → pestaña Vista
3. **Esperado:** el texto aparece sin el emoji 🟡; tiene un borde izquierdo de ~3 px en color amarillo-dorado
4. **No esperado:** emoji visible, ni borde gris genérico

#### TC-02: Ítem de categoría Argumento (🔵)
1. Resaltar texto → asignar categoría **Argumento** → guardar
2. Abrir Vista
3. **Esperado:** borde izquierdo azul, sin emoji 🔵

#### TC-03: Ítem de categoría Evidencia (🟢)
1. Resaltar texto → asignar categoría **Evidencia** → guardar
2. Abrir Vista
3. **Esperado:** borde izquierdo verde, sin emoji 🟢

#### TC-04: Ítem de categoría Título (subtítulo)
1. Resaltar texto → asignar categoría **Título** → guardar
2. Abrir Vista
3. **Esperado:** se renderiza como `<h2>` con línea horizontal inferior, sin wrapper `.md-cat-item`

#### TC-05: Ítem sin categoría (category: null)
1. Si existe un ítem legacy sin categoría (editado desde Monaco para quitar el emoji)
2. Abrir Vista
3. **Esperado:** se renderiza como `<p>` plano sin borde lateral de categoría

#### TC-06: Ítem con lista multi-línea
1. Resaltar una lista `<ul>` o `<ol>` → guardar (feature #19)
2. Abrir Vista
3. **Esperado:** la lista se renderiza como `<ul>`/`<ol>` sin wrapper `.md-cat-item` (estos ítems no tienen prefijo emoji en buildMd)

#### TC-07: Línea _Fuente: dominio_
1. Capturar texto desde una página con dominio visible
2. Abrir Vista
3. **Esperado:** aparece `Fuente: dominio` en texto más pequeño/monoespaciado, sin cambios respecto al estado anterior de la feature

#### TC-08: Modo oscuro
1. Activar tema oscuro (botón en el rail)
2. Repetir TC-01, TC-02, TC-03
3. **Esperado:** los bordes siguen visibles y usan los colores claros del tema oscuro (tokens --cat-*-border en dark)

#### TC-09: Export .md sin cambios
1. Capturar varios ítems de distintas categorías
2. Pulsar el botón de descarga .md
3. Abrir el archivo descargado
4. **Esperado:** el Markdown tiene los emojis 🟡/🔵/🟢 de forma normal (no se han modificado)

#### TC-10: Editor Monaco sin cambios
1. Cambiar a pestaña **Editor** en el panel lateral
2. **Esperado:** el Markdown fuente en Monaco muestra los emojis 🟡/🔵/🟢 como antes; no hay regresión en la carga del editor

#### TC-11: Múltiples ítems — espaciado
1. Capturar 3-4 ítems de distintas categorías
2. Abrir Vista
3. **Esperado:** cada ítem tiene un gap visible entre sí (margin-bottom: 10px en .md-cat-item)
