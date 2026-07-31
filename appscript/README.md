# Apps Script — Adjuntos fiables (A + B)

## Qué cambia

### A — `appscript/adjuntos.gs`
- Validación de municipio, `id_envio`, nombre y Base64
- Límite 35 MB en servidor
- Gancho de prueba: nombre que empiece por `FORZAR_ERROR`
- Respuesta JSON `{ status: "success"|"error", message, ... }`
- Logs en `Logger` de Apps Script

### B — Front (`js/eiel-forms.js`)
- Deja de usar `no-cors` en adjuntos
- Usa `Content-Type: text/plain` (como el login) para poder leer la respuesta
- Exige `status === "success"`
- 2 reintentos por fichero
- Si falla: cierra overlay, muestra error, **no** llama a generar PDF

## Cómo desplegar

1. Abrir el proyecto Apps Script de **URL_ADJUNTOS**
2. Sustituir el código por el de `appscript/adjuntos.gs`
3. **Implementar** → nueva versión → Web app `/exec` (misma URL o actualizar `.env` si cambia)
4. Ejecutar como tú; acceso: Cualquiera
5. Mergear este PR y, si hace falta, regenerar `docs/` o al menos publicar `docs/js/eiel-forms.js`

## Prueba forzada

1. Login en modo pruebas
2. En un formulario, adjuntar un PDF renombrado a `FORZAR_ERROR_prueba.pdf`
3. Enviar
4. **Esperado:** mensaje de error, sin justificante de éxito
5. Repetir con un PDF normal → debe funcionar como siempre
