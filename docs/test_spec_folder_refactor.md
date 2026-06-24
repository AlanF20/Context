# Test plan: spec_folder_refactor (Feature #11)

## Verificación automática (init.sh)

Correr `./init.sh` y confirmar:

- [ ] Paso 2 — `feature_list.json valid (11 features)` sin FAIL
- [ ] Paso 3 — Cada archivo `specs/NNN-spec-*.json` reporta `[OK] path (status)`
- [ ] Paso 3 — No aparece `[WARN] No specs found in specs/ yet`
- [ ] Paso 3 — No hay `[FAIL]` por campos faltantes ni status inválido
- [ ] Paso 4 — Sin errores de sintaxis en `outputs/`
- [ ] Paso 7 — `Harness ready. You can start working.`

## Verificación manual de estructura

- [ ] Directorio `specs/` existe en la raíz del repo
- [ ] Exactamente 7 archivos JSON presentes: 001, 005, 006, 007, 008, 010, 011
- [ ] Cada JSON abre sin error: `python3 -c "import json; json.load(open('specs/NNN-spec-*.json'))"`

## Verificación de contenido JSON

Para cada archivo en `specs/`:

- [ ] Campo `id` es int y coincide con el ID de la feature en `feature_list.json`
- [ ] Campo `status` es uno de: `draft`, `approved`, `implemented`, `failed_review`
- [ ] Features con `status: done` en feature_list tienen `status: "implemented"` en JSON
- [ ] Feature #11 tiene `status: "approved"` en JSON
- [ ] `acceptance_criteria` es array no vacío
- [ ] `dependencies` es array (puede ser vacío)

## Verificación de feature_list.json

- [ ] Features 1, 5, 6, 7, 8, 10 tienen `spec_path: "specs/NNN-spec-<name>.json"` (no `docs/`)
- [ ] Feature 11 tiene `spec_path: "specs/011-spec-spec_folder_refactor.json"`
- [ ] Ningún `spec_path` activo apunta a `docs/`
- [ ] Features `pending` (2, 3, 4, 9) siguen con `spec_path: null`

## Verificación de documentación

- [ ] `CLAUDE.md` menciona `specs/NNN-spec-<feature>.md` en el paso 5 del pipeline
- [ ] `AGENTS.md` incluye fila para `specs/` en la tabla del repositorio
- [ ] `AGENTS.md` no dice "no `specs/` JSON for now"

## Verificación de no-regresión

- [ ] `docs/spec_*.md` siguen existiendo (no se borraron)
- [ ] `docs/research_*.md` y `docs/test_*.md` no fueron modificados
- [ ] `init.sh` no fue modificado
