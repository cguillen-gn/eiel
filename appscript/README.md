# Apps Script — Adjuntos fiables (A + B)

## Qué cambia

### A — `appscript/adjuntos.gs`
- Validación de municipio, `id_envio`, nombre y Base64
- Límite 35 MB
- Gancho de prueba: nombre que empiece por `FORZAR_ERROR`
- Respuesta JSON `{ status: "success"|"error", message, ... }`
- Logs en `Logger` de Apps Script
- `setSharing` público envuelto en try/catch: si el Workspace lo deniega,
  el archivo **sigue** como éxito (antes tumba toda la subida con
  `Acceso denegado: DriveApp`)

### B — Front (`js/eiel-forms.js`)
- Deja de usar `no-cors` en adjuntos
- Usa `Content-Type: text/plain` (como el login) para poder leer la respuesta
- Exige `status === "success"`
- 2 reintentos por fichero
- Si falla: cierra overlay, muestra error, **no** llama a generar PDF

## Cómo desplegar

1. Abrir el proyecto Apps Script de **URL_ADJUNTOS**
2. Sustituir el código por el de `appscript/adjuntos.gs`
3. (Opcional) Ejecutar `testDrivePermisos` en el editor: debe crear un txt de
   prueba; si `setSharing` falla, lo verás en el log pero no es bloqueante
4. **Implementar** → nueva versión → Web app `/exec`
   - Ejecutar como: **Yo**
   - Acceso: **Cualquiera**
5. Publicar el front (`docs/js/eiel-forms.js`) si aún no está en Pages

## Prueba forzada

1. Login en modo pruebas
2. Adjuntar `FORZAR_ERROR_prueba.pdf` → debe fallar con mensaje
3. Adjuntar un PDF normal → debe completar OK

## Nota sobre "Acceso denegado: DriveApp"

Si el editor puede leer la carpeta pero la web falla al subir, suele ser
`file.setSharing(ANYONE_WITH_LINK)` bloqueado por política de Google Workspace.
El flujo EIEL **no necesita** enlace público: el script de PDF accede a Drive
como propietario. Por eso `setSharing` ya no es obligatorio.
