# Research — Feature #34: editor_tab_switch_persistence_bug

## Repro confirmado (respuestas del usuario)

1. Se recarga la **página web** (F5), no el side panel.
2. Secuencia: capturar en Vista → cambiar a pestaña **Editor** → volver a **Vista**
   → recargar la página → el bug ocurre igual (no hace falta editar nada en Monaco).
3. Lo que se pierde es **solo el resaltado visual** (`.ch-hl-*`) en la página; la
   nota/ítem sigue existiendo en Vista/Editor.
4. Efecto secundario: el "contexto detectado" para la página (el punto de color
   en la toolbar flotante de captura) también desaparece — el usuario tiene que
   volver a elegir el contexto manualmente en el popup completo.

## Causa raíz

### 1. `editor.flush()` no comprueba `isDirty` (`src/sidebar/editor.js:108-120`)

```js
async function flush(onSave) {
  clearTimeout(syncTimer);
  if (editor && currentCtxId) {
    const value = editor.getValue();
    ...
    await onSave(currentCtxId, value);   // <-- se ejecuta SIEMPRE que Monaco esté montado
    ...
  }
}
```

`switchMode()` en `sidebar.js:385-403` llama `await editor.flush(saveWithHistory)`
cada vez que se sale del modo `"editor"`, sin importar si el usuario tocó algo.
Como `editor.mount()` siempre crea una instancia de Monaco (`src/sidebar/editor.js:71`),
el simple hecho de visitar la pestaña Editor dispara un `flush()` con
`editor && currentCtxId` verdaderos → llama a `onSave` (=`saveWithHistory` →
`Store.replaceContextFromMarkdown`) aunque el contenido sea idéntico al que
había antes de entrar.

Existe ya una función `isDirty(ctxId)` en el mismo módulo (línea 141-143,
respaldada por `tabDirtyEl`) que sí se usa en otros puntos de `sidebar.js`
(líneas 107, 187) para decidir si refrescar la UI sin pisar cambios — pero
`flush()` nunca la consulta antes de guardar.

### 2. `replaceContextFromMarkdown` es destructivo por diseño para TODOS los ítems (`src/storage.js:361-388`)

```js
export async function replaceContextFromMarkdown(contextId, md) {
  ...
  ctx.items = parsed.items.map((it) => ({
    id: uid("item"),           // <-- nuevo id para cada ítem, siempre
    ...
    sourceUrl: "",              // <-- se pierde SIEMPRE
    rangePrefix: null,
    rangeSuffix: null,
    rangeText: null,
    rangeStart: null,
    rangeEnd: null,             // <-- ancla de resaltado se pierde SIEMPRE
  }));
  ...
}
```

El comentario del propio código dice: *"Anchoring metadata is DOM-position
data that Markdown cannot carry; editor-created items are explicitly not
re-anchorable (spec 004/027)"*. Esa es una decisión de diseño aceptable
**cuando el usuario realmente edita** en el Editor (el texto pasa por
Markdown y se pierde la posición exacta). El bug es que, combinado con el
punto 1, esta función se ejecuta y destruye el ancla de **todos** los ítems
del contexto (incluidos los que nunca se tocaron) por el solo hecho de haber
visitado la pestaña Editor y vuelto a Vista.

### 3. Efecto en cadena: la detección de "contexto para esta página" también se rompe

`src/content.js:176-188` (`contextForThisPage`) decide qué contexto mostrar
como preseleccionado en la toolbar flotante de captura comparando
`it.sourceUrl === location.href`. Como `sourceUrl` queda en `""` para todos
los ítems tras el flush del Editor, esta función deja de encontrar coincidencia
→ el punto de color de "contexto detectado" desaparece de la toolbar, y el
usuario percibe que "el contexto seleccionado se perdió" y tiene que volver a
elegirlo a mano en el popup completo. Esto explica la 4ª respuesta del usuario
sin necesitar un bug adicional: es consecuencia directa del mismo defecto.

## Por qué sobrevive un reload de storage pero no el highlight visual

El ítem en sí (`text`, `category`, `linkedSubtitleId`, `comment`) sí se
reconstruye correctamente desde el Markdown parseado — por eso la nota sigue
visible en Vista/Editor. Pero el re-pintado de `.ch-hl-*` al cargar la página
(features #4/#25/#27) depende de `rangePrefix/rangeSuffix/rangeText/rangeStart/
rangeEnd` + `sourceUrl` para reanclar el rango en el DOM. Con esos campos en
`null`/`""`, el content script no tiene con qué reanclar ese ítem → no se
repinta el highlight, aunque el dato "lógico" de la nota siga intacto.

## Alcance del fix

El fix debe evitar que **visitar** la pestaña Editor sin editar nada dispare
un `replaceContextFromMarkdown`. La forma más simple y menos invasiva,
consistente con el patrón `isDirty` ya existente en el propio módulo, es que
`flush()` sea un no-op cuando el buffer no está sucio (no hubo cambios desde
el mount), salvo cuando se invoca explícitamente vía Cmd+S (donde sí conviene
guardar aunque el contenido termine siendo idéntico, ya que es una acción
explícita del usuario y el costo de un guardado idéntico es solo perder el
ancla de items — que de todos modos es el comportamiento documentado en spec
004/027 para ediciones reales).

Nota: **no** se propone tocar el comportamiento ya documentado en spec 004/027
de que un ítem realmente editado en el Editor pierde su ancla (eso sigue
siendo una limitación de diseño aceptada). El fix es exclusivamente para el
caso "se montó Monaco pero el usuario no cambió nada".

## Archivos involucrados

- `src/sidebar/editor.js` — `flush()`, `isDirty()`.
- `src/sidebar.js` — todos los call-sites de `editor.flush(saveWithHistory)`
  (`onSelectContext`, `onDeleteContext`, `onCreateContext`, `switchMode`).
- `src/storage.js` — `replaceContextFromMarkdown` (sin cambios necesarios si el
  fix se hace en `flush()`, pero se documenta como referencia).
- `src/content.js` — `contextForThisPage` (no requiere cambios; es la
  manifestación visible del bug, no la causa).
