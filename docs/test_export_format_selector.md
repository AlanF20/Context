# Test plan: Selector de formato de exportación (feature 28)

## Cobertura automatizada (Vitest)

Los casos marcados **[Vitest]** están cubiertos por tests automatizados y no requieren
verificación manual repetida — correr `cd vite-extension && pnpm run test`:

- `tests/028-export-formats.test.js` (entorno `node`, sin mocks de chrome.*): TC-10 a TC-16 y
  TC-06/TC-13.
- `tests/028-export-menu.test.js` (entorno `jsdom`, vía docblock `@vitest-environment`): TC-02,
  TC-03, TC-04, TC-05, TC-19 (parcialmente — cubre que no hay preselección al reabrir).

Sigue siendo necesaria la verificación manual en Chrome real para todo lo que depende del runtime
de la extensión (chrome.storage.local persistido, side panel real, temas claro/oscuro, disparo
real de descarga) — ver casos restantes abajo. Esto sigue la convención acordada para
`vite-extension/`: Vitest cubre lógica pura y render/DOM aislado; `content.js`, Monaco y CSS quedan
fuera de alcance de tests unitarios.

## Cobertura E2E (Playwright)

`tests/e2e/028-export-format-selector.spec.js` (`pnpm run test:e2e`) cierra la mayor parte del
resto: carga la extensión real construida en `dist/` en un Chromium persistente (headed — el modo
headless "old" de Chromium, al que cae por defecto `headless: true`/`chrome-headless-shell`, no
soporta cargar extensiones en absoluto), siembra `chrome.storage.local` con un contexto fijo y
abre `sidebar.html` real. Cubre TC-01/02, TC-06 a TC-09 y TC-11 (Markdown y Anki con datos reales
persistidos, no solo la función pura), TC-18/19, y TC-21 (tema oscuro, token `--bg` real).

Quedan manuales: TC-03/04/05 (interacción de teclado ya cubierta por Vitest sobre el componente
aislado, no re-verificada aquí), TC-20 (regresión general del resto del header) y TC-22
(round-trip completo del editor Monaco).

## Precondiciones
- `pnpm run build` completado sin errores.
- Extensión cargada en `chrome://extensions` desde `vite-extension/dist/`.
- Un contexto con: al menos 2 subtítulos, cada uno con al menos 1 item de texto de cada categoría (idea/argumento/evidencia), y al menos 1 subtítulo sin hijos (para probar el caso "se omite"). Al menos 1 item de texto con `source` y 1 sin `source`.

## Casos de prueba

### TC-01 — Botón "Exportar" reemplaza al botón `.md`
1. Abrir el panel con un contexto seleccionado.
**Esperado:** En `row1` del header aparece un botón "Exportar" (o equivalente) con ícono de chevron. Ya no existe el botón `.md` suelto de antes.

### TC-02 — El menú se abre con las dos opciones
1. Hacer clic en "Exportar".
**Esperado:** Se despliega un menú con exactamente dos ítems: "Markdown (.md)" y "Tarjetas Anki (.txt)".

### TC-03 — Cierre por click-outside
1. Abrir el menú (TC-02).
2. Hacer clic fuera del menú.
**Esperado:** El menú se cierra sin descargar nada.

### TC-04 — Cierre por Escape
1. Abrir el menú (TC-02) con teclado (Tab hasta "Exportar", Enter).
2. Pulsar `Escape`.
**Esperado:** El menú se cierra, el foco vuelve al botón "Exportar".

### TC-05 — Navegación por teclado dentro del menú
1. Abrir el menú con teclado.
2. Usar flechas arriba/abajo para moverse entre los 2 ítems, Enter para seleccionar.
**Esperado:** El foco se mueve visualmente entre ítems; Enter dispara la descarga del ítem enfocado.

### TC-06 — Export Markdown sin regresión (modo Vista)
1. En modo Vista (no vista-edit, no editor), elegir "Markdown (.md)".
**Esperado:** Se descarga `{nombre-contexto}.md` con contenido idéntico al que producía el botón `.md` anterior (`Store.buildMd(ctx)`).

### TC-07 — Export Markdown respeta el buffer vivo en vista-edit
1. Entrar a modo Vista → editar el documento (vista-edit) y cambiar texto SIN guardar (blur/Ctrl+S) aún.
2. Elegir "Markdown (.md)" desde el menú.
**Esperado:** El archivo descargado refleja el contenido del textarea en vivo, no el último estado persistido — igual que el comportamiento actual de `downloadMd`.

### TC-08 — Export Markdown respeta el editor Monaco sin guardar
1. Entrar a modo Editor, escribir cambios sin que se haya disparado el flush/save.
2. Elegir "Markdown (.md)".
**Esperado:** El archivo refleja `editor.peek(ctx.id)` (el buffer vivo de Monaco), no el estado persistido.

### TC-09 — Export Anki ignora cambios sin guardar
1. Entrar a vista-edit o Editor, hacer un cambio SIN guardarlo (no blur, no Ctrl+S).
2. Elegir "Tarjetas Anki (.txt)".
**Esperado:** El archivo Anki se genera desde el estado persistido en `chrome.storage.local` (el cambio sin guardar NO aparece en el export Anki). Confirma AC-15.

### TC-10 — Cabecera y estructura del archivo Anki
1. Elegir "Tarjetas Anki (.txt)" en modo Vista normal (sin ediciones pendientes).
2. Abrir el archivo descargado en un editor de texto.
**Esperado:** Las primeras 3 líneas son exactamente `#separator:tab`, `#html:false`, `#tags column:3`. Le siguen filas con 3 columnas separadas por tabulador (Front, Back, Tags).

### TC-11 — Tarjeta por item de texto con fuente
1. Ubicar en el archivo la fila correspondiente a un item `idea` con `source: "ncbi.nlm.nih.gov"` anidado bajo un subtítulo "Ritmo circadiano".
**Esperado:** Front = `¿Qué Idea se capturó sobre "Ritmo circadiano"?`. Back contiene el texto del item seguido de una línea `Fuente: ncbi.nlm.nih.gov`.

### TC-12 — Tarjeta por item de texto sin subtítulo padre
1. Ubicar un item de texto sin `linkedSubtitleId` (ej. capturado directo al contexto sin nesting).
**Esperado:** Front = `¿Qué {label} se capturó en {nombre del contexto}?` (usa el nombre del contexto, no un subtítulo).

### TC-13 — Tarjeta por item de texto sin fuente
1. Ubicar un item de texto con `source` vacío/null.
**Esperado:** Back contiene solo el texto del item, sin línea "Fuente: ...".

### TC-14 — Tarjeta resumen por subtítulo con hijos
1. Ubicar la fila del subtítulo "Ritmo circadiano" (que sí tiene hijos).
**Esperado:** Front = `¿De qué trata la sección "Ritmo circadiano"?`. Back lista los textos de sus hijos, cada uno prefijado por el label de categoría (`Idea: ...`, `Argumento: ...`, etc.), unidos por ` / `.

### TC-15 — Subtítulo sin hijos no genera fila
1. Contar las filas del archivo correspondientes al subtítulo que no tiene ningún item de texto anidado.
**Esperado:** No existe ninguna fila Front/Back para ese subtítulo.

### TC-16 — Tags de cada fila
1. Inspeccionar la columna Tags de una fila de item de texto (categoría `evidence`, fuente `nature.com`, contexto "Cortisol").
**Esperado:** Tags contiene `evidence`, `nature.com` (o el hostname sin puntos problemáticos) y `cortisol` (nombre del contexto saneado), separados por espacio.

### TC-17 — Escapado de tabulador/salto de línea
1. Capturar (o editar vía Vista) un item de texto que contenga un salto de línea o tabulador dentro del texto.
2. Exportar a Anki.
**Esperado:** El TSV no se rompe — el salto de línea/tabulador dentro del campo se reemplazó por un espacio simple; el archivo sigue teniendo el número correcto de columnas por fila.

### TC-18 — Nombre de archivo Anki
1. Exportar Anki desde un contexto llamado "Mi Investigación".
**Esperado:** El archivo se descarga como `Mi_Investigacion.anki.txt` (mismo criterio de saneo que `sanitizeFilename`, con la extensión `.anki.txt`).

### TC-19 — Sin memoria de formato
1. Exportar como Anki.
2. Volver a abrir el menú "Exportar".
**Esperado:** Ambas opciones se muestran sin ninguna preselección o indicación de "última usada" — el comportamiento es idéntico a la primera apertura.

### TC-20 — Sin regresión en el resto del header
1. Cambiar de contexto en el rail, renombrar con doble clic, cambiar entre Vista/Editor.
**Esperado:** Todo funciona igual que antes; el nuevo botón/menú no interfiere con estos flujos.

### TC-21 — Funciona en modo oscuro
1. Activar modo oscuro.
2. Abrir el menú "Exportar".
**Esperado:** El menú usa los tokens de tema oscuro (`--bg`, `--border`, `--fg`, etc.), sin colores hardcodeados que rompan el contraste.

### TC-22 — buildMd/parseMd intactos
1. Exportar Markdown, y por separado editar el documento en vista-edit y confirmar el round-trip (guardar y recargar).
**Esperado:** El contrato Markdown ⇄ items sigue funcionando exactamente igual que antes de esta feature (sin cambios en `storage.js`).

### TC-23 — pnpm run build sin errores
Correr `cd vite-extension && pnpm run build`.
**Esperado:** Salida sin errores de compilación ni warnings críticos.

### TC-24 — init.sh pasa
Correr `./init.sh` desde la raíz.
**Esperado:** Todos los checks [OK].
