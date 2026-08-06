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

## Prueba / diagnóstico de pestañas
1. Entrar con **MASTER_PASS** (no con la clave del municipio).
2. Abrir formulario → DevTools → Network → petición al Logger:
   - Debe devolver `"eiel_build":"logs-split-20260806"` y
     `"log_pestana":"logs_acceso_pruebas"`.
   - Si no aparece `eiel_build`: el `/exec` **no** tiene el `logger.gs`
     nuevo (pegó código pero no publicó Nueva versión, o la URL del
     portal apunta a otro despliegue).
3. Enviar formulario → respuesta del PDF con
   `"log_pestana":"logs_envios_pruebas"`.
4. En Sheets deben existir (o crearse) las pestañas `*_pruebas`.

**Orden correcto de despliegue:** pegar código → guardar →  
Implementar → **Administrar implementaciones** → editar la del portal →  
**Nueva versión** → Implementar. Si crea un «Nuevo despliegue» con otra
URL, hay que actualizar esa URL en los HTML/`EIEL_CONFIG`.

## Prueba (legacy)
1. Abrir un formulario (logueado), p. ej. municipio 006
2. DevTools → Network → logger → JSON `{ "status": "success", ... }`
3. En `logs_acceso` / `logs_acceso_pruebas`, columna código debe verse **006** (no 6)

Si tu script actual tiene más columnas o otra hoja, pégalo y lo adaptamos
manteniendo el contrato `{ status, message }`.
