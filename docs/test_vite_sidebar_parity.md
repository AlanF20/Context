# Test Plan: vite_sidebar_parity (Feature #10)

**Fecha:** 2026-06-22  
**Spec:** `docs/spec_vite_sidebar_parity.md`

---

## 1. Verificación de sintaxis (automática)

Ejecutar desde `vite-extension/`:

```bash
node --check src/storage.js
node --check src/background.js
# Módulos ESM: copiar a .mjs para validar
cp src/sidebar.js /tmp/sidebar.mjs && node --check /tmp/sidebar.mjs
cp src/sidebar/dom.js /tmp/dom.mjs && node --check /tmp/dom.mjs
cp src/sidebar/store.js /tmp/store.mjs && node --check /tmp/store.mjs
cp src/sidebar/markdown.js /tmp/markdown.mjs && node --check /tmp/markdown.mjs
cp src/sidebar/theme.js /tmp/theme.mjs && node --check /tmp/theme.mjs
cp src/sidebar/rail.js /tmp/rail.mjs && node --check /tmp/rail.mjs
cp src/sidebar/vista.js /tmp/vista.mjs && node --check /tmp/vista.mjs
cp src/sidebar/editor.js /tmp/editor.mjs && node --check /tmp/editor.mjs
```

Todos deben salir sin errores.

## 2. Build (automático)

```bash
cd vite-extension
pnpm install
pnpm run build
```

- Sin errores de compilación.
- `dist/` contiene:
  - `dist/sidebar.html` (o similar, según CRXJS naming)
  - Chunks JS del sidebar
  - `dist/vendor/monaco/vs/loader.js` (vendor copy)
  - `dist/manifest.json` con `"sidePanel"` y `"permissions": [..., "sidePanel"]`

## 3. Verificación del manifest generado

```bash
cat vite-extension/dist/manifest.json | python3 -m json.tool
```

- `permissions` incluye `"sidePanel"`.
- `side_panel.default_path` apunta a `sidebar.html`.
- No hay `action.default_popup`.

## 4. Prueba manual en Chrome

Cargar `vite-extension/dist/` en `chrome://extensions` (Developer mode → Load unpacked).

### 4.1 Side panel se abre

- [ ] Click en el icono de la extensión → se abre el **side panel** (no un popup).
- [ ] El side panel muestra el rail de contextos a la izquierda.

### 4.2 Rail de contextos

- [ ] Si no hay contextos: el rail muestra un estado vacío o prompt para crear uno.
- [ ] Con contextos guardados: los chips aparecen en el rail con el color correcto.
- [ ] Click en un chip: selecciona el contexto y muestra su contenido a la derecha.

### 4.3 Vista (preview semántico)

- [ ] La Vista muestra los ítems del contexto seleccionado.
- [ ] Los subtítulos se renderizan como `<h3>`.
- [ ] Las notas de texto se renderizan como `<p>` dentro de `<li>` dentro de `<ul role="list">`.
- [ ] Cada nota muestra un badge de categoría con símbolo único:
  - Título → `§`
  - Idea → `◈`
  - Argumento → `→`
  - Evidencia → `✓`
- [ ] Cada nota tiene borde izquierdo tintado con el color de su categoría.
- [ ] Al pasar el cursor sobre una nota aparecen botones de editar y borrar.

### 4.4 Editar ítem inline

- [ ] Click en editar: el texto de la nota se convierte en textarea/input editable.
- [ ] Confirmar con Enter o blur: el cambio persiste en `chrome.storage.local`.
- [ ] Cancelar con Escape: el texto vuelve al original sin cambios.
- [ ] Abrir el Editor después de editar inline: el buffer de Monaco se invalida y muestra el texto actualizado.

### 4.5 Borrar ítem

- [ ] Click en borrar: el ítem desaparece de la Vista.
- [ ] Recargar la extensión o cerrar/abrir el side panel: el ítem sigue sin aparecer (persiste en storage).

### 4.6 Toggle Vista ↔ Editor

- [ ] El botón toggle cambia de Vista a Editor.
- [ ] Monaco carga con el contenido Markdown del contexto seleccionado.
- [ ] Escribir en Monaco y cambiar a Vista: los cambios se reflejan en el preview.
- [ ] El toggle funciona sin errores de consola.

### 4.7 Export Markdown

- [ ] Botón de export genera un archivo `.md` descargable.
- [ ] El contenido del `.md` es válido Markdown y contiene los ítems del contexto.

### 4.8 Content script (captura)

- [ ] Abrir cualquier página web.
- [ ] Seleccionar texto → aparece el icono `+`.
- [ ] Click en `+` → abre el popup de captura.
- [ ] El combobox de contexto lista los contextos existentes.
- [ ] El select de subtítulo se muestra si el contexto tiene subtítulos.
- [ ] Guardar con Enter → el ítem aparece en el side panel bajo el contexto correcto.
- [ ] El texto guardado queda resaltado con el color de la categoría en la página.

### 4.9 Dark mode

- [ ] El botón de tema cambia entre claro y oscuro.
- [ ] Los tokens de color del dark mode se aplican al rail, Vista y Editor.
- [ ] La preferencia persiste al cerrar y reabrir el side panel.

### 4.10 Regresión: popup huérfano

- [ ] No hay popup al hacer click en el icono (el icono abre el side panel directamente).
- [ ] No hay errores en `chrome://extensions` relacionados con `popup.html`.

## 5. init.sh

```bash
cd /Users/alanflores/dev/Context
./init.sh
```

- Todos los checks deben salir `[OK]`.
- No deben aparecer `[ERROR]` en ningún paso.

---

## Criterios de fallo (cualquiera bloquea el cierre)

- `pnpm run build` produce errores.
- `dist/manifest.json` no tiene `sidePanel`.
- El icono no abre el side panel.
- Monaco no carga o produce error en consola.
- Editar/borrar inline no persiste.
- `init.sh` produce `[ERROR]`.
