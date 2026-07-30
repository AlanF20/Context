# Research — Feature 33: Active Reading Rebrand

Investigación para el rebrand de "Context Highlighter" a "Active Reading": nuevo
nombre/ícono en `manifest.json` + superficie de onboarding en el side panel.
Las 4 categorías/colores existentes NO cambian (constraint confirmado en la
entrevista).

## 1. Lectura activa: el concepto

La lectura activa es una técnica de estudio en la que el lector interactúa con
el texto en vez de solo pasarlo por los ojos: subraya, resume con sus propias
palabras, hace preguntas y conecta ideas mientras lee, en lugar de relegar esa
elaboración a después. Métodos clásicos como Cornell Notes (dividir la nota en
apunte + pista + resumen) o SQ3R (Survey, Question, Read, Recite, Review)
comparten un principio: la comprensión y la retención mejoran cuando el
lector clasifica y transforma la información en el momento, no cuando
simplemente la resalta. Un highlighter que solo pinta texto de un color
plano no obliga a esa clasificación —de hecho, la investigación sobre
subrayado pasivo (Dunlosky et al., 2013, "Improving Students' Learning")
lo señala como una de las técnicas de estudio menos efectivas precisamente
porque no exige procesar el contenido—. Etiquetar cada resaltado con una
categoría (Título, Idea, Argumento, Evidencia) fuerza una micro-decisión
("¿qué rol juega esta frase en el texto?") que convierte el resaltado en un
acto de comprensión activa, y esa estructura es lo que luego permite
reconstruir el texto como notas organizadas en vez de un mar de frases
sueltas.

## 2. Por qué cada categoría y su color

- **Título (rojo/rosa)**: marca los encabezados o puntos de estructura del
  texto —dónde empieza un tema nuevo—. El rojo se usa por convención como
  color de "marcador estructural/atención" (señalización, alertas), útil para
  que el ojo distinga de un vistazo los puntos de anclaje del documento frente
  al contenido.
- **Idea (ámbar/amarillo)**: para conceptos o afirmaciones que valen la pena
  recordar pero que el lector todavía no ha verificado ni conectado con un
  argumento. El ámbar es el color convencional de "atención, vale la pena
  revisar" (como el amarillo de precaución), coherente con su rol de nota
  provisional.
- **Argumento (azul)**: para razonamientos o líneas lógicas que conectan
  ideas —el hilo de por qué algo se sostiene—. El azul es una elección
  habitual para lo racional/analítico (asociado a menudo con confiabilidad y
  claridad de pensamiento), lo que lo hace intuitivo para marcar lógica.
- **Evidencia (verde)**: para datos, citas o hechos que respaldan un
  argumento. El verde es la convención más extendida para "confirmado / listo
  para avanzar" (semáforo, check), coherente con marcar algo que ya está
  verificado o respaldado.

Importante para la copy: esto se presenta como una convención razonable de
diseño (colores comúnmente asociados a esos significados en interfaces y
señalización), no como un hallazgo de "psicología del color" con base
científica sólida —evitar frases como "estudios demuestran que el rojo
activa..." que no están bien respaldadas.

## 3. Requisitos técnicos de íconos MV3

- Chrome no exige un tamaño único: `manifest.json` acepta un objeto `icons`
  con claves de tamaño → ruta de archivo. Los tamaños estándar que Chrome
  Web Store y el propio Chrome usan en distintos contextos:
  - **16×16** — favicon de la extensión / barra de omnibox.
  - **32×32** — algunas pantallas de Windows con DPI alto (recomendado, no
    estrictamente obligatorio pero sí lo pide el propio Chrome Web Store).
  - **48×48** — página de extensiones (`chrome://extensions`).
  - **128×128** — instalación y Chrome Web Store.
  - `action.default_icon` (el ícono de la toolbar) acepta el mismo patrón de
    objeto por tamaño; si se omite, Chrome reutiliza `icons`. Vale la pena
    incluir 16/32 ahí también para toolbar en pantallas retina.
- Formato: **PNG**, cuadrado (mismo ancho que alto), fondo transparente
  recomendado.
- **@crxjs/vite-plugin NO redimensiona automáticamente.** Solo copia/referencia
  los archivos que el `manifest.json` apunta, resolviendo las rutas relativas
  a la raíz del proyecto (donde vive `manifest.json`, típicamente
  `vite-extension/`). Si `manifest.json` declara `"128": "src/assets/icon-128.png"`
  y ese archivo no existe con esas dimensiones exactas, Chrome lo carga igual
  pero sin garantía de nitidez (el navegador puede reescalarlo en runtime,
  con resultado borroso). Hay que generar los PNG ya redimensionados de
  antemano.
- El archivo fuente ya provisto (`src/assets/icon.png`, confirmado
  1254×1254 px, PNG) debe reducirse a 16, 32, 48 y 128 px como archivos
  independientes antes del build.
- `vite-extension/package.json` **no tiene ninguna dependencia de
  procesamiento de imágenes** (`dependencies`: `approx-string-match`,
  `dompurify`, `lucide`, `marked`; `devDependencies`: `@crxjs/vite-plugin`,
  `@playwright/test`, `@types/node`, `jsdom`, `vite`, `vitest` — nada de
  `sharp`, `jimp`, `imagemin`, etc.).
- **Recomendación concreta**: usar `sips` (Scriptable Image Processing
  System), confirmado presente en este entorno macOS (`/usr/bin/sips`,
  build 316) — es una herramienta nativa de macOS, no requiere instalar
  nada, y basta un one-liner por tamaño:
  `sips -z 128 128 src/assets/icon.png --out src/assets/icon-128.png`
  (repetir para 48/32/16). Es preferible a añadir `sharp` como devDependency
  porque `sharp` compila binarios nativos por plataforma (aumenta tiempo de
  install y superficie de CI) para resolver un problema que es, en esencia,
  un redimensionado único y estático — no hay pipeline recurrente de imágenes
  en este proyecto que justifique una dependencia de build. La alternativa de
  "exportar a mano desde un editor de imágenes" también es válida pero menos
  reproducible/documentable que un comando de shell versionable (se puede
  dejar como comentario/script de una línea en README o en un script npm
  `"icons": "sips -z 16 16 ... && sips -z 32 32 ... && ..."` para que sea
  repetible si el ícono fuente cambia). `sips` es la opción recomendada.

## 4. Patrón UX del modal de onboarding

- **Detección de primera apertura**: un flag persistente en
  `chrome.storage.local` (p.ej. `onboardingSeen: true` dentro del mismo
  namespace `contextHighlighter` o una clave hermana), no `sessionStorage` ni
  contador de sesión — así sobrevive a que el usuario cierre y reabra el
  side panel sin volver a mostrarse.
- **Dismissible sin ser intrusivo**: un botón de cierre claro (✕ o
  "Entendido"), click fuera del modal (en el overlay) para cerrar, y que
  cerrar no bloquee ninguna otra acción del panel — el modal informa, no
  interrumpe un flujo obligatorio.
- **Afordancia persistente de reapertura**: el ícono "?" fijo en el rail
  importa porque el flag de "ya visto" hace que el modal no vuelva a
  aparecer solo; sin una forma de volver a abrirlo, el usuario que olvidó el
  significado de un color no tiene cómo consultarlo de nuevo salvo
  tanteando. Es el mismo principio que un "?" de ayuda contextual en
  cualquier app con curva de aprendizaje breve.
- **Accesibilidad** (coherente con el precedente WCAG de la feature 6,
  `semantic_hierarchy`, que ya trata simbolos+color, no solo color, como
  requisito):
  - `role="dialog"` y `aria-modal="true"` en el contenedor del modal,
    `aria-labelledby` apuntando al título.
  - **Focus trap**: el foco debe quedar contenido dentro del modal mientras
    esté abierto (Tab/Shift+Tab no debe escapar a elementos del panel detrás).
  - **Escape cierra el modal** y devuelve el foco al elemento que lo abrió
    (el ícono "?" del rail, o el botón que disparó la apertura automática).
  - Los 4 swatches de color deben llevar también texto/etiqueta (no solo el
    color) para no depender exclusivamente de la percepción cromática —mismo
    criterio SC 1.4.1 ya aplicado en la Vista con los símbolos § ◈ → ✓.

## 5. Borrador de copy (ES) para el modal

**Título del modal**: `Lectura activa: cómo funciona`

**Párrafo introductorio** (sección "qué es la lectura activa"):

> La lectura activa es una forma de leer en la que no solo marcas texto, sino
> que decides qué rol juega cada fragmento mientras lees: ¿es un tema nuevo?
> ¿una idea a seguir? ¿un argumento? ¿un dato que respalda algo? Esa
> clasificación —parecida a técnicas como las notas Cornell o el método
> SQ3R— es lo que convierte un resaltado en comprensión real: en vez de
> subrayar todo del mismo color y olvidar por qué, cada nota queda archivada
> con sentido, lista para reconstruirse como apuntes de investigación.

**Encabezado de sección**: `Qué significa cada color`

**Lista de 4 categorías** (nombre — swatch — explicación, para renderizar
como lista con el mismo swatch de color que ya usa la app):

1. **Título** — swatch rojo/rosa (`#c0394c` claro / `#f6b8c4` oscuro) —
   "Marca un punto de estructura: el inicio de un tema o sección nueva
   dentro de tu contexto de investigación."
2. **Idea** — swatch ámbar (`#c07a00` claro / `#f5d78e` oscuro) —
   "Un concepto que vale la pena recordar, todavía sin conectar con un
   argumento o evidencia concretos."
3. **Argumento** — swatch azul (`#1a5fa8` claro / `#93bef5` oscuro) —
   "El razonamiento que conecta ideas: por qué algo se sostiene, no solo
   qué se afirma."
4. **Evidencia** — swatch verde (`#1e7c40` claro / `#7fce9e` oscuro) —
   "Un dato, cita o hecho concreto que respalda un argumento — la parte
   verificable de tu investigación."

**Botón de cierre**: `Entendido` (consistente con el tono directo/imperativo
ya usado en la app: "Guardar resaltado", "Guardar en {ctx} como {cat}").

**Tooltip/aria-label del ícono "?" del rail**: `Ver explicación de lectura
activa` (siguiendo el patrón existente de `title`/`aria-label` cortos en
español que ya usan `rail.js` — p.ej. `"Eliminar contexto"` — y `content.js`
— p.ej. `"Más opciones"`).

## Nota de implementación (fuera de alcance de este research, para el Spec-Writer)

`lucide` ya es dependencia del proyecto (`rail.js` importa `createElement, X`
de `lucide`); el paquete incluye un ícono de ayuda (`CircleHelp` en versiones
recientes de lucide, antes `HelpCircle`) que puede reusarse sin añadir
dependencias nuevas para el botón "?" del rail.
