# Spec: spec_folder_refactor (Feature #11)

**Estado:** awaiting human approval  
**Autor:** Claude (Spec-Writer)  
**Fecha:** 2026-06-23  
**Depende de:** ninguna

---

## Problema

El harness almacena las especificaciones como archivos Markdown en `docs/spec_*.md`,
mezcladas con research, tests y documentación de arquitectura. Esto tiene dos
fricciones:

1. **Sin estructura formal** — el formato Markdown libre no se puede validar
   programáticamente. `init.sh` no puede confirmar que una spec tenga los campos
   obligatorios.
2. **Sin nomenclatura estable** — `spec_category_indicators.md` no indica qué
   feature ID es; hay que cruzar con `feature_list.json` manualmente.

`init.sh` ya está preparado (paso 3) para validar JSONs en `specs/`, pero la
carpeta no existe y los archivos históricos no han sido migrados.

---

## Solución

Crear la carpeta `specs/` con un archivo JSON por cada feature que tenga spec,
siguiendo la nomenclatura `NNN-spec-<name>.json` (ID con zero-padding de 3 dígitos).

---

## Esquema de archivo spec JSON

```jsonc
{
  "id": 1,                          // int — feature ID
  "status": "implemented",          // "draft" | "approved" | "implemented" | "failed_review"
  "createdAt": "2026-06-23",        // ISO 8601 date
  "author": "human",
  "title": "Editar/borrar por ítem en la Vista",
  "description": "Descripción completa de la feature...",
  "acceptance_criteria": [
    "Criterio 1",
    "Criterio 2"
  ],
  "dependencies": []               // array de feature IDs (int)
}
```

Los campos y valores de `status` son exactamente los que ya valida `init.sh`.

---

## Archivos a crear

| Path en `specs/` | Feature | Status JSON |
|---|---|---|
| `001-spec-vista_item_actions.json` | 1 — Editar/borrar por ítem | `implemented` |
| `005-spec-category_indicators.json` | 5 — Badges semánticos | `implemented` |
| `006-spec-semantic_hierarchy.json` | 6 — Jerarquía WCAG | `implemented` |
| `007-spec-subtitle_nest_select.json` | 7 — Select de subtítulo | `implemented` |
| `008-spec-vite_pnpm_migration.json` | 8 — Migración Vite+pnpm | `implemented` |
| `010-spec-vite_sidebar_parity.json` | 10 — Side panel en Vite | `implemented` |
| `011-spec-spec_folder_refactor.json` | 11 — Esta feature | `approved` |

---

## Archivos a modificar

### `feature_list.json`

Actualizar el campo `spec_path` en 7 entradas (las que tenían `spec_path`
no-null):

```diff
- "spec_path": "docs/spec_vista_item_actions.md"
+ "spec_path": "specs/001-spec-vista_item_actions.json"
```

Patrón general:
```
docs/spec_<name>.md  →  specs/NNN-spec-<name>.json
```

Feature 11 pasa de `spec_path: null` a `"specs/011-spec-spec_folder_refactor.json"`.

### `CLAUDE.md`

Actualizar el paso 5 del harness pipeline en la sección "Trigger de harness":

```diff
- 5. **Spec-Writer** — redactar la spec en `docs/spec_<feature>.md` y presentarla
-    al usuario para aprobación.
+ 5. **Spec-Writer** — redactar la spec en `specs/NNN-spec-<feature>.md` y
+    presentarla al usuario para aprobación.
```

Actualizar también el mapa de archivos (sección "Mapa de archivos") para
mencionar que las specs viven en `specs/`.

### `AGENTS.md`

- Eliminar la nota "no `specs/` JSON for now" de la descripción del repositorio.
- Añadir fila a la tabla del repo:

```
| `specs/`     | Especificaciones JSON estructuradas de cada feature (NNN-spec-<name>.json) | Antes de implementar |
```

---

## Qué NO cambia

- `init.sh` — ya está correcto; no necesita modificación.
- `docs/spec_*.md` — se mantienen como referencia histórica, no se eliminan.
- `docs/research_*.md`, `docs/test_*.md` — no están en scope de esta feature.
- El campo `spec_path` en `feature_list.json` sigue existiendo; solo cambia el valor.
- La regla de `init.sh` que exige `spec_path` no-null para features `done`.

---

## Criterios de aceptación

1. Existe directorio `specs/` en la raíz del repo.
2. Cada feature con `status: done` tiene su archivo `specs/NNN-spec-<name>.json`
   con todos los campos requeridos.
3. `feature_list.json` apunta a `specs/NNN-spec-<name>.json` en todos los
   `spec_path` no-null.
4. `init.sh` pasa sin errores: paso 3 muestra `[OK]` para cada JSON en `specs/`.
5. `CLAUDE.md` documenta la nueva convención de naming y carpeta.
6. `AGENTS.md` lista `specs/` en la tabla del repositorio sin la nota "no specs/ for now".

---

## Orden de implementación recomendado

1. Crear `specs/` y los 7 archivos JSON.
2. Actualizar `feature_list.json` (spec_path de las 7 entradas + feature 11).
3. Actualizar `CLAUDE.md`.
4. Actualizar `AGENTS.md`.
5. Correr `./init.sh` y verificar que paso 3 reporta `[OK]` para cada spec.
