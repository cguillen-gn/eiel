# Apps Script — Adjuntos, PDF, token y logger

## D — Token de sesión en el envío

Sin token, cualquiera con la URL del Web App podía subir adjuntos o
disparar el PDF. Ahora el login emite un token HMAC; adjuntos y PDF lo exigen.

| Pieza | Archivo |
|-------|---------|
| Helpers HMAC (compartidos) | `auth-token.gs` |
| Login | `login.gs` / `login.PARCHE.md` |
| Adjuntos | `adjuntos.gs` + `log-errores.gs` |
| PDF | `generar-pdf.gs` + `log-errores.gs` |
| Front | `js/eiel-forms.js` + plantillas index/base |

### Despliegue (orden)

1. **Login:** `auth-token.gs` + `login.gs` → **Nueva versión**
2. **Front:** merge + regenerar
3. **Adjuntos y PDF:** mismo `auth-token.gs` + scripts → **Nueva versión**
4. Cerrar sesión y volver a entrar

### Secreto

Mismo `EIEL_TOKEN_SECRET` (Script Properties) o el mismo fallback en
`auth-token.gs` en Login, Adjuntos y PDF.

### Pruebas

1. Login → menú OK  
2. Envío con adjunto → OK  
3. Sin token (borrar `eiel_session_token`) → redirect / error de sesión  

---

## A + B — Adjuntos (`adjuntos.gs`)

- Validación, límite 35 MB, JSON legible
- `setSharing` no bloqueante
- Mensajes de error en español para el técnico
- Front sin `no-cors`; exige `status === "success"`

## C — PDF (`generar-pdf.gs`)

- JSON `{ status, success, message }`
- Mensajes de error amigables (Drive, Gmail, cuota, sesión…)
- Front sin `no-cors`; interpreta `status` o `success`

## E — Logger de accesos (`logger.gs`)

- Front sin `no-cors`; lee `{ status }`
- Si falla: solo `console.warn` (no bloquea el formulario)
- Código municipio con ceros (`'006`)
- Ver `logger.PARCHE.md`

## Nota DriveApp / setSharing

En muchos Workspace, `ANYONE_WITH_LINK` está bloqueado. El flujo EIEL no
necesita enlace público.
