# Logger — respuesta legible

## Front
En `templates/base.html.j2` (y `docs/` regenerados):
- Sin `no-cors`
- `Content-Type: text/plain`
- Envía `is_test` (modo MASTER_PASS)
- Si falla: solo `console.warn` (no molesta al usuario)

## Apps Script
1. Abrir proyecto **URL_LOGGER**
2. Sustituir `Código.gs` por `appscript/logger.gs`
3. Revisar `ID_HOJA_LOGS` si tu hoja es distinta
4. Implementar → **Nueva versión** (Yo + Cualquiera)

Pestañas:
- `logs_acceso` — técnicos municipales
- `logs_acceso_pruebas` — login con MASTER_PASS / municipio «PRUEBAS»

El código INE se escribe como texto (`'006`) para que Sheets no quite
los ceros a la izquierda.

## Prueba
1. Entrar con código municipal normal → fila en `logs_acceso`
2. Entrar con MASTER_PASS → fila en `logs_acceso_pruebas`
3. Columna código debe verse **006** (no 6)

Si tu script actual tiene más columnas o otra hoja, pégalo y lo adaptamos
manteniendo el contrato `{ status, message }`.
