# Test Plan: VS Code editor experience (Feature 22)

**Date:** 2026-06-29  
**Spec:** specs/022-spec-undo_redo_stack.json

---

## Verificación automática

```bash
cd vite-extension && pnpm run build   # debe terminar sin errores
./init.sh                             # desde la raíz, debe salir verde
```

---

## 1. Undo / Redo

### 1.1 Undo básico tras edición en textarea
1. Crear un contexto con al menos 2 notas.
2. Abrir modo **Vista** → hacer doble clic en el body del preview (entrar en vista-edit).
3. Editar texto en el textarea y esperar 400 ms (o hacer click fuera para forzar el save).
4. Presionar **Escape** (volver a vista).
5. Presionar **Cmd+Z** (macOS) o **Ctrl+Z** (Win/Linux).
- ✓ El contenido del preview vuelve al estado anterior a la edición.

### 1.2 Redo tras undo
1. Continuar desde 1.1 (estado pre-edición visible).
2. Presionar **Cmd+Shift+Z**.
- ✓ El contenido vuelve al estado post-edición.

### 1.3 Undo de captura desde content script
1. En modo **Vista**, resaltar texto en una página web y guardar con el popup de captura.
2. Volver al panel lateral; el nuevo ítem aparece en el preview.
3. Presionar **Cmd+Z**.
- ✓ El ítem capturado desaparece y el preview vuelve al estado anterior.

### 1.4 Undo de rename
1. Doble clic sobre el nombre del contexto en el header → renombrar → Enter.
2. Presionar **Cmd+Z**.
- ✓ El nombre vuelve al original (nombre del chip en el rail también actualizado).

### 1.5 No intercept en Monaco
1. Cambiar a pestaña **Editor** (Monaco).
2. Escribir algo → presionar **Cmd+Z**.
- ✓ Monaco hace su propio undo de texto (no se dispara el storage-level undo).

### 1.6 No intercept con textarea enfocado
1. Entrar en modo vista-edit (doble clic en body).
2. Escribir en el textarea → sin salir, presionar **Cmd+Z** con el textarea enfocado.
- ✓ El browser deshace el texto en el textarea (no se dispara el storage-level undo).

### 1.7 Stack vacía
1. Sin haber realizado ninguna acción undoable, presionar **Cmd+Z**.
- ✓ No pasa nada visible; el panel no se rompe.

---

## 2. Unsaved indicator (●)

### 2.1 Dot en tab-bar de Monaco
1. Abrir pestaña **Editor** (Monaco).
2. Observar el tab bar: `● Nuevo contexto.md` (sin dot inicialmente).
3. Escribir cualquier carácter en Monaco.
- ✓ El dot `●` aparece en el tab-bar junto al nombre del archivo (`.tab-dirty` visible).
4. Esperar 350 ms (debounce) o presionar **Cmd+S**.
- ✓ El dot desaparece.

### 2.2 Dot en header para vista-edit
1. En modo **Vista**, hacer doble clic en el body para entrar en vista-edit.
2. Observar el header: `● Nombre` (sin dot al inicio).
3. Escribir en el textarea.
- ✓ El dot `●` aparece después del nombre en el header (`.unsaved-dot` visible).
4. Esperar 400 ms (debounce) o click fuera.
- ✓ El dot desaparece.

### 2.3 Dot no aparece en vista (preview)
1. Quedarse en modo **Vista** sin editar.
- ✓ El header nunca muestra el dot unsaved.

---

## 3. Format Document (Shift+Alt+F)

### 3.1 Format en textarea (vista-edit)
1. Entrar en modo vista-edit.
2. Escribir Markdown malformado (e.g., sin líneas vacías entre ítems, o con espacios extra).
3. Presionar **Shift+Option+F** (macOS) / **Shift+Alt+F** (Win).
- ✓ El textarea se reemplaza con Markdown normalizado (parseMd → buildMd).
- ✓ El dot de unsaved aparece (se disparó un 'input').
- ✓ El contenido semántico es idéntico al original.

### 3.2 Format idempotente
1. Presionar **Shift+Alt+F** dos veces seguidas.
- ✓ La segunda aplicación no cambia nada.

### 3.3 Format en Monaco (Editor)
1. Abrir pestaña **Editor**.
2. Editar el Markdown manualmente de forma malformada.
3. Presionar **Shift+Option+F**.
- ✓ El editor Monaco muestra el Markdown normalizado.
- ✓ La operación es undoable dentro de Monaco (Cmd+Z revierte el format).

### 3.4 Format no activo en vista (read-only)
1. Quedarse en modo **Vista** (preview).
2. Presionar **Shift+Alt+F**.
- ✓ No pasa nada visible.

---

## 4. Find / Replace (Cmd+F)

### 4.1 Apertura de la find-bar en vista-edit
1. Entrar en modo vista-edit.
2. Presionar **Cmd+F** (macOS) / **Ctrl+F** (Win).
- ✓ La barra flotante `.find-bar` aparece en la esquina superior derecha del textarea.
- ✓ El input de búsqueda tiene el foco.

### 4.2 Búsqueda básica y navegación
1. Con la find-bar abierta, escribir una palabra presente en el documento.
- ✓ El contador muestra `1 de N`.
- ✓ El textarea selecciona la primera coincidencia y hace scroll hasta ella.
2. Presionar **Enter** (o botón ›).
- ✓ Pasa a la siguiente coincidencia; contador actualizado.
3. Presionar **Shift+Enter** (o botón ‹).
- ✓ Vuelve a la coincidencia anterior.

### 4.3 Sin coincidencias
1. Escribir una cadena que no existe en el documento.
- ✓ El contador muestra `0 resultados`.

### 4.4 Cierre con Escape
1. Con la find-bar abierta, presionar **Escape**.
- ✓ La find-bar se cierra y el foco vuelve al textarea.

### 4.5 Expand Replace
1. Abrir la find-bar y presionar el botón **±**.
- ✓ Aparece la fila de replace con un input y botones "Reemplazar" / "Todo".
2. Presionar **±** de nuevo.
- ✓ La fila de replace se oculta.

### 4.6 Reemplazar una ocurrencia
1. Con la find-bar abierta y una coincidencia seleccionada, expandir replace.
2. Escribir el texto de reemplazo y presionar **Reemplazar**.
- ✓ La coincidencia actual se reemplaza.
- ✓ El textarea dispara auto-save (dot unsaved aparece).
- ✓ La pila de undo tiene un snapshot del estado pre-reemplazo.

### 4.7 Reemplazar todo
1. Con coincidencias encontradas, presionar **Todo**.
- ✓ Todas las ocurrencias se reemplazan.
- ✓ Un único snapshot de undo cubre todo el replace-all.

### 4.8 Find en Monaco no monta find-bar
1. Abrir pestaña **Editor** (Monaco).
2. Presionar **Cmd+F**.
- ✓ El panel nativo de find de Monaco se abre; NO aparece la `.find-bar` custom.

### 4.9 Find en vista (preview) no hace nada
1. En modo **Vista** (preview), presionar **Cmd+F**.
- ✓ No pasa nada (no se abre la find-bar ni el find de Monaco).

---

## 5. Regresiones

- [ ] pnpm run build sin errores.
- [ ] init.sh verde.
- [ ] La descarga `.md` sigue funcionando.
- [ ] El rename del contexto sigue funcionando.
- [ ] El toggle Vista/Editor sigue funcionando.
- [ ] Las capturas desde el content script siguen guardando correctamente.
- [ ] El chip del rail sigue mostrando el contexto seleccionado.
- [ ] Dark mode: find-bar, unsaved-dot y tab-dirty se ven correctamente en ambos temas.
