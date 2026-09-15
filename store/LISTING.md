# Chrome Web Store — ficha de publicación (Active Reading)

Copiar/pegar estos campos al crear el listing en el
[Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

## Descripción corta (máx. 132 caracteres)

Usar la misma del manifest (107 caracteres, ya cumple el límite):

```
Practicá lectura activa: clasificá tus resaltados por categoría y archívalos por contexto de investigación.
```

## Descripción detallada

```
Active Reading te ayuda a leer con intención: resaltás texto en cualquier
página, lo clasificás por categoría (título, idea, argumento, evidencia) y
lo archivás en "contextos" — temas de investigación que armás vos mismo.

Cómo funciona:
• Seleccioná texto en cualquier página web.
• Elegí una categoría con un clic (color = categoría).
• Guardalo en un contexto existente o creá uno nuevo al vuelo.
• Revisá y editá todas tus notas desde el panel lateral, agrupadas por
  contexto, con vista de lectura y editor tipo Markdown.
• Exportá cualquier contexto como archivo .md para llevarlo a tus propias
  herramientas de escritura o investigación.

Privacidad:
• Todo se guarda localmente en tu navegador (chrome.storage.local).
• No hay servidores propios ni de terceros: no se envía ningún dato fuera
  de tu equipo.
• No hay analítica ni rastreo.

Pensada para estudiantes, investigadores y cualquiera que lea mucho online
y quiera convertir ese material disperso en notas organizadas y reutilizables.
```

## Categoría sugerida

`Productivity` (o `Tools`, según disponibilidad regional).

## Idioma

Español (es). La UI es 100% en español; si se traduce a otros idiomas en el
futuro, actualizar `default_locale` en el manifest y agregar `_locales/`.

## Justificación de permisos (pestaña "Permissions justification" del dashboard)

**`storage`**
```
Se usa para guardar localmente (chrome.storage.local) los resaltados y
contextos que el propio usuario crea. No hay sincronización remota ni envío
de datos a ningún servidor.
```

**`sidePanel`**
```
Se usa para mostrar el panel lateral donde el usuario revisa, edita y
organiza sus notas y contextos guardados.
```

**`host_permissions: <all_urls>`**
```
La extensión permite resaltar y capturar texto en cualquier página que el
usuario decida visitar; por eso necesita poder inyectar el content script de
selección/resaltado en todos los sitios. El content script solo actúa sobre
el texto que el propio usuario selecciona explícitamente: no lee, recopila
ni transmite el resto del contenido de la página.
```

## Data safety / Privacy practices (pestaña del dashboard)

- ¿Recopila datos de usuario? Declarar que sí guarda "contenido generado
  por el usuario" (el texto resaltado), pero:
  - Uso: solo funcionalidad propia de la app (mostrarle sus notas al mismo
    usuario).
  - Ubicación: solo local, nunca transmitido.
  - No se comparte con terceros.
  - No se usa para publicidad ni perfiles.
- URL de política de privacidad: publicar `store/PRIVACY.md` en algún host
  público (GitHub Pages, Gist "raw", sitio propio, etc.) y pegar esa URL acá.
  **Pendiente: elegir dónde alojarla** — este repo no tiene remoto configurado.

## Assets pendientes (no se pueden generar solo con código)

- Ícono de listing 128×128: ya existe (`vite-extension/src/assets/icon-128.png`),
  recortado y aislado (fondo transparente) del mascot "Penny" en
  `penny-the-highlighter.jpeg`.
- `vite-extension/src/assets/penny-logo.jpeg` (escena ancha del highlighter
  dibujando líneas de colores) queda reservada para uso en el listing del
  Store (marquee/promo o como hero screenshot), no se usa como ícono.
- Al menos 1 captura de pantalla, 1280×800 o 640×400 px (obligatorio).
- Opcional: "small promo tile" 440×280 y "marquee" 1400×560 (candidato:
  `penny-logo.jpeg`, ya es apaisada).

## Paquete para subir

`store/active-reading-v2.0.0.zip` (generado desde `vite-extension/dist/`
tras `pnpm run build`).
