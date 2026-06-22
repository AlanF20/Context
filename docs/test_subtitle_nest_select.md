# Test plan — subtitle_nest_select

**Feature ID:** 7  
**Fecha:** 2026-06-22

---

## Verificación estática

- [ ] `node --check outputs/content.js` — sin errores
- [ ] `node --check outputs/storage.js` — sin errores (no debe haber cambiado)
- [ ] `./init.sh` — todos los checks verdes

## Casos manuales en Chrome

### A. Contexto con múltiples subtítulos

1. Abrir cualquier página web.
2. Resaltar texto → click en `＋` → popup abierto.
3. Seleccionar un contexto que ya tenga ≥ 2 subtítulos.
4. Elegir categoría distinta de "Título" (e.g. Idea).
5. **Esperado:** fila `.ch-nest` visible con un `<select>` que muestra "— Sin subtítulo —" + un option por cada subtítulo; el último está pre-seleccionado.
6. Cambiar la selección a un subtítulo anterior.
7. Guardar.
8. **Esperado:** el ítem aparece en el sidebar anidado bajo el subtítulo elegido (no bajo el último).

### B. Opción "Sin subtítulo"

1. Mismo contexto anterior, seleccionar "— Sin subtítulo —".
2. Guardar.
3. **Esperado:** ítem sin `linkedSubtitleId` (aparece suelto en el sidebar, no bajo ningún subtítulo).

### C. Categoría "Título" oculta la fila

1. Seleccionar la categoría "Título" en el popup.
2. **Esperado:** fila `.ch-nest` oculta (`hidden`), sin importar cuántos subtítulos tenga el contexto.

### D. Contexto sin subtítulos

1. Seleccionar un contexto que no tenga ningún subtítulo guardado.
2. **Esperado:** fila `.ch-nest` oculta.

### E. Cambio de contexto repuebla el select

1. Seleccionar contexto A (con subtítulos) → fila visible con subtítulos de A.
2. Cambiar al contexto B (con subtítulos distintos).
3. **Esperado:** select muestra los subtítulos de B, no los de A.

### F. Cambio de contexto a uno sin subtítulos

1. Seleccionar contexto con subtítulos → fila visible.
2. Cambiar a contexto sin subtítulos.
3. **Esperado:** fila oculta.

### G. Dark mode

1. Activar dark mode en el sistema o en el panel.
2. **Esperado:** el select usa los tokens dark (fondo oscuro, texto claro, sin colores hardcoded).
