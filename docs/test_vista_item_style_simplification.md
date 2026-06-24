# Test plan: Vista Item Style Simplification (Feature 16)

## Verification method
`pnpm run build` (no errores) + revisión manual en Chrome cargando `vite-extension/dist/`.

## Checklist

### Build
- [ ] `./init.sh` — green
- [ ] `cd vite-extension && pnpm run build` — termina sin errores

### Vista — badges eliminados
- [ ] Abrir el side panel con un contexto que tenga ítems de cada categoría (Idea, Argumento, Evidencia)
- [ ] Confirmar que **ningún ítem** muestra el badge de texto (§ Título, ◈ Idea, → Argumento, ✓ Evidencia)
- [ ] Confirmar que los ítems de subtítulo tampoco muestran badge (ya no lo mostraban, pero verificar que no hay regresión)

### Vista — border-radius eliminado
- [ ] Confirmar que los ítems de texto tienen esquinas cuadradas (sin redondeo)
- [ ] Confirmar que los ítems de subtítulo tampoco tienen redondeo inesperado

### Vista — borde izquierdo conservado
- [ ] Ítems de categoría `idea` → borde izquierdo ámbar (`#c07a00`)
- [ ] Ítems de categoría `argument` → borde izquierdo azul (`#1a5fa8`)
- [ ] Ítems de categoría `evidence` → borde izquierdo verde (`#1e7c40`)

### Vista — espaciado
- [ ] Entre ítems de texto consecutivos hay ~8px de separación visible
- [ ] El primer ítem de texto en la lista no tiene margen superior excesivo

### Vista — hover y acciones intactas
- [ ] Hover sobre ítem de texto muestra fondo sutil (`var(--surface-2)`)
- [ ] Botones editar/borrar aparecen en hover y funcionan correctamente
- [ ] Editar inline (Enter confirma, Esc cancela) sigue funcionando

### Dark mode
- [ ] Activar tema oscuro con el toggle del rail
- [ ] Confirmar que no aparecen residuos visuales de los badges en dark mode
- [ ] Borde izquierdo visible en dark mode con los colores `--cat-*-border` oscuros

### No regresiones
- [ ] El Editor (Monaco) sigue funcionando: switch Vista/Editor, sync en vivo
- [ ] Export `.md` genera el Markdown correcto (sin cambios en la lógica de `buildMd`)
- [ ] El rail (chips de contexto) no se ve afectado
- [ ] Crear nuevo ítem desde el content script → aparece en la Vista sin badge y con borde de color
