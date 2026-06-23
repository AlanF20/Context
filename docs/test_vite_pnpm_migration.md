# Plan de verificación: vite_pnpm_migration (id 8)

**Tester:** Claude pipeline — 2026-06-22

---

## 1. Verificación de sintaxis (estática)

```bash
cd vite-extension

# ESM: copiar a .mjs para que node --check los parsee como módulos
for f in src/*.js; do
  cp "$f" "${f%.js}.mjs"
  node --check "${f%.js}.mjs" && echo "OK: $f" || echo "FAIL: $f"
  rm "${f%.js}.mjs"
done

# Validar manifest.json
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest OK')"
```

Esperado: todos los archivos imprimen `OK`, ninguno `FAIL`.

---

## 2. Instalación de dependencias

```bash
cd vite-extension
pnpm install
```

Esperado:
- Termina con código 0.
- Se crea `node_modules/` y `pnpm-lock.yaml`.
- No hay errores de peer deps críticos (warnings cosméticos aceptables).

---

## 3. Build de producción

```bash
pnpm run build
```

Esperado:
- `dist/` se genera sin errores Rollup.
- `dist/manifest.json` es JSON válido con las rutas actualizadas.
- `dist/` contiene `manifest.json`, el SW bundleado, `popup.html`, CSS y JS hasheados.

```bash
# Verificar manifest.json en dist/
node -e "
  const m = JSON.parse(require('fs').readFileSync('dist/manifest.json','utf8'));
  console.log('manifest_version:', m.manifest_version);
  console.log('background.service_worker:', m.background?.service_worker);
  console.log('action.default_popup:', m.action?.default_popup);
  console.log('content_scripts.js:', m.content_scripts?.[0]?.js);
"
```

---

## 4. Dev mode

```bash
pnpm run dev
# Vite arranca en modo watch; navegar a la URL indicada o verificar que dist/ se creó
```

Esperado:
- Servidor Vite inicia sin errores.
- `dist/` se genera con loaders de CRXJS.
- La carpeta `dist/` es cargable en Chrome (ver §5).

---

## 5. Verificación manual en Chrome

### Carga inicial
- [ ] Abrir `chrome://extensions` en Developer mode.
- [ ] Click "Load unpacked" → seleccionar `vite-extension/dist/`.
- [ ] La extensión carga sin errores en el panel de extensiones.
- [ ] El service worker no muestra errores en su consola (click "Service Worker" en chrome://extensions).

### 5.1 Content script — captura de highlights
- [ ] Navegar a cualquier página web (e.g. `https://example.com`).
- [ ] Seleccionar texto con el cursor → aparece el icono flotante **"Guardar resaltado ＋"**.
- [ ] Click en el icono → se abre el popup de captura con el texto seleccionado en la cita.
- [ ] El combobox de contexto muestra contextos existentes filtrados; permite crear uno nuevo escribiendo y pulsando Enter o haciendo click en "+ Crear «…»".
- [ ] Los 4 swatches de categoría (Título, Idea, Argumento, Evidencia) son clicables y cambian el estado visual.
- [ ] Con una categoría de texto seleccionada y un contexto con subtítulos, aparece el `<select>` de anidación.
- [ ] Pulsar **Guardar** (o Enter) persiste el ítem; el texto en la página queda resaltado con el color de la categoría.
- [ ] Verificar en DevTools → Application → Local Storage (o Storage) → `chrome.storage.local` que la clave `contextHighlighter` contiene el ítem guardado.
- [ ] Pulsar **Cancelar** o **Escape** cierra el popup sin guardar.

### 5.2 Popup de gestión — contextos e ítems
- [ ] Click en el icono de la extensión en la barra de herramientas → abre `popup.html`.
- [ ] La lista de contextos muestra un dot de color, nombre y conteo de notas por contexto.
- [ ] "+ Nuevo" → aparece el formulario de nombre → crear contexto → aparece en la lista inmediatamente.
- [ ] Click en un contexto → se expande el panel de detalle con sus ítems.
- [ ] Los subtítulos se muestran con estilo de encabezado (mayúsculas / negrita).
- [ ] Las notas de texto muestran el badge de categoría (§ Título, ◈ Idea, → Argumento, ✓ Evidencia) y el texto del ítem.
- [ ] Botón "↓ .txt" descarga un archivo `.txt` con el nombre del contexto.
  - Abrir el archivo descargado y verificar que el contenido es legible y tiene la estructura correcta.
- [ ] Botón "×" elimina el contexto tras confirmar en el `confirm()` dialog.
- [ ] Estado vacío visible cuando no hay contextos ("Sin contextos aún…").

### 5.3 Formato del archivo .txt descargado
Ejemplo esperado para un contexto con un subtítulo "Introducción" y una nota de idea "El sueño es importante":

```
Mi Contexto
===========

INTRODUCCIÓN
============

El sueño es importante
```

### 5.4 Compatibilidad de datos con `outputs/`
- [ ] Los datos guardados previamente por la extensión en `outputs/` (mismo `chrome.storage.local`, misma clave `contextHighlighter`, mismo schema) son leídos y mostrados correctamente por la nueva extensión.
  *(Ambas extensiones comparten el mismo `chrome.storage.local` si están en el mismo perfil de Chrome.)*

### 5.5 Tema oscuro
- [ ] Con `prefers-color-scheme: dark` activo (o usando Chrome DevTools → Rendering → Emulate CSS media feature):
  - El popup de captura en página (content.css) usa el tema oscuro.
  - El popup de gestión (popup.css) usa el tema oscuro.

---

## 6. Checklist de cierre

| Check | Resultado |
|---|---|
| `node --check` en todos los `.js` de `src/` | — |
| `dist/manifest.json` es JSON válido | — |
| `pnpm install` sin errores | — |
| `pnpm run build` sin errores Rollup | — |
| Content script captura y persiste highlights | — |
| Popup muestra contextos e ítems | — |
| Descarga .txt con formato correcto | — |
| Tema oscuro activo en ambos UIs | — |
