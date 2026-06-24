# Test plan: Fix carga de Monaco en Vite (Feature 17)

## Automated checks

1. `./init.sh` desde la raíz del repo — todos los steps deben salir `[OK]`.
2. `cd vite-extension && pnpm run build` — debe terminar sin errores ni warnings fatales.

## Manual — Chrome

1. Ir a `chrome://extensions`, activar **Developer mode**, cargar la carpeta `vite-extension/dist/` como extensión sin empaquetar.
2. Navegar a cualquier página web, abrir el panel lateral (clic en el icono de la extensión).
3. Crear un contexto si no existe ninguno, o seleccionar uno existente.
4. Hacer clic en el botón **Editor** (toggle Vista / Editor).

### Criterios de paso

| Criterio | Resultado esperado |
|---|---|
| Área de Monaco visible | El panel muestra un editor de código oscuro con el contenido Markdown del contexto |
| Sin mensaje de error | No aparece "No se pudo cargar el editor / Verifica la carpeta vendor/monaco" |
| Edición funcional | Escribir texto en el editor lo persiste (al volver a Vista, los cambios se ven) |
| Tab-bar visible | Se muestra la barra `<nombre>.md · Editando documento completo` |
| Status bar | Muestra `Markdown · UTF-8 · N líneas` |

### Criterio de fallo

Cualquiera de los siguientes:
- Aparece el mensaje de error de Monaco.
- El área del editor queda en blanco o negra sin contenido.
- La consola muestra errores relacionados con `vendor/monaco` o AMD.
- `pnpm run build` falla.
- `init.sh` reporta algún `[FAIL]`.
