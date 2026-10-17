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
Active Reading te ayuda a leer con intención: resaltás texto en cualquier página, lo clasificás por categoría (título, idea, argumento, evidencia) y lo archivás en "contextos" — temas de investigación que armás vos mismo.

Cómo funciona:
• Seleccioná texto en cualquier página web o PDF.
• Elegí una categoría con un clic (el color = la categoría).
• Guardalo en un contexto existente o creá uno nuevo al vuelo.
• Revisá y editá todas tus notas desde el panel lateral, con vista de lectura y editor tipo Markdown.
• Volvé a la página de origen de cualquier resaltado con un clic.
• Los resaltados se re-aplican solos al recargar la página.
• Exportá cada contexto como Markdown (.md) o como tarjetas Anki.

PDFs: la extensión incluye su propio visor, así que podés resaltar texto en documentos PDF con la misma fluidez que en una página web. Los resaltados se re-anclan por página la próxima vez que abrís el archivo.

Privacidad:
• Todo se guarda localmente en tu navegador (chrome.storage.local).
• No hay servidores propios ni de terceros: no se envía ningún dato fuera de tu equipo.
• No hay analítica ni rastreo.

Pensada para estudiantes, investigadores y cualquiera que lea mucho online y quiera convertir ese material disperso en notas organizadas y reutilizables.
```

> Actualizada 2026-10-15 para incluir el visor PDF (feature #37), la
> navegación al origen (#32) y el export Anki (#28), presentes en
> `active-reading-v2.0.0.zip`.

## Categoría sugerida

`Productivity` (o `Tools`, según disponibilidad regional).

## Idioma

Español (Latinoamérica) (es-419). La UI es 100% en español con voseo
latinoamericano; si se traduce a otros idiomas en el futuro, actualizar
`default_locale` en el manifest y agregar `_locales/`.

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

## Assets gráficos — generados en `store/chrome-webstore-upload/assets/`

Generados con la extensión real (Playwright carga `dist/`, arrastra
selecciones reales y captura la UI de verdad) más composición desde el
artwork de Penny:

- `01-captura-toolbar.png` (1280×800) — selección viva + toolbar flotante de
  categorías sobre un artículo real de Wikipedia (es).
- `02-resaltados-categoria.png` (1280×800) — 5 resaltados pintados en
  amarillo/azul/verde + toast "✓ Guardado / + agregar comentario".
- `03-panel-vista.png` (1280×800) — panel lateral con notas por categoría,
  comentarios, agrupación por fuente y botón Exportar.
- `04-visor-pdf.png` (1280×800) — visor PDF propio con un resaltado capturado.
- `promo-small-440x280.png` — wordmark + tagline + dots de categoría + Penny.
- `promo-marquee-1400x560.png` — escena `penny-logo.jpeg` recortada con el
  wordmark escrito sobre el papel del cuaderno.

**Opciones extra (05–07)**, capturadas sobre las URLs documentadas en
`tests/e2e/fixtures/test-sites.js` (importadas directo por el script, sin
duplicar) — elegir las 5 que mejor luzcan para el listing:

- `05-captura-houstonmethodist.png` — selección + toolbar sobre el artículo
  (es) de Houston Methodist.
- `06-resaltados-houstonmethodist.png` — 5 resaltados + toast en el mismo
  artículo, layout editorial.
- `07-resaltados-wikipedia-cortisol.png` — resaltados en la entrada
  "Cortisol" de Wikipedia (es).

AnkiWeb docs quedó excluido: el sitio fue rediseñado (Mintlify, sin `<main>`,
render client-side) y el selector documentado ya no aplica — su entrada en
TEST_SITES necesita reverificación. Medium quedó excluido por el overlay de
paywall.

Regenerar: `node scripts/make-store-screenshots.mjs`,
`node scripts/make-store-screenshots-sites.mjs` y
`python3 scripts/make-store-promos.py` (desde `vite-extension/`, tras
`pnpm run build`). Ícono de listing 128×128: `vite-extension/src/assets/icon-128.png`.

## Paquete para subir

`store/chrome-webstore-upload/active-reading-v2.0.0.zip` (generado desde
`vite-extension/dist/` tras `pnpm run build`, con `manifest.json` en la
raíz del zip). El zip homónimo que quedó suelto en `store/` (17-sep) está
obsoleto: no incluye el visor PDF.
