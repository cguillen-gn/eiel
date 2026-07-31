# Apps Script — Adjuntos, PDF y token de sesión

## D — Token de sesión en el envío

Sin token, cualquiera con la URL del Web App podía subir adjuntos o
disparar el PDF. Ahora el login emite un token HMAC; adjuntos y PDF lo exigen.

| Pieza | Archivo |
|-------|---------|
| Helpers HMAC (compartidos) | `auth-token.gs` |
| Parche login | `login.PARCHE.md` |
| Adjuntos | `adjuntos.gs` (llama `assertValidSessionToken_`) |
| PDF | `generar-pdf.gs` (idem) |
| Front | `js/eiel-forms.js` + plantillas index/base |

### Despliegue (orden)

1. **Login:** añadir fichero `auth-token` (`auth-token.gs`) + emitir `token`
   en la respuesta (ver `login.PARCHE.md`) → **Nueva versión**
2. **Front:** merge + regenerar (`index` guarda `eiel_session_token`;
   formularios lo envían como `session_token`)
3. **Adjuntos y PDF:** añadir el mismo `auth-token.gs` + pegar scripts
   actualizados → **Nueva versión** cada uno
4. **Cerrar sesión** en el navegador y volver a entrar (sesiones antiguas
   sin token se invalidan)

### Secreto

Mismo valor en los 3 proyectos:
- Script Properties → `EIEL_TOKEN_SECRET` (recomendado), o
- el fallback dentro de `auth-token.gs`

### Pruebas

1. Login normal → menú OK  
2. Envío con adjunto → OK  
3. Sin token (borrar `eiel_session_token` en DevTools) → error / redirect login  
4. Contacto `FORZAR_ERROR` → sigue fallando el PDF a propósito  

---

## A + B — Adjuntos (`adjuntos.gs`)

- Validación, límite 35 MB, `FORZAR_ERROR*`, JSON legible
- `setSharing` no bloqueante
- Front sin `no-cors`; exige `status === "success"`

## C — PDF (`generar-pdf.gs`)

- JSON `{ status, success, message }`
- Front sin `no-cors`; interpreta `status` o `success`
- Gancho contacto `FORZAR_ERROR`

## Nota DriveApp / setSharing

En muchos Workspace, `ANYONE_WITH_LINK` está bloqueado. El flujo EIEL no
necesita enlace público.
