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

## Prueba
1. Abrir un formulario (logueado)
2. DevTools → Network → petición al logger → JSON `{ "status": "success", ... }`
3. Comprobar nueva fila en la hoja `logs_acceso`

Si tu script actual tiene más columnas o otra hoja, pégalo y lo adaptamos
manteniendo el contrato `{ status, message }`.
