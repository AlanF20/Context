# Test plan: capture_quote_preview (Feature 14)

**Date:** 2026-06-24

---

## Preconditions

- Chrome con la extensión cargada desde `vite-extension/dist/` (Developer mode).
- Al menos un contexto guardado con ítems (para que el combobox tenga opciones).
- El side panel puede estar abierto o cerrado — no afecta el popup de captura.

---

## T-1: Borde dinámico por categoría (AC-1)

| Paso | Acción | Resultado esperado |
|---|---|---|
| 1 | Seleccionar cualquier texto breve en una página web. | Aparece el botón flotante "Guardar resaltado ＋". |
| 2 | Hacer clic en el botón. | Se abre el popup. El bloque de quote muestra el texto seleccionado. |
| 3 | Observar el borde izquierdo del quote al abrir. | Debe ser el color dorado/amarillo de la categoría "Idea" (`#d4a017`), no azul-violeta. |
| 4 | Hacer clic en el swatch "Título" (rosa). | El borde del quote cambia a rosa (`#e05a7a`) inmediatamente. |
| 5 | Hacer clic en "Argumento" (azul). | El borde cambia a azul (`#3a7fcb`). |
| 6 | Hacer clic en "Evidencia" (verde). | El borde cambia a verde (`#3aab5c`). |
| 7 | Volver a "Idea". | Borde vuelve a dorado. |

---

## T-2: Chip de categoría (AC-2)

| Paso | Acción | Resultado esperado |
|---|---|---|
| 1 | Abrir el popup (selección breve). | Chip visible dentro del quote: punto de color + "Idea". |
| 2 | Cambiar swatch a "Título". | Chip actualiza a punto rosa + "Título" sin demora. |
| 3 | Cambiar swatch a "Argumento". | Chip muestra "Argumento" con punto azul. |
| 4 | Cambiar swatch a "Evidencia". | Chip muestra "Evidencia" con punto verde. |
| 5 | Verificar colores del chip en dark mode (`prefers-color-scheme: dark` o forzado). | El fondo/texto del chip sigue siendo legible. |

---

## T-3: Texto breve — sin truncación (AC-3, AC-6)

| Paso | Acción | Resultado esperado |
|---|---|---|
| 1 | Seleccionar un texto de menos de 150 caracteres. | Popup abierto. |
| 2 | Observar el bloque de quote. | El texto se muestra completo. No aparece badge de caracteres ni botón "ver todo". |

---

## T-4: Texto largo — truncación y toggle (AC-3, AC-4)

| Paso | Acción | Resultado esperado |
|---|---|---|
| 1 | Seleccionar un texto de más de 150 caracteres (párrafo de un artículo). | Popup abierto. |
| 2 | Observar el quote. | El texto está truncado a ~120 chars con "…". Aparece un badge con el total ("N chars"). Aparece botón "ver todo". |
| 3 | Hacer clic en "ver todo". | El texto completo es visible. El botón ahora dice "colapsar". |
| 4 | Hacer clic en "colapsar". | Vuelve al texto truncado. El botón vuelve a "ver todo". |
| 5 | Con el texto expandido, cambiar de categoría. | El texto permanece expandido; solo el chip y el borde cambian. |

---

## T-5: Texto guardado es siempre el completo (AC-5)

| Paso | Acción | Resultado esperado |
|---|---|---|
| 1 | Seleccionar texto largo (>150 chars). Abrir popup. | Quote truncado visible. |
| 2 | Sin expandir el toggle, elegir contexto y hacer clic en "Guardar". | El ítem se guarda. |
| 3 | Abrir el side panel → Vista. | El ítem guardado muestra el texto **completo** (no truncado). |
| 4 | Repetir el T-5 pero expandiendo el toggle antes de guardar. | Mismo resultado: texto completo guardado. |

---

## T-6: No hay elementos fuera de .ch-quote (AC-6)

| Paso | Acción | Resultado esperado |
|---|---|---|
| 1 | Abrir DevTools → Inspector de elementos con el popup abierto. | El chip, el badge de caracteres y el botón toggle son hijos de `.ch-quote`, no elementos hermanos del popup. |

---

## T-7: Verificación de build (AC-8, AC-9)

```bash
# Desde la raíz del repo:
./init.sh

# Desde vite-extension/:
cd vite-extension && pnpm run build
```

Resultado esperado: ambos comandos terminan sin errores. `pnpm run build` no emite warnings de módulos rotos.

---

## Regresión rápida

- Guardar un ítem corto y uno largo y verificar que ambos aparecen en la Vista con texto completo.
- Verificar que el combobox sigue funcionando (crear contexto nuevo, seleccionar uno existente).
- Verificar que el nest-select (anidar bajo subtítulo) sigue apareciendo correctamente al elegir una categoría que no sea "Título".
- Verificar que Enter guarda y Esc cancela.
