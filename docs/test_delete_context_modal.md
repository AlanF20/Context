# Test plan: Modal de confirmación al eliminar contexto (feature 23)

## Precondiciones
- `pnpm run build` completado sin errores.
- Extensión cargada en `chrome://extensions` desde `vite-extension/dist/`.
- Al menos dos contextos creados (para verificar que borrar uno no rompe la selección del otro).

## Casos de prueba

### TC-01 — Modal abre al hacer clic en X
1. Hacer hover sobre un chip del rail → aparece el botón X rojo.
2. Hacer clic en X.
**Esperado:** Se abre un modal/dialog con el texto "¿Eliminar «[nombre del contexto]»?" — el nombre es el del contexto sobre el que se hizo clic. El contexto NO se elimina todavía.

### TC-02 — Cancelar no borra el contexto
1. Abrir el modal (TC-01).
2. Hacer clic en "Cancelar".
**Esperado:** El modal se cierra. El contexto sigue en el rail. No hay cambios en storage.

### TC-03 — Escape no borra el contexto
1. Abrir el modal (TC-01).
2. Pulsar `Escape`.
**Esperado:** El modal se cierra. El contexto sigue en el rail. No hay cambios en storage.

### TC-04 — Confirmar elimina el contexto
1. Abrir el modal (TC-01).
2. Hacer clic en "Eliminar".
**Esperado:** El modal se cierra. El contexto desaparece del rail. El panel muestra el siguiente contexto disponible (o el estado vacío si era el único).

### TC-05 — El foco inicial recae en "Cancelar"
1. Abrir el modal con teclado (Tab hasta el botón X, Enter).
2. Observar qué botón tiene el foco al abrirse el modal.
**Esperado:** El botón "Cancelar" tiene el foco visual (outline/ring visible).

### TC-06 — El nombre del contexto es correcto
1. Crear un contexto con nombre "Mi investigación".
2. Abrir el modal para ese contexto.
**Esperado:** El modal muestra exactamente "¿Eliminar «Mi investigación»?".

### TC-07 — Funciona en modo oscuro
1. Activar modo oscuro con el toggle de tema.
2. Abrir el modal.
**Esperado:** El fondo del modal usa `--bg` dark, el texto usa `--fg` dark, el backdrop es semitransparente. No hay colores hardcodeados que rompan el contraste.

### TC-08 — No hay regresiones en el rail
1. Hacer clic en un chip (no en X) → el contexto se selecciona normalmente.
2. Crear un nuevo contexto con "+".
3. Renombrar un contexto con doble clic en el nombre.
**Esperado:** Todo funciona igual que antes; el modal no interfiere con estas acciones.

### TC-09 — pnpm run build sin errores
Correr `cd vite-extension && pnpm run build`.
**Esperado:** Salida sin errores de compilación ni warnings críticos.

### TC-10 — init.sh pasa
Correr `./init.sh` desde la raíz.
**Esperado:** Todos los checks [OK].
