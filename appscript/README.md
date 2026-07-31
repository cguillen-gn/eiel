# Apps Script — Adjuntos fiables + PDF legible

## A + B — Adjuntos (`appscript/adjuntos.gs`)

- Validación de municipio, `id_envio`, nombre y Base64
- Límite 35 MB
- Gancho de prueba: nombre que empiece por `FORZAR_ERROR`
- Respuesta JSON `{ status: "success"|"error", message, ... }`
- Logs en `Logger` de Apps Script
- `setSharing` público envuelto en try/catch: si el Workspace lo deniega,
  el archivo **sigue** como éxito (antes tumba toda la subida con
  `Acceso denegado: DriveApp`)

### Front adjuntos (`js/eiel-forms.js`)

- Sin `no-cors` en adjuntos
- `Content-Type: text/plain` (como el login) para leer la respuesta
- Exige `status === "success"`
- 2 reintentos por fichero
- Si falla: cierra overlay, muestra error, **no** llama a generar PDF

### Despliegue adjuntos

1. Abrir el proyecto Apps Script de **URL_ADJUNTOS**
2. Sustituir el código por el de `appscript/adjuntos.gs`
3. (Opcional) Ejecutar `testDrivePermisos` en el editor
4. **Implementar** → nueva versión → Web app `/exec`
   - Ejecutar como: **Yo**
   - Acceso: **Cualquiera**

## C — PDF / justificante (respuesta legible)

### Front

- `sendPdfPayload` ya **no** usa `no-cors`
- Usa `Content-Type: text/plain` y lee JSON
- Si el script antiguo no devuelve `{ status }`, no bloquea (compatibilidad)
- Si devuelve `status !== "success"`, cierra overlay y muestra error

### Apps Script

Ver instrucciones de parche en [`generar-pdf.PARCHE.md`](./generar-pdf.PARCHE.md).

Resumen: envolver `doPost` en try/catch y **siempre** devolver

```javascript
ContentService.createTextOutput(JSON.stringify(result))
  .setMimeType(ContentService.MimeType.JSON);
```

Luego **Implementar → Nueva versión**.

## Nota sobre "Acceso denegado: DriveApp"

Si el editor puede leer la carpeta pero la web falla al subir, suele ser
`file.setSharing(ANYONE_WITH_LINK)` bloqueado por política de Google Workspace.
El flujo EIEL **no necesita** enlace público: el script de PDF accede a Drive
como propietario. Por eso `setSharing` ya no es obligatorio.
