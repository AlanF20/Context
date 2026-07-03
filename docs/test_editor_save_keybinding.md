# Plan de verificación: editor_save_keybinding (Feature #21)

## Build automático

- [ ] `cd vite-extension && pnpm run build` termina sin errores ni warnings.
- [ ] `./init.sh` (desde raíz) pasa todos los checks en verde.

## Pruebas manuales en Chrome

Cargar `vite-extension/dist/` como extensión sin empaquetar en `chrome://extensions`.

### 1. Botón Editar eliminado del header

- [ ] Abrir el side panel con al menos un contexto que tenga ítems.
- [ ] En la pestaña **Vista**: verificar que el header muestra solo el dot de
  color, el nombre del contexto y el botón de descarga `.md`. **No debe
  aparecer ningún botón de lápiz/editar.**
- [ ] Cambiar a pestaña **Editor** y volver a **Vista**: confirmar que el
  botón de lápiz sigue sin aparecer.

### 2. Header en modo Editor sin cambios

- [ ] En pestaña **Editor**: el header muestra dot + nombre + botón `.md`,
  igual que antes. No se añadió ningún botón extra.

### 3. Cmd+S / Ctrl+S guarda en el editor Monaco

- [ ] Cambiar a pestaña **Editor** con un contexto seleccionado.
- [ ] Editar cualquier línea del texto en Monaco.
- [ ] Presionar **Cmd+S** (macOS) o **Ctrl+S** (Win/Linux).
- [ ] Cambiar a pestaña **Vista**: el cambio debe estar visible en el preview.
- [ ] Recargar el side panel (`chrome://extensions` → reload) y volver:
  el cambio persiste en `chrome.storage.local`.

### 4. El debounce normal sigue funcionando

- [ ] Escribir en Monaco sin presionar Cmd+S.
- [ ] Esperar ~400 ms y cambiar a Vista: el cambio aparece (debounce intacto).

### 5. Descarga .md sigue funcionando

- [ ] Con un contexto seleccionado, clic en el botón `.md`: se descarga un
  archivo Markdown con el contenido correcto.

### 6. Sin regresiones en rename

- [ ] Doble clic en el nombre del contexto en el header: abre el input de
  rename inline, Enter confirma, Escape cancela. Sin cambios de comportamiento.
