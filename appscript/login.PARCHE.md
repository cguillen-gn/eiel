# Login — emitir token de sesión

El front ya espera `token` en la respuesta de login y lo guarda en
`localStorage.eiel_session_token`. Adjuntos y PDF lo exigen.

## Opción A (recomendada): segundo fichero

1. En el proyecto Apps Script de **URL_LOGIN_SCRIPT**, crea un fichero
   `auth-token` y pega el contenido de `auth-token.gs`.
2. En tu `doPost` de login, cuando el acceso sea válido, añade el token:

```javascript
// ... tras comprobar password OK ...
const isTest = /* tu lógica MASTER_PASS / isTest */;
const nombre = /* nombre municipio */;
const token = issueSessionToken_(codigo, isTest);

return ContentService.createTextOutput(JSON.stringify({
  valid: true,
  isTest: isTest,
  nombre: nombre,
  token: token
})).setMimeType(ContentService.MimeType.JSON);
```

3. Implementar → **Nueva versión**.

## Opción B: pégame el script de login

Si prefieres, pega aquí el script completo de login y lo dejamos
versionado en `appscript/login.gs` listo para copiar (como adjuntos/PDF).

## Secreto

Mismo `EIEL_TOKEN_SECRET` (Script Properties) o mismo fallback en
`auth-token.gs` en los tres proyectos: Login, Adjuntos, Generar PDF.

## Orden de despliegue

1. Login (emite token) → Nueva versión  
2. Front (guarda y envía token)  
3. Adjuntos + PDF (exigen token) → Nueva versión  

Si despliegas 3 antes que 1+2, los envíos fallarán hasta re-login.
