# Research: Modal de confirmación al eliminar contexto

## 1. Estado actual

- El botón de borrar (clase `rail-chip-del`, icono `X` de Lucide) vive en `vite-extension/src/sidebar/rail.js`.
- Al hacer clic llama directamente a `onDelete(ctx.id)` → `onDeleteContext(id)` en `sidebar.js`.
- `onDeleteContext` ejecuta `Store.deleteContext(id)` sin ningún gate de confirmación.
- No existe ningún mecanismo de "deshacer borrado de contexto"; la operación es irreversible.

## 2. Alternativas técnicas para el modal

### A. `window.confirm()` nativo del navegador
- **Pros**: cero código.
- **Contras**: bloqueado en Chrome extension side-panels (chrome-extension:// origin); el dialog no hereda los estilos del panel; comportamiento inconsistente cross-platform.
- **Decisión**: descartado.

### B. Elemento HTML `<dialog>` nativo
- API moderna, semántica (rol `dialog`), focus-trap built-in con `showModal()`.
- Compatible con Chrome y con el CSP de MV3 (sin eval ni código remoto).
- Se añade un único `<dialog id="confirm-delete-modal">` en `sidebar.html`.
- Se controla desde JS con `.showModal()` / `.close()`.
- Los estilos respetan los tokens `--bg`, `--fg`, `--border`, `--accent`, `--shadow-lg`.
- **Decisión: elegida.**

### C. Div overlay custom
- Mayor control de animaciones, pero requiere gestión manual de focus-trap y accesibilidad.
- Innecesariamente complejo dado que `<dialog>` cubre todos los requisitos.
- **Decisión**: descartado.

## 3. Arquitectura elegida

```
sidebar.html        → añadir <dialog id="confirm-delete-modal"> con estructura HTML
sidebar.css         → añadir estilos .confirm-modal, ::backdrop, botones
sidebar/modal.js    → exportar confirmDelete(ctxName): Promise<boolean>
sidebar.js          → onDeleteContext llama await confirmDelete(name) antes de Store.deleteContext
rail.js             → sin cambios (el handler ya llama a onDelete que está en sidebar.js)
```

### Flujo de usuario
1. Usuario hace hover sobre un chip del rail → aparece el botón X rojo.
2. Hace clic en X → se abre el modal con: "¿Eliminar «[nombre]»?" + botones "Cancelar" / "Eliminar".
3. Cancelar → modal se cierra, nada cambia.
4. Eliminar → modal se cierra, se ejecuta la eliminación existente.
5. Escape → equivalente a Cancelar (comportamiento nativo de `<dialog>`).

### Accesibilidad
- `<dialog>` con `showModal()` captura el foco automáticamente.
- Primer foco en botón "Cancelar" (acción segura por defecto).
- Atributo `aria-describedby` apunta al párrafo con el nombre del contexto.
- `Escape` cierra el dialog vía `close()` nativo.

## 4. Contrato del módulo `modal.js`

```js
// sidebar/modal.js
/**
 * confirmDelete(ctxName): Promise<boolean>
 * Shows a <dialog> confirmation and resolves true (delete) or false (cancel).
 */
export function confirmDelete(ctxName) { ... }
```

Internamente:
- Obtiene `#confirm-delete-modal` del DOM.
- Inyecta `ctxName` en el elemento `.modal-ctx-name`.
- Llama `dialog.showModal()`.
- Retorna una `Promise` que resuelve cuando el usuario hace clic en uno de los dos botones, o cuando el dialog se cierra por Escape (→ `false`).

## 5. Archivos afectados

| Archivo | Cambio |
|---|---|
| `src/sidebar.html` | Añadir `<dialog id="confirm-delete-modal">` |
| `src/sidebar.css` | Añadir estilos del modal |
| `src/sidebar/modal.js` | Nuevo módulo (≤ 60 líneas) |
| `src/sidebar.js` | `onDeleteContext` → `await confirmDelete(ctx.name)` |
| `src/sidebar/rail.js` | Sin cambios |
| `src/storage.js` | Sin cambios |

## 6. Restricciones MV3 / CRXJS
- `<dialog>` y `showModal()` no requieren permisos adicionales ni violan la CSP.
- El nuevo módulo `modal.js` es un módulo ES puro; Vite lo bundlea en el entry point `sidebar.js`.
- Sin CDN, sin eval, sin código remoto.
