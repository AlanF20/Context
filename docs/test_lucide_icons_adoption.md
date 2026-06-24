# Test plan: Adopción de Lucide Icons
**Feature ID:** 13 — `lucide_icons_adoption`  
**Agente:** Tester

---

## Verificación automática (obligatoria)

```bash
cd vite-extension && pnpm run build
```
Debe terminar sin errores ni warnings de módulo no resuelto.

```bash
# Desde raíz:
./init.sh
```
Debe salir `[OK] Harness ready.`

---

## Verificación en Chrome (manual)

Cargar `vite-extension/dist/` como extensión sin empaquetar en `chrome://extensions`.

### 1. Botones de acción en Vista (vista.js)

| Acción | Esperado |
|---|---|
| Hover sobre una nota en la Vista | Aparecen dos botones de acción |
| Botón editar (izquierda) | Muestra SVG de lápiz (Pencil de Lucide) — no el glifo `✏` |
| Botón borrar (derecha) | Muestra SVG de X (X de Lucide) — no el glifo `✕` |
| Ambos botones | SVG 16×16, color hereda del botón (`currentColor`), no distorsionado |
| Hover sobre botón editar | Background cambia (`.vista-btn-edit:hover`) |
| Hover sobre botón borrar | Background cambia a rojo suave (`.vista-btn-delete:hover`) |

### 2. Botón borrar chip en Rail (rail.js)

| Acción | Esperado |
|---|---|
| Hover sobre un chip del rail | Aparece botón ✕ rojo en la esquina superior derecha |
| Icono del botón | SVG de X (Lucide) — no el glifo `✕` |
| Tamaño | Encaja dentro del botón circular de 16×16 |

### 3. Toggle de tema (theme.js)

| Acción | Esperado |
|---|---|
| Panel en modo claro | Botón tema muestra SVG de Sol (Sun de Lucide) — no `◐` |
| Click en el botón | Cambia a modo oscuro |
| Panel en modo oscuro | Botón tema muestra SVG de Luna (Moon de Lucide) — no `☾` |
| Persistencia | Recargar la extensión mantiene el tema y el icono correcto |

### 4. Glifo de estado vacío — sin contextos (sidebar.js)

| Acción | Esperado |
|---|---|
| Panel sin ningún contexto | Se muestra el estado vacío con icono SVG (Sparkles) — no `✦` |
| Texto debajo | "Sin contextos todavía" |

### 5. Glifo de estado vacío — contexto vacío (vista.js)

| Acción | Esperado |
|---|---|
| Contexto seleccionado sin ítems | Se muestra glifo SVG (NotebookPen) — no `✎` |
| Texto debajo | "Contexto vacío" |

### 6. Badges de categoría (no cambiar)

| Verificación | Esperado |
|---|---|
| Badge de Título | Muestra `§ Título` (símbolo CSS intacto) |
| Badge de Idea | Muestra `◈ Idea` |
| Badge de Argumento | Muestra `→ Argumento` |
| Badge de Evidencia | Muestra `✓ Evidencia` |

### 7. Dark mode — todos los iconos

| Verificación | Esperado |
|---|---|
| Todos los SVGs en dark mode | Color visible (hereda `currentColor` que cambia con el tema) |
| Botones de acción en dark mode | Sin contraste quebrado |

### 8. Regresión general

| Verificación | Esperado |
|---|---|
| Crear contexto | Rail muestra nuevo chip |
| Borrar contexto | Chip desaparece |
| Editar ítem inline | Textarea aparece, Enter confirma |
| Borrar ítem | Ítem desaparece de la Vista |
| Toggle Vista/Editor | Cambia de panel correctamente |
| Export .md | Descarga Markdown válido |
