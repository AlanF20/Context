# Política de privacidad — Active Reading

**Última actualización:** 2026-10-16

Active Reading es una extensión de Chrome para resaltar texto en cualquier
página web, clasificarlo por categoría y archivarlo en "contextos" de
investigación personales.

## Qué datos maneja la extensión

- **Texto resaltado por el usuario** (la nota, su categoría, la URL y el
  dominio de origen, y la fecha de creación).
- **Nombres y colores de los contextos** que el usuario crea para organizar
  sus notas.

Estos datos los genera y controla el propio usuario al usar la extensión;
Active Reading no recopila datos de navegación, historial, ni contenido de
páginas que el usuario no haya resaltado explícitamente.

## Dónde se guardan

Todo se guarda **localmente** en el dispositivo del usuario, usando la API
`chrome.storage.local` del navegador. Active Reading:

- **No envía datos a ningún servidor.** No hay backend propio ni de
  terceros.
- **No usa analítica, telemetría ni rastreadores.**
- **No comparte ni vende datos** a terceros, porque no existe ningún canal
  de salida de datos: todo el procesamiento ocurre en el propio navegador.
- **No usa los datos para publicidad**, scoring crediticio, ni ningún fin
  distinto al de mostrarle al usuario sus propias notas.

## Por qué la extensión pide acceso a "todos los sitios"

Active Reading permite resaltar texto en **cualquier página que el usuario
visite**, por eso solicita el permiso de host `<all_urls>`. Ese acceso se usa
únicamente para:

1. Detectar la selección de texto que el usuario hace en la página.
2. Mostrar el ícono/popup de captura y el resaltado visual sobre esa
   selección.
3. Guardar la nota resultante en el almacenamiento local del usuario.

El content script no lee, transmite ni analiza el resto del contenido de la
página.

## Permisos declarados

| Permiso | Para qué se usa |
|---|---|
| `storage` | Guardar los contextos y notas del usuario en `chrome.storage.local` (nunca remoto). |
| `sidePanel` | Mostrar el panel lateral donde el usuario revisa y edita sus notas. |
| `host_permissions: <all_urls>` | Poder resaltar texto y capturar notas en cualquier página que el usuario visite. |

## Eliminación de datos

El usuario puede borrar sus notas y contextos en cualquier momento desde el
propio panel de la extensión, o desinstalando la extensión (lo que elimina
todo su almacenamiento local asociado).

## Contacto

Para preguntas sobre esta política, contactar a: alj20915@gmail.com
