# Research: editor_save_keybinding (Feature #21)

## Objetivo

1. Eliminar el botón "Editar" (pencil icon) del header de la Vista.
2. Añadir Cmd+S / Ctrl+S en el editor Monaco para guardar explícitamente.

---

## Estado actual del código

### `sidebar.js` — `renderHeader()` (líneas 144–204)

- En modo `"vista"`, se crea un `editBtn` (icono Pencil de Lucide) que al
  hacer click llama `switchMode("vista-edit")`.
- En modo `"vista-edit"`, se crea un `doneBtn` ("Listo") que llama
  `switchMode("vista")`.
- En modo `"editor"`, no se añade ningún botón extra.

El import de `Pencil` en la línea 13 quedará huérfano si se elimina el botón.

### `vista.js` — `createDocEditor()`

Implementa el textarea inline de edición completa del documento Markdown.
El modo `"vista-edit"` es el único consumidor. Nada más lo invoca. Si se
elimina el botón de entrada, el modo queda inaccesible pero el código puede
permanecer sin daño.

### `editor.js` — `mount()` (líneas 36–85)

Crea el editor Monaco. El save actual es **debounced** (350 ms) vía
`onDidChangeModelContent → scheduleSync`. No existe un save explícito por
atajo de teclado.

Monaco expone `editor.addCommand(keybinding, handler)` para registrar atajos
locales al editor. El atajo multiplataforma correcto es:

```js
monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS
```

`KeyMod.CtrlCmd` resuelve a Cmd en macOS y a Ctrl en Windows/Linux.

El handler puede llamar directamente a `flush()` (en scope por closure):
```js
editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
  flush();
});
```

---

## Cambios requeridos

### `vite-extension/src/sidebar.js`

1. Eliminar la importación de `Pencil` en la línea 13.
2. En `renderHeader()`:
   - Eliminar el bloque `if (mode === "vista")` que crea y añade `editBtn`
     (líneas 169–178).
   - Eliminar el bloque `else if (mode === "vista-edit")` que crea y añade
     `doneBtn` (líneas 179–184).
   - El bloque `else` que solo hace `row1.append(dot, name, mdBtn)` queda
     como el único caso (simplificar a una sola sentencia sin condicional).

### `vite-extension/src/sidebar/editor.js`

1. Después de `editor = monaco.editor.create(host, {...})` en `mount()`,
   añadir el comando Cmd+S:
   ```js
   editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
     flush();
   });
   ```

---

## Sin cambios requeridos

- `vista.js`: el `createDocEditor()` y todo el plumbing de `"vista-edit"` en
  `sidebar.js` (flush en `onSelectContext`, `onDeleteContext`, etc.) se dejan
  como están. El modo `"vista-edit"` queda dormido (nunca accesible), sin
  riesgo de regresión.
- `storage.js`, `content.js`, `sidebar.css`, `sidebar.html`: sin tocar.

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| `monaco.KeyCode.KeyS` no existe en la versión vendored | Comprobar en build; fallback: usar keyCode numérico 83 |
| Llamar `flush()` dentro del `addCommand` callback usa closure del `mount` actual | Correcto: `flush` es closure sobre `editor` y `currentCtxId`, siempre actualizados |
| Usuarios acostumbrados al botón Editar quedan sin flujo | El Editor tab (Monaco) cubre el caso; es la ruta canónica de edición |
