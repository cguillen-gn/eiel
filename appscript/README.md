# Apps Script — Adjuntos fiables + PDF legible

## A + B — Adjuntos (`appscript/adjuntos.gs`)

- Validación de municipio, `id_envio`, nombre y Base64
- Límite 35 MB + gancho `FORZAR_ERROR*`
- Respuesta JSON `{ status: "success"|"error", message, ... }`
- `setSharing` público en try/catch (política Workspace)

### Front adjuntos

- Sin `no-cors`; `Content-Type: text/plain`; exige `status === "success"`
- Reintentos; si falla, no llama a generar PDF

### Despliegue adjuntos

1. Pegar `appscript/adjuntos.gs` en **URL_ADJUNTOS**
2. Implementar → **Nueva versión** (Yo + Cualquiera)

## C — PDF / justificante (`appscript/generar-pdf.gs`)

### Front (`sendPdfPayload`)

- Sin `no-cors`; `Content-Type: text/plain`
- Acepta `{ status: "success"|"error" }` **o** el histórico `{ success: bool }`
- Si falla: cierra overlay y muestra error (no pantalla de éxito falsa)

### Apps Script

1. Pegar **todo** `appscript/generar-pdf.gs` en el proyecto **URL_GENERAR_PDF**
2. Implementar → **Nueva versión** (Yo + Cualquiera)
3. Cambios respecto al script anterior:
   - Respuesta con `status` + `success`
   - Gancho de prueba: contacto = `FORZAR_ERROR`
   - `is_test` se pasa a `logToSheet` (prefijo `TEST-` en el ID)
   - Eliminado bloque muerto `URL_DE_TU_SCRIPT_ADJUNTOS` (los adjuntos ya los sube el front)

### Prueba

1. Envío normal → éxito + email PDF
2. Nombre de contacto `FORZAR_ERROR` → error visible, sin pantalla de éxito

## Nota DriveApp / setSharing

En muchos Workspace, `ANYONE_WITH_LINK` está bloqueado. El flujo EIEL no necesita
enlace público (el script PDF actúa como propietario). En adjuntos, `setSharing`
ya no es bloqueante; en PDF sigue comentado.
