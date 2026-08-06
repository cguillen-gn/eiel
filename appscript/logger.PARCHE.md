# Logger — respuesta legible

## Front
En `templates/base.html.j2` (y `docs/` regenerados):
- Sin `no-cors`
- `Content-Type: text/plain`
- Si falla: solo `console.warn` (no molesta al usuario)

## Apps Script
1. Abrir proyecto **URL_LOGGER**
2. Sustituir `Código.gs` por `appscript/logger.gs`
3. Revisar `ID_HOJA_LOGS` y `NOMBRE_PESTANA_ACCESOS` si tu hoja es distinta
4. Implementar → **Nueva versión** (Yo + Cualquiera)

El código INE se escribe como texto (`'006`) para que Sheets no quite
los ceros a la izquierda.

## Prueba
1. Abrir un formulario (logueado), p. ej. municipio 006
2. DevTools → Network → logger → JSON `{ "status": "success", ... }`
3. En `logs_acceso`, columna código debe verse **006** (no 6)

Si tu script actual tiene más columnas o otra hoja, pégalo y lo adaptamos
manteniendo el contrato `{ status, message }`.
