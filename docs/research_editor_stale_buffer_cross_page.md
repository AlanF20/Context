# Research: editor_stale_buffer_cross_page

## Resumen del bug

El panel lateral (`sidebar.js`) sí escucha `chrome.storage.onChanged`, pero el
listener solo dispara un `render()` completo cuando `mode === "vista"`
(`sidebar.js:88`); si el usuario tiene abierta la pestaña **Editor** (Monaco)
de un Contexto cuando el content script de otra página escribe un nuevo ítem
en `chrome.storage.local`, el listener no hace nada. Además, aunque se
disparara un render, `editor.js` prioriza su **buffer en memoria por
contexto** (`buffers[ctx.id]`) sobre los datos frescos del store
(`editor.js:49`), y ese buffer nunca se invalida (`editor.invalidate(ctxId)`)
como reacción a escrituras externas — solo se invalida en flujos internos del
propio sidebar (borrar contexto, renombrar, sync de `docEditor`). El
resultado: el ítem guardado desde el sitio B nunca llega al buffer que
Monaco está mostrando.

## Flujo de datos (traza completa)

1. **Captura en content script (sitio B, misma pestaña de navegador).**
   El popup de captura (`vite-extension/src/content.js:592`, y el "fast save"
   de la toolbar en `content.js:280`) llama a
   `Store.addItem(ctx.id, {...})`, donde `Store` es el namespace importado de
   `content-storage.js:21` (`import * as Store from './content-storage.js'`).

2. **`content-storage.js` es una copia deliberada de `storage.js`**, no un
   re-export (ver el header en `content-storage.js:1-9`): CRXJS/Rollup
   extraería un chunk compartido marcado como *web accessible resource*, y
   Chrome no da acceso a `chrome.storage` dentro de un WAR. Por eso el
   content script usa su propio módulo duplicado, con el mismo
   `addItem()` (`content-storage.js:201-253`).

3. **`addItem()` hace un read-modify-write completo del documento**:
   `const data = await readAll()` (`content-storage.js:202`, idéntico a
   `storage.js:196`) → localiza el contexto (`data.contexts[contextId]`,
   `content-storage.js:203`) → hace `push`/`splice` del nuevo ítem
   (`content-storage.js:244/250` en `storage.js`, línea equivalente
   `239/244`) → `await writeAll(data)` (`content-storage.js:251`), que hace
   `chrome.storage.local.set({ [STORAGE_KEY]: data })`
   (`storage.js:136-140` / `content-storage.js:142-146`).

   Nota: como `readAll()` se llama de forma perezosa en cada operación (no
   hay caché de módulo persistente entre llamadas), **no** hay una carrera
   de "instancia vieja de módulo" que pise el ítem del sitio A; el ítem de A
   y el ítem de B sí terminan ambos en `chrome.storage.local` de forma
   correcta y secuencial. El problema no está en la escritura, sino en la
   lectura del lado del side panel.

4. **`chrome.storage.local.set()` dispara `chrome.storage.onChanged`** en
   todos los contextos de la extensión, incluido el side panel.
   `sidebar.js:66-89` registra el listener:

   ```js
   chrome.storage.onChanged.addListener((changes, area) => {
     if (area !== "local") return;
     ...
     if (!changes[Store.STORAGE_KEY]) return;
     // snapshot de historial si el conteo de items subió
     ...
     if (mode === "vista") render();   // <-- sidebar.js:88
   });
   ```

   Esto SÍ existe (contradice la hipótesis inicial de que no había ningún
   listener) — pero está condicionado a `mode === "vista"`. Si `mode` es
   `"editor"` o `"vista-edit"`, la función retorna sin refrescar `contexts`
   ni el buffer del editor.

5. **El estado `contexts` es una variable de módulo cacheada**
   (`sidebar.js:36`, `let contexts = []`), poblada solo por llamadas
   explícitas a `Store.listContexts()` dentro de `render()`
   (`sidebar.js:122`), `onSelectContext()` (`sidebar.js:139`),
   `afterEditorSync()` (`sidebar.js:369`), `afterDocEditorSync()`
   (`sidebar.js:337`), `onCreateContext()`/`onDeleteContext()`. **Cambiar de
   pestaña Vista↔Editor vía `switchMode()` NO refresca `contexts`** —
   `switchMode()` (`sidebar.js:348-366`) llama a `renderMain()` directamente,
   nunca a `render()` ni a `Store.listContexts()`.

6. **`renderMain()` → `editor.mount(bodyEl, ctx, ...)`** (`sidebar.js:209`)
   pasa el `ctx` que salió de `selectedContext()` (`sidebar.js:132-134`),
   es decir, el objeto potencialmente obsoleto de la variable `contexts`.

7. **`editor.mount()` decide qué mostrar** (`editor.js:46-49`):

   ```js
   async function mount(mountEl, ctx, { onSync, onSave } = {}) {
     dispose();
     currentCtxId = ctx.id;
     const md = buffers[ctx.id] != null ? buffers[ctx.id] : Store.buildMd(ctx);
     ...
   ```

   Si `buffers[ctx.id]` ya tiene un valor (fue seteado alguna vez por
   `onDidChangeModelContent`, `editor.js:87-94`, al escribir algo en Monaco
   con ese contexto abierto), ese buffer en memoria gana **siempre**,
   ignorando tanto el `ctx` recién pasado como cualquier escritura posterior
   en `chrome.storage.local`. El único mecanismo para descartar el buffer es
   `editor.invalidate(ctxId)` (`editor.js:136-138`, `delete buffers[ctxId]`),
   que se invoca en exactamente 3 sitios de `sidebar.js`: al borrar el
   contexto (`sidebar.js:159`), al renombrar (`sidebar.js:325`), y tras un
   sync de `docEditor`/Vista-edit (`sidebar.js:336`). **Ninguno de esos
   sitios se dispara por una escritura externa de `chrome.storage.onChanged`.**

## Causa raíz

El listener `chrome.storage.onChanged` en `sidebar.js:66-89` es la única vía
para que el side panel se entere de escrituras hechas por un content script
en OTRA pestaña/página. Pero:

- **Está condicionado a `mode === "vista"` (`sidebar.js:88`)**: si el usuario
  tiene la pestaña Editor (Monaco) abierta para el Contexto X cuando llega el
  guardado del sitio B, el listener no hace nada — ni refresca `contexts` ni
  invalida el buffer del editor.
- **Nunca llama a `editor.invalidate(ctxId)`** para el contexto afectado,
  bajo ninguna condición. Es la única ruta de invalidación de buffer que
  falta comparada con las otras 3 rutas internas (borrar/renombrar/vista-edit
  sync).
- Incluso si el usuario cambia de pestaña Vista→Editor manualmente después
  del guardado externo, `switchMode()` (`sidebar.js:348-366`) no vuelve a
  pedir `Store.listContexts()`, así que `ctx` sigue siendo el objeto viejo en
  memoria — y aunque lo fuera, `editor.mount()` (`editor.js:49`) de todas
  formas preferiría el buffer cacheado si ya existía uno para ese contexto.

En conjunto, esto reproduce exactamente el síntoma reportado: el usuario
guarda en el sitio A (item entra a `chrome.storage.local` y, si el panel
estaba en Editor, puede quedar cacheado en `buffers[ctxId]` la primera vez
que se abre/edita esa pestaña), navega en la misma pestaña de Chrome al
sitio B, guarda ahí también — la escritura llega a `chrome.storage.local`
correctamente — pero el Editor sigue mostrando el buffer congelado desde el
último montaje/edición, porque nada en el pipeline de `onChanged` invalida
ese buffer ni refresca `contexts` mientras `mode !== "vista"`.

## Evidencia en código

`vite-extension/src/sidebar.js:66-89` (listener condicionado a modo "vista",
sin invalidar el editor):

```js
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  if (changes.CH_NAV?.newValue) {
    onSelectContext(changes.CH_NAV.newValue);
    chrome.storage.local.remove('CH_NAV');
  }

  if (!changes[Store.STORAGE_KEY]) return;

  const oldCtxs = changes[Store.STORAGE_KEY].oldValue?.contexts || {};
  const newCtxs = changes[Store.STORAGE_KEY].newValue?.contexts || {};
  for (const [id, newCtx] of Object.entries(newCtxs)) {
    const oldCtx = oldCtxs[id];
    if (oldCtx && newCtx.items.length > oldCtx.items.length) {
      historyMgr.push(id, serialize(oldCtx));
    }
  }

  if (mode === "vista") render();   // <-- único refresh, y solo en Vista
});
```

`vite-extension/src/sidebar/editor.js:46-49` (el buffer en memoria gana
sobre cualquier dato fresco pasado a `mount`):

```js
async function mount(mountEl, ctx, { onSync, onSave } = {}) {
  dispose();
  currentCtxId = ctx.id;
  const md = buffers[ctx.id] != null ? buffers[ctx.id] : Store.buildMd(ctx);
```

`vite-extension/src/sidebar/editor.js:136-138` (única función de invalidación
disponible, nunca invocada desde el listener de `onChanged`):

```js
function invalidate(ctxId) {
  delete buffers[ctxId];
}
```

`vite-extension/src/sidebar.js:348-366` (`switchMode` no refresca `contexts`
al entrar a "editor"):

```js
async function switchMode(next) {
  if (next === mode) return;
  if (mode === "editor") {
    await editor.flush(saveWithHistory);
    contexts = await Store.listContexts();
  }
  if (mode === "vista-edit") {
    await docEditor.flush();
    contexts = await Store.listContexts();
  }
  if (next === "editor" && selectedId) {
    const ctx = selectedContext();
    if (ctx) historyMgr.push(selectedId, serialize(ctx));
  }
  findBar.dispose();
  mode = next;
  await renderMain();
}
```
(Nótese que `contexts` solo se refresca cuando se SALE de "editor"/"vista-edit",
no cuando se ENTRA a "editor" — así que entrar a Editor usa lo que ya
hubiera en `contexts`, que puede estar desactualizado si la última
actualización vino de un `onChanged` ignorado.)

`vite-extension/src/content.js:280` y `:592` (los dos puntos de guardado del
content script, ambos vía el mismo `Store.addItem`):

```js
const savedItem = await Store.addItem(ctx.id, { text: savedText, category, ... });
```

`vite-extension/src/content-storage.js:1-9` (por qué el content script usa un
módulo duplicado en vez de importar `storage.js` directamente — descarta la
hipótesis de una instancia de módulo compartida y stale):

```
* content-storage.js — DELIBERATE standalone copy of storage.js.
* -----------------------------------------------------------------
* The content script cannot share storage.js with sidebar.js: Rollup would
* extract the shared module as a chunk that CRXJS marks as a web accessible
* resource, and Chrome executes WARs without chrome.storage access ...
* Keep this file IN SYNC with storage.js ...
```

Confirmado por diff: `content-storage.js` es byte-a-byte funcionalmente
idéntico a `storage.js` (mismo `readAll`/`writeAll`/`addItem`, sin caché de
módulo persistente), así que la escritura del sitio B en sí misma es
correcta y no pisa el ítem del sitio A en `chrome.storage.local`.

## Opciones de solución (para que el Spec-Writer elija)

1. **Invalidar el buffer del editor dentro del listener de `onChanged`,
   siempre (no solo en modo "vista").**
   En `sidebar.js:66-89`, para cada contexto cuyo `newCtx.items.length >
   oldCtx.items.length` (o cualquier diff relevante), llamar a
   `editor.invalidate(id)` incondicionalmente, y refrescar `contexts` con
   `Store.listContexts()` también fuera de `mode === "vista"`. Si
   `mode === "editor"` y `selectedId === id`, además re-montar el editor (o
   marcarlo "sucio" para remount en el próximo `switchMode`/render).
   - Ventaja: arregla la causa raíz directamente, cambio acotado a un solo
     archivo/listener.
   - Riesgo: si el usuario está a mitad de edición sin guardar en Monaco y
     llega un cambio externo, hay que decidir si se descarta su edición en
     curso o se hace un merge/aviso (ver DESIGN_SPEC / UX para conflictos).

2. **Re-leer el estado desde `chrome.storage.local` cada vez que se entra a
   modo "editor" (`switchMode`/`renderMain`), en vez de confiar en la
   variable `contexts` cacheada o en el buffer.**
   Añadir `contexts = await Store.listContexts()` también al ENTRAR a
   "editor" en `switchMode` (hoy solo se hace al salir), y decidir cuándo el
   buffer de Monaco debe ceder ante datos más frescos (p.ej. comparar
   timestamps/hash del documento fresco contra el buffer, o invalidar el
   buffer si no hay cambios sin guardar pendientes).
   - Ventaja: cubre también el caso de que el listener no se haya disparado
     por cualquier motivo (side panel recién revelado, race de eventos).
   - Riesgo: más intrusivo; hay que preservar el cursor/scroll de Monaco si
     el documento no cambió, y evitar pisar ediciones no guardadas del
     usuario.

3. **Refrescar en foco/visibilidad del side panel** (`visibilitychange` /
   apertura del panel) además del listener de `onChanged`, forzando
   `render()` completo y `editor.invalidate()` de todos los contextos
   visibles al recuperar foco.
   - Ventaja: red de seguridad adicional independiente de `onChanged`
     (cubre casos donde el evento se pierda, por ejemplo si el side panel
     estuvo suspendido/descargado por Chrome).
   - Riesgo: no resuelve el caso de "panel abierto y visible en Editor
     mientras se guarda en otra pestaña sin cambiar de foco" (el usuario
     puede ver el side panel y la pestaña de la página simultáneamente en
     ventanas separadas) — habría que combinarlo con la opción 1.
