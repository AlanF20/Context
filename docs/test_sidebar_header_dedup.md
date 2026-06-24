# Plan de verificación — sidebar_header_dedup

## 1. Sintaxis (automatizable)

```bash
./init.sh
```
Debe salir verde sin errores de sintaxis en ningún archivo JS/JSON.

## 2. Estructura HTML

- [ ] `outputs/sidebar.html` no contiene la cadena `chrome-bar`.
- [ ] `outputs/sidebar.html` contiene `id="theme-toggle"` dentro de `<nav class="rail">`.
- [ ] El botón `#theme-toggle` es el último hijo del `<nav class="rail">`.

## 3. Estructura CSS

- [ ] `outputs/sidebar.css` no contiene el selector `.chrome-bar`.
- [ ] `outputs/sidebar.css` no contiene el selector `.logo` (el de la barra, no confundir con `.logo` en otros contextos).
- [ ] `outputs/sidebar.css` contiene `.icon-btn` (conservado).
- [ ] `outputs/sidebar.css` contiene `margin-top: auto` aplicado al toggle en el rail.

## 4. Verificación manual en Chrome

Cargar `outputs/` como extensión sin empaquetar en `chrome://extensions` (Developer mode):

- [ ] El panel lateral muestra **una sola barra de título** "Context Highlighter" (la nativa de Chrome).
- [ ] Ya no hay una segunda barra con logo "C" y título debajo.
- [ ] El botón de tema (◐ / ☾) aparece al fondo del rail vertical.
- [ ] Clic en el toggle cambia el tema del panel de claro a oscuro y viceversa.
- [ ] Cerrar y reabrir el panel: el tema persiste (localStorage).
- [ ] El rail sigue mostrando los chips de contexto y el botón "+".
- [ ] La funcionalidad de resaltado en páginas externas no se ve afectada.
