# Research: spec_folder_refactor (Feature #11)

## Objetivo

Entender el estado actual del harness respecto a la gestión de specs y qué debe
cambiar para migrar a `specs/NNN-spec-<name>.json`.

---

## Estado actual — hallazgos

### 1. `init.sh` (paso 3) — ya parcialmente migrado

`init.sh` paso 3 ya valida archivos en `specs/**/*.json` con el siguiente esquema
obligatorio:

```
REQUIRED = {"id", "status", "createdAt", "author", "title",
            "description", "acceptance_criteria", "dependencies"}
VALID_STATUS = {"draft", "approved", "implemented", "failed_review"}
```

La carpeta `specs/` no existe todavía → el paso muestra `[WARN] No specs found
in specs/ yet` (no falla, solo advierte). Esto significa que `init.sh` está
**listo** para el nuevo formato sin cambios.

### 2. Specs actuales — Markdown en `docs/`

Archivos existentes con specs:

| Archivo | Feature ID | Estado feature |
|---|---|---|
| `docs/spec_vista_item_actions.md` | 1 | done |
| `docs/spec_category_indicators.md` | 5 | done |
| `docs/spec_semantic_hierarchy.md` | 6 | done |
| `docs/spec_subtitle_nest_select.md` | 7 | done |
| `docs/spec_vite_pnpm_migration.md` | 8 | done |
| `docs/spec_vite_sidebar_parity.md` | 10 | done |

Features sin spec (pending): 2, 3, 4, 9.

### 3. `feature_list.json` — campo `spec_path`

El campo `spec_path` apunta actualmente a `docs/spec_<name>.md`. Ejemplos:

```json
"spec_path": "docs/spec_vista_item_actions.md"
"spec_path": "docs/spec_category_indicators.md"
"spec_path": null   // features pending
```

La regla de `init.sh` que valida `feature_list.json`:
```python
if f["status"] == "done" and not f.get("spec_path"):
    print(f"[FAIL]  Feature {f['id']} is done but has no spec_path")
```
Esta validación sigue siendo necesaria; solo cambia el path que apunta.

### 4. `CLAUDE.md` — harness pipeline

El step 5 dice: "Spec-Writer — redactar la spec en `docs/spec_<feature>.md`".
Debe actualizarse a la nueva convención.

### 5. `AGENTS.md` — mapa de repositorio

La tabla del repo dice: "no `specs/` JSON for now". Debe actualizarse para
reflejar que `specs/` existe y su convención de naming.

---

## Análisis de cambios necesarios

### Archivos a crear

- `specs/` — directorio nuevo
- `specs/001-spec-vista_item_actions.json` (feature 1)
- `specs/005-spec-category_indicators.json` (feature 5)
- `specs/006-spec-semantic_hierarchy.json` (feature 6)
- `specs/007-spec-subtitle_nest_select.json` (feature 7)
- `specs/008-spec-vite_pnpm_migration.json` (feature 8)
- `specs/010-spec-vite_sidebar_parity.json` (feature 10)
- `specs/011-spec-spec_folder_refactor.json` (esta misma feature)

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `feature_list.json` | 7 entradas: actualizar `spec_path` de `docs/spec_*.md` → `specs/NNN-spec-*.json` |
| `CLAUDE.md` | Paso 5 del harness: nueva ruta y formato |
| `AGENTS.md` | Tabla repo: añadir fila para `specs/`, actualizar nota |

### Archivos sin cambio

- `init.sh` — ya valida `specs/**/*.json` con el esquema correcto
- `docs/spec_*.md` — se mantienen como referencia histórica (no se borran)
- `docs/research_*.md`, `docs/test_*.md` — no están en scope

---

## Decisiones de diseño

### Nomenclatura de archivos

`NNN-spec-<name>.json` donde:
- `NNN` = feature ID con zero-padding a 3 dígitos (001, 005, …, 011)
- `<name>` = el campo `name` del feature en `feature_list.json` (snake_case)

Ejemplo: feature id=5, name="category_indicators" → `005-spec-category_indicators.json`

### Formato JSON de spec

Usar exactamente los campos que ya valida `init.sh`:

```jsonc
{
  "id": 1,
  "status": "implemented",   // draft | approved | implemented | failed_review
  "createdAt": "...",        // ISO 8601
  "author": "human",
  "title": "...",
  "description": "...",
  "acceptance_criteria": ["..."],
  "dependencies": []
}
```

Para features ya `done`, el status JSON es `"implemented"`.
Para esta feature (11) en progreso: `"approved"` después del gate humano.

### ¿Qué pasa con `docs/spec_*.md`?

Se mantienen sin cambios como referencia histórica. No se borran.
`feature_list.json` dejará de referenciarlos y apuntará a los JSON nuevos.

### `spec_path` en `feature_list.json`

El campo sigue existiendo. Solo cambia el valor:
- Antes: `"docs/spec_vista_item_actions.md"`
- Después: `"specs/001-spec-vista_item_actions.json"`

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| `init.sh` falla si `spec_path` apunta a un archivo que no existe | El campo `spec_path` en feature_list no es verificado contra disco por init.sh — solo se verifica que sea no-null para features `done` |
| JSON mal formado en specs/ falla init.sh | Verificar con `python3 -c "import json; json.load(open(...))"` antes de commit |
| Pérdida de información al pasar de Markdown a JSON | Los campos JSON cubren toda la información relevante; el contenido histórico detallado permanece en los `.md` |
